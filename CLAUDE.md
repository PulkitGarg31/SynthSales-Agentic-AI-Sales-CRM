# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Agentic CRM" (internal name **Reachly**) is an AI-powered B2B outreach platform: User(Company's representative) upload a CSV of potential customer's companies,and details of their product and customer requirements then an 8-agent pipeline will researches → scores → finds contacts → guesses & verifies emails of Sales decision makers →
drafts personalized outreach → tracks replies till they are ready for a meetings or reject the deal -> Fix meeting if they are ready -> Send a Google Meet link -> reads inbound replies & classifies intent. 
Two independent apps in one repo:

- `backend/` — FastAPI + PostgreSQL (SQLAlchemy 2.0). Internal name "Reachly API".
- `web/` — Next.js 16 + React 19 + Tailwind v4 (App Router). Talks to the backend over REST + WebSocket.

**`README.md` is a running context log** — it is updated after each substantial task with what changed and why; keep that
convention when you finish meaningful work.

## Running the stack

Two terminals. **Postgres runs on host port 5433** (not 5432 — a local Postgres already owns 5432).

```powershell
# Backend (terminal 1)
cd "C:\My Work\Agentic CRM\backend"
docker compose up -d                                          # Postgres 16, container "reachly_postgres"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
#   API http://127.0.0.1:8000 · Swagger /docs · /health shows which integrations are live

# Frontend (terminal 2)
cd "C:\My Work\Agentic CRM\web"
npm run dev        # http://localhost:3000
npm run build      # production build — this is also the typecheck gate
npm run lint       # eslint (flat config)
```

Demo login (seeded automatically, idempotent): **jordan@apexcloud.com / password123**.

The backend **boots with zero credentials** — every external integration degrades gracefully (see
Providers below). `web/.env.local` sets `NEXT_PUBLIC_API_URL` (defaults to `http://127.0.0.1:8000`).
To enable real integrations, copy `backend/.env.example` → `backend/.env` and fill keys.

### Verification / testing

There is **no automated test suite** (no pytest, no jest). The de-facto verification loop is:
- Frontend: `npm run build` must pass (it typechecks every route).
- Backend: hit `GET /health` to confirm integration wiring, then smoke-test live endpoints via `/docs`.
- DB inspection: **`.\db.ps1`** (repo root) is a read-only Postgres browser — `.\db.ps1` for the menu,
  `.\db.ps1 user <id|email>` for a per-user tree, `.\db.ps1 health` for row counts, `.\db.ps1 sql "<SELECT>"`
  for ad-hoc queries. Use it to confirm what the pipeline actually wrote.

## Architecture

### The agent pipeline (the heart of the system)

`backend/app/agents/` holds 8 agents registered in `base.py::AGENT_REGISTRY` (order matters):
**enrichment → scoring → employee_finder → email_guess_verification → outreach → tracking → meeting → reply_classifier**.

`agents/orchestrator.py` is the only place that sequences them. Two entry points:
- `run_campaign_pipeline()` — the full Phase 1–6 run a "Run all agents" click triggers. Also clears the data but before clearing store that in a cache for 24 hours. Ask for confirmation before running this with a clear warning message.
- `run_agent_for_campaign(..., key, force)` — runs one stage on demand (the per-agent Re-run buttons). Simply clears the results of upcoming agents(exception is outreach and meeting)
  `RUNNABLE_KEYS` excludes `meeting` (it only fires when a user books a meeting in Conversations).

Non-obvious orchestration rules you must respect when editing agents:
- **`email_guess_verification` is one merged agent** — it guesses likely addresses then verifies them
  in a single pass (`guess_emails()` runs inside `verification_agent.run()`). It stores a confirmed
  `Verified` address, or — on a **catch-all** server that can't confirm a specific mailbox — the top
  guess marked `Risky` (one credit per catch-all domain, not one per pattern, via `verifier.classify`
  + a per-domain short-circuit); `email_guess`/`verification` are no longer separate keys.
- **`_walk_for_contactable()`** is the contact-finding fallback the user explicitly asked for: walk
  ranked companies, run the employee finder, and if a Qualified company yields *no real LinkedIn
  contacts*, demote it `Qualified → Reviewed` and promote the next-best company into the top-N slot.
  Quota = `campaign.top_n`.
