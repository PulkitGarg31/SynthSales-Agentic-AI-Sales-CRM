import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.providers.ai import ai
from app.providers.email import email_provider
from app.providers.search import search
from app.providers.verification import verification
from app.workers.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reachly")


@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio

    from app.realtime.ws import set_main_loop

    # Capture the running loop so threadpool request handlers can broadcast.
    set_main_loop(asyncio.get_running_loop())

    # Import models so metadata is populated before create_all.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)

    # Lightweight, idempotent migrations for columns added after a table already
    # exists (create_all never ALTERs an existing table).
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "outbound_enabled BOOLEAN NOT NULL DEFAULT false"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS "
                "enrichment_confidence INTEGER NOT NULL DEFAULT 50"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS "
                "domain_status VARCHAR(20) NOT NULL DEFAULT 'unknown'"
            )
        )

    # Seed demo data (idempotent).
    from app.services.seed import seed_demo

    db = SessionLocal()
    try:
        seed_demo(db)
    except Exception as exc:  # pragma: no cover
        logger.warning("Seed skipped: %s", exc)
    finally:
        db.close()

    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="AI-Powered B2B Outreach & Lead Generation API",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
from app.api.routers import (  # noqa: E402
    agents,
    auth,
    campaigns,
    companies,
    contacts,
    conversations,
    dashboard,
    emails,
    logs,
    meetings,
    notifications,
    ws,
)

for module in (
    auth,
    campaigns,
    companies,
    contacts,
    emails,
    conversations,
    meetings,
    notifications,
    agents,
    logs,
    dashboard,
    ws,
):
    app.include_router(module.router)


@app.get("/health", tags=["meta"])
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "integrations": {
            "ai": ai.available,
            "search": search.available,
            # Free syntax/MX verification always runs; paid layer is optional.
            "email_verification": verification.paid_mode or "free (syntax+MX)",
            "email_mode": email_provider.mode,
        },
    }


@app.get("/", tags=["meta"])
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/health"}
