"""User-facing access requests for the gated features (outreach agents + outbound).

A user with no grant requests access (-> pending); an admin approves/rejects from
the control room (api/routers/admin.py). Re-requestable after a rejection."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import User, utcnow
from app.schemas import AccessRequestIn, UserOut
from app.services.events import add_log, add_notification

router = APIRouter(prefix="/api/access", tags=["access"])


@router.post("/request", response_model=UserOut)
def request_access(
    payload: AccessRequestIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Request the gated features. Moves the user to 'pending' and notifies admins."""
    if user.has_access:
        raise HTTPException(status_code=400, detail="You already have access.")
    if user.access_status == "pending":
        raise HTTPException(status_code=400, detail="Your request is already pending review.")
    user.access_status = "pending"
    user.access_note = payload.note
    user.access_requested_at = utcnow()
    db.commit()
    db.refresh(user)
    add_log(db, user.id, "User", "Requested feature access.")
    for admin in db.query(User).filter(User.is_admin.is_(True)).all():
        add_notification(
            db, admin.id, "system", "Access request",
            f"{user.name} ({user.email}) requested access.",
        )
    return user