- **`force=True`** means "discard prior output and redo": it wipes stale contacts/drafts/verdicts so a
  re-run produces a clean picture instead of a stale+new mix. The full pipeline passes `force=True` to
  the finder/guess-verify/outreach phases; bulk incremental runs default to `False`.
- Agents never fabricate. The employee finder returns **real** `site:linkedin.com/in/` profiles or
  **zero contacts** — do not reintroduce hardcoded name lists. Enrichment detects parked/dead domains
  and writes honest low-confidence summaries rather than hallucinating a profile.
- **Finder search is escalating + role-gated** — `find_linkedin_profiles` runs precise
  `site:linkedin.com/in/` queries, then simpler high-recall queries (`<brand> head of sales`), then a
  founder/CEO fallback across all aliases, reading SERP titles only (never opening LinkedIn), and keeps
  only roles passing a deterministic commercial-role gate (`_is_commercial_role`). Users can also add
  contacts manually via `POST /api/companies/{id}/contacts`.
- **`reply_classifier` is the inbound half of engagement** — it is NOT part of
  `run_campaign_pipeline` and is excluded from `RUNNABLE_KEYS` (like `meeting`). It runs via
  `POST /api/conversations/sync` (on demand) and a second scheduler job (`INBOUND_POLL_MINUTES`,
  default 5). It reads replies through `providers/inbound.py` (per-user Gmail read + IMAP
  fallback), de-dupes by `Message.external_id`, classifies via `ai.complete_json`, and acts: a
  high-confidence *not-interested* sets `Contact.do_not_contact=True` + `Thread.stage="Closed"`
  (reusing the Step 04 suppression); interested/meeting-ready advance to `Negotiating` + surface;
  everything else only surfaces. It never auto-sends and never opts a contact out without AI.

Each agent extends `agents/base.py::Agent` and calls `self.mark(db, owner_id, "Running"|"Idle"|"Error")`
to drive the per-user `agent_configs` status the UI reads.

### Providers — everything degrades gracefully

`backend/app/providers/` wraps all external I/O behind interfaces that work with no keys:
- **`ai.py`** — ordered backend chain (Gemini → Groq → OpenRouter) called via OpenAI-style REST with
  `httpx` (no SDKs). On HTTP 429 the backend is cooled down 60s and the call fails over to the next.
  Configure with `AI_PROVIDERS=gemini,groq,openrouter`. With no key, `complete()` returns `""` and
  callers fall back to deterministic heuristics.
- **`verification.py`** — 2 layers. Free layer (always on): syntax → role-account → disposable
  blocklist → **MX DNS lookup**. Paid layer (survivors only): **Verifalia** (preferred when
  configured — more credits) or **ZeroBounce**. No SMTP probing (reputation-safe). Verdicts rank
  Verified > Risky > Unknown > Invalid. **The merged guess-verify agent stores an address on a
  paid-provider `Verified` (confirmed mailbox) or, on a catch-all server, the best guess as `Risky`;
  it stops probing at the first hit and flags a domain catch-all once, so a paid key produces
  contactable emails without burning a credit per pattern. With no paid key, contacts stay
  `Unknown`/blank and outreach drafts nothing.**
- **`email.py`** — Gmail API / SMTP / **console** fallback. In console mode (default) emails are logged,
  and the signup OTP is also returned to the UI as `dev_otp` so you can verify without email setup.
- **`calendar.py`** — per-user Google Calendar. When a user connects their calendar (Settings →
  Connect Google Calendar; offline consent for `calendar.events`, refresh token stored on
  `User.google_calendar_token`), booking a meeting creates a real Calendar event with a Google Meet
  link on **their** calendar. No connection → falls back to a user-supplied link (else the booking
  route returns 422). Never fabricates a link.
- **`inbound.py`** — per-user inbound reader. Gmail API read (reconstructed from
  `User.gmail_read_token`, `gmail.readonly`) with a stdlib `imaplib` global fallback. Returns
  normalized `InboundMessage`s; returns `[]` and never raises on any error. No mailbox connected
  → no ingestion.
- **`search.py`** — DuckDuckGo (`ddgs`), no key. Exposes `domain_status() → live|parked|dead` and
  `find_linkedin_profiles()`.

### Outbound email kill-switch (safety — do not bypass)

`User.outbound_enabled` **defaults `False`**. No real email reaches a prospect until the user turns
sending on in Settings → Email. Gated paths return 403 / skip while paused: conversation send, the
tracking agent's auto follow-ups, and the meeting agent's contact email. **Exempt:** signup OTP and
"send test" (to self) always work.

