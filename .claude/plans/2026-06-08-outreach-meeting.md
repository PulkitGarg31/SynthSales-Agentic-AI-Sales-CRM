# Outreach & Meeting (Step 04) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the engagement-phase changes for stages 5–7 — per-user Google Calendar + auto Google Meet links on booking, a wired Conversations booking UI, booking hardening (timezone/duration/double-booking/approval gate/secret-safe tokens), and reply-cadence rules (10-day follow-up delay decoupled from poll frequency, auto-`Stalled` terminal stage, and a `do_not_contact` suppression flag honored by every send path).

**Architecture:** FastAPI + SQLAlchemy 2.0 backend, Next.js 16 + React 19 frontend. Google Meet links are created per-user via the Calendar API using each user's own OAuth refresh token (stored on `User.google_calendar_token`), reusing the existing Google OAuth client and the `google-api-python-client` already used for Gmail. Reply automation lives in the existing `tracking` agent; suppression is a `Contact.do_not_contact` boolean enforced inside every send path. Everything degrades gracefully with no credentials and respects the `outbound_enabled` kill-switch.

**Tech Stack:** Python 3.14 (FastAPI, SQLAlchemy, pydantic v2, PyJWT, google-api-python-client/google-auth, httpx), TypeScript/Next.js 16, Tailwind v4, PostgreSQL 16 (host port 5433).

---

## Prerequisites & verification approach

- **Branch:** work on `feature/outreach-meeting` (already checked out).
- **No automated test suite** exists in this repo (per `CLAUDE.md`). The de-facto verification loop replaces TDD's red/green:
  - **Backend compiles/imports:** from the `backend/` dir run `.\.venv\Scripts\python.exe -c "import app.main; print('import ok')"`.
  - **Backend boots & migrates:** `docker compose up -d` then `.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` and hit `GET /health`.
  - **DB inspection:** from repo root `.\db.ps1 sql "<SELECT>"` and `.\db.ps1 user jordan@apexcloud.com`.
  - **Frontend typecheck:** from `web/` run `npm run build` (this is the typecheck gate).
- **Demo user:** `jordan@apexcloud.com` / `password123` (seeded).
- **Commit convention:** each commit message ends with the repo trailer. Example commands below include `-m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"`.
- Run backend Python via the venv exe directly (`backend\.venv\Scripts\python.exe`); Node may need `C:\Program Files\nodejs` on PATH.

---

## Phase 1 — Schema & config foundation

Adds the two required columns, the new settings, and the API surface for `calendar_connected` / `do_not_contact`. No behavior changes yet; the stack must still boot and `/health` stay green.

### Task 1: Add new settings to config

**Files:**
- Modify: `backend/app/core/config.py`

- [ ] **Step 1: Add the calendar redirect URI to the Google OAuth block**

In `backend/app/core/config.py`, find the Google OAuth block and add the calendar redirect URI after `google_redirect_uri`:

```python
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://127.0.0.1:8000/api/auth/google/callback"
    # Per-user Google Calendar connection (offline consent for calendar.events).
    # Register this URI in the OAuth client's "Authorized redirect URIs".
    google_calendar_redirect_uri: str = "http://127.0.0.1:8000/api/auth/google/calendar/callback"
    frontend_url: str = "http://localhost:3000"
```

- [ ] **Step 2: Redefine the automation block (decoupled cadence + meeting duration)**

Replace the existing `# Automation` block:

```python
    # Automation
    followup_interval_minutes: int = 15
    enable_scheduler: bool = True
```

with:

```python
    # Automation
    # Scheduler POLL cadence — how often the worker wakes to check threads.
    followup_interval_minutes: int = 15
    enable_scheduler: bool = True
    # How long a thread must sit unanswered (OUR last message) before an automatic
    # follow-up nudge fires. Decoupled from the poll cadence above, so you can poll
    # often but only nudge after, e.g., 10 days.
    followup_delay_days: int = 10
    # Max automatic follow-up nudges per thread before it auto-stalls.
    max_follow_ups: int = 3
    # Default generated-meeting length (minutes) for the calendar event end time.
    meeting_default_duration_minutes: int = 30
```

- [ ] **Step 3: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "from app.core.config import settings; print(settings.followup_delay_days, settings.meeting_default_duration_minutes, settings.google_calendar_redirect_uri)"
```
Expected: `10 30 http://127.0.0.1:8000/api/auth/google/calendar/callback`

- [ ] **Step 4: Commit**

