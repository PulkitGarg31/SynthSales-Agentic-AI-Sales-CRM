from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Campaign, Company
from app.providers.ai import ai
from app.providers.search import search

SIZES = ["1–50", "51–200", "201–1,000", "1,000–5,000", "5,000+"]


def _seed(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest(), 16)


def _has_real_snippets(snippets: dict) -> bool:
    return any(snippets.get(k) for k in ("overview", "funding", "news", "hiring"))


def _csv_context(company: Company) -> str:
    """A human-readable description of what we got from the CSV — used as
    raw material for an honest fallback summary."""
    bits = []
    if company.industry:
        bits.append(f"the {company.industry} sector")
    if company.location:
        bits.append(f"based in {company.location}")
    if company.size:
        bits.append(f"with an estimated headcount of {company.size}")
    if not bits:
        return ""
    return " ".join(bits)


class EnrichmentAgent(Agent):
    key = "enrichment"
    name = "Company Enrichment"

    def run(
        self,
        db: Session,
        company: Company,
        campaign: Campaign,
        owner_id: int,
        force_ai: bool = False,
    ) -> None:
        """Enrich a single company.

        force_ai=False (default, bulk pipeline): skip search+AI for dead/parked
            domains to avoid spending AI tokens on companies whose websites
            offer nothing to research.
        force_ai=True (on-demand re-research): always run the search+AI flow,
            even if the domain looks dead/parked. The AI can still search by
            company name and may surface a current website or news the user
            hasn't seen — that's the whole point of clicking "Re-research".
        """
        # 1. Liveness check — always record the latest status so the UI banner
        #    stays accurate.
        status = search.domain_status(company.domain)
        company.domain_status = status

        # 2. Bulk path: skip the AI for dead/parked to save tokens.
        if not force_ai:
            if status == "dead":
                self._mark_dead_domain(company)
                db.commit()
                self.log(db, owner_id, f"Skipped {company.name} — domain unreachable.")
                return
            if status == "parked":
                self._mark_parked_domain(company)
                db.commit()
                self.log(db, owner_id, f"Skipped {company.name} — domain appears parked.")
                return

        # 3. Search + AI (or heuristic fallback). On force_ai with a dead/parked
        #    domain, this still runs — the search is by company NAME, which can
        #    work even when the CSV's URL is wrong.
        if ai.available:
            snippets = search.research_company(company.name, company.domain)
            had_snippets = _has_real_snippets(snippets)
            self._enrich_with_ai(company, campaign, snippets, had_snippets, status)
            src = "search+AI" if had_snippets else "AI (no snippets)"
        else:
            self._enrich_heuristic(company, campaign, reason="no_ai_key")
            src = "heuristic"

        # 4. If we forced AI despite a bad domain, cap confidence and prepend a
        #    site warning to the summary so the UI banner still makes sense.
        if force_ai and status in ("dead", "parked"):
            company.enrichment_confidence = min(company.enrichment_confidence, 25)
            company.research_summary = (
                self._site_warning_prefix(company, status) + " " + company.research_summary
            )

        # Once enrichment has run, status must move out of "Researching" (which
        # means "not yet processed"). Promote to "Qualified" if we have enough
        # signal; otherwise mark "Reviewed" — researched, but not auto-qualified.
        if company.status == "Researching":
            company.status = "Qualified" if company.enrichment_confidence >= 40 else "Reviewed"
        db.commit()
        self.log(
            db, owner_id,
            f"Researched {company.name} ({src}, confidence {company.enrichment_confidence}).",
        )

    # ---- Dead / parked domain paths -----------------------------------------
    def _mark_dead_domain(self, company: Company) -> None:
        ctx = _csv_context(company)
        suffix = f" Profile data is limited to the CSV upload ({ctx})." if ctx else ""
        company.industry = company.industry or "Unknown"
        company.size = company.size or "Unknown"
        company.location = company.location or "Unknown"
        company.research_summary = (
            f"The provided website ({company.domain or 'no domain on file'}) did "
            f"not respond, so no public information could be gathered about "
            f"{company.name}. Treat with caution — verify manually before "
            f"outreach to confirm the company is still active.{suffix}"
        )
        company.recent_funding = None
        company.recent_news = None
        company.active_hiring = False
        company.enrichment_confidence = 10

    def _mark_parked_domain(self, company: Company) -> None:
        ctx = _csv_context(company)
        suffix = f" CSV signals indicate {ctx}." if ctx else ""
        company.industry = company.industry or "Unknown"
        company.size = company.size or "Unknown"
        company.location = company.location or "Unknown"
        company.research_summary = (
            f"The domain {company.domain} responds, but the page is a parked/"
            f"placeholder site rather than an active company website — no real "
            f"content was available to research {company.name}. This usually "
            f"means the company no longer operates under this domain, or the "
            f"link in the CSV is incorrect. Verify manually before outreach."
            f"{suffix}"
        )
        company.recent_funding = None
        company.recent_news = None
        company.active_hiring = False
        company.enrichment_confidence = 15

    def _site_warning_prefix(self, company: Company, status: str) -> str:
        """One-sentence lead used when force_ai re-research runs against a
        dead/parked domain — so the summary still surfaces the site issue."""
        if status == "dead":
            return (
                f"Note: the CSV domain {company.domain or '(none)'} did not "
                f"respond, so the research below relies on web search by "
                f"company name and may reference a different / current site."
            )
        return (
            f"Note: {company.domain} appears to be a parked/placeholder page, "
            f"so the research below relies on web search by company name and "
            f"may reference a different / current site."
        )

    # ---- AI path -----------------------------------------------------------
    def _enrich_with_ai(
        self,
        company: Company,
        campaign: Campaign,
        snippets: dict,
        had_snippets: bool,
        domain_status: str = "live",
    ) -> None:
        context = "\n".join(
            f"{k}: " + " | ".join(s.get("body", "") for s in v[:3])
            for k, v in snippets.items() if v
        ) or "(no search results returned)"

        domain_note = ""
        if domain_status == "dead":
            domain_note = (
                f" — NOTE: the CSV domain did not respond when probed, so don't "
                f"assume it's the company's current site; rely on the snippets"
            )
        elif domain_status == "parked":
            domain_note = (
                f" — NOTE: the CSV domain returned a parked/placeholder page, "
                f"not a real company site; rely on the snippets"
            )
        prompt = (
            f"Company: {company.name} (domain: {company.domain or 'n/a'}{domain_note})\n"
            f"Industry from CSV upload (treat as ground truth unless you have "
            f"direct contradicting evidence): {company.industry or 'not provided'}\n"
            f"We sell: {campaign.product} — {campaign.product_description}\n"
            f"Search snippets:\n{context}\n\n"
            "RULES — read carefully:\n"
            "1. Only fill a field if at least one snippet directly supports it. "
            "If you don't have evidence, return null for that field. Do NOT "
            "guess from the company name alone.\n"
            "2. industry: keep the CSV value unless a snippet clearly "
            "contradicts it. If the CSV had no industry, infer only from real "
            "evidence.\n"
            "3. recent_funding / recent_news / active_hiring: return null/false "
            "if not actually mentioned in a snippet. Do not extrapolate.\n"
            "4. research_summary: 2–3 sentences (max ~400 chars). Mention the "
            "company's apparent business and any noteworthy signals from the "
            "snippets. If snippets are empty or weak, say so plainly — do not "
            "pad with generic descriptions.\n"
            "5. confidence: integer 0–100 — your honest assessment of how much "
            "real evidence backed your answers. <30 = essentially nothing, "
            "60+ = solid corroboration across snippets.\n\n"
            f"Return JSON with keys: industry (string|null), size (one of {SIZES} or null), "
            "location (string|null), research_summary (string), "
            "recent_funding (string|null), recent_news (string|null), "
            "active_hiring (boolean), confidence (integer 0-100)."
        )
        data = ai.complete_json(
            prompt, system="You are a B2B research analyst. Honesty over completeness."
        )
        if not data:
            # AI is connected but returned nothing parseable. Tell the user that,
            # rather than the older misleading "connect an AI key" message.
            self._enrich_heuristic(
                company, campaign,
                reason="no_snippets" if not had_snippets else "ai_unusable",
            )
            return

        confidence = int(data.get("confidence") or 0)
        if not had_snippets:
            confidence = min(confidence, 25)

        ai_industry = (data.get("industry") or "").strip()
        if not company.industry:
            company.industry = ai_industry or "Unknown"
        elif ai_industry and confidence >= 70 and ai_industry.lower() != company.industry.lower():
            company.industry = ai_industry

        company.size = (data.get("size") or company.size or "Unknown").strip() or "Unknown"
        company.location = (data.get("location") or company.location or "Unknown").strip() or "Unknown"

        summary = (data.get("research_summary") or "").strip()
        if not summary:
            # AI returned other fields but no summary — synthesize from context
            # so the UI never shows an empty card.
            summary = self._fallback_summary(company, reason="ai_unusable")
        company.research_summary = summary

        company.recent_funding = data.get("recent_funding") if confidence >= 50 else None
        company.recent_news = data.get("recent_news") if confidence >= 50 else None
        company.active_hiring = bool(data.get("active_hiring")) if confidence >= 50 else False
        company.enrichment_confidence = max(0, min(100, confidence))

    # ---- Deterministic fallback (used when AI absent OR returns empty) -----
    def _enrich_heuristic(
        self,
        company: Company,
        campaign: Campaign,
        reason: str = "no_ai_key",
    ) -> None:
        s = _seed(company.name)
        if not company.industry:
            first_pref = (campaign.industry_pref or "").split(",")[0].strip()
            company.industry = first_pref or "Unknown"
        if not company.size:
            company.size = SIZES[s % len(SIZES)]
        if not company.location:
            company.location = ["US", "UK", "Germany", "India", "Canada"][s % 5]
        company.research_summary = self._fallback_summary(company, reason=reason)
        # No fabricated signals — these used to be derived from the name hash,
        # which let dead-domain companies score near 99.
        company.active_hiring = False
        company.recent_funding = None
        company.recent_news = None
        # Confidence depends on *why* we fell back. AI-absent is the highest;
        # AI-tried-and-failed is lower because we know the public footprint is
        # too thin for the AI to find anything useful.
        company.enrichment_confidence = {
            "no_ai_key": 30,
            "no_snippets": 20,
            "ai_unusable": 22,
        }.get(reason, 25)

    def _fallback_summary(self, company: Company, reason: str) -> str:
        ctx = _csv_context(company)
        ctx_clause = f"is listed as operating in {ctx}" if ctx else "has no detailed profile data on file"
        if reason == "no_ai_key":
            tail = (
                "No AI key is configured, so this profile relies on the CSV "
                "upload alone — connect an AI provider for real web-sourced "
                "enrichment."
            )
        elif reason == "no_snippets":
            tail = (
                f"Public search returned no relevant coverage of "
                f"{company.domain or 'this company'}, so independent research "
                "couldn't add to the CSV-provided profile. Verify with the "
                "company directly before relying on the score."
            )
        else:  # ai_unusable
            tail = (
                "Public sources had signals, but they couldn't be summarized "
                "into a reliable profile — the AI's response was incomplete or "
                "unparseable. Re-research, or check the company manually."
            )
        return f"{company.name} {ctx_clause}. {tail}"


enrichment_agent = EnrichmentAgent()
