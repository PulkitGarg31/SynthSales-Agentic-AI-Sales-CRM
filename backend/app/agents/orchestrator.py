from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base import AGENT_REGISTRY, Agent
from app.agents.employee_finder import employee_finder_agent
from app.agents.enrichment import enrichment_agent
from app.agents.outreach import outreach_agent
from app.agents.scoring import scoring_agent
from app.agents.tracking import tracking_agent
from app.agents.verification import verification_agent
from app.models import AgentConfig, Campaign, Company, Contact
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


def _walk_for_contactable(
    db: Session, campaign: Campaign, owner_id: int, force: bool = False,
) -> list[Company]:
    """Walk the campaign's ranked companies and run the employee finder until
    `campaign.top_n` have at least one contact. Companies that yield nothing
    are demoted Qualified → Reviewed, and the next-best Reviewed company by
    rank is promoted into the slot. Stops when we either fill the quota or
    exhaust every scored company.

    This is the fallback behavior the user asked for: "if no contact found
    for a specific company, take the next company from scoring."

    `force=True` is a full reset — every contact in the campaign is deleted
    up front (so previously-Qualified-but-now-Reviewed companies don't keep
    stale rows in the UI) and then the walker re-searches from rank 1. This
    is what the per-agent "Re-run" button on the campaign timeline sends.
    """
    if force:
        # Nuke every contact in the campaign so the re-run produces a clean
        # picture instead of a mix of stale and new. CASCADE wipes their email
        # drafts at the same time.
        stale_contacts = (
            db.query(Contact)
            .join(Company, Company.id == Contact.company_id)
            .filter(Company.campaign_id == campaign.id)
            .all()
        )
        for ct in stale_contacts:
            db.delete(ct)
        db.commit()

    candidates = (
        db.query(Company)
        .filter(
            Company.campaign_id == campaign.id,
            Company.ai_score > 0,
            Company.status.in_(("Qualified", "Reviewed")),
        )
        .order_by(Company.rank)
        .all()
    )

    target = max(1, campaign.top_n)
    contactable: list[Company] = []

    for c in candidates:
        if len(contactable) >= target:
            # Quota filled — any remaining Qualified rows below this point
            # need to be demoted so verification/outreach don't pick them up.
            if c.status == "Qualified":
                c.status = "Reviewed"
            continue

        if not c.contacts or force:
            try:
                employee_finder_agent.run(db, c, owner_id, force=force)
            except Exception:
                # Don't let one bad row kill the walk — log via agent.run and
                # treat as "no contacts found" so we continue down the list.
                pass
            db.refresh(c)

        if c.contacts:
            if c.status != "Qualified":
                c.status = "Qualified"
            contactable.append(c)
        else:
            if c.status == "Qualified":
                c.status = "Reviewed"

    db.commit()
    return contactable


def run_agent_for_campaign(
    db: Session, campaign: Campaign, owner_id: int, key: str, force: bool = False,
) -> None:
    """Run a single agent for a single campaign. The pipeline above is just a
    fixed sequence of these calls — this helper lets the UI trigger any stage
    independently (e.g. "re-score" without re-enriching).

    `force=True` tells the underlying agent to discard its prior output (stale
    contacts, stale email drafts, stale verification verdicts) and produce a
    fresh result. Defaults to False so bulk pipelines stay incremental.
    """
    companies = db.query(Company).filter(Company.campaign_id == campaign.id).all()

    if key == "enrichment":
        # Enrichment uses `force_ai` (single flag — it both means "run AI even
        # for dead/parked domains" and "redo the search instead of reusing
        # cached summary"). Tie it to the same `force` toggle.
        _phase(
            db, owner_id, enrichment_agent,
            lambda: [
                enrichment_agent.run(db, c, campaign, owner_id, force_ai=force)
                for c in companies
            ],
        )
    elif key == "scoring":
        _phase(db, owner_id, scoring_agent, lambda: scoring_agent.run(db, campaign, owner_id))
    elif key == "employee_finder":
        # Walk down the rank list — if a Qualified company has no real
        # LinkedIn contacts, demote it and try the next-best Reviewed
        # company. With force=True, each candidate's prior contacts are
        # wiped first so a real re-search runs.
        _phase(
            db, owner_id, employee_finder_agent,
            lambda: _walk_for_contactable(db, campaign, owner_id, force=force),
        )
    elif key in ("email_guess", "verification"):
        # email_guess runs inside verification (verification_agent calls
        # guess_emails per contact), so they share an entry point.
        qualified = _qualified_companies(db, campaign)
        _phase(
            db, owner_id, verification_agent,
            lambda: [verification_agent.run(db, c, owner_id, force=force) for c in qualified],
        )
    elif key == "outreach":
        qualified = _qualified_companies(db, campaign)

        def _draft_all() -> None:
            for c in qualified:
                for contact in c.contacts:
                    if contact.verification in ("Verified", "Risky", "Unknown"):
                        outreach_agent.run(db, contact, c, campaign, owner_id, force=force)

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

    # Phase 3 — employee finder. Walks down the ranked list and fills the
    # top_n slots with companies that actually yielded LinkedIn contacts; any
    # company that came up empty is demoted to Reviewed and the next-best
    # candidate is tried in its place.
    #
    # `force=True` here means a "Run all agents" click wipes every contact in
    # the campaign before re-searching. Without this, contacts that belonged
    # to companies which scoring just demoted to Reviewed would linger and
    # the user perceives the finder as "not running again".
    contactable: list[Company] = []

    def _run_finder() -> None:
        nonlocal contactable
        contactable = _walk_for_contactable(db, campaign, owner_id, force=True)

    _phase(db, owner_id, employee_finder_agent, _run_finder)

    # Phases 4 & 5 — email guessing + verification (operate on the now-final
    # contactable set, not the pre-walk Qualified list). force=True so the
    # newly-found contacts get a fresh email + verification verdict rather
    # than the stale state inherited from prior runs.
    _phase(
        db, owner_id, verification_agent,
        lambda: [verification_agent.run(db, c, owner_id, force=True) for c in contactable],
    )

    # Phase 6 — outreach drafts for verified/contactable contacts. force=True
    # so each draft is regenerated against the latest enrichment summary.
    def _draft_all():
        for c in contactable:
            for contact in c.contacts:
                if contact.verification in ("Verified", "Risky", "Unknown"):
                    outreach_agent.run(db, contact, c, campaign, owner_id, force=True)

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
        "qualified": len(contactable),
        "contacts": sum(len(c.contacts) for c in contactable),
    }
