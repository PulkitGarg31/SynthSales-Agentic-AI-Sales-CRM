import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import SessionLocal, engine
from app.providers.ai import ai
from app.providers.email import email_provider
from app.providers.hunter import hunter
from app.providers.oauth import oauth_provider
from app.providers.search import search
from app.providers.verification import verification
from app.workers.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("synthsales")

# httpx logs every request line at INFO, including the full URL — and three
# providers pass their API key as a query parameter (Gemini, Hunter, ZeroBounce).
# Quiet it to WARNING so those keys never land in the log stream.
logging.getLogger("httpx").setLevel(logging.WARNING)

# Hard ceiling on any request body (bytes). The one large upload is the CSV
# importer (frontend-capped at 20 MB); everything else is small JSON. Rejecting
# oversized bodies up front stops a single POST from OOMing the single worker.
MAX_BODY_BYTES = 25 * 1024 * 1024


def _assert_production_config() -> None:
    """Refuse to boot with insecure defaults."""
    if settings.environment != "development":
        if (
            settings.secret_key in ("", "dev-secret-change-me")
            or len(settings.secret_key) < 32
        ):
            raise RuntimeError(
                "SECRET_KEY must be overridden with a strong value (>=32 chars) "
                "when ENVIRONMENT is not 'development'. "
                'Generate one: python -c "import secrets; print(secrets.token_urlsafe(48))"'
            )
        return

    # Fail CLOSED on the classic footgun: ENVIRONMENT defaults to "development", so
    # a deploy that forgets to set it would otherwise boot with the publicly-known
    # dev SECRET_KEY (forgeable JWTs for any account). If the key is still the dev
    # default but the database is NOT local, this is a real deploy misconfigured —
    # refuse to start.
    db = settings.database_url.lower()
    is_local_db = "@localhost" in db or "@127.0.0.1" in db or "localhost:" in db
    if settings.secret_key == "dev-secret-change-me" and not is_local_db:
        raise RuntimeError(
            "Refusing to boot: SECRET_KEY is the known dev default but DATABASE_URL "
            "is not local. Set ENVIRONMENT and a strong SECRET_KEY for this deploy."
        )


def _run_migrations() -> None:
    """Upgrade the database to the latest Alembic revision (run on boot).

    Builds an Alembic Config with no .ini file so it never reconfigures the
    app's logging; env.py supplies the URL + metadata from app settings/models.
    """
    from pathlib import Path

    from alembic import command
    from alembic.config import Config as AlembicConfig

    from sqlalchemy import text

    backend_dir = Path(__file__).resolve().parents[1]  # .../backend
    cfg = AlembicConfig()
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    # Serialize migrations across instances: Alembic takes no cross-process lock,
    # so two instances booting at once (the Dockerfile advises scaling >1) could
    # run the same DDL concurrently. A Postgres *session* advisory lock makes the
    # loser wait for the winner, after which its upgrade is a no-op.
    lock_key = 0x5717_5A15  # stable arbitrary constant ("SYNSALS"-ish)
    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": lock_key})
        try:
            command.upgrade(cfg, "head")
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": lock_key})
            conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    _assert_production_config()

    # Bring the database schema to the latest Alembic revision. Single-worker
    # deploy, so migrating on boot is safe (no multi-worker race): a fresh DB is
    # built from scratch, an existing one gets new revisions, an up-to-date one
    # is a no-op.
    _run_migrations()

    # Runtime admin auto-grant — depends on the ADMIN_EMAILS config (not schema),
    # so it stays here rather than in a migration: promote any matching user.
    from sqlalchemy import text

    if settings.admin_emails_list:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE users SET is_admin=true WHERE LOWER(email) = ANY(:emails)"),
                {"emails": settings.admin_emails_list},
            )

    # Seed demo data (idempotent).
    from app.services.seed import seed_demo

    db = SessionLocal()
    try:
        if settings.environment == "development" or settings.seed_demo_data:
            seed_demo(db)
        else:
            logger.info("Demo seed skipped (environment=%s).", settings.environment)
    except Exception as exc:  # pragma: no cover
        logger.warning("Seed skipped: %s", exc)
    finally:
        db.close()

    start_scheduler()
    yield
    stop_scheduler()


# Interactive API docs are a dev convenience — disabled outside development so a
# production deploy doesn't expose its full schema/try-it surface publicly.
_docs_enabled = settings.environment == "development"

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="AI-Powered B2B Outreach & Lead Generation API",
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

from fastapi.exceptions import RequestValidationError  # noqa: E402
from starlette.middleware.base import BaseHTTPMiddleware  # noqa: E402
from starlette.responses import JSONResponse  # noqa: E402


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(request, exc: RequestValidationError):
    """Strip the echoed ``input`` (and ctx/url) from validation errors — Pydantic
    v2 includes the submitted value, which would reflect a password back in the
    422 body of a failed register/reset."""
    safe = [
        {k: v for k, v in err.items() if k not in ("input", "ctx", "url")}
        for err in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": safe})


async def _security_and_limits(request, call_next):
    """Reject oversized bodies and stamp defensive response headers on everything."""
    cl = request.headers.get("content-length")
    if cl and cl.isdigit() and int(cl) > MAX_BODY_BYTES:
        return JSONResponse({"detail": "Request body too large."}, status_code=413)
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    # HSTS only outside development (local dev is plain http); the API is HTTPS-only
    # in prod behind Cloudflare/Render.
    if settings.environment != "development":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
    return response


# Registered BEFORE CORS so CORSMiddleware stays outermost — a 413 (or any error)
# from this layer still gets the CORS headers the browser needs to read it.
app.add_middleware(BaseHTTPMiddleware, dispatch=_security_and_limits)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
from app.api.routers import (  # noqa: E402
    access,
    admin,
    agents,
    auth,
    campaigns,
    companies,
    contact_us,
    contacts,
    conversations,
    dashboard,
    emails,
    logs,
    meetings,
    notifications,
)

for module in (
    auth,
    access,
    admin,
    campaigns,
    companies,
    contacts,
    contact_us,
    emails,
    conversations,
    meetings,
    notifications,
    agents,
    logs,
    dashboard,
):
    app.include_router(module.router)


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "integrations": {
            "ai": ai.available,
            "search": search.status,
            # Free syntax/MX verification always runs; paid layer is optional.
            "email_verification": verification.paid_mode or "free (syntax+MX)",
            "email_finder": "hunter" if hunter.available else "off",
            "email_mode": email_provider.mode,
            "google_oauth": oauth_provider.available,
        },
    }


@app.get("/", tags=["meta"])
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/health"}
