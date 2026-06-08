# Spec: Reply Detection and Intent Classification

> **Status note:** This is a **new-build** step (unlike the largely as-built Steps 01–04). It adds the
> capability the pipeline is currently missing: actually **reading prospect replies** and **acting on
> what they say**. It splits out of Step 04, which deliberately built only the *no-inbox* half of
> reply automation (the 10-day follow-up cadence, the auto-`Stalled` terminal stage, and the
> `do_not_contact` suppression flag). This step builds the *inbox-dependent* half: **inbound reply
> ingestion**, **AI intent classification**, and the **auto-actions** — most importantly *"not
> interested → remove from further discussion and stop emailing"*. Tags: **[NEW]** (built this step),
> **[REUSE]** (existing infrastructure this leans on), **[GAP]** (deferred).

## Overview

After Step 04, the system can *send* a first email, *nudge* a silent thread after 10 days, *stall* a
thread that never answers, and *book* a meeting — but it is **blind to replies**: a prospect's answer
only enters the system as a hand-typed message or via seed data. This step gives the pipeline eyes and
judgment on the inbound side.

A new **inbound poller** reads the user's connected mailbox, matches each new message to the right
`Thread`/`Contact`, and records it as a `direction="them"` `Message` (de-duplicated by provider
message id). A new **reply-classifier** then runs the message through the AI chain
(`ai.complete_json`) to label intent — **interested**, **meeting-ready**, **not-interested /
unsubscribe**, **question**, **out-of-office**, or **other** — and acts:

- **Not interested / unsubscribe** → set `Contact.do_not_contact = True` and advance the thread to
  the terminal **`Closed`** stage (reason: *Rejected*). The contact is now suppressed from every send
  path (the suppression mechanism built in Step 04), so no further outreach, follow-ups, or invites
  go out — *"removed from further discussion, their mail is stalled."*
- **Interested / meeting-ready** → advance the stage (`Replied` → `Negotiating`), surface it
  prominently (unread + notification), and offer the existing tracking **AI reply suggestion** /
  booking flow. It does **not** auto-reply.
- **Question / out-of-office / other** → record + surface for the human; take **no** destructive
  action (OOO must never trigger opt-out or stall).

The same principles hold: **honesty over completeness** (low-confidence classifications surface to a
human rather than auto-opting-out), **graceful degradation** (no mailbox connected → no ingestion,
and the rest of the app is unaffected), and the **outbound kill-switch** (this step only *reads* and
*classifies*; it never auto-sends).

## Depends on

- **Step 04 (Outreach, Tracking & Meeting)** — **[REUSE]** the `Contact.do_not_contact` suppression
  flag and the fact that every send path honors it; the terminal stage handling (`Stalled`/`Closed`);
  the `tracking` agent (reply suggestions, follow-up loop); the `Thread`/`Message` model and the
  Conversations UI; and the **per-user Google OAuth connection** introduced for Calendar (this step
  adds the `gmail.readonly` scope to the same per-user grant via incremental consent).
- **Step 01 (Google OAuth)** — reused for the mailbox-read grant (or IMAP credentials as a fallback).
- **Providers** — `providers/ai.py` (classification), `providers/email.py` (sending stays gated and
  untouched), `services/events.py` (logs/notifications + WS), `workers/scheduler.py` (a new poll job).

## Routes

**[NEW]**
- `POST /api/conversations/sync` — **logged-in**; "check my inbox for new replies now" — runs the
  inbound poller for the current user on demand (the scheduler runs it automatically). Returns a
  count of newly-ingested + classified messages.
- `GET /api/auth/google/mailbox/connect` + `GET /api/auth/google/mailbox/callback` +
  `POST /api/auth/google/mailbox/disconnect` — **[REUSE pattern]** the per-user Google connect flow
  from Step 04, requesting the `gmail.readonly` scope (or fold into one "Connect Google" grant
  covering both `calendar.events` + `gmail.readonly` via incremental consent so the user connects
  once). `GET /api/auth/me` surfaces `mailbox_connected: bool` (token never serialized). — connect/
  disconnect **logged-in**, callback **public**.
- `PATCH /api/conversations/{id}/stage` (or reuse a thread-update route) — **logged-in**; lets a human
  override/correct a classification (e.g. reopen a wrongly-`Closed` thread, or clear `do_not_contact`).

