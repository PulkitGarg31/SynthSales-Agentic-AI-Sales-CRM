"""Per-user Google Calendar provider.

Creates a real calendar event with a Google Meet conference on the BOOKING
user's own calendar, using their stored OAuth refresh token. House style: reuse
the google-api-python-client already used by providers/email.py for Gmail; never
log the token; return None on any failure so the caller can fall back to a
user-supplied link.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime

from app.core.config import settings
from app.models import User

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events"


class GoogleCalendarProvider:
    def available_for(self, user: User | None) -> bool:
        return bool(user and user.google_calendar_token)

    def _credentials(self, user: User):
        from google.oauth2.credentials import Credentials

        # Reconstruct from the stored refresh token + app client creds; google-auth
        # mints/refreshes the short-lived access token automatically on use.
        return Credentials(
            token=None,
            refresh_token=user.google_calendar_token,
            token_uri=GOOGLE_TOKEN_URI,
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            scopes=[CALENDAR_SCOPE],
        )

    def create_meet_event(
        self,
        user: User,
        summary: str,
        description: str,
        start: datetime,
        end: datetime,
        attendee_email: str | None = None,
        send_invite: bool = False,
    ) -> dict | None:
        """Create a Meet event on the user's primary calendar. Returns
        {"link", "event_id", "html_link"} or None on any failure."""
        if not self.available_for(user):
            return None
        try:
            from googleapiclient.discovery import build

            service = build(
                "calendar", "v3", credentials=self._credentials(user),
                cache_discovery=False,
            )
            body: dict = {
                "summary": summary,
                "description": description,
                # start/end are tz-aware UTC datetimes; carry an explicit timeZone.
                "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
                "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
                "conferenceData": {
                    "createRequest": {
                        "requestId": uuid.uuid4().hex,
                        "conferenceSolutionKey": {"type": "hangoutsMeet"},
                    }
                },
            }
            # Only add the prospect as an attendee (→ Google emails them) when the
            # kill-switch is on; otherwise the link is still generated silently.
            if attendee_email and send_invite:
                body["attendees"] = [{"email": attendee_email}]
            event = (
                service.events()
                .insert(
                    calendarId="primary",
                    body=body,
                    conferenceDataVersion=1,
                    sendUpdates="all" if send_invite else "none",
                )
                .execute()
            )
            return {
                "link": event.get("hangoutLink", ""),
                "event_id": event.get("id", ""),
                "html_link": event.get("htmlLink", ""),
            }
        except Exception as exc:  # pragma: no cover — degrade gracefully
            logger.warning("Calendar event creation failed: %s", exc)
            return None


# Process-wide singleton — import this, not the class.
calendar_provider = GoogleCalendarProvider()