```
git add backend/app/core/config.py
git commit -m "feat(config): add calendar redirect URI, decoupled follow-up delay, meeting duration" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add model columns (`User.google_calendar_token`, `Contact.do_not_contact`)

**Files:**
- Modify: `backend/app/models.py`

- [ ] **Step 1: Add the per-user calendar token + a computed property to `User`**

In `backend/app/models.py`, in the `User` class, after the `google_sub` column add the token column, and after the `created_at` column (before the `campaigns` relationship) add the property:

```python
    google_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    # Per-user Google refresh token for the calendar.events scope — booking creates
    # a real Meet link on THIS user's calendar. Sensitive: never serialized into
    # UserOut/logs/WS. Presence ⇒ calendar_connected.
    google_calendar_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    @property
    def calendar_connected(self) -> bool:
        return bool(self.google_calendar_token)

    campaigns: Mapped[list[Campaign]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
```

(`Text` is already imported at the top of `models.py`.)

- [ ] **Step 2: Add the suppression flag to `Contact`**

In the `Contact` class, after the `approved` column add:

```python
    approved: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Durable suppression flag — when True, EVERY send path (outreach draft, real
    # send, auto follow-up, meeting invite) skips this contact. Set on explicit
    # opt-out / "not interested" (Step 05) or manually in Contacts.
    do_not_contact: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
```

- [ ] **Step 3: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "from app.models import User, Contact; print('calendar_connected' in dir(User), 'do_not_contact' in Contact.__table__.columns)"
```
Expected: `True True`

- [ ] **Step 4: Commit**

```
git add backend/app/models.py
git commit -m "feat(models): add User.google_calendar_token (+property) and Contact.do_not_contact" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Idempotent migrations in lifespan

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add the two `ALTER TABLE` statements**

In `backend/app/main.py`, inside the `with engine.begin() as conn:` block, after the `google_sub` ALTER (the line adding `google_sub VARCHAR(255)`) insert:

```python
        conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_token TEXT")
        )
        conn.execute(
            text(
                "ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "
                "do_not_contact BOOLEAN NOT NULL DEFAULT false"
            )
        )
```

- [ ] **Step 2: Boot the backend so the migration runs**

Ensure Postgres is up (`docker compose up -d` from `backend/`), then from `backend/`:
```
.\.venv\Scripts\python.exe -c "import app.main; print('import ok')"
```
Then start the server briefly to run `lifespan`:
```
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```
(Ctrl-C after it logs "Application startup complete".)

- [ ] **Step 3: Verify the columns exist**

From repo root:
```
.\db.ps1 sql "SELECT column_name FROM information_schema.columns WHERE (table_name='users' AND column_name='google_calendar_token') OR (table_name='contacts' AND column_name='do_not_contact')"
```
Expected: two rows — `google_calendar_token` and `do_not_contact`.

- [ ] **Step 4: Commit**

```
git add backend/app/main.py
git commit -m "feat(db): idempotent ALTERs for google_calendar_token + do_not_contact" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Expose `calendar_connected` / `do_not_contact` in schemas

**Files:**
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Add `calendar_connected` to `UserOut`**

In `backend/app/schemas.py`, update `UserOut` (the token is NOT added — only the computed bool):

```python
class UserOut(ORMModel):
    id: int
    name: str
    email: EmailStr
    is_verified: bool
    outbound_enabled: bool = False
    calendar_connected: bool = False
    created_at: datetime
```

(`from_attributes=True` reads the `User.calendar_connected` property added in Task 2.)

- [ ] **Step 2: Add `do_not_contact` to `ContactOut` and `ContactUpdate`**

```python
class ContactOut(ORMModel):
    id: int
    company_id: int
    name: str
    role: str
    email: str
    linkedin: str | None = None
    verification: str
    confidence: int
    approved: bool | None = None
    do_not_contact: bool = False


class ContactUpdate(BaseModel):
    email: str | None = None
    approved: bool | None = None
    role: str | None = None
    name: str | None = None
    do_not_contact: bool | None = None
```

- [ ] **Step 3: Verify import + field presence**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "from app.schemas import UserOut, ContactOut, ContactUpdate; print('calendar_connected' in UserOut.model_fields, 'do_not_contact' in ContactOut.model_fields, 'do_not_contact' in ContactUpdate.model_fields)"
```
Expected: `True True True`

- [ ] **Step 4: Commit**

```
git add backend/app/schemas.py
git commit -m "feat(schemas): surface calendar_connected and do_not_contact" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Reply cadence & auto-stall + suppression

Backend behavior, independently shippable. Decouples the follow-up delay from the poll cadence, auto-stalls unanswered threads, and makes `do_not_contact` suppress every send path.

### Task 5: Decoupled cadence + auto-stall in the tracking agent

**Files:**
- Modify: `backend/app/agents/tracking.py`

- [ ] **Step 1: Replace `TrackingAgent.run`**

In `backend/app/agents/tracking.py`, replace the entire `run` method with:

```python
    def run(self, db: Session, owner_id: int) -> int:
        """Send automatic follow-ups for stale, unanswered outbound threads, and
        auto-stall threads that never reply after the follow-up cap."""
        # Respect the user's outbound kill-switch — no auto follow-ups while paused.
        owner = db.get(User, owner_id)
        if not owner or not owner.outbound_enabled:
            return 0
        # Staleness is measured in DAYS now, independent of how often we poll.
        cutoff = utcnow() - timedelta(days=settings.followup_delay_days)
        threads = (
            db.query(Thread)
            .join(Campaign, Campaign.id == Thread.campaign_id)
            .filter(Campaign.owner_id == owner_id, Campaign.status == "Running")
            .all()
        )
        sent = 0
        stalled = 0
        for t in threads:
            if t.stage != "Contacted" or not t.messages:
                continue
            # Suppressed contacts are skipped entirely (do-not-contact).
            contact = db.get(Contact, t.contact_id) if t.contact_id else None
            if contact and contact.do_not_contact:
                continue
            last = t.messages[-1]
            # Only act when WE spoke last and it's gone unanswered past the delay.
            if last.direction != "us" or last.sent_at >= cutoff:
                continue
            follow_ups = sum(1 for m in t.messages if m.is_follow_up)
            if follow_ups < settings.max_follow_ups:
                self._send_follow_up(db, t, owner_id)
                sent += 1
            else:
                # Cap reached and still no reply → terminal stall (no more outreach).
                t.stage = "Stalled"
                t.last_activity = utcnow()
                db.commit()
                add_notification(
                    db,
                    owner_id,
                    "followup",
                    "Thread stalled",
                    f"'{t.subject}' — no reply after {settings.max_follow_ups} follow-ups.",
                )
                stalled += 1
        if sent or stalled:
            self.log(db, owner_id, f"Sent {sent} follow-up(s); stalled {stalled} thread(s).")
        return sent
```

(`Contact`, `add_notification`, `settings`, `timedelta` are already imported in this file.)

- [ ] **Step 2: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "import app.agents.tracking; print('tracking ok')"
```
Expected: `tracking ok`

- [ ] **Step 3: Manual behavior check (after Phase 1 boot)**

With the stack running and the demo seed (which has a `Contacted` thread), confirm a thread idle a few minutes is NOT nudged (delay is 10 days). Trigger tracking:
```
.\db.ps1 sql "UPDATE messages SET sent_at = now() - interval '11 days' WHERE id = (SELECT m.id FROM messages m JOIN threads t ON t.id=m.thread_id WHERE t.stage='Contacted' ORDER BY m.sent_at DESC LIMIT 1)"
```
Then POST `/api/agents/run-tracking` (via `/docs`, authorized as the demo user with sending ON) and confirm one follow-up message appears on that thread. (If sending is OFF, `run()` returns 0 — that's correct.)
Expected: exactly one new `is_follow_up` message after back-dating; none when the thread is fresh.

- [ ] **Step 4: Commit**

```
git add backend/app/agents/tracking.py
git commit -m "feat(tracking): 10-day follow-up delay decoupled from poll + auto-stall + do_not_contact skip" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Enforce `do_not_contact` + approval gate in the other send paths

**Files:**
- Modify: `backend/app/agents/orchestrator.py` (two drafting loops)
- Modify: `backend/app/api/routers/conversations.py` (`send_from_draft`)

- [ ] **Step 1: Gate outreach drafting in `run_agent_for_campaign`**

In `backend/app/agents/orchestrator.py`, in `run_agent_for_campaign`'s `_draft_all`, replace:

```python
                    if (contact.email or "").strip():
                        outreach_agent.run(db, contact, c, campaign, owner_id, force=force)
```

with:

```python
                    if (
                        (contact.email or "").strip()
                        and contact.approved is not False
                        and not contact.do_not_contact
                    ):
                        outreach_agent.run(db, contact, c, campaign, owner_id, force=force)
```

- [ ] **Step 2: Gate outreach drafting in `run_campaign_pipeline`**

In the same file, in `run_campaign_pipeline`'s `_draft_all`, replace:

```python
                if (contact.email or "").strip():
                    outreach_agent.run(db, contact, c, campaign, owner_id, force=True)
```

with:

```python
                if (
                    (contact.email or "").strip()
                    and contact.approved is not False
                    and not contact.do_not_contact
                ):
                    outreach_agent.run(db, contact, c, campaign, owner_id, force=True)
```

- [ ] **Step 3: Block sending to a suppressed contact**

In `backend/app/api/routers/conversations.py`, in `send_from_draft`, after the ownership check (right after `if not company or company.campaign.owner_id != user.id:` block) add:

```python
    if contact.do_not_contact:
        raise HTTPException(
            status_code=403, detail="This contact is marked do-not-contact."
        )
```

- [ ] **Step 4: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "import app.agents.orchestrator, app.api.routers.conversations; print('ok')"
```
Expected: `ok`

- [ ] **Step 5: Manual behavior check**

Set a contact suppressed and confirm no draft is produced on re-run and `/conversations/send` 403s:
```
.\db.ps1 sql "UPDATE contacts SET do_not_contact = true WHERE id = (SELECT id FROM contacts WHERE email <> '' LIMIT 1)"
```
Re-run `run-agent key=outreach` for that campaign via `/docs`; confirm no new draft for that contact (`.\db.ps1 sql "SELECT * FROM email_drafts WHERE contact_id = <id>"`).
Expected: no draft for the suppressed contact; sending a pre-existing draft for it returns 403.

- [ ] **Step 6: Commit**

```
git add backend/app/agents/orchestrator.py backend/app/api/routers/conversations.py
git commit -m "feat(outreach): gate drafting/sending on approved + do_not_contact" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Per-user Google Calendar connection

Backend OAuth: lets a user connect their own calendar (offline consent for `calendar.events`), storing the refresh token on their `User` row.

### Task 7: Calendar consent URL + generalized code exchange in the OAuth provider

**Files:**
- Modify: `backend/app/providers/oauth.py`

- [ ] **Step 1: Add the calendar scope constant**

In `backend/app/providers/oauth.py`, below `GOOGLE_SCOPES`, add:

```python
GOOGLE_SCOPES = "openid email profile"
GOOGLE_CALENDAR_SCOPES = (
    "openid email profile https://www.googleapis.com/auth/calendar.events"
)
```

- [ ] **Step 2: Add `calendar_authorization_url`**

Inside `GoogleOAuthProvider`, after `authorization_url`, add:

```python
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
```

- [ ] **Step 3: Generalize `exchange_code` to accept a redirect URI**

Replace the `exchange_code` signature line and the `redirect_uri` line in its `data` dict:

```python
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
```

(The rest of `exchange_code` is unchanged.)

- [ ] **Step 4: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "from app.providers.oauth import oauth_provider; print(callable(oauth_provider.calendar_authorization_url))"
```
Expected: `True`

- [ ] **Step 5: Commit**

```
git add backend/app/providers/oauth.py
git commit -m "feat(oauth): calendar consent URL (offline) + redirect-uri-aware exchange_code" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Per-user Google Calendar provider

**Files:**
- Create: `backend/app/providers/calendar.py`

- [ ] **Step 1: Write the provider**

Create `backend/app/providers/calendar.py`:

```python
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
```

- [ ] **Step 2: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "from app.providers.calendar import calendar_provider; print(calendar_provider.available_for(None))"
```
Expected: `False`

- [ ] **Step 3: Commit**

```
git add backend/app/providers/calendar.py
git commit -m "feat(providers): per-user GoogleCalendarProvider (Meet link creation)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Calendar connect / callback / disconnect routes

**Files:**
- Modify: `backend/app/api/routers/auth.py`

- [ ] **Step 1: Extend the security import**

In `backend/app/api/routers/auth.py`, update only the security import to add `decode_access_token`:

```python
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
```

(`RedirectResponse`, `get_current_user`, `UserOut`, `Request`, `Depends`, `HTTPException`, `Session`, `get_db`, `oauth_provider`, `settings`, `add_log`, `User` are already imported. No `JSONResponse` is needed — the connect route returns a plain dict.)

- [ ] **Step 2: Append the three calendar routes**

At the end of `backend/app/api/routers/auth.py` add:

```python
# --- Google Calendar connection (per-user, incremental consent) ------------
# Reuses the OAuth client to request offline access for the calendar.events
# scope so booking can create a real Meet event on THIS user's calendar. The
# connect endpoint is authenticated and returns the consent URL as JSON for the
# SPA to navigate to; the callback is a public browser redirect whose `state` is
# a short-lived signed JWT binding the grant back to the logged-in user.


@router.get("/google/calendar/connect")
def google_calendar_connect(user: User = Depends(get_current_user)):
    if not oauth_provider.available:
        raise HTTPException(status_code=404, detail="Google integration is not enabled")
    # Signed, short-lived state both identifies the user on callback and acts as an
    # unforgeable CSRF token (HMAC over our secret_key). No cookie is used: the SPA
    # fetches this URL with its bearer token, then navigates the browser to it (a
    # cross-origin fetch can't persist a Set-Cookie anyway).
    state = create_access_token(str(user.id), expires_minutes=10)
    return {"url": oauth_provider.calendar_authorization_url(state)}


@router.get("/google/calendar/callback")
def google_calendar_callback(
    code: str = "",
    state: str = "",
    error: str = "",
    db: Session = Depends(get_db),
):
    base = f"{settings.frontend_url}/settings?calendar="
    if not oauth_provider.available:
        raise HTTPException(status_code=404, detail="Google integration is not enabled")
    if error:
        return RedirectResponse(base + "denied", status_code=307)
    # Verify the signed state (signature + expiry) and recover the user id.
    user_id = decode_access_token(state) if state else None
    if not user_id or not code:
        return RedirectResponse(base + "state", status_code=307)
    tokens = oauth_provider.exchange_code(
        code, redirect_uri=settings.google_calendar_redirect_uri
    )
    refresh_token = (tokens or {}).get("refresh_token")
    if not refresh_token:
        # No refresh token ⇒ offline access wasn't granted; ask the user to retry.
        return RedirectResponse(base + "exchange", status_code=307)
    user = db.get(User, int(user_id))
    if not user:
        return RedirectResponse(base + "state", status_code=307)
    user.google_calendar_token = refresh_token
    db.commit()
    add_log(db, user.id, "User", "Connected Google Calendar.")
    return RedirectResponse(base + "connected", status_code=307)


@router.post("/google/calendar/disconnect", response_model=UserOut)
def google_calendar_disconnect(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    user.google_calendar_token = None
    db.commit()
    db.refresh(user)
    add_log(db, user.id, "User", "Disconnected Google Calendar.")
    return user
```

- [ ] **Step 3: Verify import + route registration**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "from app.main import app; print([r.path for r in app.routes if 'calendar' in r.path])"
```
Expected includes: `/api/auth/google/calendar/connect`, `/api/auth/google/calendar/callback`, `/api/auth/google/calendar/disconnect`.

- [ ] **Step 4: Verify the no-credentials path**

With no `GOOGLE_CLIENT_ID` configured, hit `GET /api/auth/google/calendar/connect` (authorized as demo user via `/docs`). Expected: **404** "Google integration is not enabled". And `GET /api/auth/me` returns `"calendar_connected": false`.

- [ ] **Step 5: Commit**

```
git add backend/app/api/routers/auth.py
git commit -m "feat(auth): per-user Google Calendar connect/callback/disconnect routes" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Meet generation on booking

### Task 10: Rewrite `MeetingAgent.book` (per-user Meet, tz, duration, double-booking, kill-switch)

**Files:**
- Modify: `backend/app/agents/meeting.py`

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `backend/app/agents/meeting.py` with:

```python
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.core.config import settings
from app.models import Campaign, Contact, Meeting, Message, Thread, User, utcnow
from app.providers.calendar import calendar_provider
from app.providers.email import email_provider
from app.services.events import add_notification


class MeetingAgent(Agent):
    key = "meeting"
    name = "Meeting Coordination"

    def book(
        self,
        db: Session,
        thread: Thread,
        owner: User,
        scheduled_at: datetime,
        link: str | None = None,
        notes: str | None = None,
        duration_minutes: int | None = None,
    ) -> Meeting:
        contact = db.get(Contact, thread.contact_id) if thread.contact_id else None
        campaign = db.get(Campaign, thread.campaign_id)
        company_name = (
            contact.company.name if contact and contact.company else thread.subject
        )
        contact_name = contact.name if contact else "—"
        duration = duration_minutes or settings.meeting_default_duration_minutes
        end_at = scheduled_at + timedelta(minutes=duration)

        # Resolve the meeting link. Priority: a link the user pasted, else a real
        # Google Meet link created on the user's OWN calendar. The link itself is
        # generated regardless of the kill-switch; only the prospect invite/email
        # is gated on outbound_enabled. Never fabricate a fake link.
        meet_link = (link or "").strip()
        invite_sent = False
        if not meet_link and calendar_provider.available_for(owner):
            want_invite = bool(
                owner.outbound_enabled
                and contact
                and contact.email
                and not contact.do_not_contact
            )
            result = calendar_provider.create_meet_event(
                owner,
                summary=f"{(campaign.product if campaign else '') or 'Intro'} — {company_name}",
                description=notes or "Booked via Reachly.",
                start=scheduled_at,
                end=end_at,
                attendee_email=contact.email if contact else None,
                send_invite=want_invite,
            )
            if result and result.get("link"):
                meet_link = result["link"]
                invite_sent = want_invite
        if not meet_link:
            # No paste and no connected calendar → cannot honestly produce a link.
            raise ValueError("no_meeting_link")

        # Double-booking guard: one Upcoming meeting per thread's company+contact.
        meeting = (
            db.query(Meeting)
            .filter(
                Meeting.campaign_id == thread.campaign_id,
                Meeting.company == company_name,
                Meeting.contact == contact_name,
                Meeting.status == "Upcoming",
            )
            .first()
        )
        if meeting:
            meeting.scheduled_at = scheduled_at
            meeting.link = meet_link
            meeting.notes = notes
        else:
            meeting = Meeting(
                campaign_id=thread.campaign_id,
                company=company_name,
                contact=contact_name,
                scheduled_at=scheduled_at,
                status="Upcoming",
                link=meet_link,
                notes=notes,
            )
            db.add(meeting)

        confirm = (
            f"Great — booked for {scheduled_at:%b %d, %Y %I:%M %p} UTC. "
            f"Join link: {meet_link}"
        )
        db.add(
            Message(
                thread_id=thread.id,
                direction="us",
                author="Reachly",
                body=confirm,
                is_follow_up=True,
            )
        )
        thread.stage = "Meeting"
        thread.last_activity = utcnow()
        db.commit()
        db.refresh(meeting)

        add_notification(
            db,
            owner.id,
            "meeting",
            "Meeting scheduled",
            f"{company_name} — {scheduled_at:%b %d, %Y %I:%M %p} UTC.",
        )
        # Email the contact ourselves only if a real calendar invite was NOT sent
        # (avoid double-emailing), sending is on, we have an address, and the
        # contact isn't suppressed.
        if (
            not invite_sent
            and owner.outbound_enabled
            and contact
            and contact.email
            and not contact.do_not_contact
        ):
            email_provider.send(
                contact.email,
                f"Meeting confirmed — {campaign.product if campaign else ''}",
                confirm,
            )
        self.log(db, owner.id, f"Booked meeting with {company_name}.")
        return meeting


meeting_agent = MeetingAgent()
```

- [ ] **Step 2: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "import app.agents.meeting; print('meeting ok')"
```
Expected: `meeting ok`

- [ ] **Step 3: Commit**

```
git add backend/app/agents/meeting.py
git commit -m "feat(meeting): per-user Meet link, UTC duration/end, double-booking guard, kill-switch-safe invite" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Booking route — optional link + duration + 422

**Files:**
- Modify: `backend/app/api/routers/conversations.py`

- [ ] **Step 1: Make `BookMeetingIn.link` optional + add duration**

In `backend/app/api/routers/conversations.py`, replace:

```python
class BookMeetingIn(BaseModel):
    scheduled_at: datetime
    link: str
    notes: str | None = None
```

with:

```python
class BookMeetingIn(BaseModel):
    scheduled_at: datetime
    link: str | None = None
    notes: str | None = None
    duration_minutes: int | None = None
```

- [ ] **Step 2: Pass the user into `book()` and 422 on no link**

Replace the `book_meeting` route body:

```python
@router.post("/{thread_id}/book-meeting", response_model=ThreadDetailOut)
def book_meeting(
    thread_id: int,
    payload: BookMeetingIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    t = _owned(db, user, thread_id)
    try:
        meeting_agent.book(
            db,
            t,
            user,
            payload.scheduled_at,
            payload.link,
            payload.notes,
            duration_minutes=payload.duration_minutes,
        )
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail="Connect your Google Calendar or paste a meeting link.",
        )
    return get_thread(thread_id, db, user)
```

- [ ] **Step 3: Verify import**

From `backend/`:
```
.\.venv\Scripts\python.exe -c "import app.api.routers.conversations; print('conversations ok')"
```
Expected: `conversations ok`

- [ ] **Step 4: Manual behavior check (no calendar connected)**

Authorized as demo user via `/docs`, on a thread: POST `/api/conversations/{id}/book-meeting` with `{"scheduled_at":"2026-06-20T15:00:00Z"}` (no link). Expected: **422** "Connect your Google Calendar or paste a meeting link." Then with `{"scheduled_at":"2026-06-20T15:00:00Z","link":"https://meet.google.com/abc-defg-hij"}`: Expected: 200, thread stage → `Meeting`, a confirmation message with the link, and a `meetings` row (`.\db.ps1 sql "SELECT company, contact, link, status FROM meetings ORDER BY id DESC LIMIT 1"`). Re-book the same thread → still one Upcoming meeting (updated, not duplicated).

- [ ] **Step 5: Commit**

```
git add backend/app/api/routers/conversations.py
git commit -m "feat(conversations): optional link + duration on book-meeting, 422 when no link/calendar" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — Frontend

### Task 12: Frontend types

**Files:**
- Modify: `web/src/lib/api-types.ts`

- [ ] **Step 1: Add the new fields/values**

In `web/src/lib/api-types.ts`:

Add `"Stalled"` to `ThreadStage`:
```typescript
export type ThreadStage =
  | "Contacted"
  | "Replied"
  | "Negotiating"
  | "Meeting"
  | "Closed"
  | "Stalled";
```

Add `calendar_connected` to `User`:
```typescript
export interface User {
  id: number;
  name: string;
  email: string;
  is_verified: boolean;
  outbound_enabled: boolean;
  calendar_connected: boolean;
  created_at: string;
}
```

Add `do_not_contact` to `Contact`:
```typescript
export interface Contact {
  id: number;
  company_id: number;
  name: string;
  role: string;
  email: string;
  linkedin?: string | null;
  verification: "Verified" | "Risky" | "Invalid" | "Unknown";
  confidence: number;
  approved: boolean | null;
  do_not_contact: boolean;
}
```

- [ ] **Step 2: Commit**

```
git add web/src/lib/api-types.ts
git commit -m "feat(types): calendar_connected, do_not_contact, Stalled stage" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: API client methods

**Files:**
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Make `bookMeeting` link optional + add duration**

In `web/src/lib/api.ts`, replace the `bookMeeting` method:

```typescript
  bookMeeting: (
    threadId: number,
    data: {
      scheduled_at: string;
      link?: string;
      notes?: string;
      duration_minutes?: number;
    }
  ) =>
    request<ThreadDetail>(`/api/conversations/${threadId}/book-meeting`, {
      method: "POST",
      body: data,
    }),
```

- [ ] **Step 2: Add calendar connect/disconnect under `// ---- auth ----`**

After the `setOutbound` method, add:

```typescript
  connectCalendar: () =>
    request<{ url: string }>("/api/auth/google/calendar/connect"),
  disconnectCalendar: () =>
    request<User>("/api/auth/google/calendar/disconnect", { method: "POST" }),
```

- [ ] **Step 3: Verify typecheck (deferred to Task 16's build; quick local check optional)**

`bookMeeting`/`connectCalendar`/`disconnectCalendar` are exercised by the build in Task 16. No standalone command.

- [ ] **Step 4: Commit**

```
git add web/src/lib/api.ts
git commit -m "feat(api): optional book-meeting link/duration + calendar connect/disconnect" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Settings — Connect Google Calendar control

**Files:**
- Modify: `web/src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Render `<CalendarControl />` in the Email tab**

In `web/src/app/(app)/settings/page.tsx`, in the `tab === "Email"` block, add `<CalendarControl />` right after `<OutboundControl />`:

```tsx
          {tab === "Email" && (
            <>
            <OutboundControl />
            <CalendarControl />
            <Card>
```

- [ ] **Step 2: Add the `CalendarControl` component**

After the `OutboundControl` function (before `function Row`), add:

```tsx
function CalendarControl() {
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connected = !!user?.calendar_connected;

  async function connect() {
    setBusy(true);
    setErr(null);
    try {
      const { url } = await api.connectCalendar();
      window.location.href = url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not start Google Calendar connect");
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setErr(null);
    try {
      await api.disconnectCalendar();
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader title="Google Calendar" />
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-ink">
              {connected ? "Calendar connected" : "Calendar not connected"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Connect your Google Calendar so booking a meeting creates a real Google
              Meet link on your own calendar. Without it, you can still book by pasting
              a meeting link.
            </p>
          </div>
          {connected ? (
            <Button variant="ghost" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          ) : (
            <Button onClick={connect} disabled={busy}>
              <Icon.Calendar width={16} height={16} /> Connect
            </Button>
          )}
        </div>
        {err && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>
        )}
      </div>
    </Card>
  );
}
```

(`useAuth`, `api`, `Button`, `Card`, `CardHeader`, `Icon`, `useState` are already imported in this file.)

- [ ] **Step 3: Commit**

```
git add "web/src/app/(app)/settings/page.tsx"
git commit -m "feat(settings): Connect/Disconnect Google Calendar control" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Contacts — Do-not-contact toggle

**Files:**
- Modify: `web/src/app/(app)/contacts/page.tsx`

- [ ] **Step 1: Add the toggle handler**

In `web/src/app/(app)/contacts/page.tsx`, after the `saveEdit` function, add:

```tsx
  async function setDnc(id: number, do_not_contact: boolean) {
    const updated = await api.updateContact(id, { do_not_contact });
    setList((contacts).map((c) => (c.id === id ? updated : c)));
  }
```

- [ ] **Step 2: Show the badge + toggle in the action cluster**

In the action `<div className="flex items-center gap-2">` block, after the existing approved/rejected badges and before the approve button, add the do-not-contact badge; and after the edit button add the toggle:

```tsx
                    <div className="flex items-center gap-2">
                      {c.do_not_contact && <Badge tone="danger">Do not contact</Badge>}
                      {c.approved === true ? (
                        <Badge tone="ok"><Icon.Check width={12} height={12} /> Approved</Badge>
                      ) : c.approved === false ? (
                        <Badge tone="danger">Rejected</Badge>
                      ) : null}
                      <button onClick={() => setApproved(c.id, true)} className="rounded-full bg-ok/10 p-2 text-ok hover:bg-ok/20" title="Approve">
                        <Icon.Check width={16} height={16} />
                      </button>
                      <button onClick={() => setApproved(c.id, false)} className="rounded-full bg-danger/10 p-2 text-danger hover:bg-danger/20" title="Reject">
                        <Icon.X width={16} height={16} />
                      </button>
                      <button onClick={() => { setEditing(c.id); setDraftEmail(c.email); }} className="rounded-full bg-ink/5 p-2 text-ink hover:bg-ink/10" title="Edit contact">
                        <Icon.Settings width={16} height={16} />
                      </button>
                      <button
                        onClick={() => setDnc(c.id, !c.do_not_contact)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                          c.do_not_contact
                            ? "bg-danger/10 text-danger hover:bg-danger/20"
                            : "bg-ink/5 text-ink-500 hover:bg-ink/10"
                        }`}
                        title={c.do_not_contact ? "Allow contact again" : "Mark do-not-contact"}
                      >
                        {c.do_not_contact ? "Allow" : "Do not contact"}
                      </button>
                    </div>
```

- [ ] **Step 3: Commit**

```
git add "web/src/app/(app)/contacts/page.tsx"
git commit -m "feat(contacts): manual do-not-contact toggle" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Conversations — Stalled tone + booking modal (wires `api.bookMeeting`)

**Files:**
- Modify: `web/src/app/(app)/conversations/page.tsx`

- [ ] **Step 1: Import `useAuth`**

Add to the imports at the top of `web/src/app/(app)/conversations/page.tsx`:

```tsx
import { useAuth } from "@/components/AuthProvider";
```

- [ ] **Step 2: Add `Stalled` to `stageTone`**

```tsx
const stageTone: Record<ThreadStage, "neutral" | "info" | "warn" | "ok" | "brand"> = {
  Contacted: "neutral",
  Replied: "info",
  Negotiating: "warn",
  Meeting: "ok",
  Closed: "brand",
  Stalled: "warn",
};
```

- [ ] **Step 3: Add booking state + handler inside `ConversationsPage`**

After the existing `const [busy, setBusy] = useState(false);` line, add:

```tsx
  const { user } = useAuth();
  const [booking, setBooking] = useState(false);
  const [bWhen, setBWhen] = useState("");
  const [bDuration, setBDuration] = useState(30);
  const [bLink, setBLink] = useState("");
  const [bNotes, setBNotes] = useState("");
  const [bErr, setBErr] = useState<string | null>(null);
  const calConnected = !!user?.calendar_connected;
```

After the existing `send()` function, add:

```tsx
  async function book() {
    if (!active || !bWhen) return;
    setBusy(true);
    setBErr(null);
    try {
      // datetime-local is naive local time → convert to a UTC ISO instant.
      const iso = new Date(bWhen).toISOString();
      const updated = await api.bookMeeting(active.id, {
        scheduled_at: iso,
        link: bLink.trim() || undefined,
        notes: bNotes.trim() || undefined,
        duration_minutes: bDuration,
      });
      setActive(updated);
      setBooking(false);
      setBWhen("");
      setBLink("");
      setBNotes("");
      threadsQ.reload();
    } catch (e) {
      setBErr(e instanceof Error ? e.message : "Could not book meeting");
    } finally {
      setBusy(false);
    }
  }
```

- [ ] **Step 4: Add the Book-meeting button to the open-thread header**

Replace the header-right stage badge:

```tsx
                <Badge tone={stageTone[active.stage]}>{active.stage}</Badge>
              </div>
```

with (the first occurrence — inside the `flex items-center justify-between border-b` header):

```tsx
                <div className="flex items-center gap-2">
                  <Button variant="ghost" className="h-8" onClick={() => setBooking(true)}>
                    <Icon.Calendar width={14} height={14} /> Book meeting
                  </Button>
                  <Badge tone={stageTone[active.stage]}>{active.stage}</Badge>
                </div>
              </div>
```

- [ ] **Step 5: Render the modal**

Just before the final closing `</div>` of the component's returned tree (after the main grid `</div>`), add:

```tsx
      {booking && active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => setBooking(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-ink">Book a meeting</h3>
            <p className="mt-0.5 text-xs text-ink-500">
              with {active.contact_name} · {active.company_name}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-500">Date & time</label>
                <input
                  type="datetime-local"
                  value={bWhen}
                  onChange={(e) => setBWhen(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-500">Duration (minutes)</label>
                <input
                  type="number"
                  min={15}
                  step={15}
                  value={bDuration}
                  onChange={(e) => setBDuration(Number(e.target.value))}
                  className="form-input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-500">
                  Meeting link {calConnected ? "(optional)" : ""}
                </label>
                <input
                  value={bLink}
                  onChange={(e) => setBLink(e.target.value)}
                  placeholder={
                    calConnected
                      ? "Leave blank to auto-generate a Google Meet link"
                      : "Paste a Meet/Zoom link"
                  }
                  className="form-input"
                />
                {!calConnected && (
                  <p className="mt-1 text-[11px] text-ink-300">
                    <a href="/settings" className="font-semibold text-info hover:underline">
                      Connect Google Calendar
                    </a>{" "}
                    to auto-generate Meet links.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-ink-500">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={bNotes}
                  onChange={(e) => setBNotes(e.target.value)}
                  className="form-input resize-none"
                />
              </div>
              {bErr && (
                <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{bErr}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setBooking(false)}>Cancel</Button>
              <Button onClick={book} disabled={busy || !bWhen}>
                <Icon.Calendar width={15} height={15} /> Book
              </Button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Typecheck the whole frontend**

From `web/`:
```
npm run build
```
Expected: build succeeds (no TypeScript errors). This is the frontend gate for Tasks 12–16.

- [ ] **Step 7: Commit**

```
git add "web/src/app/(app)/conversations/page.tsx"
git commit -m "feat(conversations): booking modal (wires api.bookMeeting) + Stalled stage tone" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6 — Docs & final smoke

### Task 17: Document env + update CLAUDE.md

**Files:**
- Modify: `backend/.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new env in `backend/.env.example`**

In `backend/.env.example`, in the `--- Google OAuth ---` section, after `GOOGLE_REDIRECT_URI=...` add:

```
# Per-user Google Calendar connection (auto Google Meet links on booking).
# Add this URI to the OAuth client's Authorized redirect URIs, enable the
# Google Calendar API in the project, and note that calendar.events is a
# "sensitive" scope (needs app verification before external production use).
GOOGLE_CALENDAR_REDIRECT_URI=http://127.0.0.1:8000/api/auth/google/calendar/callback
```

And in the `--- Outreach / follow-up automation ---` section, after `FOLLOWUP_INTERVAL_MINUTES=15` add:

```
# How long a thread sits unanswered (our last message) before an auto follow-up.
# Decoupled from the poll cadence above. Max nudges before a thread auto-stalls.
FOLLOWUP_DELAY_DAYS=10
MAX_FOLLOW_UPS=3
# Default generated-meeting length (minutes).
MEETING_DEFAULT_DURATION_MINUTES=30
```

- [ ] **Step 2: Update `CLAUDE.md` Providers note**

In `CLAUDE.md`, under the Providers section (after the `email.py` bullet), add a bullet:

```
- **`calendar.py`** — per-user Google Calendar. When a user connects their calendar
  (Settings → Connect Google Calendar; offline consent for `calendar.events`, refresh
  token stored on `User.google_calendar_token`), booking a meeting creates a real
  Calendar event with a Google Meet link on **their** calendar. With no connection it
  degrades to a user-supplied link (else the booking route 422s). Never fabricates a link.
```

And update the merged guess-verify / pipeline note where the meeting agent is described, adding that the follow-up delay is `FOLLOWUP_DELAY_DAYS` (decoupled from the poll cadence), threads auto-advance to `Stalled` after `MAX_FOLLOW_UPS` unanswered nudges, and `Contact.do_not_contact` suppresses every send path.

- [ ] **Step 3: Final full-stack smoke**

- Backend imports: from `backend/` → `.\.venv\Scripts\python.exe -c "import app.main; print('ok')"` → `ok`.
- Frontend build: from `web/` → `npm run build` → succeeds.
- `GET /health` → 200 with `integrations.google_oauth` present.
- `.\db.ps1 sql "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='google_calendar_token'"` → one row.

- [ ] **Step 4: Commit**

```
git add backend/.env.example CLAUDE.md
git commit -m "docs: document calendar connection + decoupled follow-up cadence + do_not_contact" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## End-to-end verification (maps to spec Definition of Done)

Run after all tasks. With a **real** Google account connected (Calendar API enabled, redirect URI registered) you can verify the live Meet path; without one, verify the graceful-fallback path.

- **DoD #7 (connect):** Settings → Connect Google Calendar → consent → returns to `/settings?calendar=connected`; `GET /api/auth/me` → `calendar_connected: true`; `.\db.ps1 sql "SELECT (google_calendar_token IS NOT NULL) FROM users WHERE email='jordan@apexcloud.com'"` → `t`; the token never appears in any API response. Disconnect → `calendar_connected: false`.
- **DoD #8 (booking UI):** Open a thread → "Book meeting" → modal → submit → thread flips to `Meeting`, confirmation message appears.
- **DoD #9 (auto Meet):** Connected + no link → `meetings.link` starts `https://meet.google.com/`.
- **DoD #10 (fallback/422):** Not connected: with a link → stored; without → 422.
- **DoD #11 (supplied link wins):** Pasted Zoom link stored verbatim.
- **DoD #12 (kill-switch):** Sending OFF → link generated, no invite/email; ON → invite, no duplicate confirmation email.
- **DoD #13 (timezone):** Event start equals the picked local time as a UTC instant; `timeZone:"UTC"`.
- **DoD #14 (duration):** Event `end == start + duration` (default 30).
- **DoD #15 (double-booking):** Re-book a thread → one Upcoming meeting (updated).
- **DoD #16 (approval gate):** `approved=false` contact → no draft, not sent.
- **DoD #17 (10-day delay):** Back-date a thread's last `sent_at` 11 days → tracking nudges; fresh thread → none.
- **DoD #18 (auto-stall):** After `MAX_FOLLOW_UPS` unanswered nudges → `stage="Stalled"`, no further nudges, `Stalled` badge + notification.
- **DoD #19 (suppression):** `do_not_contact=true` → no draft, send 403s, no follow-up, no meeting invite email.

---

## Self-review notes (completed)

- **Spec coverage:** Every [CHANGES] item maps to a task — Calendar OAuth (Tasks 1,7,9 + col Tasks 2–4), Meet generation (Tasks 8,10,11), booking UI (Tasks 12,13,16), Settings connect (Task 14), timezone/duration/double-booking (Tasks 10,16), approval gate + suppression (Tasks 6,15), decoupled cadence + auto-stall (Tasks 1,5), docs (Task 17). [GAP] items (#20–25) are intentionally out of scope (Step 05 / later).
- **Type/signature consistency:** `MeetingAgent.book(db, thread, owner: User, scheduled_at, link=None, notes=None, duration_minutes=None)` is defined in Task 10 and called identically in Task 11. `calendar_provider.create_meet_event(...)`/`available_for(user)` defined in Task 8, used in Task 10. `api.bookMeeting` signature (Task 13) matches its call site (Task 16). `User.calendar_connected` property (Task 2) ↔ `UserOut.calendar_connected` (Task 4) ↔ `User.calendar_connected` TS field (Task 12). `Contact.do_not_contact` flows model→schema→TS→UI consistently.
- **Placeholder scan:** No TBD/TODO; every code step shows full code; every verify step has an exact command + expected output adapted to this repo's no-test-suite reality.
