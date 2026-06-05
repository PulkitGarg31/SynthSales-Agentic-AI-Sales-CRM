# Agentic CRM — AI-Powered B2B Outreach & Lead Generation Platform

This repo implements the platform described in
`AI-Powered B2B Outreach & Lead Generation Platform.pdf` (the PRD).
The frontend visual design follows the supplied reference image:
deep teal/navy ink, bold yellow brand accent, warm peach/orange surfaces,
and heavy condensed display headings.

> **This README is the running context log.** It is updated after each task so work can
> resume with full context. See the "Progress log" section at the bottom.

## Scope (agreed with user, 2026-05-27)

- **Frontend:** Next.js (React) MVP. ✅ Done.
- **Backend:** FastAPI + **PostgreSQL (Docker)**, real integrations behind provider
  interfaces with `.env` placeholder keys (app boots without them). ✅ Done.
- **Frontend ↔ backend wiring:** ✅ Done — the UI now runs on live API data with real
  JWT auth (no more mock imports in the app pages).

## Running both together

1. **Backend** (terminal 1): `cd backend; docker compose up -d; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`
2. **Frontend** (terminal 2): `cd web; npm run dev`
3. Open http://localhost:3000 → sign in with **jordan@apexcloud.com / password123**.

The frontend reads the API base URL from `web/.env.local` (`NEXT_PUBLIC_API_URL`).

## Where things live

```
Agentic CRM/
  AI-Powered ... Platform.pdf   # the PRD (source of truth)
  spec.txt                      # extracted plain-text of the PRD (for quick reference)
  README.md                     # THIS FILE — running progress + context
  web/                          # the Next.js frontend
    src/app/                    # routes (App Router + route groups)
    src/components/             # shell, sidebar, topbar, icons, ui primitives
    src/lib/                    # api.ts, api-types.ts, hooks.ts, constants.ts, nav.ts
  backend/                      # the FastAPI backend
    docker-compose.yml          # PostgreSQL 16 (host port 5433 → container 5432)
    .env / .env.example         # config + placeholder integration keys
    requirements.txt
    app/
      main.py                   # FastAPI app, lifespan (create tables + seed + scheduler)
      core/                     # config, database, security (JWT, password hashing)
      models.py  schemas.py     # SQLAlchemy models + Pydantic schemas
      api/routers/              # auth, campaigns, companies, contacts, emails,
                                #   conversations, meetings, notifications, agents,
                                #   logs, dashboard, ws (websocket)
      agents/                   # 7-agent pipeline + orchestrator (PRD §3)
      providers/                # ai (Claude), search (DuckDuckGo), verification
                                #   (ZeroBounce REST), email (Gmail/SMTP/console)
      services/                 # events (logs+notifications), serializers, seed
      workers/scheduler.py      # APScheduler — 15-min follow-up polling
      realtime/ws.py            # in-process WebSocket hub
```

## Run it

### Frontend
```powershell
# Node lives at C:\Program Files\nodejs if not on PATH in a fresh shell
cd "c:\My Work\Agentic CRM\web"
npm run dev      # http://localhost:3000
npm run build    # production build + typecheck
```

### Backend
```powershell
cd "c:\My Work\Agentic CRM\backend"
docker compose up -d                       # start PostgreSQL (host port 5433)
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
# API:   http://127.0.0.1:8000
# Docs:  http://127.0.0.1:8000/docs   (Swagger; click "Authorize" to use the token)
# Health http://127.0.0.1:8000/health (shows which integrations are configured)
```
Demo login (seeded automatically): **jordan@apexcloud.com / password123**

### OTP email (signup verification)
The signup OTP is sent via the email provider. By default email is **not configured**, so the
backend runs in **console mode**: the code is logged to the backend terminal *and* returned to the
signup screen (`dev_otp`, dev only) so you can verify without any email setup.

