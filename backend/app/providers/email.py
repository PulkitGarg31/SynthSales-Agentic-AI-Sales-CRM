"""Email sending provider.

Prefers Gmail API when GMAIL_TOKEN_FILE is configured; otherwise falls back to
SMTP; otherwise runs in "console" mode (logs the message) so flows still work.
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.text import MIMEText

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailProvider:
    @property
    def mode(self) -> str:
        if settings.gmail_token_file and settings.gmail_credentials_file:
            return "gmail"
        if settings.smtp_host and settings.smtp_username and settings.smtp_password:
            return "smtp"
        return "console"

    @property
    def available(self) -> bool:
        return self.mode in ("gmail", "smtp")

    def send(self, to: str, subject: str, body: str) -> bool:
        mode = self.mode
        if mode == "gmail":
            return self._send_gmail(to, subject, body)
        if mode == "smtp":
            return self._send_smtp(to, subject, body)
        logger.info("[console-email] To:%s | %s\n%s", to, subject, body)
        return True

    def _send_smtp(self, to: str, subject: str, body: str) -> bool:
        msg = MIMEText(body)
        msg["Subject"] = subject
        # A valid From is required; fall back to the authenticated user.
        msg["From"] = settings.smtp_from or settings.smtp_username
        msg["To"] = to
        try:
            # Port 465 → implicit SSL; otherwise STARTTLS (e.g. Gmail 587).
            if settings.smtp_port == 465:
                with smtplib.SMTP_SSL(settings.smtp_host, 465, timeout=20) as server:
                    server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(msg)
            else:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(settings.smtp_username, settings.smtp_password)
                    server.send_message(msg)
            logger.info("SMTP email sent to %s (%s)", to, subject)
            return True
        except Exception as exc:
            logger.warning("SMTP send to %s failed: %s", to, exc)
            return False

    def _send_gmail(self, to: str, subject: str, body: str) -> bool:
        try:
            import base64

            from google.oauth2.credentials import Credentials
            from googleapiclient.discovery import build

            creds = Credentials.from_authorized_user_file(settings.gmail_token_file)
            service = build("gmail", "v1", credentials=creds)
            msg = MIMEText(body)
            msg["To"] = to
            msg["Subject"] = subject
            raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
            service.users().messages().send(userId="me", body={"raw": raw}).execute()
            return True
        except Exception as exc:  # pragma: no cover
            logger.warning("Gmail send failed: %s", exc)
            return False


email_provider = EmailProvider()
