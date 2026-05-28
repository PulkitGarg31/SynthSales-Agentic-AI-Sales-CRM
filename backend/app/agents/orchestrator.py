from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base import AGENT_REGISTRY, Agent
from app.agents.employee_finder import employee_finder_agent
from app.agents.enrichment import enrichment_agent
from app.agents.outreach import outreach_agent
from app.agents.scoring import scoring_agent
from app.agents.tracking import tracking_agent
from app.agents.verification import verification_agent
from app.models import AgentConfig, Campaign, Company
from app.services.events import add_notification


def ensure_agents(db: Session, owner_id: int) -> None:
    """Create the canonical agent rows for a user if missing."""
    existing = {
        a.key for a in db.query(AgentConfig).filter(AgentConfig.owner_id == owner_id)
    }
    for order, (key, name, desc) in enumerate(AGENT_REGISTRY, start=1):
        if key not in existing:
            db.add(
                AgentConfig(
                    owner_id=owner_id,
                    key=key,
                    name=name,
                    description=desc,
                    order=order,
                    enabled=True,
                    status="Idle",
                )
            )
    db.commit()


def _enabled(db: Session, owner_id: int, key: str) -> bool:
    cfg = (
        db.query(AgentConfig)
        .filter(AgentConfig.owner_id == owner_id, AgentConfig.key == key)
        .first()
    )
    return cfg.enabled if cfg else True


def _phase(db: Session, owner_id: int, agent: Agent, fn) -> None:
    if not _enabled(db, owner_id, agent.key):
        return
    agent.mark(db, owner_id, "Running")
    try:
        fn()
        agent.mark(db, owner_id, "Idle")
    except Exception:
        agent.mark(db, owner_id, "Error")
        raise


# Keys that can be triggered on-demand for a single campaign. "meeting" is
# excluded because it's only ever triggered by the user booking a meeting in the
# Conversations UI — there's nothing for it to "run" otherwise.
RUNNABLE_KEYS = {
    "enrichment", "scoring", "employee_finder",
    "email_guess", "verification", "outreach", "tracking",
}


def _qualified_companies(db: Session, campaign: Campaign) -> list[Company]:
    return (
        db.query(Company)
        .filter(Company.campaign_id == campaign.id, Company.status == "Qualified")
        .order_by(Company.rank)
        .limit(campaign.top_n)
        .all()
    )


def run_agent_for_campaign(
    db: Session, campaign: Campaign, owner_id: int, key: str
) -> None:
    """Run a single agent for a single campaign. The pipeline above is just a
    fixed sequence of these calls — this helper lets the UI trigger any stage
    independently (e.g. "re-score" without re-enriching)."""
    companies = db.query(Company).filter(Company.campaign_id == campaign.id).all()

    if key == "enrichment":
        _phase(
            db, owner_id, enrichment_agent,
            lambda: [enrichment_agent.run(db, c, campaign, owner_id) for c in companies],
        )
    elif key == "scoring":
        _phase(db, owner_id, scoring_agent, lambda: scoring_agent.run(db, campaign, owner_id))
    elif key == "employee_finder":
        qualified = _qualified_companies(db, campaign)
        _phase(
            db, owner_id, employee_finder_agent,
            lambda: [employee_finder_agent.run(db, c, owner_id) for c in qualified],
        )
    elif key in ("email_guess", "verification"):
        # email_guess runs inside verification (verification_agent calls
        # guess_emails per contact), so they share an entry point.
        qualified = _qualified_companies(db, campaign)
        _phase(
            db, owner_id, verification_agent,
            lambda: [verification_agent.run(db, c, owner_id) for c in qualified],
        )
    elif key == "outreach":
        qualified = _qualified_companies(db, campaign)

        def _draft_all() -> None:
            for c in qualified:
                for contact in c.contacts:
                    if contact.verification in ("Verified", "Risky", "Unknown"):
                        outreach_agent.run(db, contact, c, campaign, owner_id)

        _phase(db, owner_id, outreach_agent, _draft_all)
    elif key == "tracking":
        # Tracking is user-scoped, not campaign-scoped — the agent walks all
        # the user's Running threads. Triggering it here runs it for everyone.
        _phase(db, owner_id, tracking_agent, lambda: tracking_agent.run(db, owner_id))
    else:
        raise ValueError(f"Agent '{key}' cannot be run on demand")


def run_campaign_pipeline(db: Session, campaign: Campaign, owner_id: int) -> dict:
    """Phases 1–6: research → score → contacts → guess/verify → outreach drafts."""
    companies = db.query(Company).filter(Company.campaign_id == campaign.id).all()

    # Phase 1 — enrichment
    _phase(
        db, owner_id, enrichment_agent,
        lambda: [enrichment_agent.run(db, c, campaign, owner_id) for c in companies],
    )

    # Phase 2 — scoring + ranking
    _phase(db, owner_id, scoring_agent, lambda: scoring_agent.run(db, campaign, owner_id))

    # Top-N qualified companies feed the contact phases.
    qualified = (
        db.query(Company)
        .filter(Company.campaign_id == campaign.id, Company.status == "Qualified")
        .order_by(Company.rank)
        .limit(campaign.top_n)
        .all()
    )

    # Phase 3 — employee finder
    _phase(
        db, owner_id, employee_finder_agent,
        lambda: [employee_finder_agent.run(db, c, owner_id) for c in qualified],
    )

    # Phases 4 & 5 — email guessing + verification
    _phase(
        db, owner_id, verification_agent,
        lambda: [verification_agent.run(db, c, owner_id) for c in qualified],
    )

    # Phase 6 — outreach drafts for verified/contactable contacts
    def _draft_all():
        for c in qualified:
            for contact in c.contacts:
                if contact.verification in ("Verified", "Risky", "Unknown"):
                    outreach_agent.run(db, contact, c, campaign, owner_id)

    _phase(db, owner_id, outreach_agent, _draft_all)

    campaign.status = "Running"
    db.commit()
    add_notification(
        db, owner_id, "campaign",
        "Pipeline complete",
        f"'{campaign.name}' researched, scored, and drafted. Review and send.",
    )
    return {
        "companies": len(companies),
        "qualified": len(qualified),
        "contacts": sum(len(c.contacts) for c in qualified),
    }
