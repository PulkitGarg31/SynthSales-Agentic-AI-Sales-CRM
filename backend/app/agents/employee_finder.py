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
from app.providers.search import search

logger = logging.getLogger(__name__)


class EmployeeFinderAgent(Agent):
    key = "employee_finder"
    name = "Employee Finder"

    def run(self, db: Session, company: Company, owner_id: int, count: int = 3) -> list[Contact]:
        # Don't duplicate on re-run.
        if company.contacts:
            return company.contacts

        # 1. Search the web for real LinkedIn profiles employed at this company.
        profiles: list[dict] = []
        try:
            profiles = search.find_linkedin_profiles(company.name, max_per_query=6)
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
                f"'{company.name}'. Pick up to {count} that:\n"
                "  - are CURRENT senior employees at this exact company,\n"
                "  - have decision-making influence (C-suite, VP, Head of, Director),\n"
                "  - are likely B2B-outreach-relevant (sales/ops/data/eng leaders).\n\n"
                "Drop profiles that look like:\n"
                "  - former employees (snippet says 'previously', 'ex-', past dates only),\n"
                "  - similarly-named companies (different industry/region),\n"
                "  - vendors, journalists, or interns,\n"
                "  - company pages (linkedin.com/company/...).\n\n"
                "Candidates:\n" + "\n\n".join(tagged) + "\n\n"
                "Return JSON: {\"picks\": [list of indices in priority order]}. "
                "If none qualify, return {\"picks\": []}."
            )
            data = ai.complete_json(
                prompt,
                system="You are a B2B sales research analyst. Be strict — better to return zero than to recommend a wrong contact.",
            )
            if not data:
                return profiles
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
            return profiles


employee_finder_agent = EmployeeFinderAgent()
