"""Pipeline snapshots — one-level, 24h undo for a campaign's pipeline output.
Capture before a destructive op; restore rolls back and consumes the snapshot.
Undo is blocked once the campaign is live (any Thread). See the design spec."""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy.orm import Session

from app.models import (
    Campaign, Company, Contact, EmailDraft, PipelineSnapshot, utcnow,
)
from app.services.pipeline_locks import campaign_is_live

SNAPSHOT_TTL_HOURS = 24

# Company columns owned by the pipeline agents — snapshotted + restored.
_COMPANY_FIELDS = (
    "ai_score", "rank", "match_level", "match_explanation", "score_factors",
    "research_summary", "research_points", "recent_funding", "recent_news",
    "active_hiring", "enrichment_confidence", "metric_confidence",
    "domain_status", "mail_domain", "status",
)
_CONTACT_FIELDS = (
    "name", "role", "email", "linkedin", "verification", "confidence",
    "approved", "do_not_contact",
)
_DRAFT_FIELDS = ("subject", "body", "footer", "state")


class ConversationActive(Exception):
    """Raised by restore() when the campaign has a live conversation."""


def _serialize(db: Session, campaign: Campaign) -> dict:
    companies = db.query(Company).filter(Company.campaign_id == campaign.id).all()
    company_ids = [c.id for c in companies]
    contacts = (
        db.query(Contact).filter(Contact.company_id.in_(company_ids)).all()
        if company_ids else []
    )
    contact_ids = [c.id for c in contacts]
    drafts = (
        db.query(EmailDraft).filter(EmailDraft.contact_id.in_(contact_ids)).all()
        if contact_ids else []
    )
    return {
        "campaign": {"status": campaign.status},
        "companies": [
            {"id": c.id, **{f: getattr(c, f) for f in _COMPANY_FIELDS}}
            for c in companies
        ],
        "contacts": [
            {"id": c.id, "company_id": c.company_id,
             **{f: getattr(c, f) for f in _CONTACT_FIELDS}}
            for c in contacts
        ],
        "drafts": [
            {"id": d.id, "contact_id": d.contact_id,
             **{f: getattr(d, f) for f in _DRAFT_FIELDS}}
            for d in drafts
        ],
    }


def capture(db: Session, campaign: Campaign, owner_id: int, trigger: str, label: str) -> None:
    """Snapshot the campaign's pipeline picture, replacing any prior snapshot.
    No-op when the campaign is live (a Thread exists) — undo is blocked there."""
    if campaign_is_live(db, campaign.id):
        return
    db.query(PipelineSnapshot).filter(
        PipelineSnapshot.campaign_id == campaign.id
    ).delete()
    db.add(
        PipelineSnapshot(
            campaign_id=campaign.id, owner_id=owner_id, trigger=trigger,
            label=label, payload=_serialize(db, campaign),
            expires_at=utcnow() + timedelta(hours=SNAPSHOT_TTL_HOURS),
        )
    )
    db.commit()


def _latest(db: Session, campaign_id: int) -> PipelineSnapshot | None:
    """Newest snapshot for the campaign; deletes + ignores it if expired."""
    snap = (
        db.query(PipelineSnapshot)
        .filter(PipelineSnapshot.campaign_id == campaign_id)
        .order_by(PipelineSnapshot.created_at.desc())
        .first()
    )
    if snap is None:
        return None
    if snap.expires_at <= utcnow():
        db.delete(snap)
        db.commit()
        return None
    return snap


def availability(db: Session, campaign: Campaign) -> dict:
    if campaign_is_live(db, campaign.id):
        return {"available": False, "reason": "conversation_active"}
    snap = _latest(db, campaign.id)
    if snap is None:
        return {"available": False, "reason": "none"}
    return {
        "available": True, "trigger": snap.trigger, "label": snap.label,
        "created_at": snap.created_at, "expires_at": snap.expires_at,
    }


def restore(db: Session, campaign: Campaign) -> bool:
    """Roll the campaign back to its snapshot and consume it. Returns False when
    there's nothing to restore. Raises ConversationActive when the campaign is live."""
    if campaign_is_live(db, campaign.id):
        raise ConversationActive()
    snap = _latest(db, campaign.id)
    if snap is None:
        return False
    payload = snap.payload or {}

    campaign.status = payload.get("campaign", {}).get("status", campaign.status)

    live_companies = {
        c.id: c
        for c in db.query(Company).filter(Company.campaign_id == campaign.id).all()
    }
    for snap_co in payload.get("companies", []):
        co = live_companies.get(snap_co["id"])
        if co is None:
            continue
        for f in _COMPANY_FIELDS:
            if f in snap_co:
                setattr(co, f, snap_co[f])

    # Contacts: delete current (CASCADE drops drafts), re-insert from snapshot
    # with fresh ids, remapping old→new so drafts re-link.
    current = (
        db.query(Contact)
        .filter(Contact.company_id.in_(list(live_companies.keys())))
        .all()
        if live_companies else []
    )
    for c in current:
        db.delete(c)
    db.flush()

    id_map: dict[int, int] = {}
    for snap_c in payload.get("contacts", []):
        if snap_c["company_id"] not in live_companies:
            continue
        new_c = Contact(
            company_id=snap_c["company_id"],
            **{f: snap_c.get(f) for f in _CONTACT_FIELDS},
        )
        db.add(new_c)
        db.flush()
        id_map[snap_c["id"]] = new_c.id

    for snap_d in payload.get("drafts", []):
        new_cid = id_map.get(snap_d["contact_id"])
        if new_cid is None:
            continue
        db.add(
            EmailDraft(contact_id=new_cid, **{f: snap_d.get(f) for f in _DRAFT_FIELDS})
        )

    db.delete(snap)  # consume — one-level undo
    db.commit()
    return True


def purge_expired(db: Session) -> int:
    """Delete all globally-expired snapshots. Returns the count removed."""
    rows = db.query(PipelineSnapshot).filter(
        PipelineSnapshot.expires_at <= utcnow()
    ).all()
    for r in rows:
        db.delete(r)
    if rows:
        db.commit()
    return len(rows)
