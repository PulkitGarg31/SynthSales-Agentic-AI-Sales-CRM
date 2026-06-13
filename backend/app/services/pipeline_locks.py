"""Pipeline lock helpers. A contact with a Thread (a sent conversation) is
"locked": no clear path may delete it, so its conversation survives re-runs and
the full pipeline. A campaign with any Thread is "live", which disables undo.

Leaf module — imports only models + Session, never app.agents, so importing it
from the agents creates no cycle."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Contact, Thread


def locked_contact_ids(db: Session, campaign_id: int) -> set[int]:
    """Ids of contacts in this campaign that have a Thread (mail was sent)."""
    rows = (
        db.query(Thread.contact_id)
        .filter(Thread.campaign_id == campaign_id, Thread.contact_id.isnot(None))
        .distinct()
        .all()
    )
    return {cid for (cid,) in rows}


def is_locked(db: Session, contact: Contact) -> bool:
    """True if this contact has a Thread (a sent conversation)."""
    return (
        db.query(Thread.id).filter(Thread.contact_id == contact.id).first()
        is not None
    )


def campaign_is_live(db: Session, campaign_id: int) -> bool:
    """True once any conversation exists in the campaign. Undo is blocked while live."""
    return (
        db.query(Thread.id).filter(Thread.campaign_id == campaign_id).first()
        is not None
    )
