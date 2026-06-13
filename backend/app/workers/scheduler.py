"""Background scheduler — runs the tracking/follow-up agent on an interval.

PRD §3 Phase 7: monitor inboxes every 15 minutes and send contextual
follow-ups until a meeting is booked or the campaign is stopped.
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
        next_run_time=None,  # don't fire immediately on boot
    )
    _scheduler.add_job(
        _poll_inbound,
        "interval",
        minutes=settings.inbound_poll_minutes,
        id="inbound",
        next_run_time=None,  # don't fire immediately on boot
    )
    _scheduler.add_job(
        _purge_snapshots,
        "interval",
        minutes=60,
        id="snapshot_purge",
        next_run_time=None,  # don't fire immediately on boot
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
