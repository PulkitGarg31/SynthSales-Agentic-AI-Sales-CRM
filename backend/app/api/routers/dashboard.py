from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Campaign, Company, Contact, Meeting, Message, Thread, User
from app.schemas import DashboardOut, FunnelStage

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    campaign_ids = [c.id for c in db.query(Campaign.id).filter(Campaign.owner_id == user.id)]
    cid = campaign_ids or [-1]

    def count(model, *filters):
        return db.query(func.count(model.id)).filter(*filters).scalar() or 0

    status_count = lambda s: count(Campaign, Campaign.owner_id == user.id, Campaign.status == s)

    uploaded = count(Company, Company.campaign_id.in_(cid))
    researched = count(Company, Company.campaign_id.in_(cid), Company.status != "Researching")
    qualified = count(
        Company,
        Company.campaign_id.in_(cid),
        Company.status.in_(["Qualified", "Approved", "Contacted"]),
    )
    contacted = count(Thread, Thread.campaign_id.in_(cid))
    replied = (
        db.query(func.count(func.distinct(Message.thread_id)))
        .join(Thread, Thread.id == Message.thread_id)
        .filter(Thread.campaign_id.in_(cid), Message.direction == "them")
        .scalar()
        or 0
    )
    meetings = count(Meeting, Meeting.campaign_id.in_(cid))
    emails_sent = contacted

    return DashboardOut(
        active_campaigns=status_count("Running"),
        paused_campaigns=status_count("Paused"),
        completed_campaigns=status_count("Completed"),
        companies_uploaded=uploaded,
        companies_researched=researched,
        emails_sent=emails_sent,
        replies_received=replied,
        meetings_booked=meetings,
        funnel=[
            FunnelStage(label="Uploaded", value=uploaded),
            FunnelStage(label="Qualified", value=qualified),
            FunnelStage(label="Contacted", value=contacted),
            FunnelStage(label="Replied", value=replied),
            FunnelStage(label="Meeting", value=meetings),
        ],
    )
