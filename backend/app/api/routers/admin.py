"""Admin-only routes: cross-tenant read + delete across every user's data.

Bootstrap the first admin by flipping the flag directly in the DB once:

    .\\db.ps1 sql "UPDATE users SET is_admin=true WHERE email='you@example.com'"

After that, you can use POST /api/admin/users/{id}/admin to grant or revoke
the flag on other users through the API.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.core.database import get_db
from app.models import Campaign, Company, Contact, EmailDraft, User

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


# ---------- Pydantic shapes for the read endpoints ----------

class AdminUserRow(BaseModel):
    id: int
    name: str
    email: str
    is_verified: bool
    outbound_enabled: bool
    is_admin: bool
    campaigns: int
    companies: int
    contacts: int


class AdminCampaignRow(BaseModel):
    id: int
    owner_id: int
    name: str
    status: str
    top_n: int
    companies: int
    contacts: int
    drafts: int


class AdminSetFlag(BaseModel):
    value: bool


# ---------- Users ----------

@router.get("/users", response_model=list[AdminUserRow])
def list_users(db: Session = Depends(get_db)):
    """Every user in the system, with rollup counts."""
    out: list[AdminUserRow] = []
    for u in db.query(User).order_by(User.id).all():
        camp_ids = [c.id for c in u.campaigns]
        companies = (
            db.query(Company).filter(Company.campaign_id.in_(camp_ids)).count()
            if camp_ids else 0
        )
        contacts = (
            db.query(Contact)
            .join(Company, Company.id == Contact.company_id)
            .filter(Company.campaign_id.in_(camp_ids))
            .count()
            if camp_ids else 0
        )
        out.append(AdminUserRow(
            id=u.id, name=u.name, email=u.email,
            is_verified=u.is_verified, outbound_enabled=u.outbound_enabled,
            is_admin=u.is_admin,
            campaigns=len(u.campaigns), companies=companies, contacts=contacts,
        ))
    return out


@router.get("/users/{user_id}")
def get_user_tree(user_id: int, db: Session = Depends(get_db)):
    """Full nested view of one user's data — campaigns, companies, contacts."""
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    return {
        "user": {
            "id": u.id, "name": u.name, "email": u.email,
            "is_verified": u.is_verified, "outbound_enabled": u.outbound_enabled,
            "is_admin": u.is_admin,
        },
        "campaigns": [
            {
                "id": c.id, "name": c.name, "status": c.status, "top_n": c.top_n,
                "companies": [
                    {
                        "id": co.id, "name": co.name, "rank": co.rank,
                        "ai_score": co.ai_score, "status": co.status,
                        "domain_status": co.domain_status,
                        "contacts": [
                            {
                                "id": ct.id, "name": ct.name, "role": ct.role,
                                "email": ct.email, "verification": ct.verification,
                                "approved": ct.approved,
                            }
                            for ct in co.contacts
                        ],
                    }
                    for co in c.companies
                ],
            }
            for c in u.campaigns
        ],
    }


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    """Hard-delete a user and (via CASCADE) all their data:
    campaigns, companies, contacts, email_drafts, threads, messages,
    notifications, logs, agent_configs. Meetings are kept but orphaned
    (campaign_id set to NULL) since they may represent real calendar events.
    """
    if user_id == me.id:
        raise HTTPException(400, "Admins can't delete their own account here")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    db.delete(u)
    db.commit()


@router.post("/users/{user_id}/admin", response_model=AdminUserRow)
def set_admin_flag(
    user_id: int,
    payload: AdminSetFlag,
    db: Session = Depends(get_db),
    me: User = Depends(require_admin),
):
    """Grant or revoke the admin flag for another user."""
    if user_id == me.id and not payload.value:
        raise HTTPException(400, "Admins can't demote themselves here")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    u.is_admin = payload.value
    db.commit()
    db.refresh(u)
    return AdminUserRow(
        id=u.id, name=u.name, email=u.email,
        is_verified=u.is_verified, outbound_enabled=u.outbound_enabled,
        is_admin=u.is_admin,
        campaigns=len(u.campaigns),
        companies=db.query(Company).join(Campaign).filter(Campaign.owner_id == u.id).count(),
        contacts=(
            db.query(Contact)
            .join(Company, Company.id == Contact.company_id)
            .join(Campaign, Campaign.id == Company.campaign_id)
            .filter(Campaign.owner_id == u.id)
            .count()
        ),
    )


# ---------- Campaigns / Companies / Contacts (cross-tenant) ----------

