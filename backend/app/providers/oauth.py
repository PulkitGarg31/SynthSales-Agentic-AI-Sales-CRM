"""Google OAuth 2.0 provider (Authorization Code flow).

Degrades gracefully: with no GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET configured,
``available`` is False and the auth router declines to expose the OAuth routes.
Follows the house style — plain REST over httpx, no Google SDK — mirroring
``verification.py`` / ``search.py``.

Security: never log the client secret, the authorization ``code``, or any access
/ id token. On any network error the helpers return ``None`` and the caller
surfaces a friendly error to the SPA.
"""
from __future__ import annotations

import logging
from urllib.parse import urlencode

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
GOOGLE_SCOPES = "openid email profile"
GOOGLE_CALENDAR_SCOPES = (
    "openid email profile https://www.googleapis.com/auth/calendar.events"
)


class GoogleOAuthProvider:
    @property
    def available(self) -> bool:
        return bool(settings.google_client_id and settings.google_client_secret)

    def authorization_url(self, state: str) -> str:
        """Build the Google consent-screen URL the browser is redirected to."""
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_redirect_uri,
            "response_type": "code",
            "scope": GOOGLE_SCOPES,
            "state": state,
            "access_type": "online",
            "prompt": "select_account",
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    def calendar_authorization_url(self, state: str) -> str:
        """Consent URL for the per-user calendar connection. access_type=offline +
        prompt=consent forces Google to return a refresh token we can store."""
        params = {
            "client_id": settings.google_client_id,
            "redirect_uri": settings.google_calendar_redirect_uri,
            "response_type": "code",
            "scope": GOOGLE_CALENDAR_SCOPES,
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str, redirect_uri: str | None = None) -> dict | None:
        """Exchange an authorization code for tokens. Returns None on failure."""
        try:
            resp = httpx.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": redirect_uri or settings.google_redirect_uri,
                    "grant_type": "authorization_code",
                },
                timeout=15.0,
            )
        except httpx.HTTPError as exc:
            logger.warning("Google token exchange failed: %s", exc)
            return None
        if resp.status_code != 200:
            # Log status only — the body can echo back sensitive request fields.
            logger.warning("Google token exchange returned %s", resp.status_code)
            return None
        return resp.json()

    def fetch_userinfo(self, access_token: str) -> dict | None:
        """Fetch the OpenID userinfo (sub, email, email_verified, name)."""
        try:
            resp = httpx.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15.0,
            )
        except httpx.HTTPError as exc:
            logger.warning("Google userinfo fetch failed: %s", exc)
            return None
        if resp.status_code != 200:
            logger.warning("Google userinfo returned %s", resp.status_code)
            return None
        return resp.json()


# Process-wide singleton — import this, not the class.
oauth_provider = GoogleOAuthProvider()
