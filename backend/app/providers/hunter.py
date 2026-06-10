"""Hunter.io provider — Email Finder.

Used **sparingly** (Hunter's free tier is tiny): one lookup per company resolves
the top contact's real email AND reveals the company's actual mail domain (the
"mail ending"), which the guess+verify agent then reuses for the remaining
contacts via Verifalia/ZeroBounce. Degrades gracefully — no key or any error
returns None and the caller falls back to web-search domain discovery + pattern
guessing.
"""
from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

HUNTER_BASE = "https://api.hunter.io/v2"

# Hunter verification status -> our verdict vocabulary.
_HUNTER_MAP = {
    "valid": "Verified",
    "accept_all": "Risky",   # catch-all server — can't confirm the exact mailbox
    "webmail": "Risky",
    "unknown": "Risky",
    "invalid": "Invalid",
    "disposable": "Invalid",
}


class HunterProvider:
    @property
    def available(self) -> bool:
        return bool(settings.hunter_api_key)

    def find_email(
        self, first_name: str, last_name: str, domain: str = "", company: str = ""
    ) -> dict | None:
        """Look up the most likely email for a person at a company via Hunter's
        Email Finder. Returns ``{"email", "verdict", "score"}`` or None (not
        found / not configured / known-bad / error). One API call = one credit."""
        if not self.available or not first_name or not last_name:
            return None
        params = {
            "api_key": settings.hunter_api_key,
            "first_name": first_name,
            "last_name": last_name,
        }
        if domain:
            params["domain"] = domain
        elif company:
            params["company"] = company
        else:
            return None
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.get(f"{HUNTER_BASE}/email-finder", params=params)
                if resp.status_code != 200:
                    logger.warning("Hunter HTTP %s: %s", resp.status_code, resp.text[:200])
                    return None
                data = (resp.json() or {}).get("data") or {}
                email = (data.get("email") or "").strip()
                if not email or "@" not in email:
                    return None
                status = ((data.get("verification") or {}).get("status") or "").lower()
                # Have an email but unconfirmed deliverability -> Risky (not blank).
                verdict = _HUNTER_MAP.get(status, "Risky")
                if verdict == "Invalid":
                    return None  # don't store a known-bad address
                return {"email": email, "verdict": verdict, "score": int(data.get("score") or 0)}
        except Exception as exc:  # pragma: no cover
            logger.warning("Hunter find_email failed: %s", exc)
            return None


hunter = HunterProvider()
