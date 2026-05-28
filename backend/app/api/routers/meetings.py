from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Campaign, Meeting, User
from app.schemas import MeetingOut

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def _owned_campaign_ids(db: Session, user: User) -> list[int]:
    return [c.id for c in db.query(Campaign.id).filter(Campaign.owner_id == user.id)]


@router.get("", response_model=list[MeetingOut])
def list_meetings(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ids = _owned_campaign_ids(db, user)
    q = db.query(Meeting).filter(Meeting.campaign_id.in_(ids or [-1]))
    if status:
        q = q.filter(Meeting.status == status)
    return q.order_by(Meeting.scheduled_at).all()


class MeetingStatusIn(BaseModel):
    status: str
    notes: str | None = None


@router.patch("/{meeting_id}", response_model=MeetingOut)
def update_meeting(
    meeting_id: int,
    payload: MeetingStatusIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = db.get(Meeting, meeting_id)
    if not m or m.campaign_id not in _owned_campaign_ids(db, user):
        raise HTTPException(status_code=404, detail="Meeting not found")
    m.status = payload.status
    if payload.notes is not None:
        m.notes = payload.notes
    db.commit()
    db.refresh(m)
    return m
