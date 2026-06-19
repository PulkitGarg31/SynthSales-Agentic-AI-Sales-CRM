# Agentic CRM — AI-Powered B2B Outreach & Lead Generation Platform

This repo implements the platform described in
`AI-Powered B2B Outreach & Lead Generation Platform.pdf` (the PRD).
The frontend visual design follows the `UI.webp` reference: warm cream editorial
minimalism — cream/paper surfaces, ink text, hairline borders, a terracotta accent,
and a Schibsted Grotesk + Instrument Serif (italic display) type pairing.

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
                                #   conversations, meetings, notifications, agents, logs,
                                #   dashboard, admin, contact (contact_us), ws (websocket)
      agents/                   # 8-agent pipeline + orchestrator (PRD §3)
      providers/                # ai (Gemini→Groq→OpenRouter), search (DuckDuckGo),
                                #   verification (MX + Verifalia/ZeroBounce), email
                                #   (Gmail/SMTP/console), calendar, inbound (reply reader)
      services/                 # events (logs+notifications), serializers, seed
      workers/scheduler.py      # APScheduler — follow-up + inbound reply polling
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
(`GEMINI_API_KEY`/`GROQ_API_KEY`/`OPENROUTER_API_KEY`, `VERIFALIA_*` or
`ZEROBOUNCE_API_KEY`, Gmail/SMTP). Without them the app still runs: AI and paid
email-verification degrade gracefully and email uses "console" mode (messages are
logged). DuckDuckGo search needs no key.

## PRD frontend modules → implementation status

| # | PRD Module | Route(s) | Status |
|---|---|---|---|
| 1 | Authentication | `/login`, `/signup` (+OTP), `/forgot-password` | ✅ Done |
| 2 | Dashboard | `/dashboard` | ✅ Done |
| 3 | Campaign Management | `/campaigns` | ✅ Done (filters, pause/resume/duplicate/archive/delete) |
| 4 | Campaign Creation Form | `/campaigns/new` | ✅ Done (4-step wizard, CSV upload + sample download) |
| 5 | Company Research & Ranking | `/research`, `/research/[id]` | ✅ Done (ranked table + detail w/ scoring breakdown) |
| 6 | Contact Discovery Review | `/contacts` | ✅ Done (approve/reject/edit per contact) |
| 7 | Email Draft Review & Editor | `/outreach` | ✅ Done (editor + live preview, regenerate, send test) |
| 8 | Conversation / Inbox | `/conversations` | ✅ Done (thread view + AI reply suggestions) |
| 9 | Meeting Management | `/meetings` | ✅ Done (upcoming/history, notes, join links) |
| 10 | Notifications Center | `/notifications` | ✅ Done (filter, mark read) + topbar bell dropdown |
| 11 | Agents Section | `/agents` | ✅ Done (pipeline strip + per-agent toggle/config) |
| 12 | Settings | `/settings` | ✅ Done (Profile / Email / AI / Security tabs) |
| 13 | Billing & Subscription | — | ❌ Dropped in the 2026-06 rebuild |
| 14 | Integrations | `/integrations` | ✅ Done (email/calendar/verification/CRM) |
| 15 | Activity Logs & Audit | `/activity` | ✅ Done (category filter, leveled entries) |
| 16 | Support Pages | `/about`, `/contact` | ✅ Done (mission/team + support form/FAQ) |
| 17 | Error Handling & Empty States | `not-found.tsx`, `EmptyState`, CSV validation | ✅ Partial |
| 18 | Admin Panel (optional) | `/admin` | ✅ Done (cross-tenant user/campaign drill-downs) |

## PRD backend (Tech Stack §1–8) → implementation status

| PRD area | Status |
|---|---|
| FastAPI services + REST layer | ✅ 72 endpoints across 14 routers, OpenAPI at `/docs` |
| Database (PostgreSQL) | ✅ Postgres 16 in Docker; SQLAlchemy 2.0 models; tables auto-created on boot |
| Authentication | ✅ JWT, password hashing (pbkdf2), register + OTP email verify + login + `/me` |
| Multi-agent architecture (8 agents) | ✅ Enrichment, Scoring, Employee Finder, Email Guessing & Verification, Outreach, Tracking/Follow-up, Meeting Coordination, Reply Detection & Intent — sequential orchestrator |
| Email infrastructure | ✅ Provider with Gmail API / SMTP / console fallback |
| AI layer | ✅ Gemini→Groq→OpenRouter chain via httpx REST with 429 failover (graceful fallback when no key) |
| Search + scraping | ✅ DuckDuckGo (ddgs) provider, no key required |
| Email verification | ✅ Free MX/syntax layer + Verifalia/ZeroBounce (httpx); returns Verified/Risky/Invalid/Unknown |
| WebSocket / realtime | ✅ `/ws?token=…` pushes notification + log events |
| Background jobs | ✅ APScheduler: follow-up polling (15 min) + inbound reply polling (5 min) (PRD Phase 7) |
| Gmail + Calendar integration | ✅ Email send wired; per-user Google Calendar creates real Meet links on booking (falls back to a user-supplied link) |
| Migrations (Alembic) | ⏳ Using `create_all` on boot for dev; Alembic is the production follow-up |
| Deployment / CI-CD | ⏳ Not done (future) |

