"""Per-user inbound mail reader.

Reads new replies from the user's connected mailbox so the reply-classifier can
ingest + label them. Mirrors providers/calendar.py: reconstructs google-auth
Credentials from the user's stored gmail.readonly refresh token; never logs the
token; returns [] (never raises) on any failure so the rest of the app is
unaffected. A stdlib-imaplib fallback reads a single globally-configured mailbox
when no per-user Gmail token is connected but IMAP creds are set (dev/testing).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parseaddr

from app.core.config import settings
from app.models import User

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"


@dataclass
class InboundMessage:
    """Normalized inbound reply. `thread_hint` is the provider conversation id
    (Gmail threadId) when available; `external_id` is the de-dupe key."""
    external_id: str
    from_email: str
    subject: str
    body: str
    sent_at: datetime | None = None
    thread_hint: str | None = None


def _extract_email(raw: str) -> str:
    """Pull the bare address out of a From header, lowercased. '' if none."""
    return (parseaddr(raw or "")[1] or "").strip().lower()


class InboundMailProvider:
    def available_for(self, user: User | None) -> bool:
        return bool(user and user.gmail_read_token) or self._imap_configured()

    def _imap_configured(self) -> bool:
        return bool(
            settings.imap_host and settings.imap_username and settings.imap_password
        )

    def fetch_new_messages(self, user: User, max_results: int = 25) -> list[InboundMessage]:
        """Return the most recent inbound messages (newest first). Never raises.
        Prefers the per-user Gmail token; falls back to the global IMAP mailbox.
        De-dup is the CALLER's job (by external_id) — this just reads."""
        if user and user.gmail_read_token:
            return self._fetch_gmail(user, max_results)
        if self._imap_configured():
            return self._fetch_imap(max_results)
        return []

    # --- Gmail API (per-user) ---------------------------------------------
    def _credentials(self, user: User):
        from google.oauth2.credentials import Credentials

        return Credentials(
            token=None,
            refresh_token=user.gmail_read_token,
            token_uri=GOOGLE_TOKEN_URI,
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            scopes=[GMAIL_READ_SCOPE],
        )

    def _fetch_gmail(self, user: User, max_results: int) -> list[InboundMessage]:
        try:
            from googleapiclient.discovery import build

            service = build(
                "gmail", "v1", credentials=self._credentials(user),
                cache_discovery=False,
            )
            # Inbound only (-from:me), recent window, primary inbox. external_id
            # de-dup downstream is the correctness guarantee; the window just
            # bounds the read.
            listing = (
                service.users().messages()
                .list(
                    userId="me",
                    q="newer_than:30d -from:me",
                    maxResults=max_results,
                )
                .execute()
            )
            out: list[InboundMessage] = []
            for ref in listing.get("messages", []):
                full = (
                    service.users().messages()
                    .get(userId="me", id=ref["id"], format="full")
                    .execute()
                )
                parsed = self._parse_gmail(full)
                if parsed:
                    out.append(parsed)
            return out
        except Exception as exc:  # pragma: no cover — degrade gracefully
            logger.warning("Gmail read failed: %s", exc)
            return []

    @staticmethod
    def _parse_gmail(full: dict) -> InboundMessage | None:
        import base64

        payload = full.get("payload", {})
        headers = {h["name"].lower(): h["value"] for h in payload.get("headers", [])}
        from_email = _extract_email(headers.get("from", ""))
        subject = headers.get("subject", "")

        def _decode(data: str) -> str:
            try:
                return base64.urlsafe_b64decode(data.encode()).decode("utf-8", "ignore")
            except Exception:
                return ""

        body = ""

        def _walk(part: dict) -> None:
            nonlocal body
            if body:
                return
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data")
                if data:
                    body = _decode(data)
                    return
            for sub in part.get("parts", []) or []:
                _walk(sub)

        _walk(payload)
        if not body:
            body = full.get("snippet", "")

        ts: datetime | None = None
        internal = full.get("internalDate")
        if internal:
            try:
                ts = datetime.fromtimestamp(int(internal) / 1000, tz=timezone.utc)
            except Exception:
                ts = None

        return InboundMessage(
            external_id=full.get("id", ""),
            from_email=from_email,
            subject=subject,
            body=body.strip(),
            sent_at=ts,
            thread_hint=full.get("threadId"),
        )

    # --- IMAP fallback (single global mailbox) ----------------------------
    def _fetch_imap(self, max_results: int) -> list[InboundMessage]:
        import email as _email
        import imaplib

        out: list[InboundMessage] = []
        try:
            box = imaplib.IMAP4_SSL(settings.imap_host, settings.imap_port)
            box.login(settings.imap_username, settings.imap_password)
            box.select("INBOX")
            typ, data = box.search(None, "ALL")
            ids = data[0].split()[-max_results:] if data and data[0] else []
            for num in reversed(ids):
                typ, msg_data = box.fetch(num, "(RFC822)")
                if not msg_data or not msg_data[0]:
                    continue
                parsed = self._parse_imap(_email.message_from_bytes(msg_data[0][1]))
                if parsed:
                    out.append(parsed)
            box.logout()
        except Exception as exc:  # pragma: no cover — degrade gracefully
            logger.warning("IMAP read failed: %s", exc)
            return []
        return out

    @staticmethod
    def _parse_imap(parsed) -> InboundMessage | None:
        from email.utils import parsedate_to_datetime

        subject = parsed.get("Subject", "")
        from_email = _extract_email(parsed.get("From", ""))
        external_id = (parsed.get("Message-ID") or "").strip()

        body = ""
        if parsed.is_multipart():
            for part in parsed.walk():
                if part.get_content_type() == "text/plain":
                    payload = part.get_payload(decode=True)
                    if payload:
                        body = payload.decode("utf-8", "ignore")
                        break
        else:
            payload = parsed.get_payload(decode=True)
            if payload:
                body = payload.decode("utf-8", "ignore")

        ts: datetime | None = None
        try:
            ts = parsedate_to_datetime(parsed.get("Date"))
        except Exception:
            ts = None

        return InboundMessage(
            external_id=external_id or subject[:200],
            from_email=from_email,
            subject=subject,
            body=body.strip(),
            sent_at=ts,
            thread_hint=None,
        )


# Process-wide singleton — import this, not the class.
inbound_provider = InboundMailProvider()
