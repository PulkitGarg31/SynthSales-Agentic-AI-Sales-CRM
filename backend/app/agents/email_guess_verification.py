"""Email Guessing & Verification agent (pipeline stage 4).

A single agent that, per contact, guesses the most-likely mailbox from
name + domain patterns and then verifies each guess. It stores an address
**only** when ZeroBounce confirms it deliverable ("Verified") and stops at that
first hit; if no guess is confirmed it stores no address. The guess patterns
live in `guess_emails()` below (a plain helper); verification is delegated to
`providers/verification.py` (free syntax/MX layer → ZeroBounce).

This module replaces the former split `email_guess.py` + `verification.py`
agents — guessing always ran inside the verification agent, so they are now one.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Company, Contact
from app.providers.search import search
from app.providers.verification import verification as verifier


# --------------------------------------------------------------------------- #
# Email guessing — standard name+domain patterns, ordered most→least common.
# --------------------------------------------------------------------------- #
def _parts(name: str) -> tuple[str, str]:
    cleaned = re.sub(r"[^a-zA-Z ]", "", name).strip().lower().split()
    if not cleaned:
        return "", ""
    first = cleaned[0]
    last = cleaned[-1] if len(cleaned) > 1 else ""
    return first, last


def guess_emails(name: str, domain: str) -> list[str]:
    """Standard name+domain patterns, ordered most→least common (PRD §4)."""
    first, last = _parts(name)
    domain = domain.strip().lstrip("@") or "company.com"
    if not first:
        return [f"contact@{domain}"]
    candidates = []
    if last:
        candidates += [
            f"{first}.{last}@{domain}",
            f"{first}{last}@{domain}",
            f"{first[0]}{last}@{domain}",
            f"{first}@{domain}",
            f"{first}.{last[0]}@{domain}",
            f"{first[0]}.{last}@{domain}",
        ]
    else:
        candidates.append(f"{first}@{domain}")
    # de-dupe, keep order
    seen, out = set(), []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


# --------------------------------------------------------------------------- #
# The agent — guess, then verify, in one pass.
# --------------------------------------------------------------------------- #
class EmailGuessVerificationAgent(Agent):
    key = "email_guess_verification"
    name = "Email Guessing & Verification"

    def run(
        self,
        db: Session,
        company: Company,
        owner_id: int,
        force: bool = False,
    ) -> None:
        # Forced re-run wipes the previously guessed email + verification
        # state so we re-guess the address and re-call the verifier instead
        # of trusting whatever was recorded last time.
        if force:
            for contact in company.contacts:
                contact.email = ""
                contact.verification = "Unknown"
                contact.confidence = 0
            db.commit()
        # Find the company's REAL email domain first (e.g. Notion's site is
        # notion.so but its mail is @makenotion.com); fall back to the website
        # domain when the web search turns up nothing.
        real_domain = search.find_email_domain(company.name, company.domain)
        domain = real_domain or company.domain or f"{company.name.lower().replace(' ', '')}.com"
        if real_domain and real_domain != (company.domain or "").lower():
            self.log(
                db, owner_id,
                f"Email domain for {company.name}: {real_domain} (web) — site is {company.domain or 'n/a'}.",
            )
        for contact in company.contacts:
            candidates = guess_emails(contact.name, domain)
            self._resolve(contact, candidates, db, owner_id)
        # rollup status
        verified = sum(1 for c in company.contacts if c.verification == "Verified")
        db.commit()
        self.log(
            db,
            owner_id,
            f"Verified {verified}/{len(company.contacts)} contacts at {company.name}.",
        )

    # Confidence for a ZeroBounce-confirmed address, decayed by pattern index.
    _VERIFIED_CONF = 95

    def _resolve(
        self, contact: Contact, candidates: list[str], db: Session, owner_id: int
    ) -> None:
        # Guess in priority order; each guess passes through the free local layer
        # and then ZeroBounce (inside verifier.verify). Store the address ONLY on
        # a ZeroBounce-confirmed "Verified" and stop — no further guessing. If no
        # guess is confirmed deliverable, store NO address (an honest "no confirmed
        # address" rather than a speculative Risky/Unknown guess).
        #
        # NB: with no ZeroBounce key the free layer never returns "Verified", so
        # nothing is stored — ZeroBounce is required to produce a contactable
        # address (deliberate; see spec 03 / the Step-03 plan).
        for i, email in enumerate(candidates):
            if verifier.verify(email) == "Verified":
                contact.email = email
                contact.verification = "Verified"
                contact.confidence = max(self._VERIFIED_CONF - i * 3, 5)
                return

        contact.email = ""
        contact.verification = "Unknown"
        contact.confidence = 0


email_guess_verification_agent = EmailGuessVerificationAgent()
