from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Campaign, Company, Contact, User
from app.schemas import ContactOut, ContactUpdate

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
):
    q = (
        db.query(Contact)
        .join(Company, Company.id == Contact.company_id)
        .join(Campaign, Campaign.id == Company.campaign_id)
        .filter(Campaign.owner_id == user.id)
    )
    if campaign_id is not None:
        q = q.filter(Campaign.id == campaign_id)
    return q.all()


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
