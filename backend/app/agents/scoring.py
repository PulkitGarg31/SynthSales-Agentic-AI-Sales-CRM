from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Campaign, Company
from app.providers.ai import ai

FACTORS = [
    ("Product fit", 0.30),
    ("Industry alignment", 0.20),
    ("Company relevance", 0.15),
    ("Requirement satisfaction", 0.15),
    ("Market compatibility", 0.10),
    ("Growth indicators", 0.10),
]


class ScoringAgent(Agent):
    key = "scoring"
    name = "Company Scoring"

    def run(
        self,
        db: Session,
        campaign: Campaign,
        owner_id: int,
        companies: list[Company] | None = None,
    ) -> int:
        if companies is None:
            companies = (
                db.query(Company).filter(Company.campaign_id == campaign.id).all()
            )
        for c in companies:
            self._score(c, campaign)

        # Rank by score (desc), assign ranks, pick top N.
        ranked = sorted(companies, key=lambda c: c.ai_score, reverse=True)
        for i, c in enumerate(ranked, start=1):
            c.rank = i
            # Preserve user-set states ("Excluded", "Approved", "Contacted"); only
            # toggle automatic ones. Below-top-N now flips to "Reviewed" rather
            # than back to "Researching" — the research IS done, the company
            # just wasn't selected for outreach this round.
            if c.status in ("Researching", "Qualified", "Reviewed"):
                c.status = "Qualified" if i <= campaign.top_n else "Reviewed"
        db.commit()
        self.log(
            db,
            owner_id,
            f"Scored & ranked {len(companies)} companies for '{campaign.name}'; "
            f"top {min(campaign.top_n, len(companies))} qualified.",
        )
        return len(companies)

    # ---- Per-company scoring ------------------------------------------------
    def _score(self, c: Company, campaign: Campaign) -> None:
        """Score a company against the campaign's ICP. AI-driven when a provider
        is configured (uses the full ICP + the enrichment profile); otherwise a
        deterministic real-signal heuristic. Both paths are discounted by the
        per-metric confidence and finally clamped by the overall
        enrichment_confidence ceiling."""
        if ai.available:
            factors, explanation = self._score_ai(c, campaign)
            if factors is None:
                factors, explanation = self._score_heuristic(c, campaign)
        else:
            factors, explanation = self._score_heuristic(c, campaign)

        c.score_factors = factors
        raw = int(round(sum(f["weight"] * f["score"] for f in factors)))
        c.ai_score = self._apply_confidence_ceiling(raw, c)
        c.match_level = self._match_level(c.ai_score)
        c.match_explanation = explanation

    # ---- AI path ------------------------------------------------------------
    def _score_ai(self, c: Company, campaign: Campaign):
        """Ask the AI to score the company against the real ICP using the
        enrichment profile. Returns (factors, explanation), or (None, None) if
        the response is unusable so the caller falls back to the heuristic."""
        profile = "\n".join(f"- {p}" for p in (c.research_points or [])) or "(no research points)"
        signals = []
        if c.recent_funding:
            signals.append(f"recent funding: {c.recent_funding}")
        if c.recent_news:
            signals.append(f"recent news: {c.recent_news}")
        signals.append(f"actively hiring: {bool(c.active_hiring)}")

        prompt = (
            "Score how well this company fits our Ideal Customer Profile (ICP). "
            "Rate EACH factor 0-100 based ONLY on the evidence below — do not "
            "invent facts that aren't in the research profile. If the profile is "
            "thin, score conservatively (40-60), never high.\n\n"
            "=== WHAT WE SELL ===\n"
            f"Product: {campaign.product}\n"
            f"Description: {campaign.product_description}\n"
            f"Value proposition: {campaign.value_proposition}\n"
            f"Our industry: {campaign.industry}\n"
            f"Differentiators: {campaign.differentiators}\n\n"
            "=== OUR IDEAL CUSTOMER (ICP) ===\n"
            f"ICP description: {campaign.icp or 'not specified'}\n"
            f"Preferred industries: {campaign.industry_pref or 'any'}\n"
            f"Business requirements: {campaign.business_requirements or 'none specified'}\n"
            f"Ranking criteria: {campaign.ranking_criteria or 'none specified'}\n"
            f"Target geography: {campaign.geography or 'any'}\n"
            f"Target company size: {campaign.company_size or 'any'}\n\n"
            "=== THE COMPANY ===\n"
            f"Name: {c.name}\n"
            f"Industry: {c.industry or 'unknown'}\n"
            f"Size: {c.size or 'unknown'}\n"
            f"Location: {c.location or 'unknown'}\n"
            f"Research profile:\n{profile}\n"
            f"Signals: {'; '.join(signals)}\n\n"
            'Return JSON exactly like: {"scores": {"Product fit": 0, '
            '"Industry alignment": 0, "Company relevance": 0, '
            '"Requirement satisfaction": 0, "Market compatibility": 0, '
            '"Growth indicators": 0}, "match_explanation": "2-3 sentence '
            'justification grounded in the profile"} — each score an integer 0-100.'
        )
        data = ai.complete_json(
            prompt,
            system="You are a precise B2B ICP-fit scoring analyst. Evidence over optimism.",
        )
        if not data or not isinstance(data.get("scores"), dict):
            return None, None
        raw = data["scores"]
        factors = self._build_factors(c, lambda label: raw.get(label, 50))
        explanation = str(data.get("match_explanation") or "").strip() or self._auto_explanation(c, factors)
        return factors, explanation

    # ---- Deterministic fallback (no AI, or AI unusable) ---------------------
    def _score_heuristic(self, c: Company, campaign: Campaign):
        """Score from REAL signals only — no name-hash randomness. Research
        depth (number of honest bullets) sets the baseline; industry match,
        funding, hiring and news adjust it. On the heuristic enrichment path the
        funding/news/hiring signals are always absent, so a low-evidence company
        stays low and the confidence ceiling then keeps it out of Strong/Good."""
        prefs = [p.strip().lower() for p in (campaign.industry_pref or "").split(",") if p.strip()]
        ind = (c.industry or "").lower()
        industry_match = bool(prefs) and any(p in ind or ind in p for p in prefs)

        evidence = len(c.research_points or [])      # 0–8 honest bullets, real signal
        base = 45 + min(evidence, 6) * 3             # 45–63 from research depth
        funding = 12 if c.recent_funding else 0
        hiring = 10 if c.active_hiring else 0
        news_pen = 14 if c.recent_news else 0
        ind_bonus = 20 if industry_match else 0
        has_reqs = bool((campaign.business_requirements or "").strip())

        per_factor = {
            "Product fit": base + ind_bonus // 2,
            "Industry alignment": base + ind_bonus,
            "Company relevance": base + min(evidence, 6) * 2,
            "Requirement satisfaction": base + (8 if has_reqs and evidence >= 3 else 0),
            "Market compatibility": base + ind_bonus // 2,
            "Growth indicators": base + funding + hiring - news_pen,
        }
        factors = self._build_factors(c, lambda label: per_factor[label])
        return factors, self._auto_explanation(c, factors)

    # ---- Shared factor assembly --------------------------------------------
    def _build_factors(self, c: Company, base_for) -> list[dict]:
        """Turn per-label base scores into the score_factors list, applying the
        per-metric confidence discount to the factors whose evidence it rates,
        and clamping to 5–99."""
        factors = []
        for label, weight in FACTORS:
            try:
                score = float(max(0, min(100, int(base_for(label)))))
            except (TypeError, ValueError):
                score = 50.0
            if label == "Industry alignment":
                score *= self._disc(c, "industry")
            elif label == "Growth indicators":
                score *= max(self._disc(c, "recent_funding"), self._disc(c, "active_hiring"))
            elif label == "Market compatibility":
                score *= self._disc(c, "location")
            factors.append(
                {"label": label, "weight": weight, "score": int(max(5, min(99, round(score))))}
            )
        return factors

    @staticmethod
    def _disc(c: Company, key: str, floor: float = 0.4) -> float:
        """Per-metric confidence discount in [floor, 1.0]. Absent key → 1.0, so
        legacy rows (empty metric_confidence) are unaffected. `floor` keeps a
        known-but-unverified signal from zeroing out its factor entirely."""
        mc = getattr(c, "metric_confidence", None) or {}
        if key not in mc:
            return 1.0
        try:
            v = max(0, min(100, int(mc[key])))
        except (TypeError, ValueError):
            return 1.0
        return floor + (1.0 - floor) * (v / 100.0)

    @staticmethod
    def _apply_confidence_ceiling(raw: int, c: Company) -> int:
        """Final clamp by OVERALL enrichment_confidence — load-bearing. Companies
        with no real evidence (dead domain, no search hits, AI couldn't
        corroborate) can't reach "Strong"/"Good" no matter what the factor
        scores produced, so a hallucinated profile can't outrank a real one."""
        conf = max(0, min(100, getattr(c, "enrichment_confidence", 50)))
        if conf < 20:
            ceiling = 45    # Weak
        elif conf < 40:
            ceiling = 60    # Moderate (was Good)
        elif conf < 60:
            ceiling = 75    # Good but not top of Good
        elif conf < 75:
            ceiling = 87    # Strong achievable
        else:
            ceiling = 99
        return min(raw, ceiling)

    @staticmethod
    def _match_level(score: int) -> str:
        return (
            "Strong" if score >= 85
            else "Good" if score >= 70
            else "Moderate" if score >= 55
            else "Weak"
        )

    def _auto_explanation(self, c: Company, factors: list) -> str:
        """Deterministic explanation — used on the heuristic path and as the
        backstop when the AI omits its own match_explanation."""
        conf = max(0, min(100, getattr(c, "enrichment_confidence", 50)))
        bits = []
        if c.active_hiring:
            bits.append("active hiring (a growth signal)")
        if c.recent_funding:
            bits.append("recent funding")
        if c.recent_news:
            bits.append("recent news affecting timing")
        if conf < 20:
            bits.append("very low research confidence — domain unreachable or parked")
        elif conf < 40:
            bits.append("low research confidence — limited public signals")
        score = self._apply_confidence_ceiling(
            int(round(sum(f["weight"] * f["score"] for f in factors))), c
        )
        return (
            f"Scored {score}/100 (research confidence {conf}/100) — "
            + (", ".join(bits) if bits else "based on ICP-fit factors")
            + "."
        )


scoring_agent = ScoringAgent()