To send **real OTP emails via Gmail**, edit `backend/.env`:
- `SMTP_USERNAME` = your Gmail address (pre-filled)
- `SMTP_PASSWORD` = a 16-char **Gmail App Password** (Google Account → Security → 2-Step
  Verification → App passwords). *Not* your normal password.
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587` (already set)

Then restart the backend. Once a password is present the provider switches to `smtp` mode,
emails the code for real, and stops surfacing `dev_otp`.

To enable other integrations, fill the blank keys in `backend/.env`
(`ANTHROPIC_API_KEY`, `ZEROBOUNCE_API_KEY`, Gmail/SMTP). Without them the
app still runs: AI/ZeroBounce degrade gracefully and email uses "console" mode
(messages are logged). DuckDuckGo search needs no key.

## PRD frontend modules → implementation status

| # | PRD Module | Route(s) | Status |
|---|---|---|---|
| 1 | Authentication | `/login`, `/signup` (+OTP), `/forgot-password` | ✅ Done |
| 2 | Dashboard | `/dashboard` | ✅ Done |
| 3 | Campaign Management | `/campaigns` | ✅ Done (filters, pause/resume/duplicate/archive/delete) |
| 4 | Campaign Creation Form | `/campaigns/new` | ✅ Done (4-step wizard, CSV upload + sample download) |
| 5 | Company Research & Ranking | `/research`, `/research/[id]` | ✅ Done (ranked table + detail w/ scoring breakdown) |
| 6 | Contact Discovery Review | `/contacts` | ✅ Done (approve/reject/edit per contact) |
| 7 | Email Draft Review & Editor | `/email-review` | ✅ Done (editor + live preview, regenerate, send test) |
| 8 | Conversation / Inbox | `/conversations` | ✅ Done (thread view + AI reply suggestions) |
| 9 | Meeting Management | `/meetings` | ✅ Done (upcoming/history, notes, join links) |
| 10 | Notifications Center | `/notifications` | ✅ Done (filter, mark read) + topbar bell dropdown |
| 11 | Agents Section | `/agents` | ✅ Done (pipeline strip + per-agent toggle/config) |
| 12 | Settings | `/settings` | ✅ Done (Profile / Email / AI / Security tabs) |
| 13 | Billing & Subscription | `/billing` | ✅ Done (usage, plans, payment history) |
| 14 | Integrations | `/integrations` | ✅ Done (email/calendar/verification/CRM) |
| 15 | Activity Logs & Audit | `/logs` | ✅ Done (category filter, leveled entries) |
| 16 | Support Pages | `/about`, `/contact` | ✅ Done (mission/team + support form/FAQ) |
| 17 | Error Handling & Empty States | `not-found.tsx`, `EmptyState`, CSV validation | ✅ Partial |
| 18 | Admin Panel (optional) | — | Not started (optional) |

## PRD backend (Tech Stack §1–8) → implementation status

| PRD area | Status |
|---|---|
| FastAPI services + REST layer | ✅ 39 endpoints across 12 routers, OpenAPI at `/docs` |
| Database (PostgreSQL) | ✅ Postgres 16 in Docker; SQLAlchemy 2.0 models; tables auto-created on boot |
| Authentication | ✅ JWT, password hashing (pbkdf2), register + OTP email verify + login + `/me` |
| Multi-agent architecture (7 agents) | ✅ Enrichment, Scoring, Employee Finder, Email Guessing & Verification, Outreach, Tracking/Follow-up, Meeting Coordination — sequential orchestrator |
| Email infrastructure | ✅ Provider with Gmail API / SMTP / console fallback |
| AI layer | ✅ Anthropic Claude provider (graceful fallback when no key) |
| Search + scraping | ✅ DuckDuckGo (ddgs) provider, no key required |
| Email verification | ✅ ZeroBounce via REST (httpx); returns Verified/Risky/Invalid/Unknown |
| WebSocket / realtime | ✅ `/ws?token=…` pushes notification + log events |
| Background jobs | ✅ APScheduler polls follow-ups every 15 min (PRD Phase 7) |
| Gmail + Calendar integration | ⚙️ Email send wired; Calendar event creation is a stub (meeting links captured/stored) |
| Migrations (Alembic) | ⏳ Using `create_all` on boot for dev; Alembic is the production follow-up |
| Deployment / CI-CD | ⏳ Not done (future) |

> All external integrations **degrade gracefully** without keys, so the API runs end-to-end
> out of the box. Fill `backend/.env` to switch them on.

## Not built yet (future)

- **Frontend ↔ backend wiring** (the agreed next step): replace `web/src/lib/mock.ts` imports
  with a typed API client hitting `http://127.0.0.1:8000`, plus a real auth/token flow.
- Optional Admin Panel (frontend Module 18).
- Alembic migrations, Google Calendar event creation, deployment/CI-CD.

## Progress log

### 2026-05-27
- Installed Node.js LTS (winget `OpenJS.NodeJS.LTS`); scaffolded Next.js 16 + Tailwind v4 + TS app in `web/`.
- Built design system (Tailwind v4 `@theme` tokens) matching the reference image.
- Built shared app shell: responsive sidebar nav (grouped), topbar with search, notification
  bell dropdown, and user menu.
- Built Auth module: login (+ Google button), signup with 6-digit OTP verification step,
  forgot password.
- Built public landing page in the reference hero style.
- Built mock data layer (`src/lib/mock.ts`) covering campaigns, companies, contacts, email drafts,
  conversations, meetings, notifications, agents, logs.
- Built Dashboard: campaign overview, 5 outreach metrics, conversion funnel, activity feed,
  campaigns list + upcoming meetings.
- Built **all 16 core PRD frontend modules** (plus optional Admin not started):
  Campaign Management, 4-step Create Campaign wizard, Company Research list + detail,
  Contact Discovery review, Email Draft editor + preview, Conversations inbox, Meetings,
  Notifications, Agents, Settings (4 tabs), Billing, Integrations, Logs, About, Contact.
- Added global `not-found.tsx` (404) and reusable `EmptyState`; CSV upload has format validation.
- ✅ `npm run build` passes (23 routes, typecheck clean).
- ✅ Verified all routes return HTTP 200 (unknown route → 404) via the running dev server; no
  runtime errors in logs.
