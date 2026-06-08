# Spec: Outreach and Meeting

> **Status note:** This step covers the **engagement phase** of the pipeline — stages **5–7**:
> **Outreach** (`outreach`), **Tracking & Follow-up** (`tracking`), and **Meeting Coordination** (`meeting`). Per the scoping decision, **tracking (stage 6) is included** because it is the bridge that carries a thread from *Contacted* toward *meeting-ready*; the outreach↔meeting loop is incomplete without it. Like Steps 01–03, **all three agents already exist and work**, so much of this spec is an as-built record. The **changes this step implements** are:
> (1) the headline missing piece from the CLAUDE.md vision — *"Fix meeting if they are ready → Send a Google Meet link"* — built as a **per-user Google Calendar integration** (each user connects their own calendar via incremental OAuth; booking creates a real Calendar event + Meet link on *their* calendar) plus **wiring the Conversations booking UI** (the `book-meeting` endpoint and `api.bookMeeting` already exist but **no page calls them**);
> (2) **booking hardening** — timezone-correct scheduling, meeting duration/end, a double-booking guard, an outreach approval gate, and secret-safe token handling;
> (3) **reply-cadence & auto-stall** — a configurable **10-day follow-up delay** (decoupled from the scheduler's poll frequency), an automatic **`Stalled`** terminal thread stage after unanswered follow-ups, and a **`do_not_contact`** suppression flag every send path honors.
> Detecting *why* a prospect went quiet — reading their reply and classifying "not interested" — needs inbound email ingestion and is specified separately as **Step 05 (Reply Detection & Intent Classification)**. Items are tagged **[AS-BUILT]** (exists — verify, don't rebuild), **[CHANGES]** (code this step modifies/adds), or **[GAP]** (tracked follow-up).

## Overview

Outreach, Tracking, and Meeting are the last three stages of the 7-agent pipeline — the part that
turns a vetted, contactable shortlist (Steps 02–03) into booked sales conversations:

- **Outreach Generation** (stage 5, `outreach`) writes a personalized cold-email **draft** (subject + body) per contact from the company research, the contact's role, and the campaign's product/value-prop/tone/personalization settings, via the failover AI chain (`ai.complete_json`) with a deterministic template fallback. It only **drafts** — it never sends. Drafts are stored as `EmailDraft(state="Queued")`, gated on the contact having an address. The human reviews/edits/regenerates/test-sends each draft on the **Email Review** page and clicks **Approve & send**, the only action that creates a `Thread` and performs real delivery.

- **Email Tracking & Follow-up** (stage 6, `tracking`) is the engagement engine between first-touch and a booked meeting. It (a) generates a contextual **AI reply suggestion** when the lead has replied (`suggestion_for`, surfaced in Conversations), and (b) sends **automatic follow-up nudges** for stale, unanswered outbound threads (`run`). After this step, a nudge fires once a thread has had **no reply for `FOLLOWUP_DELAY_DAYS` (default 10 days)** — a delay that is now **independent of how often the scheduler polls**; the nudge count is capped (`MAX_FOLLOW_UPS`, default 3); and a thread still unanswered after the final nudge is auto-advanced to the terminal **`Stalled`** stage so it stops receiving outreach. Contacts flagged **`do_not_contact`** are skipped by every send path. All of this honors the outbound kill-switch.

- **Meeting Coordination** (stage 7, `meeting`) books the meeting once a lead is ready: it generates a Google Meet link **on the booking user's own connected calendar**, creates a `Meeting` row, posts a confirmation message into the thread, advances the thread to `Meeting`, notifies the user in-app, and (when sending is enabled) invites/emails the contact. It is the only agent **excluded from `RUNNABLE_KEYS`** — it fires solely when the user books a meeting in Conversations.

Governing principles are unchanged: **honesty over completeness** (never fabricate — and specifically never mint a fake `meet.google.com` code: a Meet link is a real Calendar-created one or a user-supplied link) and **graceful degradation** (every send path, the Meet generation, and the
cadence/stall logic must work, or degrade cleanly, when no calendar is connected and when the `outbound_enabled` kill-switch is off).

## Depends on

- **Step 01 (Registration & Google OAuth)** — agents are per-user scoped (`mark()`, per-user logs/notifications). The **`User.outbound_enabled` kill-switch** (default `False`) gates every prospect-facing send. The calendar feature **extends the existing Google OAuth** (`providers/oauth.py`, `api/routers/auth.py::/google/start|/callback`): it reuses  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` and the authorization-code mechanics, adding an **incremental, offline-access consent for the `calendar.events` scope**. The Google Cloud project must have the **Calendar API enabled** and the calendar redirect URI registered.
- **Step 02 (Enrichment & Scoring)** — the outreach prompt uses `company.research_summary`/`industry`; only `Qualified` companies feed drafting.
- **Step 03 (Contact Discovery & Verification)** — outreach drafts only for contacts with a non-empty `email`; with no `ZEROBOUNCE_API_KEY`, contacts stay blank and outreach drafts nothing.
- **Providers**: `providers/ai.py`, `providers/email.py`, `providers/oauth.py`, `services/events.py` (logs/notifications + WebSocket), `workers/scheduler.py` (tracking poll), `core/security.py` (JWTs — reused to sign the OAuth `state` binding the calendar callback to the logged-in user).

## Routes

**[AS-BUILT]** — the engagement stages are driven through these existing endpoints:

*Outreach drafting & review (`backend/app/api/routers/emails.py`):* `GET /api/emails?campaign_id=`,
`PATCH /api/emails/{id}`, `POST /api/emails/{id}/regenerate`, `POST /api/emails/{id}/test` (to self —
kill-switch exempt). — **logged-in**

*Pipeline triggers (`backend/app/api/routers/campaigns.py`):* `POST /api/campaigns/{id}/run` (Phase 6
drafts outreach), `POST /api/campaigns/{id}/run-agent` (`key ∈ {outreach, tracking}`; `meeting`
rejected), `GET /api/campaigns/{id}/pipeline` (`meeting.runnable == False`). — **logged-in**

*Conversations & sending (`backend/app/api/routers/conversations.py`):* `GET /api/conversations`,
`GET /api/conversations/{id}`, `POST /api/conversations/{id}/reply`, `POST /api/conversations/send`
(**403 if `outbound_enabled` off**), `POST /api/conversations/{id}/book-meeting`. — **logged-in**

*Meetings (`backend/app/api/routers/meetings.py`):* `GET /api/meetings?status=`,
`PATCH /api/meetings/{id}`. — **logged-in**

**[CHANGES]** — modified/added this step:

- `POST /api/conversations/{id}/book-meeting` — `BookMeetingIn.link` becomes **optional**
  (`str | None = None`) + optional `duration_minutes`. No link + connected calendar →
  **auto-generate a Meet link on the user's calendar**; no link + no calendar → **422** ("Connect
  your Google Calendar or paste a meeting link"). A supplied link is always honored. `scheduled_at`
  arrives as a tz-aware UTC instant (see Rules → Timezone). — **logged-in**
- `GET /api/auth/google/calendar/connect` — **logged-in (bearer)**; returns the Google consent URL
  (offline, `prompt=consent`, scope `…/auth/calendar.events`, `redirect_uri =
  google_calendar_redirect_uri`) with a **signed `state` embedding the user id** (short-lived JWT via
  `core/security.py`). The SPA navigates the browser to it. 404 when `oauth_provider.available` is false.
- `GET /api/auth/google/calendar/callback` — **public** (Google redirect); verifies the signed `state`
  (HMAC-signed, short-lived, user-bound — the signature is the CSRF protection, no cookie), exchanges
  the code with the **calendar** redirect URI, stores the **refresh token**
  on `User.google_calendar_token`, redirects to Settings. Never logs the code/token.
- `POST /api/auth/google/calendar/disconnect` — **logged-in**; clears `User.google_calendar_token`.
- `GET /api/auth/me` (`UserOut`) — adds computed **`calendar_connected: bool`**; the token is never serialized.
- **No new route for suppression/stall** — `do_not_contact` is enforced *inside* the existing send
  paths (`/conversations/send`, the outreach drafting phase, the tracking follow-up loop, the meeting
  invite), and the `Stalled` transition happens inside the tracking agent. A manual
  `PATCH /api/contacts/{id}` (Step 03) can set `do_not_contact` once exposed (see Templates).

**[GAP]** routes (now scoped to **Step 05** or later): `POST /api/conversations/sync` / a Gmail push
webhook for **inbound reply ingestion**, and `POST /api/meetings/{id}/cancel|reschedule` (Calendar
sync), and a reminders trigger (the 24h/1h reminders the Meetings UI advertises).

## Database changes

**[CHANGES] — two required new columns.** Verified against `backend/app/models.py` and `.\db.ps1`:

| Table | Column | Type | Notes |
| --- | --- | --- | --- |
| `users` | `google_calendar_token` | `Text`, **nullable** | Per-user Google refresh token for `calendar.events`. **Sensitive — never in `UserOut`/logs/WS.** Presence ⇒ `calendar_connected`. |
| `contacts` | `do_not_contact` | `Boolean`, default `false` | Suppression flag honored by **every** send path. Set by Step 05's "not interested" classification or manually in Contacts. (Auto-stall on no-reply sets the thread's `Stalled` stage, **not** this flag — silence ≠ permanent opt-out.) |

Per CLAUDE.md (no Alembic) add to `main.py::lifespan`:
`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_token TEXT` and
`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN NOT NULL DEFAULT false`.

**The new `Stalled` thread state needs no schema change** — `threads.stage` is a free `String(20)`;
`Stalled` is just a new allowed value (add it to the frontend `ThreadStage` union + tone map).

**[CHANGES] — optional (recommended) columns:** `meetings.event_id VARCHAR(200) NULL` (Calendar
event id for future cancel/reschedule), `meetings.duration_minutes INTEGER NULL` (only if persisting
duration rather than computing the end), `campaigns.followup_delay_days INTEGER NULL` (per-campaign
override of the global 10-day delay). None required for the build.

**[GAP]** Columns later steps want: `messages.external_id` (dedupe ingested replies — **Step 05**),
`meetings.reminder_*_at`, a widened `email_drafts.state` lifecycle (`Delivered`/`Failed`).

## Templates

This is a Next.js + FastAPI app — "templates" maps to React route pages. All surfaces exist.

- **Create:** None required. (Optionally extract the booking modal into
  `web/src/app/(app)/conversations/BookMeetingDialog.tsx`; inlining matches current style.)
- **Modify:**
  - **[CHANGES]** `web/src/app/(app)/conversations/page.tsx` — **add the booking UI** (Book-meeting
    button → modal: `datetime-local`, duration, notes, optional link whose helper adapts to
    `user.calendar_connected`); **add the `Stalled` tone** to `stageTone`; on book success refresh the
    thread. Wires the existing, currently-uncalled `api.bookMeeting`.
  - **[CHANGES]** `web/src/app/(app)/settings/page.tsx` — **"Connect Google Calendar"** control
    (connected-state + **Disconnect**), using `user.calendar_connected`.
  - **[CHANGES]** `web/src/app/(app)/contacts/page.tsx` — surface/allow a **"Do not contact"** toggle
    (manual opt-out) via `PATCH /api/contacts/{id}` (the approve/reject UI from Step 03 lives here).
  - **[AS-BUILT]** `web/src/app/(app)/email-review/page.tsx` — Email Draft Review & Editor. Verify.
  - **[AS-BUILT]** `web/src/app/(app)/meetings/page.tsx` — meetings dashboard. **Reminders card copy
    is aspirational** (nothing sends them); leave/soften — real reminders are a [GAP].

## Files to change

For the as-built record: **none**.

**[CHANGES] — per-user Calendar / Meet build + booking UI:**

*Backend (Google Calendar connection):*
- `backend/app/providers/oauth.py` — add `calendar_authorization_url(state)` (calendar scope, offline,
  `prompt=consent`, `redirect_uri=settings.google_calendar_redirect_uri`); generalize
  `exchange_code(code, redirect_uri=None)`.
- `backend/app/api/routers/auth.py` — the three calendar routes (connect/callback/disconnect), reusing
  the `/google/callback` CSRF-state pattern + a signed-JWT state carrying the user id; persist the
  refresh token to `user.google_calendar_token`.
- `backend/app/models.py` — `User.google_calendar_token` (Text, nullable).
- `backend/app/schemas.py` — `UserOut.calendar_connected: bool` (computed; token excluded);
  `BookMeetingIn` (in `conversations.py`) `link` optional + `duration_minutes`.
- `backend/app/core/config.py` — `google_calendar_redirect_uri`, `meeting_default_duration_minutes:
  int = 30`.
- `backend/app/main.py` — idempotent ALTERs (above); `/health` keeps `google_oauth` as the capability flag.
- `backend/.env.example` (+ `.env`) — document Calendar API enablement, the calendar redirect URI, the
  `calendar.events` scope, and the **sensitive-scope** verification note.
- `CLAUDE.md` — note per-user Google Calendar connection + Meet generation.

*Backend (meeting generation):*
- `backend/app/agents/meeting.py` — `book()` accepts the owner `User` + optional `link`/`duration`;
  auto-creates a Meet event on the owner's calendar when no link + connected; UTC start/end with
  `timeZone="UTC"`; attendee + `sendUpdates="all"` only when `outbound_enabled`, else
  `sendUpdates="none"`; **double-booking guard** (update the thread's existing `Upcoming` meeting
  instead of duplicating); skip the redundant confirmation email when a real invite was sent; fall
  back to a supplied link; raise → route 422 when neither link nor calendar.
- `backend/app/api/routers/conversations.py` — pass `user` into `book()`; 422 logic.

*Backend (outreach approval gate — gap #6):*
- `backend/app/agents/orchestrator.py` — draft only when `(contact.email or "").strip()` **and**
  `contact.approved is not False` **and** `not contact.do_not_contact`.

**[CHANGES] — reply cadence & auto-stall (this step's no-inbox reply rules):**
- `backend/app/core/config.py` — add `followup_delay_days: int = 10` (no-reply threshold before a
  nudge) and `max_follow_ups: int = 3`; **redefine `followup_interval_minutes` as the scheduler
  *poll cadence only*** (how often we wake to check), no longer the nudge delay.
- `backend/app/agents/tracking.py` — `run()`: change the staleness cutoff from
  `timedelta(minutes=followup_interval_minutes)` to `timedelta(days=<per-campaign or global
  followup_delay_days>)`; use `max_follow_ups`; **skip threads whose contact is `do_not_contact`**;
  when a thread has hit the follow-up cap and is *still* unanswered past the delay, set
  `thread.stage="Stalled"` (+ a log/notification "No reply after N follow-ups — stalled") and send
  nothing further. The follow-up loop already ignores non-`Contacted` threads, so `Stalled` naturally
  drops out.
- `backend/app/agents/meeting.py`, `backend/app/api/routers/conversations.py::send_from_draft`,
  `backend/app/agents/orchestrator.py` — **honor `do_not_contact`** in the meeting invite, the real
  send, and outreach drafting (skip / 4xx).
- `backend/app/workers/scheduler.py` — poll cadence stays `followup_interval_minutes`; each run nudges
  threads idle > `followup_delay_days`. (Decoupled — no code change beyond the comment if the cutoff
  moves into the agent, which it should.)
- `backend/app/models.py` — `Contact.do_not_contact` (Boolean, default False).
- `backend/app/schemas.py` — `ContactOut.do_not_contact: bool`; `ContactUpdate.do_not_contact: bool |
  None` (manual toggle); the `Stalled` value is just a new `ThreadStage` string client-side.

*Frontend:*
- `web/src/app/(app)/conversations/page.tsx` — booking modal + `Stalled` tone (above).
- `web/src/app/(app)/settings/page.tsx` — Connect/Disconnect Calendar.
- `web/src/app/(app)/contacts/page.tsx` — "Do not contact" toggle.
- `web/src/lib/api.ts` — `bookMeeting` `link?` optional + `duration_minutes?`; add `connectCalendar()`
  / `disconnectCalendar()`; `updateContact` already supports the new field.
- `web/src/lib/api-types.ts` — `User.calendar_connected: boolean`; `Contact.do_not_contact: boolean`;
  `ThreadStage` gains `"Stalled"`.

**[GAP] follow-ups only (→ Step 05 / later):** inbound reply ingestion + intent classification in a
new agent; meeting-reminders scheduler job; cancel/reschedule Calendar sync.

## Files to create

- **[CHANGES]** `backend/app/providers/calendar.py` — a **per-user** `GoogleCalendarProvider`
  (`calendar_provider`): `available_for(user)` → `bool(user.google_calendar_token)`;
  `create_meet_event(user, summary, description, start, end, attendee_email=None, send_invite=False)`
  → reconstruct `google.oauth2.credentials.Credentials` from the user's refresh token + app
  client id/secret (auto-refresh), `build("calendar","v3", ...)`,
  `events().insert(calendarId="primary", conferenceDataVersion=1, sendUpdates=..., body=...)` with a
  `conferenceData.createRequest` (`hangoutsMeet`, unique `requestId`). Returns `{"link", "event_id",
  "html_link"}` or **`None` on any failure** (never raises, never logs the token). Reuses
  `google-api-python-client` (already installed, used by `email.py`).

## New dependencies

**No new dependencies.** Drafting/suggestions use `ai.complete*` (`httpx`); sending uses
`email_provider`; the OAuth exchange reuses `oauth.py`'s `httpx`; Meet creation reuses
`google-api-python-client` + `google-auth` (already present); the signed state reuses
`core/security.py`. New config only: `GOOGLE_CALENDAR_REDIRECT_URI`, `FOLLOWUP_DELAY_DAYS`,
`MAX_FOLLOW_UPS` (+ the existing client id/secret and the Calendar API enabled).

## Rules for implementation

Follow this codebase's conventions, **not** generic defaults:

- **The outbound kill-switch is sacred.** `outbound_enabled` defaults `False`; no prospect-facing
  email/invite leaves while off (send 403s, follow-ups early-return, meeting email gated — keep all).
  The Meet link **may** be generated while paused (a URL is not a send) but the Calendar event must use
  `sendUpdates="none"`/no attendee email. **Exempt:** signup OTP, `POST /api/emails/{id}/test`.
- **Calendar access is strictly per-user.** Never a global token; events use the **booking user's**
  credentials so the meeting lands on **their** calendar. `oauth_provider.available` only gates whether
  *connect* is offered.
- **Agents never fabricate — including Meet links.** Real `hangoutLink`, user-supplied link, or 422.
- **Timezone correctness.** `scheduled_at` is stored/used as **tz-aware UTC**; the frontend converts
  the naive `datetime-local` via `new Date(value).toISOString()` before POST; Calendar `start`/`end`
  carry an explicit `timeZone` (`"UTC"`). Never create a naive-time event.
- **Duration/end.** `end = start + duration`, default `meeting_default_duration_minutes` (30).
- **One active meeting per thread.** Re-booking updates the existing `Upcoming` meeting, never duplicates.
- **Secret-safe tokens.** The refresh token is server-side only (never in `UserOut`/logs/notifications/
  WS), cleared on disconnect, least scope (`calendar.events`); connect `state` is a short-lived signed
  JWT whose HMAC signature is itself the CSRF protection (no cookie — the SPA fetches the consent URL
  with its bearer token, so a cross-origin Set-Cookie wouldn't persist anyway).
- **`do_not_contact` is honored everywhere.** Outreach drafting, the real send, auto follow-ups, and
  the meeting invite **must** skip a contact flagged `do_not_contact`. The flag is the durable
  "stall their mail" mechanism; it composes with the kill-switch (both must pass to send).
- **Cadence is decoupled.** `followup_interval_minutes` = how often the scheduler polls;
  `followup_delay_days` (default 10, per-campaign override allowed) = how long a thread must be
  unanswered before a nudge. Never conflate them again. Keep the follow-up cap (`max_follow_ups`).
- **Auto-stall is terminal, not destructive.** A thread unanswered after the final nudge → `stage =
  "Stalled"` and no further outreach in that thread; it is **not** deleted and the contact is **not**
  globally opted-out by mere silence (set `do_not_contact` only on explicit opt-out / "not interested"
  in Step 05, or manual). Preserve user-set states.
- **Outreach only drafts; sending is explicit.** Only `POST /api/conversations/send` sends. Drafting
  gated on `email` + `approved is not False` + `not do_not_contact`. `force=True` discards & redrafts.
- **`meeting` stays out of `RUNNABLE_KEYS`.** Fires only from `book-meeting`; `runnable=False`.
- **Use `self.log()` / `add_notification()` / `self.mark()`**, never raw rows. `_phase()` drives status.
- **SDK exception is the Google client only**; everything else REST over `httpx`. No new package.
- **No Alembic** — every new column needs an idempotent `ALTER ... ADD COLUMN IF NOT EXISTS` in `lifespan`.
- **Frontend is Next.js 16** — read `web/node_modules/next/dist/docs/` before routing/server-component
  changes. Tailwind v4 `@theme` tokens + existing primitives, **no hardcoded hex**; native
  `datetime-local` for `scheduled_at`.

## Definition of done

Verifiable by running the stack (`docker compose up -d`, uvicorn :8000, `npm run dev` :3000) +
`.\db.ps1`. Run backend tooling via the venv directly (`.\.venv\Scripts\python.exe ...`) per CLAUDE.md.

**[AS-BUILT] — regression checklist:**

1. **Outreach drafts only for addressable contacts.** After Run-all (or `run-agent key=outreach`),
   `email_drafts` rows (`state=Queued`) exist for top-N contacts **with** an `email`, none for blanks;
   no AI key → fallback body, AI key → personalized.
2. **Email Review works.** List/edit/AI-regenerate/Send-test (to self, kill-switch exempt); Approve &
   send disabled while sending off (paused banner).
3. **Real send is gated + creates a thread.** Sending off → `POST /api/conversations/send` 403; on →
   creates `Thread(stage=Contacted)` + first `Message`, `draft.state→Sent`, `company.status→Contacted`.
4. **Tracking suggests + follows up.** `them`-last thread shows an AI suggestion (Use). Sending off →
   `run()` returns 0.
5. **Manual reply works.** `/reply` appends a `us` message + bumps `last_activity`.
6. **Meetings dashboard.** Correct status badges, Join opens `m.link`, Mark-done PATCHes Completed;
   `@theme` tokens, no hex.

**[CHANGES] — verify this step:**

7. **Connect Google Calendar (per-user).** Settings → Connect runs OAuth (offline + `calendar.events`);
   after consent `GET /api/auth/me` returns `calendar_connected: true` and `.\db.ps1` shows
   `users.google_calendar_token` populated — and it **never** appears in any API response. Disconnect
   clears it. `oauth_provider.available` false → routes 404, button hidden.
8. **Booking UI wired.** An open thread has a Book-meeting modal; submit calls `book-meeting`; the
   thread flips to `Meeting` and shows the confirmation + link without manual refresh. (Confirm a page
   now calls `api.bookMeeting`.)
9. **Auto Meet on the user's calendar.** Connected user + no link → real event on **their** calendar,
   `meetings.link` = `https://meet.google.com/...` (and `event_id` if added).
10. **Graceful fallback / 422.** Not connected: with a link → stored; without a link → clear **422**,
    no meeting created.
11. **Supplied link always wins.** An explicit link (e.g. Zoom) is stored verbatim regardless of calendar.
12. **Meet respects the kill-switch.** Sending off → link generated, **no** prospect invite/email
    (`sendUpdates="none"`, confirmation email skipped). On → prospect invited, **no** duplicate confirmation.
13. **Timezone-correct.** A meeting booked for a local time yields a Calendar event at the same
    wall-clock time (UTC instant matches; `timeZone:"UTC"`); `scheduled_at` stored tz-aware.
14. **Duration/end.** Event `end == start + duration` (default 30; honored when supplied).
15. **Double-booking guard.** Re-booking a thread with an `Upcoming` meeting **updates** it (one
    Upcoming, one confirmation), not a second.
16. **Outreach approval gate.** A contact set `approved=false` gets **no** new draft and is **not** sent.
17. **10-day follow-up delay, decoupled.** With `FOLLOWUP_DELAY_DAYS=10`, a `Contacted` thread with our
    last message **older than 10 days** and no reply gets exactly one nudge per run up to the cap; a
    thread idle only a few minutes/hours gets **none** (proving the old 15-min behavior is gone and the
    poll frequency is independent). Verifiable by back-dating a thread's last `sent_at` in `.\db.ps1`
    (or temporarily lowering the setting) and running `run-agent key=tracking`.
18. **Auto-stall after unanswered follow-ups.** A thread that reaches `MAX_FOLLOW_UPS` nudges with
    still no reply is advanced to `stage="Stalled"`, receives **no further** follow-ups, shows the
    `Stalled` badge in Conversations, and logs/notifies "stalled".
19. **`do_not_contact` suppression honored everywhere.** A contact flagged `do_not_contact=true`
    (manually in Contacts, or via Step 05 later) gets **no** outreach draft, **cannot** be sent
    (`/conversations/send` skips/4xx), receives **no** auto follow-up, and gets **no** meeting invite
    email — verifiable in `.\db.ps1` (no new drafts/messages) and the UI.

**[GAP] — explicitly NOT done (tracked follow-ups):**

20. **No inbound reply ingestion → Step 05.** The system still can't *read* prospect replies
    (`direction="them"` only from seed); there is no IMAP/Gmail-read poll or webhook.
21. **No intent classification / "not interested" auto-opt-out → Step 05.** Nothing reads a reply to
    decide *interested vs not-interested* and set `do_not_contact`/advance the stage; the
    `do_not_contact` flag + `Stalled` stage built here are the infrastructure Step 05 will drive.
22. **No AI meeting scheduling / free-busy.** `scheduled_at` is user-chosen; no slot proposal.
23. **No meeting reminders.** The 24h/1h reminders the Meetings UI advertises are not sent.
24. **No cancel/reschedule Calendar sync.** `PATCH /api/meetings/{id}` updates `status`/`notes` only.
25. **No outbound delivery tracking.** `EmailDraft.state` only goes `Queued`→`Sent`; `Delivered`/`Failed` never set.
