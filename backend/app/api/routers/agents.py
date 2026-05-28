from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents.orchestrator import ensure_agents
from app.agents.tracking import tracking_agent
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models import AgentConfig, User
from app.schemas import AgentOut, AgentUpdate

router = APIRouter(prefix="/api/agents", tags=["agents"])


@router.get("", response_model=list[AgentOut])
def list_agents(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ensure_agents(db, user.id)
    return (
        db.query(AgentConfig)
        .filter(AgentConfig.owner_id == user.id)
        .order_by(AgentConfig.order)
        .all()
    )


@router.patch("/{agent_id}", response_model=AgentOut)
def update_agent(
    agent_id: int,
    payload: AgentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    a = db.get(AgentConfig, agent_id)
    if not a or a.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Agent not found")
    a.enabled = payload.enabled
    db.commit()
    db.refresh(a)
    return a


@router.post("/run-tracking")
def run_tracking(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Manually trigger the follow-up tracking agent (otherwise runs on a schedule)."""
    sent = tracking_agent.run(db, user.id)
    return {"follow_ups_sent": sent}