- **Dev server runs at http://localhost:3000** (`npm run dev` in `web/`).

### 2026-05-27 (backend)
- Started Postgres 16 in Docker. Discovered host port 5432 was taken by a local
  PostgreSQL 18 install → remapped the container to **host port 5433** (see `docker-compose.yml`).
- Scaffolded FastAPI backend in `backend/` with a Python 3.14 venv. (Note: the `verifalia`
  SDK has no 3.14 wheel — implemented Verifalia via its REST API with `httpx` instead.)
- Built core: config (pydantic-settings + `.env`), SQLAlchemy 2.0 models, Pydantic schemas,
  JWT auth + password hashing.
- Built **4 provider interfaces** (AI/Claude, DuckDuckGo search, Verifalia, Email) that
  degrade gracefully when keys are absent.
- Built the **8-agent pipeline** + sequential orchestrator (PRD §3), the **REST API** (39
  endpoints / 12 routers), `/health`, **WebSocket** realtime, and an **APScheduler** worker
  for 15-minute follow-up polling.
- Added an idempotent **seed** mirroring the frontend mock data (demo user + Apex Cloud campaign).
- ✅ App boots: tables auto-created, demo data seeded, scheduler running.
- ✅ Verified end-to-end via the live API: login → `/me` → dashboard → campaigns/companies/agents.
- ✅ Verified the **full agent pipeline**: created a campaign, uploaded a CSV, ran it — companies
  were enriched, scored & ranked (Logistics > Technology via the ICP heuristic), top-N qualified,
  3 contacts found per company, and 9 personalized drafts generated — all in ~4 seconds.
- **Backend runs at http://127.0.0.1:8000** (`/docs` for Swagger). Demo: jordan@apexcloud.com / password123.

### 2026-05-27 (frontend ↔ backend wiring)
- Added `web/.env.local` (`NEXT_PUBLIC_API_URL`), a typed **API client** (`web/src/lib/api.ts`)
  covering all 39 endpoints, backend-matching types (`web/src/lib/api-types.ts`), a `useApi`
  data-fetch hook, and loading/error UI primitives.
- Built **AuthProvider** (JWT in localStorage, `/me` on load, route guard, logout) wrapping the
  `(app)` layout; auth pages (login, signup + OTP) now call the real endpoints and store the token.
- Rewired **every app page** to live API data with loading/error/empty states:
  Dashboard, Campaigns (+ real pause/resume/duplicate/delete), Create Campaign (create → CSV
  upload → run pipeline), Research list + company detail (approve/exclude/re-research/find-contacts),
  Contacts (approve/reject/edit), Email Review (edit/regenerate/test/approve-&-send),
  Conversations (live threads, reply, AI suggestion), Meetings (mark done), Notifications
  (mark read), Agents (toggle + run follow-up), Logs.
- Topbar bell + user menu now pull from the API; sign-out clears the token everywhere.
- Backend tweak: `ThreadOut` now includes `company_name`/`contact_name`/`role`/`email` for the inbox.
- ✅ Frontend `npm run build` passes (23 routes, types clean). ✅ Verified API endpoints, the
  enriched conversations payload, and **CORS** (ACAO `http://localhost:3000`) against the live backend.

#### Create Campaign — required-field enforcement
- The wizard now blocks advancing past a step until its essential inputs are filled, with red
  asterisks marking required fields:
  - **Step 1 (Upload):** campaign name **and** a valid CSV are required (the draft-without-CSV
    path was removed since the pipeline needs companies).
  - **Step 2 (Product):** product name, description, industry (already enforced).
  - **Step 3 (Target requirements):** ICP, ≥1 target industry, ≥1 company size, ≥1 buying
    signal, ≥1 ranking factor. Target countries stays optional.
- File: `web/src/app/(app)/campaigns/new/page.tsx` (`validateStep()` + `required` props).

#### Outbound email kill-switch (sending OFF by default)
- New per-user **`outbound_enabled`** flag (User model, **defaults `false`**). No real emails go
  to prospects until the user turns sending on in **Settings → Email**.
- Migration: `main.py` lifespan runs an idempotent `ALTER TABLE users ADD COLUMN IF NOT EXISTS
  outbound_enabled ...` so existing DBs pick up the column (all existing accounts start paused).
- API: `GET /api/auth/me` now returns `outbound_enabled`; new `PATCH /api/auth/me`
  `{outbound_enabled: bool}` toggles it (logged).
- Gated send paths (all held while paused, none crash):
  - `POST /api/conversations/send` (Approve & send) → **403** with a clear message when paused;
    when enabled it now also attempts real delivery via the email provider.
  - `TrackingAgent.run` (scheduler auto follow-ups) → returns 0 / skips while paused.
  - `MeetingAgent.book` → books the meeting + in-app notice, but skips the contact email.
  - **Exempt:** sign-in OTP and "Send test" (to self) always work.