### Data model & status lifecycles

`backend/app/models.py` — Users, Campaigns, Companies, Contacts, EmailDrafts, Threads+Messages,
Meetings, Notifications, Logs, AgentConfigs. All child rows cascade-delete from their owner. Key
status fields the UI depends on:
- `Company.status`: `Researching` (not yet processed) → `Qualified` (top-N) | `Reviewed` (scored but
  not selected) | `Excluded`/`Approved`/`Contacted` (user-set, preserved across re-runs).
- `Company.domain_status`: `live|parked|dead|unknown`; `enrichment_confidence` (0–100) caps scoring so
  a parked/dead-domain company can't display as "Strong".
- `Contact.verification`: `Verified|Risky|Unknown|Invalid` (the merged guess-verify agent persists
  `Verified` (confirmed) or `Risky` (best-guess on a catch-all server) with an address, else `Unknown`
  with no address). `EmailDraft.state`, `Thread.stage`.
  `Contact.do_not_contact` is set by `reply_classifier` on a high-confidence not-interested reply (and
  cleared by the human reopen control); `Message.intent` holds the classified reply intent.

### Schema migrations

**No Alembic yet.** `main.py::lifespan` runs `Base.metadata.create_all` on boot, followed by a block
of **idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`** statements for columns added after a table
already existed (`create_all` never alters existing tables). When you add a column to an existing model,
add the matching idempotent ALTER there or existing dev databases won't pick it up.

### Realtime & cross-cutting services

- `services/events.py` — `add_log()` / `add_notification()` are the single way to record audit logs and
  notifications; both also push over WebSocket via `realtime/ws.py::notify()`. Use these, don't write
  `Log`/`Notification` rows directly.
- `realtime/ws.py` — in-process hub; `/ws?token=…` streams `log` + `notification` events. The main
  event loop is captured in `lifespan` so threadpool (sync) request handlers can broadcast.
- `workers/scheduler.py` — APScheduler polls the tracking agent every `FOLLOWUP_INTERVAL_MINUTES`
  (default 15, the **poll cadence**) for all users. Disable with `ENABLE_SCHEDULER=false`. A thread
  gets an automatic follow-up only after our last message goes unanswered for `FOLLOWUP_DELAY_DAYS`
  (default 10 — decoupled from the poll cadence); after `MAX_FOLLOW_UPS` (default 3) unanswered nudges
  it auto-advances to the terminal `Stalled` stage. `Contact.do_not_contact` suppresses every send
  path (outreach draft, send, auto follow-up, meeting invite). A second job polls the inbound reply
  reader (the `reply_classifier` agent) every `INBOUND_POLL_MINUTES` (default 5) for every user with
  a connected mailbox.

### API surface & auth

Routers in `backend/app/api/routers/`, all prefixed `/api/<name>`. Auth is JWT (`api/deps.py::
get_current_user`); cross-tenant `/api/admin/*` routes require `require_admin` (a user is admin if
`is_admin` is set, auto-granted at startup/verification for emails in `ADMIN_EMAILS`).

Frontend wiring (`web/src/lib/`): `api.ts` is the typed client (token in `localStorage["reachly_token"]`,
401 auto-redirects to `/login`), `api-types.ts` mirrors backend schemas, `hooks.ts::useApi` is the
fetch hook. `components/AuthProvider.tsx` wraps the `(app)` route group and guards routes. App pages run
on live API data (no mock imports); shared UI constants live in `lib/constants.ts`.

## Frontend gotcha — Next.js 16 is not the Next.js you know

Per `web/AGENTS.md`: this is Next.js 16, which has breaking changes vs. older versions in your training
data (APIs, conventions, file structure). **Read the relevant guide under `web/node_modules/next/dist/docs/`
before writing frontend code**, and heed deprecation notices. Routes use the App Router with `(app)` and
`(auth)` route groups. The design system lives in Tailwind v4 `@theme` tokens in `src/app/globals.css`
(deep teal/navy, yellow brand accent, peach surfaces, condensed display headings).

## Environment notes

- Platform is **Windows + PowerShell**; the backend Python lives in `backend\.venv` (invoke as
  `.\.venv\Scripts\python.exe`). Node may not be on a fresh shell's PATH (`C:\Program Files\nodejs`).
- `docker compose` must be running for the backend to reach Postgres on `localhost:5433`.
