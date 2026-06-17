import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
from app.providers.ai import ai
from app.providers.email import email_provider
from app.providers.hunter import hunter
from app.providers.oauth import oauth_provider
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
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "autonomous_replies BOOLEAN NOT NULL DEFAULT false"
            )
        )
        # OTP codes carry a 1-char provenance prefix (V/R) since 2026-06-12;
        # widening is idempotent (a no-op when already VARCHAR(8)).
        conn.execute(text("ALTER TABLE users ALTER COLUMN otp_code TYPE VARCHAR(8)"))
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
        conn.execute(
            text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS "
                "mail_domain VARCHAR(200) NOT NULL DEFAULT ''"
            )
        )
        # 5–8 bullet research profile (user-facing) + per-metric confidence
        # (backend-only, feeds scoring). JSON maps to JSONB on Postgres.
        conn.execute(
            text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS "
                "research_points JSONB NOT NULL DEFAULT '[]'::jsonb"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE companies ADD COLUMN IF NOT EXISTS "
                "metric_confidence JSONB NOT NULL DEFAULT '{}'::jsonb"
            )
        )
        # Widen multi-select columns so picking many industries / countries /
        # size brackets doesn't overflow. Idempotent on Postgres.
        conn.execute(text("ALTER TABLE campaigns ALTER COLUMN industry_pref TYPE VARCHAR(600)"))
        conn.execute(text("ALTER TABLE campaigns ALTER COLUMN geography TYPE VARCHAR(400)"))
        conn.execute(text("ALTER TABLE campaigns ALTER COLUMN company_size TYPE VARCHAR(120)"))
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "is_admin BOOLEAN NOT NULL DEFAULT false"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "otp_attempts INTEGER NOT NULL DEFAULT 0"
            )
        )
        conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)")
        )
        conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_token TEXT")
        )
        conn.execute(
            text(
                "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "
                "do_not_contact BOOLEAN NOT NULL DEFAULT false"
            )
        )
        # Step 05 — inbound reply detection: per-message provider id (de-dupe) +
        # classified intent; per-thread provider conversation id; per-user gmail
        # read token.
        conn.execute(
            text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)")
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS ix_messages_external_id ON messages (external_id)")
        )
        conn.execute(
            text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS intent VARCHAR(20)")
        )
        conn.execute(
            text("ALTER TABLE threads ADD COLUMN IF NOT EXISTS provider_thread_id VARCHAR(255)")
        )
        conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS gmail_read_token TEXT")
        )
        # Auto-promote any user whose email matches the ADMIN_EMAILS config.
        # Lets you set the admin list in .env instead of running ad-hoc SQL.
        if settings.admin_emails_list:
            conn.execute(
                text("UPDATE users SET is_admin=true WHERE LOWER(email) = ANY(:emails)"),
                {"emails": settings.admin_emails_list},
            )
        # Step 03: the former `email_guess` + `verification` agents were merged
        # into a single `email_guess_verification` agent. Drop the stale per-user
        # rows and back-fill the merged one for existing users (new users get it
        # from ensure_agents()).
        conn.execute(
            text("DELETE FROM agent_configs WHERE key IN ('email_guess', 'verification')")
        )
        conn.execute(
            text(
                "INSERT INTO agent_configs "
                '(owner_id, key, name, description, enabled, "order", status) '
                "SELECT u.id, 'email_guess_verification', "
                "'Email Guessing & Verification', '', true, 4, 'Idle' "
                "FROM users u WHERE NOT EXISTS ("
                "SELECT 1 FROM agent_configs ac "
                "WHERE ac.owner_id = u.id AND ac.key = 'email_guess_verification')"
            )
        )
        # Step 05: back-fill the new reply_classifier agent row (order 8) for
        # existing users so they see 8 agents. New users get it from ensure_agents().
        conn.execute(
            text(
                "INSERT INTO agent_configs "
                '(owner_id, key, name, description, enabled, "order", status) '
                "SELECT u.id, 'reply_classifier', 'Reply Detection & Intent', '', "
                "true, 8, 'Idle' "
                "FROM users u WHERE NOT EXISTS ("
                "SELECT 1 FROM agent_configs ac "
                "WHERE ac.owner_id = u.id AND ac.key = 'reply_classifier')"
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
    ws,
)

for module in (
    auth,
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
            "email_finder": "hunter" if hunter.available else "off",
            "email_mode": email_provider.mode,
            "google_oauth": oauth_provider.available,
        },
    }


@app.get("/", tags=["meta"])
def root():
    return {"name": settings.app_name, "docs": "/docs", "health": "/health"}