**[GAP]** A Gmail **push** webhook (`POST /api/conversations/inbound` via Cloud Pub/Sub) for real-time
ingestion instead of polling — optional optimization; polling is the baseline.

## Database changes

**[NEW]**

| Table | Column | Type | Notes |
| --- | --- | --- | --- |
| `messages` | `external_id` | `String(255)`, **nullable**, indexed | Provider message id (Gmail `id` / IMAP UID). De-dupe key so re-polling never double-inserts a reply. |
| `users` | `gmail_read_token` | `Text`, **nullable** | Per-user `gmail.readonly` refresh token. **Sensitive.** *May be merged with `google_calendar_token`* into one combined-scope grant — preferred (one "Connect Google"). |
| `threads` | `provider_thread_id` | `String(255)`, **nullable** | Optional: provider conversation id to match inbound to the thread when subject/participant matching is ambiguous. |

`Contact.do_not_contact` already exists (Step 04). Per CLAUDE.md, add idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for each in `main.py::lifespan`.

## Templates

- **Modify:**
  - `web/src/app/(app)/conversations/page.tsx` — render ingested `them` messages (already supported);
    add a **"Sync inbox"** action (→ `POST /api/conversations/sync`); show an intent badge per thread
    (Interested / Not interested / Meeting-ready / Question / OOO); add a "reopen" / "clear do-not-
    contact" override control for a `Closed`/suppressed thread.
  - `web/src/app/(app)/settings/page.tsx` — **"Connect Gmail (read replies)"** (or the combined
    "Connect Google" if scopes are merged), with connected-state + disconnect, using `mailbox_connected`.
  - `web/src/lib/api.ts` / `api-types.ts` — `syncInbox()`, mailbox connect/disconnect, `User.mailbox_connected`,
    a `Message.intent`/thread classification field if surfaced.

## Files to change

**[NEW] / [CHANGES]**
- `backend/app/agents/tracking.py` **or** a new `backend/app/agents/reply_classifier.py` — the
  classification + action logic. Prefer a **new agent** (`reply_classifier`, registered in
  `AGENT_REGISTRY`) so the 7-agent pipeline gains a clearly-scoped 8th engagement agent rather than
  overloading `tracking`. It consumes newly-ingested `them` messages, calls `ai.complete_json`, and
  applies the action map.
- `backend/app/providers/oauth.py` — add the `gmail.readonly` scope to the connect flow (or a mailbox
  variant), reusing the generalized `exchange_code`.
- `backend/app/api/routers/auth.py` — mailbox connect/callback/disconnect (or extend the calendar grant).
- `backend/app/api/routers/conversations.py` — `POST /sync` and the stage-override route.
- `backend/app/workers/scheduler.py` — a **second job** that runs the inbound poller per user on an
  interval (`INBOUND_POLL_MINUTES`, default e.g. 5); independent of the follow-up cadence.
- `backend/app/models.py` — `Message.external_id`, `User.gmail_read_token`, `Thread.provider_thread_id`.
- `backend/app/schemas.py` — `UserOut.mailbox_connected`; expose intent where surfaced; never the token.
- `backend/app/core/config.py` — `inbound_poll_minutes`, the mailbox redirect URI / scope.
- `backend/app/main.py` — idempotent ALTERs; register the new agent's seed key (and the Step-04-style
  back-fill so existing users get the new `agent_configs` row).
- `backend/.env.example` — Gmail API enablement + `gmail.readonly` scope + the poll interval.
- `CLAUDE.md` — document the new agent and the inbound poller; bump the pipeline count if a new agent is added.

## Files to create

- `backend/app/providers/inbound.py` — `InboundMailProvider` (per-user): `available_for(user)`;
  `fetch_new_messages(user, since) -> list[InboundMessage]` via the **Gmail API read** (reusing
  `google-api-python-client`) with an **IMAP fallback** (`imaplib`, stdlib) when IMAP creds are
  configured instead. Returns normalized `{external_id, from_email, subject, body, sent_at,
  in_reply_to/thread hints}`; returns `[]` and never raises on any error (graceful degrade).
- (If chosen) `backend/app/agents/reply_classifier.py` — the new agent (above).

