from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.agents.employee_finder import employee_finder_agent
from app.agents.enrichment import enrichment_agent
from app.agents.email_guess_verification import email_guess_verification_agent
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Company, Contact, Thread, User
from app.schemas import (
    CompanyDetailOut,
    CompanyMailDomainUpdate,
    CompanyStatusUpdate,
    ContactCreate,
    ContactOut,
)
from app.services.events import add_log
from app.services.serializers import company_out

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _owned(db: Session, user: User, company_id: int) -> Company:
    c = db.get(Company, company_id)
    if not c or c.campaign.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Company not found")
    return c


@router.get("/{company_id}", response_model=CompanyDetailOut)
def get_company(
    company_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    c = _owned(db, user, company_id)
    base = company_out(db, c)
    detail = CompanyDetailOut(**base.model_dump())
    detail.contacts = [ContactOut.model_validate(ct) for ct in c.contacts]
    return detail


@router.patch("/{company_id}/status", response_model=CompanyDetailOut)
def set_status(
    company_id: int,
    payload: CompanyStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    c = _owned(db, user, company_id)
    c.status = payload.status
    db.commit()
    return get_company(company_id, db, user)


@router.patch("/{company_id}/mail-domain", response_model=CompanyDetailOut)
def set_mail_domain(
    company_id: int,
    payload: CompanyMailDomainUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set an explicit mail domain (the part after '@') for a company whose email
    domain differs from its website (e.g. makenotion.com vs notion.so). The
    guess-verify agent then uses it for Hunter + pattern guessing."""
    c = _owned(db, user, company_id)
    md = (payload.mail_domain or "").strip().lower().lstrip("@")
    for pre in ("https://", "http://", "www."):
        if md.startswith(pre):
            md = md[len(pre):]
    c.mail_domain = md.split("/")[0].strip()
    db.commit()
    add_log(db, user.id, "Campaign", f"Set mail domain '{c.mail_domain or '(cleared)'}' for {c.name}.")
    return get_company(company_id, db, user)


@router.post("/{company_id}/enrich", response_model=CompanyDetailOut)
def enrich(
    company_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    """On-demand "Re-research". Unlike the bulk pipeline, this forces the
    AI/search path even on dead/parked domains so the user actually gets a
    fresh attempt — that's the point of clicking the button."""
    c = _owned(db, user, company_id)
    enrichment_agent.run(db, c, c.campaign, user.id, force_ai=True)
    return get_company(company_id, db, user)


@router.post("/{company_id}/find-contacts", response_model=CompanyDetailOut)
def find_contacts(
    company_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    c = _owned(db, user, company_id)
    employee_finder_agent.run(db, c, user.id)
    email_guess_verification_agent.run(db, c, user.id)
    return get_company(company_id, db, user)


@router.post("/{company_id}/contacts", response_model=CompanyDetailOut)
def add_contact(
    company_id: int,
    payload: ContactCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually add a contact to a company (owner-scoped). The email is still
    subject to email verification (free MX/syntax → Verifalia/ZeroBounce) before any outreach."""
    c = _owned(db, user, company_id)
    contact = Contact(
        company_id=c.id,
        name=payload.name,
        role=payload.role.strip(),
        email=payload.email.strip(),
        linkedin=payload.linkedin,
        verification="Unknown",
        confidence=0,
        approved=None,
    )
    db.add(contact)
    db.commit()
    add_log(db, user.id, "Campaign", f"Manually added contact '{payload.name}' to {c.name}.")
    return get_company(company_id, db, user)


@router.delete("/{company_id}", status_code=204)
def delete_company(
    company_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a company and its contacts/drafts (cascade). Blocked with 409 if it
    has a live conversation (a sent Thread on the company or any of its contacts),
    unless force=true. Threads themselves are SET NULL, not deleted."""
    c = _owned(db, user, company_id)
    if not force:
        contact_ids = [ct.id for ct in c.contacts]
        conds = [Thread.company_id == c.id]
        if contact_ids:
            conds.append(Thread.contact_id.in_(contact_ids))
        if db.query(Thread.id).filter(or_(*conds)).first():
            raise HTTPException(
                status_code=409,
                detail="This company has a live conversation. Pass force=true to delete it anyway.",
            )
    name = c.name
    db.delete(c)
    db.commit()
    add_log(db, user.id, "Campaign", f"Deleted company '{name}'.")
