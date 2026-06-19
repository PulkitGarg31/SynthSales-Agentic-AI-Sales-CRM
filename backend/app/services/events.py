"""Helpers to record audit logs and notifications.

These persist the rows; the UI reads them via REST polling (GET /api/logs,
GET /api/notifications) — there is no WebSocket push.
"""
from sqlalchemy.orm import Session

from app.models import Log, Notification


def add_log(
    db: Session,
    owner_id: int | None,
    category: str,
    message: str,
    level: str = "info",
    commit: bool = True,
) -> Log:
    log = Log(owner_id=owner_id, category=category, message=message, level=level)
    db.add(log)
    if commit:
        db.commit()
        db.refresh(log)
    return log


def add_notification(
    db: Session,
    owner_id: int,
    ntype: str,
    title: str,
    detail: str = "",
    commit: bool = True,
) -> Notification:
    n = Notification(owner_id=owner_id, type=ntype, title=title, detail=detail)
    db.add(n)
    if commit:
        db.commit()
        db.refresh(n)
    return n