## New dependencies

**No new dependencies.** Gmail read reuses `google-api-python-client` (present); IMAP uses stdlib
`imaplib`; classification uses the existing `ai.complete*` chain (`httpx`). New config only.

## Rules for implementation

- **Read-only and kill-switch-safe.** This step **ingests and classifies**; it must **never
  auto-send** a reply. Drafting a suggested reply is fine (existing `suggestion_for`), but sending
  stays the human's explicit action and stays gated by `outbound_enabled`.
- **Opt-out is decisive and sticky; everything else is conservative.** Only a **high-confidence**
  *not-interested/unsubscribe* sets `do_not_contact=True` + `Closed`. Low confidence, questions, and
  **out-of-office must never** opt-out or stall — surface them for a human. A wrongly-closed thread
  must be reopenable (clears `do_not_contact`).
- **Honor and reuse Step 04's suppression.** Setting `do_not_contact` is the entire "stall their mail"
  action — do not add a parallel mechanism; rely on the send paths already checking the flag.
- **Idempotent ingestion.** De-dupe by `external_id`; re-polling the same mailbox must never create
  duplicate `them` messages or re-fire actions. Match a reply to its thread by provider thread id,
  else by participant email + subject; if no thread matches, attach to the contact's most recent
  thread or log "unmatched reply" rather than guessing.
- **Per-user mailbox access.** Like the calendar token, the read token is per-user, server-side only,
  least scope (`gmail.readonly`), never serialized/logged, cleared on disconnect.
- **Agents never fabricate.** No mailbox connected (or AI absent) → no ingestion / no classification;
  the rest of the app is unaffected. Never invent a reply or an intent.
- **Use `self.log()` / `add_notification()` / `self.mark()`**; the new agent runs through `_phase()`/
  `mark()` like the others. **No Alembic** — idempotent ALTERs in `lifespan`. **Google client is the
  only SDK exception.** **Next.js 16** + `@theme` tokens on any UI.

## Definition of done

Verifiable by running the stack + `.\db.ps1` (backend tooling via `.\.venv\Scripts\python.exe`).

**[NEW] — verify this step:**

1. **Mailbox connect (per-user).** Settings → Connect Gmail runs OAuth for `gmail.readonly`;
   `GET /api/auth/me` then returns `mailbox_connected: true`; the token is stored server-side and
   **never** appears in any response. Disconnect clears it.
2. **Inbound ingestion + dedupe.** With a connected test mailbox, sending a real reply to an outbound
   thread and then `POST /api/conversations/sync` (or waiting for the poll) creates exactly **one**
   `direction="them"` `Message` on the correct thread with a populated `external_id`; a second sync
   creates **no** duplicate.
3. **"Not interested" → removed & stalled.** A reply classified *not-interested* sets
   `Contact.do_not_contact=true` and `thread.stage="Closed"`; thereafter the contact receives **no**
   outreach draft, **no** follow-up, **no** send, and **no** meeting invite (verify in `.\db.ps1` and
   by running `run-agent key=tracking`/`outreach`).
4. **Interested / meeting-ready → surfaced, not auto-sent.** Such a reply advances the stage
   (`Replied`/`Negotiating`), marks the thread unread + notifies, and shows the AI reply suggestion —
   but **nothing is emailed** automatically.
5. **OOO / ambiguous → safe.** An out-of-office or low-confidence reply is recorded and surfaced but
   does **not** opt-out, stall, or close the thread.
6. **Human override.** A user can reopen a wrongly-`Closed` thread / clear `do_not_contact`, after
   which normal cadence resumes.
7. **Graceful degradation.** With no mailbox connected (and/or no AI key), nothing ingests or
   classifies, no errors surface, and Steps 01–04 behave exactly as before.

**[GAP] — explicitly NOT done (tracked follow-ups):**

8. **No real-time push.** Ingestion is poll-based; a Gmail Pub/Sub push webhook is a later optimization.
9. **No multi-language / nuanced sentiment / attachment parsing** beyond what the single AI
   classification call returns; no negotiation-state modeling beyond the coarse stage advance.
10. **No non-Google provider matrix** beyond Gmail-read + IMAP fallback (no Outlook/Graph integration).
