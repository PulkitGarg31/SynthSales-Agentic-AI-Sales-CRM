from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.pagination import Page, paginate
from app.core.database import get_db
from app.models import Campaign, Company, Contact, User
from app.schemas import ContactOut, ContactUpdate
from app.services.events import add_log
from app.services.pipeline_locks import is_locked

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _owned(db: Session, user: User, contact_id: int) -> Contact:
    ct = db.get(Contact, contact_id)
    if not ct or ct.company.campaign.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Contact not found")
    return ct


@router.get("", response_model=list[ContactOut])
def list_contacts(
    campaign_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    page: Page = Depends(),
):
    q = (
        db.query(Contact)
        .join(Company, Company.id == Contact.company_id)
        .join(Campaign, Campaign.id == Company.campaign_id)
        .filter(Campaign.owner_id == user.id)
    )
    if campaign_id is not None:
        q = q.filter(Campaign.id == campaign_id)
    return paginate(q, page).all()


@router.patch("/{contact_id}", response_model=ContactOut)
def update_contact(
    contact_id: int,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ct = _owned(db, user, contact_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(ct, k, v)
    db.commit()
    db.refresh(ct)
    return ct


@router.delete("/{contact_id}", status_code=204)
def delete_contact(
    contact_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a contact and its drafts (cascade). Blocked with 409 if the contact
    has a live conversation (a sent Thread), unless force=true."""
    ct = _owned(db, user, contact_id)
    if not force and is_locked(db, ct):
        raise HTTPException(
            status_code=409,
            detail="This contact has a live conversation. Pass force=true to delete it anyway.",
        )
    name = ct.name
    db.delete(ct)
    db.commit()
    add_log(db, user.id, "Campaign", f"Deleted contact '{name}'.")