- Frontend: Settings → Email has an **Outbound email sending** toggle (reads/writes via
  `api.setOutbound`, refreshes auth). Email Review shows a "sending paused" banner, disables
  **Approve & send**, and surfaces the 403 as a toast.
- Verified live: `/me` exposes the flag, PATCH toggles both ways, and send returns 403 while paused.

#### Layered email verification (free MX layer + optional paid)
- `app/providers/verification.py` rewritten into a 2-layer verifier:
  1. **Free local layer (always on, no key):** syntax (`email-validator`) → role-account
     detection (`info@`, `sales@`, …) → disposable-domain blocklist → **MX DNS lookup**
     (`dnspython`). Catches typos, dead domains, throwaway/role addresses for free.
  2. **Paid layer (optional, survivors only):** escalates addresses that pass layer 1 to
     **ZeroBounce** (preferred, `ZEROBOUNCE_API_KEY`) or **Verifalia** — so paid credits are
     spent only where they add value. With no key, layer-1 survivors return `Unknown`.
- `verification.available` is now always `True` (free layer always works); `paid_mode` reports
  `zerobounce` / `verifalia` / `None`. `/health` shows `email_verification`.
- `VerificationAgent._resolve` reworked to pick the **best-ranked** result across guessed
  patterns (Verified > Risky > Unknown > Invalid) instead of defaulting survivors to Invalid.
- Config: added `ZEROBOUNCE_API_KEY`; `.env` / `.env.example` documented (ZeroBounce = 100 free/mo).
- Verified live: bad syntax & dead domains → Invalid; role/disposable → Risky; valid+MX → Unknown
  (until a paid key is added). No SMTP probing (reputation-safe by design).

#### AI provider — multi-provider chain with automatic rate-limit failover
- `app/providers/ai.py` now holds an **ordered chain** of backends with automatic failover:
  on HTTP **429**, the current backend is cooled down for 60s and the call retries on the next.
- **Supported backends:** Google Gemini, Groq, OpenRouter (Anthropic removed). All three are
  called via OpenAI-style REST with `httpx` — no SDKs, no new dependencies.
- Configuration in `.env`:
  - `AI_PROVIDERS=gemini,groq,openrouter` → comma-separated priority chain (recommended).
  - `AI_PROVIDER=auto|gemini|groq|openrouter` → single-provider override.
  - Per-provider: `{GEMINI,GROQ,OPENROUTER}_API_KEY` and `{…}_MODEL`.
- **Defaults:** Gemini `gemini-2.5-flash` (free tier; **2.0-flash had `limit: 0` on the test
  key**), Groq `llama-3.3-70b-versatile`, OpenRouter `meta-llama/llama-3.3-70b-instruct:free`.
- Verified live with the user's Gemini key:
  - `complete()` → `"Are you optimizing your network for today's dynamic freight market?"`
  - `complete_json()` → `{'industry': 'Logistics', 'size': 'Large'}`
- Failover proven: when 2.0-flash returned 429, the chain logged `"AI backend gemini
  rate-limited; cooling down 60s, failing over."` — exactly as designed.
- ZeroBounce key added by user → `/health` reports `email_verification: "zerobounce"` (paid
  verification layer active).

#### Landing page redesign (refined dark hero + cream, professional)
- `web/src/app/page.tsx` rewritten as a long-form marketing landing — same CargoX-inspired
  dark-hero-on-cream direction, polished and expanded.
- **Sections (top → bottom):** Hero · Integrations row · How it works (8-step visual pipeline
  with numbered icon nodes and dashed connector) · Features grid (6 cards, distinct icons,
  hover lift, ZeroBounce mention replaces Verifalia) · **Product showcase — auto-scrolling
  carousel** · FAQ · Final CTA band · Footer (4-column nav + legal).
- **Carousel:** pure-CSS marquee (`@keyframes translate3d -50%`), 55s loop, pauses on hover,
  honors `prefers-reduced-motion`. Six self-contained mockup "screenshots" rendered as JSX
  (no image assets): Dashboard, Campaign builder, Research & ranking, Email review,
  Conversations, Agents — each in a faux window chrome.
- Typography: tightened tracking on display headings, `clamp()` hero sizing for fluid scale.
- All copy reflects current backend: AI provider chain (Gemini/Groq/OpenRouter), ZeroBounce
  verification, outbound-paused-by-default safety, human-in-the-loop review checkpoints.
- ✅ `npm run build` passes (23 routes, types clean).

#### Per-campaign agent pipeline view
- New page `web/src/app/(app)/campaigns/[id]/page.tsx` — click any campaign → see all 8 agents
  for THAT campaign as a vertical timeline. Per-agent: status badge, progress bar (X / Y),
  last-run timestamp, **Run / Re-run** button, and a "View results →" link that drops you in
  the right downstream page (Research / Contacts / Email Review / Conversations / Meetings).
- "Run all agents" button at the top kicks off the whole pipeline.
- `/campaigns` list updated: clicking a campaign now goes to `/campaigns/[id]` (previously
  jumped straight to `/research?campaign=X`).
