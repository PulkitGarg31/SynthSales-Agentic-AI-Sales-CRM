from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Campaign, Company

FACTORS = [
    ("Product fit", 0.30),
    ("Industry alignment", 0.20),
    ("Company relevance", 0.15),
    ("Requirement satisfaction", 0.15),
    ("Market compatibility", 0.10),
    ("Growth indicators", 0.10),
]


def _h(text: str, salt: str) -> int:
    return int(hashlib.sha256(f"{text}:{salt}".encode()).hexdigest()[:8], 16) % 100


class ScoringAgent(Agent):
    key = "scoring"
    name = "Company Scoring"

    def run(self, db: Session, campaign: Campaign, owner_id: int) -> int:
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

    def _score(self, c: Company, campaign: Campaign) -> None:
        factors = []
        # Signals that nudge the heuristic.
        hiring_bonus = 12 if c.active_hiring else 0
        funding_bonus = 10 if c.recent_funding else 0
        news_penalty = 14 if c.recent_news else 0
        # industry_pref may be a comma-separated list of preferred industries.
        prefs = [p.strip().lower() for p in (campaign.industry_pref or "").split(",") if p.strip()]
        company_industry = (c.industry or "").lower()
        industry_match = (
            18 if any(p in company_industry or company_industry in p for p in prefs) else 0
        )
        for label, weight in FACTORS:
            base = 55 + _h(c.name, label) % 30  # 55–84 baseline
            score = base + industry_match + hiring_bonus + funding_bonus - news_penalty
            if label == "Growth indicators":
                score += hiring_bonus + funding_bonus
            if label == "Industry alignment":
                score += industry_match
            score = max(5, min(99, score))
            factors.append({"label": label, "weight": weight, "score": int(score)})

        c.score_factors = factors
        raw = int(round(sum(f["weight"] * f["score"] for f in factors)))

        # Confidence cap — companies with no real evidence (dead domain, no
        # search hits, AI couldn't corroborate) can't reach "Strong" no matter
        # what the name-hash baseline produced. Otherwise a hallucinated
        # profile would outrank a real, well-researched company.
        conf = max(0, min(100, getattr(c, "enrichment_confidence", 50)))
        # Tightened ceilings — without real evidence a company can't display as
        # "Good" or better. conf=30 (heuristic / parked / no-snippets path)
        # now caps in the Moderate range, not Good.
        if conf < 20:
            ceiling = 45   # Weak
        elif conf < 40:
            ceiling = 60   # Moderate (was 70/Good)
        elif conf < 60:
            ceiling = 75   # Good but not top of Good
        elif conf < 75:
            ceiling = 87   # Strong achievable
        else:
            ceiling = 99
        c.ai_score = min(raw, ceiling)

        c.match_level = (
            "Strong" if c.ai_score >= 85
            else "Good" if c.ai_score >= 70
            else "Moderate" if c.ai_score >= 55
            else "Weak"
        )
        bits = []
        if industry_match:
            bits.append("strong industry alignment")
        if c.active_hiring:
            bits.append("active hiring (a growth signal)")
        if c.recent_funding:
            bits.append("recent funding")
        if c.recent_news:
            bits.append("recent negative news lowers timing")
        if conf < 20:
            bits.append("very low research confidence — domain unreachable or parked")
        elif conf < 40:
            bits.append("low research confidence — limited public signals")
        c.match_explanation = (
            f"Scored {c.ai_score}/100 (research confidence {conf}/100) — "
            + (", ".join(bits) if bits else "based on baseline fit signals")
            + "."
        )


scoring_agent = ScoringAgent()
