from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Company, Contact, EmailDraft, Meeting, Message, Thread
from app.schemas import CampaignOut, CompanyOut


def campaign_rollups(db: Session, campaign) -> CampaignOut:
    uploaded = (
        db.query(func.count(Company.id))
        .filter(Company.campaign_id == campaign.id)
        .scalar()
        or 0
    )
    researched = (
        db.query(func.count(Company.id))
        .filter(Company.campaign_id == campaign.id, Company.status != "Researching")
        .scalar()
        or 0
    )
    thread_ids = [
        t.id for t in db.query(Thread.id).filter(Thread.campaign_id == campaign.id)
    ]
    emails_sent = len(thread_ids)
    replies = 0
    if thread_ids:
        replies = (
            db.query(func.count(func.distinct(Message.thread_id)))
            .filter(Message.thread_id.in_(thread_ids), Message.direction == "them")
            .scalar()
            or 0
        )
    meetings = (
        db.query(func.count(Meeting.id))
        .filter(Meeting.campaign_id == campaign.id)
        .scalar()
        or 0
    )
    out = CampaignOut.model_validate(campaign)
    out.companies_uploaded = uploaded
    out.companies_researched = researched
    out.emails_sent = emails_sent
    out.replies_received = replies
    out.meetings_booked = meetings
    return out


def company_out(db: Session, company: Company) -> CompanyOut:
    found = (
        db.query(func.count(Contact.id))
        .filter(Contact.company_id == company.id)
        .scalar()
        or 0
    )
    verified = (
        db.query(func.count(Contact.id))
        .filter(Contact.company_id == company.id, Contact.verification == "Verified")
        .scalar()
        or 0
    )
    out = CompanyOut.model_validate(company)
    out.contacts_found = found
    out.contacts_verified = verified
    return out
