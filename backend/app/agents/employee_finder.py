"""Employee Finder Agent.

Finds real decision-makers at the target company by searching the public web
for LinkedIn profiles, then optionally lets the AI pick the most sales-relevant
ones. No fabricated names or LinkedIn URLs — if nothing real can be found, the
agent leaves the company without contacts (better than confidently wrong data).
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Company, Contact
from app.providers.ai import ai
from app.providers.search import search, _is_commercial_role

logger = logging.getLogger(__name__)


class EmployeeFinderAgent(Agent):
    key = "employee_finder"
    name = "Employee Finder"

    def run(
        self,
        db: Session,
        company: Company,
        owner_id: int,
        count: int = 3,
        force: bool = False,
    ) -> list[Contact]:
        # Skip if we already have contacts — unless the caller asked for a
        # forced re-search. Forced re-runs wipe the prior contacts (and their
        # email drafts, via CASCADE) so the new search starts from a clean
        # slate instead of returning the stale data the user already rejected.
        if company.contacts and not force:
            return company.contacts
        if force and company.contacts:
            for stale in list(company.contacts):
                db.delete(stale)
            db.commit()
            db.refresh(company)

        # 1. Search the web for real LinkedIn profiles employed at this company.
        profiles: list[dict] = []
        try:
            profiles = search.find_linkedin_profiles(
                company.name,
                domain=company.domain or "",
                max_per_query=6,
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("LinkedIn search failed for %s: %s", company.name, exc)

        # 2. If AI is available, always validate — even with a single candidate.
        #    Search can return profiles where the company name appears but the
        #    person doesn't actually work there (similarly-named companies,
        #    former employees, journalists). The AI's job is to filter those.
        if ai.available and profiles:
            profiles = self._rank_with_ai(company, profiles, count)

        # 3. Save up to `count` real contacts. NO heuristic fallback — if search
        #    found nothing, we leave the contacts list empty rather than invent.
        created: list[Contact] = []
        for p in profiles[:count]:
            contact = Contact(
                company_id=company.id,
                name=p["name"],
                role=p["role"],
                email="",  # filled by guess + verification agents
                linkedin=p["linkedin"],
                verification="Unknown",
                confidence=0,
                approved=None,
            )
            db.add(contact)
            created.append(contact)

        if not created:
            self.log(
                db, owner_id,
                f"No LinkedIn profiles found for {company.name} via public search "
                "— add contacts manually or re-run.",
            )
            return []

        db.commit()
        self.log(
            db, owner_id,
            f"Found {len(created)} contact(s) at {company.name} via public LinkedIn search.",
        )
        return created

    # ---- Optional AI ranking / filtering ------------------------------------
    @staticmethod
    def _rank_with_ai(company: Company, profiles: list[dict], count: int) -> list[dict]:
        """Ask the AI to pick the top-N most relevant contacts for B2B outreach
        AND drop any that look like false positives (left the company, vendors,
        non-employees, etc.). Falls back to the raw list on any failure."""
        try:
            # Tag each profile with an index for easy reference in the JSON output.
            tagged = [
                f"[{i}] {p['name']} — {p['role']}\n     url: {p['linkedin']}\n     snippet: {p['snippet']}"
                for i, p in enumerate(profiles)
            ]
            prompt = (
                f"Company: {company.name} "
                f"(industry: {company.industry or 'unknown'}, domain: {company.domain or 'n/a'})\n\n"
                f"Below are LinkedIn profiles surfaced by a web search for "
                f"'{company.name}'. Pick up to {count} contacts that we should "
                "approach for a B2B sales conversation.\n\n"
                "STRONGLY PREFER, in this order:\n"
                "  1. Heads of the COMMERCIAL function — CRO, VP Sales, Head of Sales, "
                "VP Revenue, Sales Director. They own inter-company deals.\n"
                "  2. Senior Account Executives or Strategic Account leads.\n"
                "  3. For sub-200-employee companies: Founder / CEO / President — "
                "at that size founders still own commercial conversations.\n\n"
                "REJECT (do NOT include) anyone in a non-commercial function, "
                "no matter how senior:\n"
                "  - Engineering: CTO, VP Engineering, Head of Engineering, "
                "Software Engineer, Architect, DevOps, SRE, Data Engineer, "
                "ML/AI Engineer, Tech Lead.\n"
                "  - Product/Design: CPO, Product Manager, Designer, UX, UI, "
                "Researcher.\n"
                "  - Operations / Finance / Legal / HR: CFO, COO (UNLESS the "
                "company has < 200 employees), General Counsel, CHRO, Recruiter, "
                "HR / Talent / People Ops.\n"
                "  - Security: CISO, Security Engineer, SOC, GRC.\n"
                "  - Marketing IC: Content Writer, SEO Specialist, Brand Manager, "
                "Community Manager. (CMO is borderline — accept only if no real "
                "sales leader is available.)\n"
                "  - Support / Success / IT helpdesk / Internal tools.\n"
                "  - Business Development / Partnerships / Alliances / Channel "
                "Sales — not targeted for this campaign.\n\n"
                "REJECT profiles whose role is just the company name, a single "
                "ambiguous word, or blank — without an explicit commercial title "
                "we cannot trust them.\n\n"
                "HARD REJECTS — drop these even if the title looks impressive:\n"
                "  - Anyone whose snippet identifies a DIFFERENT current employer "
                "(e.g. \"VP Sales at OtherCorp. Previously at " + company.name + "\"). "
                "Past employment at our target does NOT qualify.\n"
                "  - Profiles with \"Former\", \"Ex-\", \"Previously\", \"Past:\" "
                "near the company name.\n"
                "  - Similarly-named companies in a different industry or country.\n"
                "  - WORD-MATCH ONLY (not employment): the company name appearing as a "
                "sales territory/region (e.g. \"West " + company.name + "\"), a "
                "market/customer \"segment\", or inside a DIFFERENT employer's name. "
                "They must CURRENTLY work AT " + company.name + " — the title/snippet "
                "should show it (\"at " + company.name + "\", \"@ " + company.name + "\"). "
                "If employment at " + company.name + " is not clear, REJECT.\n"
                "  - Vendors, journalists, recruiters writing about the company.\n"
                "  - Company pages (linkedin.com/company/...).\n\n"
                "If you are uncertain whether someone is current, in sales, or "
                "former — REJECT. A missed lead is cheaper than a wrong outreach. "
                "Returning {\"picks\": []} is a valid and preferred answer when "
                "nothing in the list is clearly a commercial decision-maker.\n\n"
                "Candidates:\n" + "\n\n".join(tagged) + "\n\n"
                "Return JSON: {\"picks\": [list of indices in priority order]}. "
                "If none qualify, return {\"picks\": []}."
            )
            data = ai.complete_json(
                prompt,
                system=(
                    "You are a B2B sales research analyst. Your job is to find "
                    "CURRENT commercial decision-makers — not former employees, "
                    "not unrelated staff. Be strict: zero contacts is better than "
                    "one wrong contact."
                ),
            )
            if not data:
                return [p for p in profiles if _is_commercial_role(p.get("role", ""))]
            picks = data.get("picks") or []
            ranked: list[dict] = []
            seen: set[int] = set()
            for idx in picks:
                try:
                    idx = int(idx)
                except (TypeError, ValueError):
                    continue
                if idx in seen or idx < 0 or idx >= len(profiles):
                    continue
                seen.add(idx)
                ranked.append(profiles[idx])
            # If the AI returns no picks, trust it — better to surface zero
            # contacts than include profiles it flagged as wrong.
            return ranked
        except Exception as exc:  # pragma: no cover
            logger.warning("AI ranking of LinkedIn candidates failed: %s", exc)
            return [p for p in profiles if _is_commercial_role(p.get("role", ""))]


employee_finder_agent = EmployeeFinderAgent()