> All external integrations **degrade gracefully** without keys, so the API runs end-to-end
> out of the box. Fill `backend/.env` to switch them on.

## Not built yet (future)

- Alembic migrations (still using `create_all` + idempotent `ALTER TABLE` on boot).
- Deployment / CI-CD.

## Progress log

### 2026-06-17 (functional gaps)
- **Fixed orphaned Meetings on delete** (BACKEND-GAPS §1). `Meeting` sat outside the cascade graph
  (only a `campaign_id` FK with `ondelete=SET NULL`), so deleting a campaign *or* a user left ownerless
  meeting rows. Added a `Campaign.meetings` ↔ `Meeting.campaign` relationship with
  `cascade="all, delete-orphan"`, so `DELETE /api/campaigns/{id}` and `DELETE /api/admin/users/{id}`
  now remove the associated meetings too (ORM-level cascade — no schema migration). Updated the
  `delete_user` docstring; SQLAlchemy mapper config verified. (`CLAUDE.md`'s "all child rows
  cascade-delete from their owner" is now literally true.)
- **Conversation replies now send for real** (BACKEND-GAPS §1). `POST /api/conversations/{id}/reply`
  only saved a `Message` before, so the prospect never received it. It now goes through the same gated
  path as `/send` — respects `outbound_enabled` (403 when paused), skips `do_not_contact`, and emails
  via the provider (subject `Re:`-prefixed). The frontend already handled the 403.
- **De-duplicated the OTP validation ladder** (BACKEND-GAPS §1). `verify-otp` and `reset-password`
  shared a copy-pasted check (lookup → expiry → lockout → compare → increment) that had drifted once.
  Extracted `_consume_otp(db, email, code, prefix, lock_label)` in `auth.py`; both endpoints now call it
  and apply only their channel-specific success action. Behavior-preserving; byte-compiled clean.
- **Typed the admin tree endpoints** (BACKEND-GAPS §1). `GET /api/admin/users/{id}`, `/campaigns/{id}`,
  and `/companies/{id}` returned raw dicts with no `response_model`, so a field rename would silently
  break the hand-maintained frontend types. Added Pydantic models mirroring each nested shape exactly
  (incl. nullability) and attached them as `response_model`s; validated round-trip key-exact.
- **Editable display name** (BACKEND-GAPS §1). `PATCH /api/auth/me` now also accepts `name`
  (`UserUpdate` strips + validates 1–120 chars); Settings → Profile got an editable Name field + Save
  (email + member-since stay read-only). Backend validation tested; `web` typechecks (`tsc --noEmit`).
- **Proper mark-as-read** (BACKEND-GAPS §1). `GET /api/conversations/{id}` no longer mutates read-state;
  added `POST /api/conversations/{id}/read`, and `ThreadView` now marks the thread read on open (then
  refreshes the inbox so the unread dot clears). Frontend method is `markThreadRead`. `web` typechecks.

### 2026-06-17 (consistency sweep — doc/code mismatch fixes)
- Ran a repo-wide consistency audit (backend schemas ↔ frontend types, status enums ↔ tone maps,
  config ↔ docs ↔ `.env.example`, agent registry, branding, models ↔ migration ALTERs, endpoints ↔
  client/nav). Most surfaces were already consistent; fixed the genuine mismatches:
  - **Rebrand lag** — `CLAUDE.md` and `BACKEND-GAPS.md` still called the product "Sellari AI" after the
    2026-06-16 rename; updated to **SynthSales** (code/UI/README were already correct).
  - **`FOLLOWUP_DELAY_DAYS`** — `config.py` defaults to 7 but the docs and `.env.example` said 10; kept
    the code value and corrected the docs/example to **7**.
  - **Log level** — `api/routers/auth.py` emitted `level="warning"` in 7 audit logs while the frontend
    `LogEntry` type and `seed.py` use `"warn"`; switched auth to `"warn"`.
  - **Follow-up notification copy** — `agents/tracking.py` said "no reply after {interval} min" but the
    trigger is the days-based delay; now reads `{followup_delay_days} days` (closes BACKEND-GAPS §2).
- No automated tests; the two changed backend files byte-compiled clean, frontend untouched.
- **Doc↔code drift sweep (follow-on).** Cleared `BACKEND-GAPS.md` §1 ("Docs ↔ code drift"), then swept
  the whole repo for similar drift and corrected it:
  - **README** live sections — architecture diagram & PRD status tables (7→8 agents; AI is
    Gemini→Groq→OpenRouter, not Claude; verify is MX + Verifalia/ZeroBounce; calendar is real Meet, not
    a stub; endpoint/router count 39/12→72/14; stale routes `/email-review`→`/outreach`,
    `/logs`→`/activity`, admin now done, Billing dropped); the intro design blurb (cream/ink/terracotta);
    and the "Not built yet" list (dropped already-shipped wiring/Admin/Calendar).
  - **`requirements.txt`** — dropped unused `anthropic`, added missing `dnspython`.
  - **CLAUDE.md** — documented the autonomous-reply feature (`User.autonomous_replies` +
    `services/auto_reply.py`) that contradicted the "never auto-sends" claim; `/ws` prefix + marketing-
    route nits.
  - **Backend comments/docstrings** — scheduler docstring (15-min poll vs 7-day trigger; two separate
    jobs), stale "ZeroBounce" verifier mentions (`orchestrator.py`, `companies.py`), the forgot-password
    "always 200" note, and the `.env.example` `SMTP_FROM` sample (→ SynthSales).
  - Pruned the two now-resolved items from `BACKEND-GAPS.md` §1 (empty → removed; sections renumbered).

### 2026-06-16 (sidebar = campaigns dropdown; campaign-preserving research chain)
- **Fixed the broken back-chain** company → research → campaign: the company detail
  (`/research/[id]`) now reads `?campaign=<id>` and its "Back to research" returns to
  `/research?campaign=<id>` (which offers "Back to campaign"), instead of the unscoped
  all-companies view that had no way back. The research table and the contacts table now pass
  `?campaign=<company.campaign_id>` when linking into a company. (`/research/[id]` got the standard
  Suspense + `useSearchParams` wrapper.)
- **Sidebar restructure** (per user): dropped **Research / Contacts / Outreach** as sidebar items —
  they're reached through a campaign's pipeline agents now — and added a **campaigns dropdown** under
  the Campaigns row (`CampaignsNavItem` in `Sidebar.tsx`): the label still links to the list, a
  chevron toggles a scrollable list of the user's campaigns (auto-expands on any `/campaigns/*`
  route, highlights the active campaign), each opening its pipeline. Conversations & Meetings stay.
