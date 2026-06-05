from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AgentConfig, utcnow
from app.services.events import add_log

# Canonical agent registry: key -> (display name, description, order)
AGENT_REGISTRY: list[tuple[str, str, str]] = [
    ("enrichment", "Company Enrichment", "Researches each company: profile, industry, size, funding, news, hiring signals."),
    ("scoring", "Company Scoring", "Applies weighted, explainable scoring against your ICP and ranks companies."),
    ("employee_finder", "Employee Finder", "Identifies top decision-makers and relevant business contacts per company."),
    ("email_guess_verification", "Email Guessing & Verification", "Guesses likely email addresses from name + domain patterns, then verifies them: free syntax/MX checks first, then ZeroBounce for survivors. Stores only a ZeroBounce-confirmed address; stops at the first deliverable one."),
    ("outreach", "Outreach Generation", "Writes personalized subject + body from research, role, and your product."),
    ("tracking", "Email Tracking & Follow-up", "Monitors inboxes and sends contextual follow-ups until a meeting is booked."),
    ("meeting", "Meeting Coordination", "Captures meeting links, stores details, and notifies both parties."),
]


class Agent:
    key: str = "agent"
    name: str = "Agent"

    def log(self, db: Session, owner_id: int | None, message: str, level: str = "info") -> None:
        add_log(db, owner_id, "AI", f"[{self.name}] {message}", level=level)

    def mark(self, db: Session, owner_id: int, status: str) -> None:
        cfg = (
            db.query(AgentConfig)
            .filter(AgentConfig.owner_id == owner_id, AgentConfig.key == self.key)
            .first()
        )
        if cfg:
            cfg.status = status
            if status == "Running":
                cfg.last_run = utcnow()
            db.commit()
