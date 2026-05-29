from __future__ import annotations

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.agents.email_guess import guess_emails
from app.models import Company, Contact
from app.providers.verification import verification as verifier


class VerificationAgent(Agent):
    key = "verification"
    name = "Email Verification"

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
        domain = company.domain or f"{company.name.lower().replace(' ', '')}.com"
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

    # Higher = better. Used to keep the strongest result across guessed patterns.
    _RANK = {"Verified": 4, "Risky": 3, "Unknown": 2, "Invalid": 1}
    _CONF = {"Verified": 95, "Risky": 60, "Unknown": 45, "Invalid": 20}

    def _resolve(
        self, contact: Contact, candidates: list[str], db: Session, owner_id: int
    ) -> None:
        if not candidates:
            contact.verification, contact.confidence = "Unknown", 0
            return

        # Try each guessed pattern; stop at the first deliverable address (PRD §4),
        # otherwise keep the best-ranked result we saw (e.g. Risky/Unknown over Invalid).
        best_email, best_status, best_conf = candidates[0], "Invalid", 20
        for i, email in enumerate(candidates):
            status = verifier.verify(email)
            if status == "Verified":
                contact.email = email
                contact.verification = "Verified"
                contact.confidence = self._CONF["Verified"] - i * 3
                return
            if self._RANK[status] > self._RANK[best_status]:
                best_email, best_status = email, status
                best_conf = max(self._CONF[status] - i * 3, 5)

        contact.email = best_email
        contact.verification = best_status
        contact.confidence = best_conf


verification_agent = VerificationAgent()