@router.get("/campaigns", response_model=list[AdminCampaignRow])
def list_all_campaigns(db: Session = Depends(get_db)):
    out: list[AdminCampaignRow] = []
    for c in db.query(Campaign).order_by(Campaign.owner_id, Campaign.id).all():
        companies = db.query(Company).filter(Company.campaign_id == c.id).count()
        contacts = (
            db.query(Contact)
            .join(Company, Company.id == Contact.company_id)
            .filter(Company.campaign_id == c.id)
            .count()
        )
        drafts = (
            db.query(EmailDraft)
            .join(Contact, Contact.id == EmailDraft.contact_id)
            .join(Company, Company.id == Contact.company_id)
            .filter(Company.campaign_id == c.id)
            .count()
        )
        out.append(AdminCampaignRow(
            id=c.id, owner_id=c.owner_id, name=c.name,
            status=c.status, top_n=c.top_n,
            companies=companies, contacts=contacts, drafts=drafts,
        ))
    return out


@router.get("/campaigns/{campaign_id}")
def get_campaign_tree(campaign_id: int, db: Session = Depends(get_db)):
    """Single campaign with everything researched for it: companies (with
    enrichment summary, score, signals, domain status) and contacts (with
    email + verification + draft state) nested inline."""
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")
    owner = db.get(User, c.owner_id)
    return {
        "campaign": {
            "id": c.id, "owner_id": c.owner_id,
            "owner_email": owner.email if owner else None,
            "name": c.name, "product": c.product, "status": c.status,
            "tone": c.tone, "top_n": c.top_n,
            "icp": c.icp, "industry_pref": c.industry_pref,
            "geography": c.geography, "company_size": c.company_size,
            "business_requirements": c.business_requirements,
            "ranking_criteria": c.ranking_criteria,
        },
        "companies": [
            {
                "id": co.id, "name": co.name, "domain": co.domain,
                "industry": co.industry, "size": co.size, "location": co.location,
                "rank": co.rank, "ai_score": co.ai_score,
                "match_level": co.match_level, "status": co.status,
                "enrichment_confidence": co.enrichment_confidence,
                "domain_status": co.domain_status,
                "research_summary": co.research_summary,
                "match_explanation": co.match_explanation,
                "score_factors": co.score_factors,
                "recent_funding": co.recent_funding,
                "recent_news": co.recent_news,
                "active_hiring": co.active_hiring,
                "contacts": [
                    {
                        "id": ct.id, "name": ct.name, "role": ct.role,
                        "email": ct.email, "linkedin": ct.linkedin,
                        "verification": ct.verification, "confidence": ct.confidence,
                        "approved": ct.approved,
                        "drafts": [
                            {"id": d.id, "subject": d.subject, "state": d.state}
                            for d in (
                                db.query(EmailDraft)
                                .filter(EmailDraft.contact_id == ct.id)
                                .all()
                            )
                        ],
                    }
                    for ct in co.contacts
                ],
            }
            for co in sorted(c.companies, key=lambda co: (co.rank or 999, co.id))
        ],
    }


@router.delete("/campaigns/{campaign_id}", status_code=204)
def delete_any_campaign(campaign_id: int, db: Session = Depends(get_db)):
    c = db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(404, "Campaign not found")
    db.delete(c)
    db.commit()


@router.get("/companies/{company_id}")
def get_any_company(company_id: int, db: Session = Depends(get_db)):
    """Full research record for any user's company. Same payload as the
    owner-scoped GET /api/companies/{id} but bypasses ownership for admins."""
    co = db.get(Company, company_id)
    if not co:
        raise HTTPException(404, "Company not found")
    return {
        "id": co.id, "campaign_id": co.campaign_id,
        "name": co.name, "domain": co.domain,
        "industry": co.industry, "size": co.size, "location": co.location,
        "rank": co.rank, "ai_score": co.ai_score,
        "match_level": co.match_level, "status": co.status,
        "enrichment_confidence": co.enrichment_confidence,
        "domain_status": co.domain_status,
        "research_summary": co.research_summary,
        "match_explanation": co.match_explanation,
        "score_factors": co.score_factors,
        "recent_funding": co.recent_funding,
        "recent_news": co.recent_news,
        "active_hiring": co.active_hiring,
        "contacts": [
            {
                "id": ct.id, "name": ct.name, "role": ct.role,
                "email": ct.email, "linkedin": ct.linkedin,
                "verification": ct.verification, "confidence": ct.confidence,
                "approved": ct.approved,
            }
            for ct in co.contacts
        ],
    }


@router.delete("/companies/{company_id}", status_code=204)
def delete_any_company(company_id: int, db: Session = Depends(get_db)):
    c = db.get(Company, company_id)
    if not c:
        raise HTTPException(404, "Company not found")
    db.delete(c)
    db.commit()


@router.delete("/contacts/{contact_id}", status_code=204)
def delete_any_contact(contact_id: int, db: Session = Depends(get_db)):
    ct = db.get(Contact, contact_id)
    if not ct:
        raise HTTPException(404, "Contact not found")
    db.delete(ct)
    db.commit()