- **Backend additions:**
  - `GET /api/campaigns/{id}/pipeline` → returns per-agent status + derived progress
    (e.g. enrichment = companies with `research_summary`, outreach = drafts / contacts).
  - `POST /api/campaigns/{id}/run-agent` body `{key}` → runs one agent in the background.
    Validates against `RUNNABLE_KEYS` (`meeting` is excluded — booking is user-triggered).
  - `orchestrator.run_agent_for_campaign(db, campaign, owner_id, key)` is the new shared
    helper; the existing full-pipeline endpoint still works unchanged.
- **Verified live:** demo campaign returns 8-stage pipeline (e.g. `Enrichment 4/4 runnable=True`,
  `Meeting 0/0 runnable=False`); `verification` run-agent returns 202-style start; bad keys
  return `400 "Agent 'X' cannot be run on demand"`.
- ✅ `npm run build` passes (24 routes including `ƒ /campaigns/[id]`).

#### Enrichment hardening — parked-domain detection + honest summaries
- **Found via real bug:** Vertex Health Systems was showing "Good" / 70 even though
  `vertexhealth.org` is a parked domain (114-byte JS redirect to a parking lander). HEAD probe
  returned 200, so the prior `domain_alive()` said "live" and the AI hallucinated a profile.
- `app/providers/search.py` now exposes **`domain_status() → live | parked | dead`**:
  - GET (not HEAD), follows redirects, inspects body.
  - Tags as **parked** if body contains parking markers (`/lander`, "this domain is for sale",
    "godaddy", "sedo", "afternic", "future home of", "coming soon", etc.) **or** stripped
    visible content is < 200 chars.
  - Tags as **dead** on DNS failure / connect refused / timeout. Live otherwise.
  - `domain_alive()` retained as `!= "dead"` for back-compat.
- `app/agents/enrichment.py`:
  - **Parked-domain path** (new): skips AI, sets `confidence=15`, writes a 3-sentence summary
    that names the domain, explicitly calls it parked/placeholder, suggests the CSV link may be
    wrong, and quotes the available CSV signals.
  - **Dead-domain path**: same structure, `confidence=10`, mentions "did not respond".
  - **AI-empty-response path** no longer prints the misleading "connect an AI key" line — it
    now says the AI's response was incomplete/unparseable.
  - **`_csv_context()` + `_fallback_summary(reason)`**: every fallback summary now uses what
    we DO know from the CSV (industry, size, location) and what we explicitly DON'T (parked,
    no snippets, AI failed).
- `app/agents/scoring.py`: tightened ceilings — `conf < 20 → 45 (Weak)`, `< 40 → 60 (Moderate)`,
  `< 60 → 75 (Good)`, `< 75 → 87 (Strong)`. Now a parked or dead-domain company cannot display
  as Good no matter what the name-hash baseline produces.
- **Verified live on campaign #1:** Vertex Health Systems (parked domain) went from
  **#4 Good 70 conf=30** → **#2 Weak 45 conf=15**, with research summary now explicitly stating
  "domain responds, but the page is a parked/placeholder site rather than an active company
  website." Match explanation: *"Scored 45/100 (research confidence 15/100) — very low research
  confidence — domain unreachable or parked."*

#### Status semantics fix — "Reviewed" replaces stuck "Researching"
- **Bug:** below-top-N companies stayed labelled "Researching" after the pipeline finished
  (scoring demoted them back to that state), making it look like research was still in progress
  for 12+ companies indefinitely.
- **Fix:** introduced a new company status **`"Reviewed"`** meaning *"research is done, but
  this company didn't make the top-N selection (or had too-low confidence)"*. `"Researching"`
  now means only what it should: *not yet processed / actively in progress*.
- Backend changes:
  - `app/agents/enrichment.py`: after running, status moves to `Qualified` if `conf ≥ 40`,
    else `Reviewed`. Companies no longer remain in `Researching` after the agent runs.
  - `app/agents/scoring.py`: top-N → `Qualified`, rest → `Reviewed` (was → `Researching`).
    Preserves user-set states (`Excluded`, `Approved`, `Contacted`).
- Frontend changes:
  - `CompanyStatus` union in `lib/api-types.ts` + `lib/types.ts` includes `Reviewed`.
  - `research/page.tsx` status tone map adds `Reviewed: "neutral"` (distinct from
    `Researching: "warn"`).
- Existing dashboard/serializer "researched" counts (`status != "Researching"`) automatically
  count `Reviewed` correctly.
- **Verified live on Pipeline Test 2** (`top_n=3`, 4 companies): top 3 = `Qualified`,
  #4 Umbrella Transit = `Reviewed`. Across all campaigns: 10 Qualified, 1 Reviewed, 1 Excluded.
- ✅ `npm run build` passes.

#### Site status surfaced in the UI (banner + signals + header badge)
- Research summary already mentioned parked/dead sites in prose, but the
  **SIGNALS** card and header didn't reflect it — easy to miss. Fixed:
