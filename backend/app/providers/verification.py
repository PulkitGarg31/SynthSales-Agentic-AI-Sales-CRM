"""Layered email verification.

Order (cheapest first):
  1. Free local layer — runs always, no key:
       syntax → role/disposable detection → MX (DNS) lookup.
     Catches obvious bad addresses (typos, dead domains) for free, so we never
     spend paid credits on them.
  2. Paid layer — optional, only for addresses that survive layer 1:
       ZeroBounce (when ZEROBOUNCE_API_KEY is set).

Returns one of: Verified | Risky | Invalid | Unknown.

NB: We deliberately do NOT do live SMTP "RCPT TO" probing — it's unreliable for
catch-all domains, blocked by Gmail/Outlook, and can harm sender reputation.
"""
from __future__ import annotations

import logging

import httpx

try:  # pragma: no cover - import guard
    import dns.resolver
    from email_validator import EmailNotValidError, validate_email

    _LIBS = True
except Exception:  # pragma: no cover
    _LIBS = False

from app.core.config import settings

logger = logging.getLogger(__name__)

ZEROBOUNCE_BASE = "https://api.zerobounce.net/v2"

# Common mailbox names that are shared aliases, not a specific person. They're
# usually deliverable but low quality for 1:1 outreach → flag as Risky.
ROLE_ACCOUNTS = {
    "info", "admin", "administrator", "sales", "support", "help", "contact",
    "hello", "office", "team", "billing", "accounts", "marketing", "hr",
    "jobs", "careers", "noreply", "no-reply", "webmaster", "postmaster",
    "abuse", "privacy", "legal", "press", "media", "enquiries", "inquiries",
}

# A small built-in disposable/temp-mail domain blocklist (extensible).
DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
    "temp-mail.org", "throwawaymail.com", "yopmail.com", "getnada.com",
    "trashmail.com", "fakeinbox.com", "sharklasers.com", "dispostable.com",
    "maildrop.cc", "mintemail.com", "mailnesia.com", "emailondeck.com",
    "spam4.me", "tempinbox.com", "moakt.com", "mohmal.com", "ameady.com",
}

# ZeroBounce status -> our vocabulary.
_ZB_MAP = {
    "valid": "Verified",
    "invalid": "Invalid",
    "catch-all": "Risky",
    "spamtrap": "Risky",
    "abuse": "Risky",
    "do_not_mail": "Risky",
    "unknown": "Unknown",
}


class VerificationProvider:
    # The free layer always works, so verification is always "available".
    @property
    def available(self) -> bool:
        return True

    @property
    def paid_mode(self) -> str | None:
        if settings.zerobounce_api_key:
            return "zerobounce"
        return None

    def verify(self, email: str) -> str:
        # ---- Layer 1: free local checks ----
        local = self._local(email)
        if local in ("Invalid", "Risky"):
            # Definitive enough — don't spend a paid credit confirming it.
            return local

        # ---- Layer 2: paid confirmation of survivors ----
        if self.paid_mode == "zerobounce":
            return self._zerobounce(email)

        # No paid provider configured: syntax + MX look fine, but we can't
        # confirm the actual mailbox exists.
        return "Unknown"

    # ----------------------------------------------------------------- local
    def _local(self, email: str) -> str:
        """Returns 'Invalid', 'Risky', or 'pass' (looks deliverable so far)."""
        email = (email or "").strip()
        if "@" not in email:
            return "Invalid"
        local_part, _, domain = email.rpartition("@")
        local_part, domain = local_part.lower(), domain.lower()

        # Syntax (no network).
        if _LIBS:
            try:
                validate_email(email, check_deliverability=False)
            except EmailNotValidError:
                return "Invalid"
        elif not local_part or "." not in domain:
            return "Invalid"

        if domain in DISPOSABLE_DOMAINS:
            return "Risky"
        if local_part in ROLE_ACCOUNTS:
            return "Risky"

        mx = self._domain_accepts_mail(domain)
        if mx is False:
            return "Invalid"  # domain resolves to nothing that can receive mail
        return "pass"

    @staticmethod
    def _domain_accepts_mail(domain: str) -> bool | None:
        """True if the domain has MX (or A) records, False if definitively not,
        None if it couldn't be determined (transient DNS issue → don't punish)."""
        if not _LIBS:
            return None
        try:
            answers = dns.resolver.resolve(domain, "MX")
            return len(answers) > 0
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            # No MX — RFC says fall back to the A record.
            try:
                dns.resolver.resolve(domain, "A")
                return True
            except Exception:
                return False
        except Exception as exc:  # timeout, no nameservers, etc.
            logger.debug("MX lookup for %s inconclusive: %s", domain, exc)
            return None

    # ------------------------------------------------------------- zerobounce
    def _zerobounce(self, email: str) -> str:
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.get(
                    f"{ZEROBOUNCE_BASE}/validate",
                    params={
                        "api_key": settings.zerobounce_api_key,
                        "email": email,
                        "ip_address": "",
                    },
                )
                if resp.status_code != 200:
                    logger.warning("ZeroBounce HTTP %s: %s", resp.status_code, resp.text)
                    return "Unknown"
                status = (resp.json().get("status") or "unknown").lower()
                return _ZB_MAP.get(status, "Unknown")
        except Exception as exc:  # pragma: no cover
            logger.warning("ZeroBounce verify failed for %s: %s", email, exc)
            return "Unknown"


verification = VerificationProvider()
