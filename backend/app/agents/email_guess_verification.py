"""Email Guessing & Verification agent (pipeline stage 4).

A single agent that, per contact, guesses the most-likely mailbox from
name + domain patterns and then verifies each guess. It stores the first guess
the provider confirms **Verified** (a real mailbox). On a **catch-all** server —
one that accepts every address, so no specific mailbox can be confirmed — it
keeps the top guess marked **Risky** rather than burning a paid credit on every
pattern for the same answer. If a company would otherwise get nothing, the top
contact still gets a best-guess address (Risky, low confidence) so it stays
contactable.

When **Hunter.io** is configured, ONE lookup per company first resolves the top
contact's real email and the company's mail domain (its small free tier is spent
once per company, not per contact); the remaining contacts reuse that domain via
the guess+verify path. The guess patterns live in `guess_emails()` below (a plain
helper); verification is delegated to `providers/verification.py` (free syntax/MX
→ Verifalia/ZeroBounce).

This module replaces the former split `email_guess.py` + `verification.py`
agents — guessing always ran inside the verification agent, so they are now one.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.models import Company, Contact
from app.providers.hunter import hunter
from app.providers.search import search
from app.providers.verification import verification as verifier
from app.services import contact_directory
from app.services.pipeline_locks import is_locked


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
        # Forced re-run clears prior guesses so we re-resolve — but PRESERVES
        # already-Verified addresses: they're confirmed and cost a paid credit to
        # obtain, so re-verifying would only waste another (and could blank them
        # when the verifier is out of credits).
        if force:
            for contact in company.contacts:
                if self._confirmed(contact) or is_locked(db, contact):
                    continue
                contact.email = ""
                contact.verification = "Unknown"
                contact.confidence = 0
            db.commit()
        contacts = list(company.contacts)

        # 1) The company's REAL mail domain, in priority order: an explicit
        #    user-set override (for cases like notion.so → makenotion.com that
        #    can't be auto-discovered), then an already-confirmed contact's domain,
        #    then discovery (site/web), then the website domain. Hunter needs the
        #    actual mail ending.
        real_domain = (getattr(company, "mail_domain", "") or "").strip().lower()
        if not real_domain:
            real_domain = next(
                (c.email.split("@")[-1].lower() for c in contacts if self._confirmed(c)), ""
            )
        if not real_domain:
            real_domain = search.find_email_domain(company.name, company.domain)
            if real_domain and real_domain != (company.domain or "").lower():
                self.log(
                    db, owner_id,
                    f"Email domain for {company.name}: {real_domain} — site is {company.domain or 'n/a'}.",
                )
        domain = real_domain or company.domain or f"{company.name.lower().replace(' ', '')}.com"

        # 2) Hunter.io (ONE lookup per company): resolve the top contact's real
        #    email — unless it's ALREADY Verified (keep it, don't spend a credit).
        #    Pass the discovered mail domain when we have one; otherwise let Hunter
        #    resolve it from the company name (better than the website domain).
        hunter_done = None
        if hunter.available and contacts and not self._confirmed(contacts[0]) \
                and not is_locked(db, contacts[0]):
            top = contacts[0]
            fn, ln = _parts(top.name)
            hit = hunter.find_email(fn, ln, domain=real_domain, company=company.name)
            if hit:
                top.email = hit["email"]
                top.verification = hit["verdict"]
                top.confidence = hit["score"]
                hunter_done = top
                # Hunter's returned email domain is authoritative — adopt it for
                # guessing the remaining contacts.
                hdom = hit["email"].split("@", 1)[1].lower()
                if hdom:
                    domain = hdom
                self.log(
                    db, owner_id,
                    f"Hunter.io: {top.name} → {hit['email']} ({hit['verdict']}).",
                )

        # 3) Remaining contacts: guess + verify via the paid layer (Verifalia/
        #    ZeroBounce), with the per-domain catch-all short-circuit.
        domain_is_catch_all = False
        for contact in contacts:
            if contact is hunter_done or self._confirmed(contact) or is_locked(db, contact):
                continue  # confirmed or in-conversation — never re-verify
            candidates = guess_emails(contact.name, domain)
            if domain_is_catch_all:
                # Domain already shown catch-all — every probe returns the same
                # "Risky", so don't spend more credits; keep the top guess.
                contact.email = candidates[0]
                contact.verification = "Risky"
                contact.confidence = 50
                continue
            if self._resolve(contact, candidates, db, owner_id):
                domain_is_catch_all = True

        # Floor — guarantee at least one contactable lead per company. If nothing
        # above produced an address (Hunter had no data AND the paid verifier is
        # unavailable / out of credits), store the top contact's most-likely
        # pattern as a best-guess so the company isn't a dead end.
        if contacts and not any((c.email or "").strip() for c in contacts):
            top = contacts[0]
            top.email = guess_emails(top.name, domain)[0]
            top.verification = "Risky"
            top.confidence = 30
            self.log(
                db, owner_id,
                f"No address could be verified for {company.name}; stored a best-guess for "
                f"{top.name} ({top.email}) so it stays contactable.",
            )

        # rollup status
        verified = sum(1 for c in company.contacts if c.verification == "Verified")
        with_email = sum(1 for c in company.contacts if (c.email or "").strip())
        db.commit()
        self.log(
            db,
            owner_id,
            f"{with_email}/{len(company.contacts)} contacts at {company.name} have an "
            f"address ({verified} confirmed, {with_email - verified} best-guess on a "
            "catch-all server).",
        )

        # Record any confirmed addresses into the global directory so other
        # campaigns for the same company can reuse them (skips finder + verify).
        contact_directory.record_verified(db, company)

    @staticmethod
    def _confirmed(contact: Contact) -> bool:
        """A contact whose address is already provider-Verified — keep it as-is
        and never re-verify (it's confirmed and re-checking just burns a credit)."""
        return contact.verification == "Verified" and bool((contact.email or "").strip())

    # Confidence for a confirmed ("Verified") vs a best-guess ("Risky") address.
    _VERIFIED_CONF = 95
    _RISKY_CONF = 55

    def _resolve(
        self, contact: Contact, candidates: list[str], db: Session, owner_id: int
    ) -> bool:
        # Guess in priority order; each guess passes the free local layer and then
        # the paid provider (inside verifier.classify). Store on the first:
        #   • "Verified" — a confirmed mailbox (best), then stop; or
        #   • "Risky"   — a catch-all / anti-probe server that ACCEPTS mail but
        #                 can't confirm the exact mailbox, so every pattern reads
        #                 the same "Risky". Keep this top guess and stop — probing
        #                 the rest just burns paid credits for the same answer.
        # "Invalid"/"Unknown" patterns are skipped. If nothing is usable, store no
        # address. Returns True when the server looked catch-all, so the caller can
        # skip paid probes for the other contacts at the same domain.
        for i, email in enumerate(candidates):
            verdict, catch_all = verifier.classify(email)
            if verdict == "Verified":
                contact.email = email
                contact.verification = "Verified"
                contact.confidence = max(self._VERIFIED_CONF - i * 3, 5)
                return False
            if verdict == "Risky":
                contact.email = email
                contact.verification = "Risky"
                contact.confidence = max(self._RISKY_CONF - i * 3, 5)
                return catch_all

        contact.email = ""
        contact.verification = "Unknown"
        contact.confidence = 0
        return False


email_guess_verification_agent = EmailGuessVerificationAgent()
