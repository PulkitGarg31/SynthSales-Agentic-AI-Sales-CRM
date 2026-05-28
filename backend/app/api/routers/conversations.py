from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.meeting import meeting_agent
from app.agents.tracking import tracking_agent
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import (
    Campaign,
    Company,
    Contact,
    EmailDraft,
    Message,
    Thread,
    User,
    utcnow,
)
from app.providers.email import email_provider
from app.schemas import ReplyIn, ThreadDetailOut, ThreadOut

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _owned(db: Session, user: User, thread_id: int) -> Thread:
    t = db.get(Thread, thread_id)
    if not t:
        raise HTTPException(status_code=404, detail="Thread not found")
    campaign = db.get(Campaign, t.campaign_id)
    if not campaign or campaign.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Thread not found")
    return t


def _enrich(db: Session, t: Thread) -> Thread:
    """Attach contact/company display fields (transient, not persisted)."""
    contact = db.get(Contact, t.contact_id) if t.contact_id else None
    company = db.get(Company, t.company_id) if t.company_id else None
    t.contact_name = contact.name if contact else ""  # type: ignore[attr-defined]
    t.role = contact.role if contact else ""  # type: ignore[attr-defined]
    t.email = contact.email if contact else ""  # type: ignore[attr-defined]
    t.company_name = (  # type: ignore[attr-defined]
        company.name if company else (contact.company.name if contact else "")
    )
    return t


@router.get("", response_model=list[ThreadOut])
def list_threads(
    campaign_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (
        db.query(Thread)
        .join(Campaign, Campaign.id == Thread.campaign_id)
        .filter(Campaign.owner_id == user.id)
        .order_by(Thread.last_activity.desc())
    )
    if campaign_id is not None:
        q = q.filter(Campaign.id == campaign_id)
    return [_enrich(db, t) for t in q.all()]


@router.get("/{thread_id}", response_model=ThreadDetailOut)
def get_thread(
    thread_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    t = _owned(db, user, thread_id)
    t.unread = False
    db.commit()
    _enrich(db, t)
    out = ThreadDetailOut.model_validate(t)
    out.messages = t.messages  # type: ignore[assignment]
    out.ai_suggestion = tracking_agent.suggestion_for(t)
    return out


@router.post("/{thread_id}/reply", response_model=ThreadDetailOut)
def reply(
    thread_id: int,
    payload: ReplyIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = _owned(db, user, thread_id)
    db.add(
        Message(thread_id=t.id, direction="us", author=user.name, body=payload.body)
    )
    t.last_activity = utcnow()
    db.commit()
    return get_thread(thread_id, db, user)


class SendFromDraftIn(BaseModel):
    draft_id: int


@router.post("/send", response_model=ThreadDetailOut, status_code=201)
def send_from_draft(
    payload: SendFromDraftIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.outbound_enabled:
        raise HTTPException(
            status_code=403,
            detail="Outbound sending is paused. Enable it in Settings → Email before sending.",
        )
    draft = db.get(EmailDraft, payload.draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    contact = db.get(Contact, draft.contact_id)
    company = contact.company if contact else None
    if not company or company.campaign.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Draft not found")

    thread = Thread(
        campaign_id=company.campaign_id,
        company_id=company.id,
        contact_id=contact.id,
        subject=draft.subject,
        stage="Contacted",
        unread=False,
    )
    db.add(thread)
    db.flush()
    db.add(
        Message(
            thread_id=thread.id,
            direction="us",
            author=user.name,
            subject=draft.subject,
            body=f"{draft.body}\n\n{draft.footer}",
        )
    )
    # Outbound is enabled (checked above) — attempt real delivery. The provider
    # degrades gracefully (logs + returns False) if SMTP/Gmail isn't configured.
    if contact.email:
        email_provider.send(
            contact.email, draft.subject, f"{draft.body}\n\n{draft.footer}"
        )
    draft.state = "Sent"
    company.status = "Contacted"
    db.commit()
    return get_thread(thread.id, db, user)


class BookMeetingIn(BaseModel):
    scheduled_at: datetime
    link: str
    notes: str | None = None


@router.post("/{thread_id}/book-meeting", response_model=ThreadDetailOut)
def book_meeting(
    thread_id: int,
    payload: BookMeetingIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = _owned(db, user, thread_id)
    meeting_agent.book(db, t, user.id, payload.scheduled_at, payload.link, payload.notes)
    return get_thread(thread_id, db, user)