- **New column `Company.domain_status`** (`live` | `parked` | `dead` | `unknown`),
  set by the enrichment agent on every run. Idempotent ALTER on boot.
- Exposed in `CompanyOut` schema and the frontend `Company` type as a typed literal.
- **`/research/[id]` company detail now surfaces it in three places:**
  - **Warning banner** at the top of the page (red for dead, yellow for parked) —
    explicitly says *"Website unreachable / appears parked"* with a one-line
    explanation and a "verify manually before outreach" nudge.
  - **Header badge** next to Match / Status — "Site unreachable" or "Site parked".
  - **Signals card** now has a "Website" row showing live/parked/dead/unknown with
    the matching icon and color (was missing entirely before).
- Verified live: Vertex Health Systems → `domain_status="parked"`, conf=15;
  Northwind / Orbit → `dead`; Brightwave → `live`.

#### Company detail action buttons — visible feedback ("Re-research not working")
- **User reported:** clicking *Re-research* appeared to do nothing. Diagnosis: the backend
  endpoint worked fine (0.9s for a parked domain), but the frontend `act()` helper:
  - swallowed errors silently (no toast)
  - showed no success indication
  - on a parked domain re-research, returned identical data — so the page looked unchanged
- **Fix in `web/src/app/(app)/research/[id]/CompanyDetail.tsx`:**
  - `act(action, fn, successMsg)` now catches `ApiError` / `Error` and flashes a toast
    (red for failure, dark for success).
  - **Per-action busy state** — only the clicked button shows "Approving… / Excluding… /
    Re-researching… / Finding contacts…"; other buttons are disabled but readable.
  - **Status-aware re-research summary** in the success toast:
    - dead site → *"Re-research complete — site still unreachable, no new signals."*
    - parked → *"Re-research complete — site still appears parked, no new signals."*
    - live → *"Re-research complete — confidence X/100."*
  - Replaces the old "whole-page goes opaque, no feedback" UX.
- ✅ `npm run build` passes.

#### Re-research that actually does something (force-AI on demand)
- **Root cause** of the user-reported "Re-research not working": bulk-pipeline enrichment
  *skips* the AI for dead/parked domains (saves tokens). The single-company `/enrich`
  endpoint reused that exact code path, so re-research on a parked domain ran the same
  three-line early-return and produced identical data — looking broken.
- **Split the path:**
  - `enrichment_agent.run(..., force_ai: bool = False)` — new parameter. Default False
    keeps the bulk pipeline's "skip AI on dead/parked" optimization.
  - **`POST /api/companies/{id}/enrich`** now calls `force_ai=True` — the on-demand path
    always runs search + AI, even when the CSV's domain is parked/dead. The AI searches
    by company *name*, so it can surface a real current site or recent info the user
    couldn't see before.
- **Honest context for the AI:** the prompt now includes the domain status — `"NOTE: the
  CSV domain returned a parked/placeholder page, not a real company site; rely on the
  snippets"` — so the model doesn't anchor on a dead URL.
- **Summary prefix:** when force-AI runs against a bad domain, the resulting summary is
  prepended with a one-line site warning so the UI banner still makes sense.
- **Confidence stays capped** (≤ 25) when re-researching a parked/dead domain — the AI
  may have found *something*, but the original site link is still broken.
- **Verified live on Vertex Health Systems:**
  - Before: summary said "no real content was available to research Vertex Health Systems."
  - After: AI surfaced **"Virtual Care platform and health technology solutions for
    hospitals and medical practices, focus on remote patient monitoring"** — completed
    in 17 seconds, conf=25, with the parking-domain warning kept at the top.
- ✅ `npm run build` passes.

#### Contact finder — real LinkedIn profiles, no more hallucinated people
- **The big bug:** `employee_finder` was generating contacts by hashing the company name
  to index into hardcoded `FIRST = ["Dana","Marcus","Priya"...]` / `LAST = [...]` arrays
  and building fake `linkedin.com/in/dana-whitfield` URLs. Every company got 3 plausible
  invented people. Names didn't work there, LinkedIn URLs were fake.
- **New `search.find_linkedin_profiles(company_name)`** in `providers/search.py`:
  - Runs 4 targeted `site:linkedin.com/in/` queries against DuckDuckGo for
    senior-title cohorts (CEO/Founder, CTO/COO, VP, Head of / Director).
  - Parses real name + role from result titles (`"Satya Nadella - Chairman and CEO at Microsoft | LinkedIn"`).
  - Validates: company name must appear in title or body — drops coincidental matches.
  - Deduplicates by LinkedIn URL.
- **New `EmployeeFinderAgent.run()`** is search-first, no fabrication:
  - Calls `find_linkedin_profiles`. If results, optional AI ranking step (when AI is
    configured) **filters false positives** — former employees, similarly-named
    companies, vendors, journalists, company pages — and picks the top N by sales
    relevance.
  - **If no real profiles are found, the agent leaves the company without contacts**
    instead of inventing any. Logged honestly.
