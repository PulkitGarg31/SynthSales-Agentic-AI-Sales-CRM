"""Background scheduler — runs the follow-up and inbound-reply jobs on intervals.

PRD §3 Phase 7. Two interval jobs (plus an hourly snapshot purge): follow-ups poll
every `followup_interval_minutes` (default 15) and send a nudge once a thread has gone
unanswered for `followup_delay_days` (default 7); a separate job polls inboxes every
`inbound_poll_minutes` (default 5) and runs the reply classifier.
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.agents.tracking import tracking_agent
from app.agents.reply_classifier import reply_classifier_agent
from app.providers.inbound import inbound_provider
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import User
from app.services import snapshots

logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


def _poll_followups() -> None:
    db = SessionLocal()
    try:
        for user in db.query(User).all():
            try:
                tracking_agent.run(db, user.id)
            except Exception as exc:  # pragma: no cover
                logger.warning("Tracking run failed for user %s: %s", user.id, exc)
    finally:
        db.close()


def _poll_inbound() -> None:
    db = SessionLocal()
    try:
        for user in db.query(User).all():
            if not inbound_provider.available_for(user):
                continue
            try:
                reply_classifier_agent.run(db, user.id)
            except Exception as exc:  # pragma: no cover
                logger.warning("Inbound poll failed for user %s: %s", user.id, exc)
    finally:
        db.close()


def _purge_snapshots() -> None:
    db = SessionLocal()
    try:
        n = snapshots.purge_expired(db)
        if n:
            logger.info("Purged %s expired pipeline snapshot(s)", n)
    finally:
        db.close()


def _purge_revoked_tokens() -> None:
    db = SessionLocal()
    try:
        from app.models import RevokedToken, utcnow

        n = (
            db.query(RevokedToken)
            .filter(RevokedToken.expires_at < utcnow())
            .delete(synchronize_session=False)
        )
        db.commit()
        if n:
            logger.info("Purged %s expired revoked token(s)", n)
    finally:
        db.close()


def start_scheduler() -> None:
    global _scheduler
    if not settings.enable_scheduler or _scheduler is not None:
        return
    _scheduler = BackgroundScheduler(daemon=True)
    _scheduler.add_job(
        _poll_followups,
        "interval",
        minutes=settings.followup_interval_minutes,
        id="followups",
        # first run is one interval out (interval trigger's default) — not on boot.
        # NOTE: passing next_run_time=None here would PAUSE the job (it never runs).
    )
    _scheduler.add_job(
        _poll_inbound,
        "interval",
        minutes=settings.inbound_poll_minutes,
        id="inbound",
        # first run is one interval out (interval trigger's default) — not on boot.
        # NOTE: passing next_run_time=None here would PAUSE the job (it never runs).
    )
    _scheduler.add_job(
        _purge_snapshots,
        "interval",
        minutes=60,
        id="snapshot_purge",
        # first run is one interval out (interval trigger's default) — not on boot.
        # NOTE: passing next_run_time=None here would PAUSE the job (it never runs).
    )
    _scheduler.add_job(
        _purge_revoked_tokens,
        "interval",
        minutes=60,
        id="revoked_token_purge",
    )
    _scheduler.start()
    logger.info(
        "Scheduler started: follow-up polling every %s min, inbound polling every %s min",
        settings.followup_interval_minutes,
        settings.inbound_poll_minutes,
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