- `nav.ts`: removed the three items + their now-unused icons, renumbered the eyebrows (Dashboard 01
  … Admin 09), and moved Research/Contacts/Outreach into `EXTRA_EYEBROWS` so the Topbar still labels
  those pages.
- Verified: `tsc --noEmit` clean; `eslint` clean on all changed files; `/campaigns`, `/campaigns/10`,
  `/research/1?campaign=10`, `/conversations`, `/meetings` all compile → 200.

### 2026-06-16 (back link on the campaign-scoped result pages)
- Completes the round-trip for the agent→results deep-links: each result page now shows a
  contextual `← Back to campaign` (→ `/campaigns/<id>`) **only when scoped to a specific
  campaign** — i.e. the state you land in from a pipeline agent click. On the default sidebar
  "All campaigns" view it shows nothing (keeps the top-level-sections-use-the-sidebar rule).
- Signal per page: Research keys off the URL `?campaign` param (its `selected` auto-falls-back to
  the newest campaign, so it can't be used); Contacts/Outreach/Conversations reuse their existing
  `selected` (null on "All"). Meetings isn't campaign-scoped, so it got a small Suspense refactor
  (`MeetingsInner` + `useSearchParams`) to read `?campaign` purely for the back link — and the
  `meeting` agent link now carries `?campaign=<id>` too (the `resultsLink` /meetings special-case
  was dropped).
- Verified: `tsc --noEmit` clean; `eslint` clean on all six changed files; `/research`,
  `/contacts`, `/outreach`, `/conversations`, `/meetings` compile → 200 both scoped and bare.

### 2026-06-16 (click a pipeline agent → its results)
- The campaign pipeline (`PipelineTimeline`) showed each agent's status + `completed/total` +
  Run/Re-run, but the rows were never clickable — no way to drill into what a stage produced
  (the `/pipeline` payload carries no per-agent results, and logs aren't tagged per agent).
- Each agent now **deep-links to the existing page that already holds its outputs**, scoped to the
  campaign via `?campaign=<id>` (no backend change — every target page already supported it):
  `enrichment`/`scoring` → Research, `employee_finder`/`email_guess_verification` → Contacts,
  `outreach` → Outreach, `tracking`/`reply_classifier` → Conversations, `meeting` → Meetings.
- Two affordances per row: the **agent name is a link**, plus an explicit **"View … →"** link that
  also shows on the non-runnable rows (`meeting`, `reply_classifier`). Mapping lives in a small
  `RESULTS` table + `resultsLink()` helper in `PipelineTimeline.tsx`.
- Verified: `tsc --noEmit` clean; `eslint` clean on the file; `/campaigns/10` recompiles → 200.

### 2026-06-16 (back navigation on drill-down pages)
- Added a shared **`BackLink`** ui primitive (`web/src/components/ui/BackLink.tsx`): an
  `ArrowLeft` + label `<Link>` to a fixed parent route (not `router.back()`, so it always lands
  on the list even when the page was opened from a deep link or a fresh tab).
- Wired a persistent "← Back to …" affordance onto every drill-down page, which previously only
  offered a way back from their not-found cards: the campaign pipeline (`/campaigns/[id]` →
  `/campaigns`), the new-campaign wizard (`/campaigns/new` → `/campaigns`, alongside its existing
  footer Cancel/Back step controls), and the company research detail (`/research/[id]` →
  `/research`, placed in the thin page wrapper so it shows in every load/error/loaded state).
- Migrated the two admin drill-downs (`/admin/users/[id]`, `/admin/campaigns/[id]`) off their
  inline `Link + ArrowLeft` markup onto the same `BackLink`, so all five share one implementation.
- Top-level sections keep the sidebar as their nav (no back button there, by design).
- Verified: `tsc --noEmit` clean; `/campaigns/new`, `/campaigns/1`, `/research/1` recompile and
  serve 200 in dev; no new lint findings.

### 2026-06-16 (rebrand → SynthSales)
- Renamed the product from **Sellari AI** to **SynthSales** across all user-facing surfaces.
- New logo art dropped in from `Logo/`: the sunrise emblem (`web/public/brand/emblem.png`,
  same 742×894 dims — clean swap) and the full lockup (now the social card via the
  `app/opengraph-image.png` convention, auto-generating `og:image`/`twitter:image`).
- Favicons via Next 16 file conventions: `app/favicon.ico`, `app/icon.svg`, `app/apple-icon.png`,
  plus a generated `app/manifest.ts` (PWA, cream `#f4efe6` theme) pointing at the
  `web-app-manifest-*.png` icons in `/public/brand`.
- `Wordmark` and the display/footer/auth wordmarks now read **Synth** (grotesque) +
  *Sales* (Instrument Serif italic) + terracotta dot, matching the lockup.
- Swept every user-facing "Sellari"/"Sellari AI" string (metadata, hero/FAQ copy, terms,
  privacy, about, docs, contact, dashboard, admin, footer, alt/aria labels) → "SynthSales".
- **Left internal** (invisible identifiers, like the backend's retained "reachly" name):
  `localStorage` keys `sellari_token` / `sellari_theme` — renaming would log users out / reset themes.
- Verified: `npm run build` passes; route table shows `/favicon.ico`, `/icon.svg`,
  `/apple-icon.png`, `/manifest.webmanifest`, `/opengraph-image.png` all served.

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

### 2026-06-08 (reply detection & intent — 8th agent + inbound poller)

Implemented `.claude/specs/05-reply-detection.md` (plan in `.claude/plans/`). Adds the inbound
half of engagement: read prospect replies, classify intent, and act. Reuses the Step 04
`do_not_contact` suppression. No new dependencies (Gmail read via httpx, IMAP via stdlib).

#### `reply_classifier` agent (`agents/reply_classifier.py`) → 8-agent registry
- New 8th agent **`reply_classifier` ("Reply Detection & Intent")**, registered **last** in
  `AGENT_REGISTRY` (`base.py`). Like `meeting` it is **NOT** part of `run_campaign_pipeline` and is
  **excluded from `RUNNABLE_KEYS`** — it fires on demand and on a timer, not from the per-agent
  Re-run buttons. It self-marks `Running`/`Idle`/`Error` via `self.mark`.
- Per user it reads inbound replies through `providers/inbound.py`, **de-dupes by
  `Message.external_id`**, classifies each new reply via `ai.complete_json`, and acts: a
  high-confidence **not-interested** sets `Contact.do_not_contact=True` + `Thread.stage="Closed"`
  (reusing Step 04 suppression); **interested / meeting-ready** advance the thread to `Negotiating`
  and surface; everything else only surfaces. **Never auto-sends; never opts a contact out without
  AI.** `main.py::lifespan` back-fills the `agent_configs` row so existing users see 8 agents.

#### `providers/inbound.py` (`InboundMailProvider`)
- Per-user **Gmail API read** (reconstructed from `User.gmail_read_token`, `gmail.readonly`) with a
  stdlib **`imaplib` global IMAP fallback**. Returns normalized `InboundMessage`s; returns `[]` and
  **never raises** on any error. No mailbox connected → no ingestion.

#### Per-user Gmail mailbox connect (`auth.py`)
- OAuth connect/callback/disconnect mirroring the calendar grant (offline consent for
  `gmail.readonly`, refresh token stored on `User.gmail_read_token`). `UserOut.mailbox_connected`
  reflects connection state.

#### API (`api/routers/conversations.py`)
- `POST /api/conversations/sync` runs `reply_classifier` on demand and returns a `SyncResult`.
- `PATCH /api/conversations/{id}/stage` — human override (validated stage; optional
  `clear_do_not_contact`) to **reopen a wrongly-Closed thread** and re-allow contact.
- Thread list/detail surface `last_intent` for the UI badge.

#### Scheduler (`workers/scheduler.py`)
- Second interval job polls the inbound reply reader (`reply_classifier`) every
  **`INBOUND_POLL_MINUTES`** (default 5) for every user with a connected mailbox, alongside the
  existing follow-up poll. Both honor `ENABLE_SCHEDULER`.

#### Frontend
- Conversations: **Sync inbox** button, per-thread **intent badge** (`last_intent`), and a
  **Reopen** control (calls the stage override with `clear_do_not_contact`).
- Settings: **Connect Gmail (read replies)** card (connect/disconnect mailbox).

#### Schema / migrations
- Four idempotent statements in `main.py::lifespan` (still no Alembic): `messages.external_id`
  (`VARCHAR`, **indexed**), `messages.intent`, `threads.provider_thread_id`, `users.gmail_read_token`
  (`TEXT`).

### 2026-06-08 (contact search enhancement — Step 06)

Implemented `.claude/specs/06-contact-search-enhancement.md` (plan in `.claude/plans/`). Improves the
employee finder's recall + precision on the free DuckDuckGo path; no new dependencies. Also restored
**Verifalia** as a paid verification provider (preferred when configured — more credits — with
ZeroBounce as fallback).

#### Escalating, role-gated finder (`providers/search.py`, `agents/employee_finder.py`)
- `find_linkedin_profiles` now runs an **escalating query set** — precise `site:linkedin.com/in/`,
  then simpler high-recall queries (`<brand> head of sales`, `<brand> sales`), then a founder/CEO
  fallback — across the legal name, brand, and domain-root aliases, stopping once enough candidates
  are found (with retry/backoff for throttling). It reads **SERP titles/snippets only** via the new
  `_parse_linkedin_title`; it never opens a LinkedIn page.
- A deterministic **commercial-role gate** (`_is_commercial_role`) drops non-sales titles (Marketing
  Manager, Investment Analyst, BD/Partnerships/Channel, engineering, product, finance, analysts)
  **before and independent of** the AI ranker, which now falls back to the role-gated list instead of
  raw search results. The dead `_role_is_unusable` was removed.

#### Manual add-contact (`api/routers/companies.py`, `web/.../CompanyDetail.tsx`)
- `POST /api/companies/{id}/contacts` (owner-scoped, `ContactCreate`) + an "Add contact" form on the
  company detail page, so a company the search can't crack is never a dead end.

#### Verified
- 42/42 deterministic logic tests + `npm run build`; **live DuckDuckGo check on HubSpot returned 6
  real sales contacts (CRO/GTM/President/CEO), zero junk**; add-contact route smoke (201 / blank→422).

### Notification bell: unread badge now re-syncs on read (2026-06-17)

**Symptom (reported):** the header bell's unread count was wrong — it never decremented when
notifications were marked read; it only refreshed on an incoming realtime frame or a hard browser
refresh. Backend push, `/ws` auth, the captured event loop, and event field names were all verified
intact first, so this was a client state-sync gap, not a transport break.

**Root cause:** the **Bell** (`shell/Bell.tsx`) and the **notifications page** each call
`useApi(() => api.notifications(), [])` as *independent* fetch instances with no shared state.
`mark_read` / `mark_all_read` (`api/routers/notifications.py`) only write the DB — no WS broadcast —
and the bell only refetches on mount or a `notification` frame, so reads on the page never reached
the bell. (The 50-row `GET /api/notifications` cap is a separate latent undercount, not in play here
— the busiest dev account sits at 28/34 unread.)

**Fix (surgical, client-only):**
- New `web/src/lib/notifications-bus.ts` — a tiny payload-less pub/sub mirroring `ws.ts`
  (`Set<Listener>`, unsubscribe return, per-listener try/catch isolation).
- `notifications/page.tsx` — a successful `markRead` / `markAll` now calls `reload()` **and**
  `emitNotificationsChanged()` (via `useAction`'s `onDone`, so it fires only on success; failures
  still roll the optimistic flip back).
- `shell/Bell.tsx` — subscribes via `onNotificationsChanged(reload)` so the badge re-syncs the
  instant a read fires, plus a `window` `focus` refetch for reads made elsewhere / while the socket
  was idle.

#### Verified
- `npm run build` clean (Turbopack compile + TypeScript, 32 routes incl. `/notifications`); only the
  pre-existing `metadataBase` warnings remain. No backend change.

**Follow-up — mark-read from the bell dropdown.** The dropdown's latest-5 rows were display-only
(`Bell.tsx` previously noted "Opening the dropdown marks nothing read"). Each **unread** row is now a
`<button>`: clicking marks just that one read — an optimistic `readIds` overlay (badge drops instantly,
dot greys), persisted via `api.markRead`, then `emitNotificationsChanged()` on the bus. Read rows stay
inert and the dropdown stays open. The notifications page now also **subscribes** to the bus
(`onNotificationsChanged(reload)`) and its `afterRead` is emit-only, so a dropdown read refreshes an open
page and vice-versa through one symmetric sync path. ✅ `npm run build` clean (32 routes).

### 2026-06-11 (Sellari AI — full frontend rebuild)

Implemented `.claude/specs/07-sellari-frontend-rebuild.md` (27-task plan in `.claude/plans/`).
The product is renamed **Sellari AI** (frontend-visible; backend internals keep the Reachly
names per `BACKEND-GAPS.md` §3). The entire `web/src` UI was demolished and rebuilt clean-slate
on the same stack (Next.js 16 + React 19 + Tailwind v4), styled after the `UI.webp` reference:
warm cream editorial minimalism — ink-on-cream, Schibsted Grotesk + Instrument Serif italic
display pairing, hairline borders, numbered eyebrows, dark band sections, giant footer wordmark.

#### Backend additions (Tasks 1–2 + review fixes)
- `UserOut.is_admin` exposed; **password-reset flow**: `POST /api/auth/forgot-password`
  (throttled, anti-enumeration generic response) + `POST /api/auth/reset-password`
  (OTP ladder mirroring verify-otp, `compare_digest` byte-hardened).
- `GET /api/notifications` gained `limit` (default 50, max 500).

#### Frontend (Tasks 3–25)
- **Brand**: emblem prepped via sharp (transparent 742×894), favicon set, `Wordmark`,
  token sheet in `globals.css` (`cream/paper/ink/ink-soft/ink-faint/line/terracotta/band/
  moss/amber/amber-deep/rust`), fonts via next/font.
- **Data layer**: api-types audited against `schemas.py`; admin/sync/stage/reset endpoints typed;
  token key renamed `reachly_token` → **`sellari_token`**; canonical tone maps in `constants.ts`
  (exhaustive via `satisfies`).
- **Primitives**: Button/Badge/Card/Field/Tabs/Chips + Modal/ConfirmModal (focus + scroll lock,
  busy-gated dismiss)/Toast/Skeleton/EmptyState/ErrorCard/StatNumeral.
- **Infra**: `useAction` mutation hook (keyed busy, overlap guard), reconnecting WS client
  (listener isolation, dead-token stop), network-tolerant AuthProvider with retry.
- **Shell**: grouped sidebar (admin gated), topbar with outbound chip + live notification bell.
- **Screens (21 routes)**: marketing landing/about/contact + emblem 404; auth (login w/
  verify-now flow, signup with live password policy, real forgot-password, OAuth callback);
  dashboard (stats/funnel/live activity); campaigns list + 4-step wizard (CSV validation,
  orphan-retry) + pipeline page (3s polling, run-all confirm, live WS logs); research list +
  company detail (score factors, signals, contacts, mail-domain); contacts (tri-state approval,
  opt-out confirm); outreach (letter preview, gated send w/ inline 403, double-send lock);
  conversations (inbox, AI suggestion, stage override, reopen-clears-opt-out, book-meeting w/
  inline 422); meetings; agents (enable confirm, run follow-ups); integrations health board;
  notifications center; live activity stream (pause/buffer); settings (kill-switch with
  enable-confirm, Google connections + callback handling); admin (user trees, campaign
  inspector w/ metric_confidence debug, typed-phrase deletes).
- **Dropped**: Billing (decided 2026-06-09). **Added vs old app**: Integrations, Activity, Admin.

#### Process + verification
- Subagent-driven: every task implemented by a fresh agent, then spec-compliance + code-quality
  reviewed; review fixes landed per task (e.g. modal focus management, backdrop-blur containing-
  block bug, OTP tail preservation, WS 1008 handling, CSV stale-read guard).
- ✅ `npm run build` (24 routes, typecheck clean) + `npm run lint` (zero errors) at every step.
- ✅ Zero "reachly" strings in `web/src`; all 22 routes serve HTTP 200 (404 for unknown) on dev.
- ✅ Live API smoke vs the running backend: login → me → dashboard → campaigns → pipeline
  (8 agents, keys match `AGENT_LABELS`) → companies/contacts/drafts/threads/meetings/agents/
  notifications/logs — all contracts hold; counts cross-checked against `.\db.ps1 health`.
- New backend gaps recorded in `BACKEND-GAPS.md` (reply endpoint never emails; admin user
  delete orphans meetings).

### 2026-06-13 (verified-contact directory + pipeline undo)

Implemented `.claude/plans/2026-06-13-contact-directory-and-pipeline-undo-design.md` (11-task
plan, subagent-driven on Opus 4.8). Two independent backend features.

**Verified-contact directory** (`verified_contacts` table + `services/contact_directory.py`).
A global, cross-tenant store of Verified contacts keyed by normalized company domain (name
fallback). The guess-verify agent upserts confirmed contacts (`record_verified`); the finder
walk seeds a known company straight from the directory (`seed_company`) and skips the web search —
and because seeded contacts are `Verified`, guess-verify's `_confirmed()` short-circuit also skips
the paid verification. Net: a previously-seen company costs 0 finder searches + 0 verify credits.

**Cascade-clear + one-level 24h undo** (`pipeline_snapshots` table + `services/snapshots.py` +
`services/pipeline_locks.py`). A forced per-agent re-run (and the full pipeline) first snapshots
the campaign's pipeline output (company agent-fields + contacts + drafts), then `clear_successors`
clears that agent's downstream outputs. `POST /api/campaigns/{id}/restore` rolls the snapshot back
and consumes it (one undo only); `GET …/snapshot` reports availability.
- **Conversation lock invariant**: a contact with a sent `Thread` is "locked" — no clear path
  (cascade re-run, full pipeline, finder force, restore) ever deletes it, so live conversations
  keep all their messages and keep replying. Meetings are inherently safe (no FK to contacts).
  Unsent drafts are cleared freely. Undo is blocked (409) once a campaign has any conversation.
- Expiry: 24h, lazy on read + an hourly scheduler purge job.

#### Process + verification
- Subagent-driven on Opus 4.8: fresh implementer per task; trivial tasks controller-reviewed,
  risky logic (snapshots restore, orchestrator cascade) verified with self-contained DB tests.
- ✅ Per-module import checks; ✅ restore remap round-trip (contacts + drafts re-linked); ✅ wired
  `run_agent_for_campaign(force)` → snapshot + cascade + re-run → undo restores; ✅ app boots clean
  (`/health` ok); ✅ HTTP smoke: `GET /snapshot` → `conversation_active`, `POST /restore` → 409 on
  the live seeded campaign.
- Makes `BACKEND-GAPS.md` §2 "24h cache before clear" real and implements CLAUDE.md's per-agent
  "clears successors except outreach/meeting" semantics.

#### Frontend (Undo UI)
- Added an **"Undo last run"** header button on the campaign pipeline page (`UndoLastRun.tsx`),
  rendered only when `GET /api/campaigns/{id}/snapshot` reports an available snapshot and no run is
  in flight. A `ConfirmModal` shows what it restores + the 24h window; confirm → `POST /restore` →
  reload campaign + pipeline + availability. Availability is re-checked after each run and once a run
  finishes. ✅ `npm run build` clean (typecheck + lint, 29 routes).

### 2026-06-17 (fix: domain-liveness false positives/negatives)

`search.py::domain_status` was misclassifying the modern web. Reproduced against live
sites: **linear/notion/stripe/vercel/figma all returned "parked"** and **openai/g2 returned
"dead"** — all perfectly live. Two root causes:
- **False "parked":** the check tag-stripped only `resp.text[:6000]` and required ≥200 visible
  chars. A modern JS site front-loads a huge `<head>` (preloads, inline CSS, scripts), so the
  first 6 KB strips to 17–117 visible chars — no size threshold can separate a real SPA shell
  (vercel = 17 chars) from a parking page.
- **False "dead":** `200 ≤ status < 400` was the only "responding" window, so a `403/401/429/503`
  (WAF/bot wall, e.g. Cloudflare) was bucketed with "no server exists." These then cascaded in
  enrichment: parked/dead skipped the AI, forced confidence to 10–15, and demoted the company
  below the `≥40` qualify bar — silently dropping good prospects.

**Fix** — reachability and content judged separately:
- **dead** = only a genuine connection failure/timeout on both schemes (after one retry). ANY HTTP
  status, incl. 4xx/5xx, means *reachable* → at least "live".
- Content judged on the **full document**: a parking marker → parked; else `len(body) ≥ 1500` or
  a JS app-shell marker (`__NEXT_DATA__`, `id="__next"/"root"`, …) → live; only a tiny static page
  with neither → parked (still catches the `vertexhealth.org → 114-byte /lander` case).
- Browser User-Agent + one retry on https (mirrors `_site_email_domain`); markers tightened —
  dropped bare `"godaddy"` (matches real GoDaddy-built sites) and `"coming soon"` (legit banners),
  added cPanel `"account has been suspended"`.

**Enrichment** (per user decision — *detect parked but don't skip AI*): a parked domain now runs
the full search+AI flow (search by company name can surface the real/current site); it only
annotates the parked warning + caps confidence ≤25 (step 4). Dead still skips the AI on the bulk
path (nothing to research). Removed the now-orphaned `_mark_parked_domain`.

✅ Verified 16/16: live network panel (7 sites now "live", dead control still "dead") + synthetic
branch tests (lander/cPanel/tiny → parked; app-shell/large body/403/503 → correct; connect-fail →
dead). ✅ Both modules import + `py_compile` clean.

## Landing & auth polish (user change-list)

A round of UI/copy refinements off a user-supplied change list:
- **Hero** — the headline's full stop now renders in terracotta; the long paragraph sub was
  replaced with one line ("Your next customer is already in the spreadsheet.").
- **Top nav** — the active link now underlines (terracotta). Route match for `/about` and
  `/contact`; IntersectionObserver scroll-spy for the `#how` / `#features` sections. New client
  component `MarketingNav` replaces the server-rendered desktop nav (mobile menu unchanged).
- **Accordions** (landing FAQ + contact) — the open state shows a Minus icon instead of a
  rotated Plus (which read as an ×): `Plus group-open:hidden` + `Minus hidden group-open:block`.
- **About** — dropped the `01–03` eyebrow numbering. (The crew-card `01–08` enumeration of the
  eight agents was left as-is — only the quoted eyebrow was removed.)
- **Em dashes** — removed from the 3 user-facing strings (autonomous-replies confirm copy, the
  campaign-wizard top-N hint); the only remaining `—` are 2 non-rendered code comments.
- **Dashboard** — Upcoming meetings moved to the top, above the stat numerals (most actionable).
- **Signup** — added "Continue with Google", mirroring login (`api.authProviders()` gate +
  `googleStartUrl()`). No backend change needed: `/google/callback` already creates Google users
  with a random unguessable hash, so a Google sign-up implies Google-only sign-in.

✅ `npm run build` green (32/32 routes). ✅ Visually verified hero, about (numbering + nav
underline), and signup (Google button) via headless screenshots.

## Scroll reveal, sliding auth, nav scroll-spy (user change-list 2)

- **Hero** — restored the long descriptive paragraph (an earlier pass had wrongly replaced
  it); "Your next customer is already in the spreadsheet." now sits as a serif-italic tagline
  above it, with its full stop in terracotta to match the headline.
- **Scroll reveal** — each landing section below the hero fades + lifts in as it enters the
  viewport via a `<Reveal>` wrapper (IntersectionObserver, fires once; animates only opacity +
  transform so it stays compositor-smooth, never laggy; honours `prefers-reduced-motion`).
- **Sliding auth** — `(auth)/layout.tsx` is now a client split-screen: sign-in keeps the form
  on the RIGHT; Create account slides it to the LEFT (and the quote panel the other way) with a
  500 ms transform transition. Collapses to the single full-width form on mobile (plain swap).
- **Top nav** — added **Home**; reordered so How it works precedes Product (matching page
  order). The active underline is now driven by an IntersectionObserver mid-line: it follows the
  section in view (Home / How it works / Product) and clears entirely in any section that isn't
  in the nav (Showcase, Testimonials, FAQ, CTA). About/Contact still underline by route.

✅ `npm run build` green (32/32). ✅ Verified nav order + Home underline, orange tagline stop,
and the login (form-right) / signup (form-left) slide end-states via headless screenshots.