- Verified live on campaign #1:
  - Real names (Northwind Logistics → Nicole Chubioglu (Transportation Planner) and
    others — real linkedin.com URLs).
  - Fictional companies (Brightwave, Vertex, Orbit) → **0 contacts** (correct —
    those companies don't exist).
  - The AI filter trimmed earlier borderline results when company-name ambiguity
    was high (e.g. multiple "Summit" companies).
- All old fake `["Dana","Marcus","Priya"…]` constants + `_idx()` helper are gone.

#### What's next (suggested)
- A real browser click-through pass (login → create campaign → run → review → send) — verified
  at the API/build/CORS layers, but not yet exercised in an actual browser here.
- Optional Admin Panel (frontend Module 18).
- Alembic migrations, Google Calendar event creation, deployment/CI-CD.
- Forgot-password is still a frontend-only stub (no backend reset endpoint yet).

### 2026-06-01 (registration hardening + Google OAuth)

Closed the four gaps from `.claude/specs/01-registration.md` (the core register → OTP →
verify flow already existed; see also the plan in `.claude/plans/01-registration.md`).
Backend hardening ships with no new deps; Google OAuth is fully mergeable with **no**
credentials — it degrades like every other integration.

#### Password strength on signup
- First pydantic-v2 `@field_validator` in the codebase (`schemas.py`): password must be
  8–128 chars (128 is a pbkdf2 DoS guard, **not** a bcrypt 72-byte cap — the hasher is
  pbkdf2_sha256) and include ≥2 of 4 character classes. Surfaces as a readable 422.

#### Abuse controls (in-memory, zero deps)
- New `core/ratelimit.py` — thread-safe sliding-window limiter (monotonic clock,
  `threading.Lock`; per-process, resets on restart — Redis-swappable behind `.check()`).
- `POST /register` and `/resend-otp` now throttle by **both IP and email** (register 5/IP·
  3/email; resend 5/IP·3/email per 10 min) → 429 plus a `level="warning"` audit log.
- `POST /verify-otp` gained an **OTP brute-force lockout**: new `User.otp_attempts` column;
  5 wrong codes → 429 (locked); the counter resets when a fresh code is issued
  (register/resend) or on success. Expiry is checked before the lock so an expired code
  self-heals (the user is routed to resend).

#### Google OAuth (sign-in / sign-up)
- New `providers/oauth.py` (`GoogleOAuthProvider`, httpx, no SDK) + 4 config keys;
  `.available` is False with no client id/secret, exactly like the other providers.
- Authorization-code flow: `GET /api/auth/google/start` (random `state` in an HttpOnly
  cookie for CSRF) → Google → `GET /api/auth/google/callback` exchanges the code, fetches
  userinfo, **requires `email_verified`**, resolves the account (by `google_sub`, else links
  onto an existing password account by email, else creates a verified user + `ensure_agents`),
  then 307-redirects to the SPA `/oauth-callback?token=…`. New nullable, indexed
  `User.google_sub` column.
- `GET /api/auth/providers` tells the frontend whether to show the button; `/health` now
  reports `google_oauth`.
- Frontend: new Suspense-wrapped `(auth)/oauth-callback` page; the previously-inert
  "Continue with Google" buttons on login + signup now render only when OAuth is configured
  and kick off the flow via a full-page nav.

#### Schema / migrations
- Two idempotent `ALTER TABLE users ADD COLUMN IF NOT EXISTS` (`otp_attempts`, `google_sub`)
  in `main.py::lifespan` (still no Alembic).

#### Verified
- Backend imports clean; `npm run build` passes (incl. the `/oauth-callback` Suspense
  boundary that Next.js 16 requires for `useSearchParams`).
- Unit: password validator, rate limiter (T,T,T,F sequence), OAuth degrade.
- Live (Postgres on 5433): migrations applied; weak password → 422; 5 wrong OTP codes →
  400×4 then **429**, `otp_attempts`=5, resend resets it to 0; register throttle →
  400,400,**429**; unconfigured OAuth → `providers.google=false`, `/google/start` &
  `/google/callback` → 404.

### 2026-06-03 (enrichment & scoring upgrade)

Implemented `.claude/specs/02-enrichment-scoring.md` (plan in `.claude/plans/`). Pipeline
phases 1–2 were upgraded; closes the spec's prior gaps #11–#14. No new dependencies.

#### Enrichment (`agents/enrichment.py`)
- **5–8 bullet research profile** — the AI now returns `research_points` (new `Company`
  JSON column) instead of a 2–3 sentence blob. `research_summary` is **retained but derived**
  (space-joined points) so every existing consumer (outreach prompt + fallback, pipeline
  `stats()`, admin debug, seed) keeps working untouched.
- **Per-metric confidence** — new `metric_confidence` JSON column: a 0–100 confidence for each
  AI-filled field. **Backend-only** — deliberately absent from `CompanyOut`/`api-types.ts`/UI;
  its sole job is to make scoring more correct. When low overall confidence suppresses
  funding/news/hiring, those per-metric values are capped too. Dead/parked/heuristic paths emit
  honest bullet lists + `{}` (no fabricated signals).
- **`domain_status` caching** — the live HTTP probe (the slowest step) now runs only on `force`
  or when status is `unknown`; non-force re-runs reuse the cached value. The per-company
  Re-research button still forces a fresh probe.

#### Scoring (`agents/scoring.py`)
- **Removed the `sha256(name)` baseline.** With an AI key, `_score()` scores against the full
  campaign ICP (`product`, `product_description`, `value_proposition`, `icp`, `industry_pref`,
  `business_requirements`, `ranking_criteria`, `geography`, `company_size`, `differentiators`)
  using the enrichment profile; with no key, a **deterministic real-signal heuristic** (research
  depth + industry/funding/hiring/news) drives it.
- **Per-metric discount** — `metric_confidence` discounts the factors it rates (industry →
  Industry alignment; funding/hiring → Growth indicators; location → Market compatibility). The
  load-bearing `enrichment_confidence` → `ai_score` **ceiling is preserved** as the final clamp.
- **AI-written `match_explanation`** in the AI path, deterministic backstop otherwise.

#### Performance (`agents/orchestrator.py`, `core/database.py`)
- Enrichment fans out across a **bounded `ThreadPoolExecutor`** (`ENRICH_MAX_WORKERS=4`), each
  worker on its **own `SessionLocal()`** (re-fetch by id — no ORM object crosses a thread).
  Blocks until join, so enrichment→scoring ordering and `mark()` on the main session are
  preserved. Engine `pool_size` pinned to hold the workers.

#### Schema / migrations / UI
- Two idempotent `ALTER TABLE companies ADD COLUMN IF NOT EXISTS` (`research_points`,
  `metric_confidence` JSONB) in `main.py::lifespan`. `research_points` added to `CompanyOut`
  (not `metric_confidence`). `CompanyDetail.tsx` renders the bullets (prose fallback for legacy
  rows). Seed/admin/`db.ps1` show the new fields for debugging.

#### Verified
- All changed backend modules byte-compile; `npm run build` passes (typechecks `research_points`).
- Live smoke (Postgres 5433): see the spec's Definition of done.

### 2026-06-05 (contact discovery & verification — agent merge, ZeroBounce-only, finder trim)

Implemented `.claude/specs/03-contact-discovery-verification.md` (plan in `.claude/plans/`).
Pipeline stages 3–4. No schema changes, no dependency changes.

#### Agent merge → 7-agent pipeline
- The former `email_guess` + `verification` agents are now **one** agent,
  `email_guess_verification` ("Email Guessing & Verification") — `guess_emails()` stays a helper
  called inside `verification_agent.run()`. Updated `AGENT_REGISTRY` (`base.py`),
  `VerificationAgent.key`, `RUNNABLE_KEYS` + the run-agent branch (`orchestrator.py`), and the
  `/pipeline` `stats()` (`campaigns.py`). The frontend timeline `resultsLink` switch collapses the
  two cases. `main.py::lifespan` gets an idempotent `DELETE`+back-fill of `agent_configs` so existing
  users see 7 agents. CLAUDE.md updated 8→7.

#### Strict verify-or-drop (`agents/verification.py`)
- `_resolve()` now stores an address **only** on the first ZeroBounce-`Verified` guess (then stops);
  if no guess verifies it stores **no address** (`email=""`, `verification="Unknown"`,
  `confidence=0`). The old best-ranked Risky/Unknown fallback is gone, so a contact's stored verdict
  is now only `Verified` or `Unknown`. **ZeroBounce is required** — with no key the free layer never
  returns `Verified`, so the zero-key demo yields no addresses and no drafts (owner-chosen behavior).
- Outreach gate (`orchestrator.py`, both `_draft_all`) changed from `verification ∈ {…}` to a
  non-empty `email` check, so only contacts with a real (verified or human-edited) address are drafted.

#### ZeroBounce-only (Verifalia removed)
- Stripped Verifalia from `providers/verification.py` (`_verifalia`, `_VF_MAP`, `VERIFALIA_BASE`,
  the `paid_mode`/`verify` branches, `import time`), `core/config.py` (settings), `.env.example`,
  `requirements.txt`, the `base.py` registry description, the `seed.py` demo log, and CLAUDE.md.
  `paid_mode` now returns `"zerobounce"` or `None`.

#### Finder role trim (`providers/search.py`, `agents/employee_finder.py`)
- Dropped the Business Development / Partnerships / Alliances / Channel role group from the LinkedIn
  search queries and moved it to the AI ranker's reject list. Keeps top-commercial, mid-level sales,
  and the small-company Founder/CEO fallback.

#### Verified
- Backend byte-compiles and imports clean (`AGENT_REGISTRY` = 7 agents, `paid_mode` = None with no key).
- `npm run build` passes (timeline switch typechecks).
- Full end-to-end (with/without `ZEROBOUNCE_API_KEY`): see the spec's Definition of done.
