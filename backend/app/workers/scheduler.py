"""Background scheduler — runs the tracking/follow-up agent on an interval.

PRD §3 Phase 7: monitor inboxes every 15 minutes and send contextual
follow-ups until a meeting is booked or the campaign is stopped.
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.agents.tracking import tracking_agent
from app.core.config import settings
from app.core.database import SessionLocal
from app.models import User

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
    _scheduler.start()
    logger.info(
        "Scheduler started: follow-up polling every %s min",
        settings.followup_interval_minutes,
    )


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
