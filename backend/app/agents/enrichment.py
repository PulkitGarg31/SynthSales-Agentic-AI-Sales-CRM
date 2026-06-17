from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Campaign, Company
from app.providers.ai import ai
from app.providers.search import search

SIZES = ["1–50", "51–200", "201–1,000", "1,000–5,000", "5,000+"]

# Per-metric confidence keys the AI may return (and that scoring reads). This is
# a BACKEND-ONLY signal — never serialized to the user-facing API.
METRIC_KEYS = (
    "industry", "size", "location",
    "recent_funding", "recent_news", "active_hiring", "summary",
)


def _seed(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest(), 16)


def _has_real_snippets(snippets: dict) -> bool:
    return any(snippets.get(k) for k in ("overview", "funding", "news", "hiring"))


def _csv_context(company: Company) -> str:
    """A human-readable description of what we got from the CSV — used as
    raw material for an honest fallback profile."""
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

        force_ai=False (default, bulk pipeline): skip search+AI only for a DEAD
            (unreachable) domain — there is nothing to research. A *parked*
            domain still runs the full search+AI flow: searching by company NAME
            can surface the company's real/current site, so we research it and
            merely annotate the parked warning + cap confidence (step 4).
        force_ai=True (on-demand re-research): always run the search+AI flow,
            even if the domain looks dead/parked. The AI can still search by
            company name and may surface a current website or news the user
            hasn't seen — that's the whole point of clicking "Re-research".
        """
        # 1. Liveness check — cache-aware. A live HTTP probe is the slowest
        #    single step, so on a non-force bulk re-run we reuse the recorded
        #    status instead of re-probing. force_ai (Re-research) always
        #    re-probes, which covers a domain that has since recovered/broken.
        known = (company.domain_status or "").strip().lower()
        if force_ai or known in ("", "unknown"):
            status = search.domain_status(company.domain)
            company.domain_status = status
        else:
            status = known

        # 2. Bulk path: skip the AI only for a dead (unreachable) domain — there
        #    is nothing to research. A parked domain falls through to the AI flow
        #    below (search by company name may surface the real site); step 4
        #    annotates the parked warning and caps its confidence.
        if not force_ai and status == "dead":
            self._mark_dead_domain(company)
            db.commit()
            self.log(db, owner_id, f"Skipped {company.name} — domain unreachable.")
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

        # 4. Ran the AI against a bad domain — cap confidence and prepend a site
        #    warning as the first profile point so the UI still makes sense. This
        #    covers any parked domain (always reaches here now) and a forced
        #    re-research of a dead domain (bulk dead returned in step 2, so a dead
        #    status here always implies force_ai).
        if status in ("dead", "parked"):
            company.enrichment_confidence = min(company.enrichment_confidence, 25)
            warning = self._site_warning_prefix(company, status)
            company.research_points = [warning] + list(company.research_points or [])
            company.research_summary = self._summary_from_points(company.research_points)

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
        company.industry = company.industry or "Unknown"
        company.size = company.size or "Unknown"
        company.location = company.location or "Unknown"
        points = [
            f"The provided website ({company.domain or 'no domain on file'}) did "
            f"not respond, so no public information could be gathered about "
            f"{company.name}.",
            "Treat with caution — verify manually before outreach to confirm the "
            "company is still active.",
        ]
        if ctx:
            points.append(f"Profile data is limited to the CSV upload ({ctx}).")
        points.append("No funding, news, or hiring signals could be confirmed.")
        company.research_points = points
        company.research_summary = self._summary_from_points(points)
        company.metric_confidence = {}
        company.recent_funding = None
        company.recent_news = None
        company.active_hiring = False
        company.enrichment_confidence = 10

    def _site_warning_prefix(self, company: Company, status: str) -> str:
        """One-sentence lead used when force_ai re-research runs against a
        dead/parked domain — so the profile still surfaces the site issue."""
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
                " — NOTE: the CSV domain did not respond when probed, so don't "
                "assume it's the company's current site; rely on the snippets"
            )
        elif domain_status == "parked":
            domain_note = (
                " — NOTE: the CSV domain returned a parked/placeholder page, "
                "not a real company site; rely on the snippets"
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
            "4. research_points: 5–8 short factual bullets (each under ~160 "
            "chars, no leading dash). Each bullet must be grounded in a snippet "
            "or the CSV facts — cover what the company does, its industry/market, "
            "size/footprint, and any real funding/news/hiring signal. If evidence "
            "is thin, return FEWER honest bullets (minimum 1) — never pad to 5 "
            "with filler or generic claims.\n"
            "5. confidence: integer 0–100 — your honest OVERALL assessment of how "
            "much real evidence backed your answers. <30 = essentially nothing, "
            "60+ = solid corroboration across snippets.\n"
            "6. metric_confidence: an object giving an integer 0–100 PER FIELD "
            "(industry, size, location, recent_funding, recent_news, "
            "active_hiring, summary) — how much real evidence backs THAT field. "
            "A field you set to null/false gets a LOW confidence (absence of "
            "evidence, not a confident negative). 'summary' rates research_points "
            "as a whole.\n\n"
            f"Return JSON with keys: industry (string|null), size (one of {SIZES} or null), "
            "location (string|null), research_points (array of 5-8 strings), "
            "recent_funding (string|null), recent_news (string|null), "
            "active_hiring (boolean), confidence (integer 0-100), "
            "metric_confidence (object of field→integer 0-100)."
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

        points = self._clean_points(data.get("research_points"))
        if not points:
            # AI returned other fields but no usable bullets — synthesize an
            # honest fallback so the UI never shows an empty card.
            points = self._fallback_points(company, reason="ai_unusable")
        company.research_points = points
        company.research_summary = self._summary_from_points(points)

        company.recent_funding = data.get("recent_funding") if confidence >= 50 else None
        company.recent_news = data.get("recent_news") if confidence >= 50 else None
        company.active_hiring = bool(data.get("active_hiring")) if confidence >= 50 else False
        company.enrichment_confidence = max(0, min(100, confidence))

        # Per-metric confidence (backend-only, feeds scoring). When low overall
        # confidence suppressed the funding/news/hiring signals above, their
        # per-metric confidence must drop too — otherwise scoring would read a
        # stale-high confidence for a now-empty field. Build the final dict
        # before assigning so SQLAlchemy persists exactly what we intend.
        mc = self._clean_metric_conf(data.get("metric_confidence"))
        if confidence < 50:
            for k in ("recent_funding", "recent_news", "active_hiring"):
                if k in mc:
                    mc[k] = min(mc[k], 20)
        company.metric_confidence = mc

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
        company.research_points = self._fallback_points(company, reason=reason)
        company.research_summary = self._summary_from_points(company.research_points)
        # Per-metric confidence is empty on the heuristic path — we have no real
        # evidence to rate. An empty dict means scoring applies no per-metric
        # discount; the overall enrichment_confidence ceiling still applies.
        company.metric_confidence = {}
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

    # ---- Profile / confidence helpers --------------------------------------
    @staticmethod
    def _summary_from_points(points: list[str]) -> str:
        """Derive the prose research_summary (kept for the outreach prompt,
        pipeline stats, admin debug, and seed consumers) from the bullet
        points. Space-joined with terminal periods so outreach's
        `research_summary.split('.')[0]` still yields a clean lead sentence and
        no newline bleeds into a fallback email body."""
        return " ".join(
            p.rstrip(". ").strip() + "." for p in points if p and p.strip()
        )

    @staticmethod
    def _clean_points(raw) -> list[str]:
        """Normalize the AI's research_points: strip leading bullet glyphs,
        drop blanks/non-strings, cap length and count."""
        if not isinstance(raw, list):
            return []
        out: list[str] = []
        for p in raw:
            if not isinstance(p, (str, int, float)):
                continue
            text = str(p).strip().lstrip("-•*").strip()
            if text:
                out.append(text[:300])
        return out[:8]

    @staticmethod
    def _clean_metric_conf(raw) -> dict:
        """Validate the AI's per-metric confidence object: keep only known
        keys, clamp each to 0–100, ignore garbage. Returns {} on a non-dict."""
        if not isinstance(raw, dict):
            return {}
        out: dict[str, int] = {}
        for k in METRIC_KEYS:
            if k in raw and raw[k] is not None:
                try:
                    out[k] = max(0, min(100, int(raw[k])))
                except (TypeError, ValueError):
                    continue
        return out

    def _fallback_points(self, company: Company, reason: str) -> list[str]:
        """Honest bullet profile for the no-evidence paths. Mirrors the old
        prose fallback but as a list, and never fabricates signals."""
        ctx = _csv_context(company)
        lead = (
            f"{company.name} is listed as operating in {ctx}."
            if ctx else
            f"{company.name} has no detailed profile data on file."
        )
        points = [lead]
        if reason == "no_ai_key":
            points.append(
                "No AI provider is configured, so this profile relies on the CSV "
                "upload alone — connect an AI provider for real web-sourced "
                "enrichment."
            )
        elif reason == "no_snippets":
            points.append(
                f"Public search returned no relevant coverage of "
                f"{company.domain or 'this company'}, so independent research "
                "couldn't add to the CSV-provided profile."
            )
            points.append("Verify with the company directly before relying on the score.")
        else:  # ai_unusable
            points.append(
                "Public sources had some signals, but they couldn't be summarized "
                "into a reliable profile — the AI response was incomplete or "
                "unparseable."
            )
            points.append("Re-research, or check the company manually.")
        points.append("No funding, news, or hiring signals could be confirmed.")
        return points


enrichment_agent = EnrichmentAgent()
