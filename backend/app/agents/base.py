from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AgentConfig, utcnow
from app.services.events import add_log

# Canonical agent registry: key -> (display name, description, order)
AGENT_REGISTRY: list[tuple[str, str, str]] = [
    ("enrichment", "Company Enrichment", "Researches each company in depth: what they do, their size, recent funding and news, and signs they're ready to buy."),
    ("scoring", "Company Scoring", "Scores and ranks every company against your ideal customer, so the best-fit prospects rise to the top."),
    ("employee_finder", "Employee Finder", "Finds the real decision-makers at each company — the people actually worth reaching out to."),
    ("email_guess_verification", "Email Guessing & Verification", "Works out each contact's email address and confirms it's deliverable, so your outreach lands in a real inbox."),
    ("outreach", "Outreach Generation", "Writes a personalized email for every contact, tailored to their role, their company, and what you're selling."),
    ("tracking", "Email Tracking & Follow-up", "Watches for replies and sends timely, relevant follow-ups so promising leads never go cold."),
    ("meeting", "Meeting Coordination", "Books the meeting, shares a Google Meet link, and keeps both sides in the loop."),
    ("reply_classifier", "Reply Detection & Intent", "Reads every reply, works out who's interested, and surfaces the ones ready for your attention."),
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
