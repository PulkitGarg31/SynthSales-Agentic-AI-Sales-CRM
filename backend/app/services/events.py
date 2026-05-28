"""Helpers to record audit logs and notifications, and push them over WS."""
from sqlalchemy.orm import Session

from app.models import Log, Notification
from app.realtime.ws import notify


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
    if owner_id is not None:
        notify(
            owner_id,
            "log",
            {"category": category, "message": message, "level": level},
        )
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
    notify(owner_id, "notification", {"type": ntype, "title": title, "detail": detail})
    return n
