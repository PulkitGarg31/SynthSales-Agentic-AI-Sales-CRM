from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import Log, User
from app.schemas import LogOut

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=list[LogOut])
def list_logs(
    category: str | None = None,
    # Bounded both ways so a negative value can't reach Postgres as LIMIT -1 (500).
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(Log).filter(Log.owner_id == user.id)
    if category and category != "All":
        q = q.filter(Log.category == category)
    return q.order_by(Log.created_at.desc()).limit(limit).all()
