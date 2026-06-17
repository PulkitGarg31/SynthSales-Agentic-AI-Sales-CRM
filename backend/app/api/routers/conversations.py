from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.agents.meeting import meeting_agent
from app.agents.reply_classifier import reply_classifier_agent
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
from app.services.events import add_log

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class SyncResult(BaseModel):
    ingested: int
    classified: int


@router.post("/sync", response_model=SyncResult)
def sync_inbox(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """Read the user's connected mailbox now, ingest + classify new replies.
    No mailbox connected ⇒ {ingested:0, classified:0} (no error)."""
    result = reply_classifier_agent.run(db, user.id)
    return SyncResult(**result)


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
    last_them = (
        db.query(Message)
        .filter(Message.thread_id == t.id, Message.direction == "them")
        .order_by(Message.sent_at.desc())
        .first()
    )
    t.last_intent = last_them.intent if last_them else None  # type: ignore[attr-defined]
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
    """Send a manual reply to the prospect on this thread. Same gating as /send:
    blocked (403) while outbound is paused or the contact is do-not-contact. Records
    the message either way; emails it when an address is on file."""
    t = _owned(db, user, thread_id)
    if not user.outbound_enabled:
        raise HTTPException(
            status_code=403,
            detail="Outbound sending is paused. Enable it in Settings → Email before sending.",
        )
    contact = db.get(Contact, t.contact_id) if t.contact_id else None
    if contact and contact.do_not_contact:
        raise HTTPException(
            status_code=403, detail="This contact is marked do-not-contact."
        )
    subject = t.subject or "Following up"
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"
    db.add(
        Message(
            thread_id=t.id,
            direction="us",
            author=user.name,
            subject=subject,
            body=payload.body,
        )
    )
    t.last_activity = utcnow()
    # Outbound enabled + not suppressed → attempt real delivery. The provider
    # degrades gracefully (logs + returns False) if SMTP/Gmail isn't configured.
    if contact and contact.email:
        email_provider.send(contact.email, subject, payload.body)
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
    if contact.do_not_contact:
        raise HTTPException(
            status_code=403, detail="This contact is marked do-not-contact."
        )

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
    link: str | None = None
    notes: str | None = None
    duration_minutes: int | None = None


@router.post("/{thread_id}/book-meeting", response_model=ThreadDetailOut)
def book_meeting(
    thread_id: int,
    payload: BookMeetingIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = _owned(db, user, thread_id)
    try:
        meeting_agent.book(
            db,
            t,
            user,
            payload.scheduled_at,
            payload.link,
            payload.notes,
            duration_minutes=payload.duration_minutes,
        )
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Connect your Google Calendar or paste a meeting link.",
        )
    return get_thread(thread_id, db, user)


class StageOverrideIn(BaseModel):
    stage: str | None = None
    clear_do_not_contact: bool | None = None


_ALLOWED_STAGES = {
    "Contacted", "Replied", "Negotiating", "Meeting", "Closed", "Stalled",
}


@router.patch("/{thread_id}/stage", response_model=ThreadDetailOut)
def override_stage(
    thread_id: int,
    payload: StageOverrideIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Human override of a classification — e.g. reopen a wrongly-Closed thread
    and clear the contact's do-not-contact flag so normal cadence resumes."""
    t = _owned(db, user, thread_id)
    if payload.stage is not None:
        if payload.stage not in _ALLOWED_STAGES:
            raise HTTPException(status_code=400, detail="Invalid stage")
        t.stage = payload.stage
    if payload.clear_do_not_contact:
        contact = db.get(Contact, t.contact_id) if t.contact_id else None
        if contact:
            contact.do_not_contact = False
    t.last_activity = utcnow()
    db.commit()
    add_log(db, user.id, "User", f"Thread '{t.subject}' overridden by user.")
    return get_thread(thread_id, db, user)
