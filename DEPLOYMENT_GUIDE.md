# SynthSales — Step-by-Step Deployment Guide (Render)

A complete, click-by-click walkthrough to take SynthSales from a GitHub repo to a
live, working deployment — backend + frontend + database + Redis. Follow it top to
bottom; it should take **~20–30 minutes**.

> This is the hand-holding tutorial. `DEPLOY.md` is the shorter technical
> reference (and covers Railway/Fly alternatives). Everything here targets
> **Render** via the `render.yaml` blueprint already in the repo.

> 🔐 **Never paste real API keys into this file or any committed file.** This guide
> only names the variables; you copy their values from your local
> `backend/.env` (which is gitignored) straight into the Render dashboard.

---

## What gets deployed

The `render.yaml` blueprint creates **four** resources, wired together automatically:

| Resource | Name | What it is |
|---|---|---|
| Web service | `synthsales-api` | The FastAPI backend (Docker) |
| Web service | `synthsales-web` | The Next.js frontend (Docker, standalone) |
| PostgreSQL | `synthsales-db` | Managed database |
| Key Value | `synthsales-redis` | Redis for the rate limiter |

The backend migrates the database on boot (`alembic upgrade head`), so there's no
separate migration step. Both Docker images are already build-verified.

---

## Phase 0 — Before you begin

You need:
- ✅ The code on GitHub — **already done** (`origin/main`, repo
  `PulkitGarg31/Agentic-AI-Sales-CRM`). Confirm with `git status` (clean) and
  `git log origin/main..main` (no unpushed commits).
- ⬜ A **Render account** (free) — created in Phase 1.
- ⬜ Your **API keys** — already in your local `backend/.env`. Keep that file open;
  you'll copy values from it in Phase 3.
- ⬜ Your **Google OAuth client** (optional, for Google sign-in / Calendar / Gmail) —
  you already have `GOOGLE_CLIENT_ID`/`SECRET` in `.env`; Phase 6 adds the prod URLs.

---

## Phase 1 — Create your Render account

1. Open **https://render.com** in your browser.
2. Click **Get Started** / **Sign Up**.
3. Choose **Sign up with GitHub** (simplest — it lets Render see your repos).
4. When GitHub asks, **Authorize Render**. You can grant access to **all repos** or
   just **`Agentic-AI-Sales-CRM`** (select "Only select repositories" → pick it).
5. You land on the Render **Dashboard**.

---

## Phase 2 — Launch the Blueprint (creates all 4 resources)

1. On the dashboard, click **New +** (top-right) → **Blueprint**.
2. Render lists your GitHub repos. Find **`Agentic-AI-Sales-CRM`** and click
   **Connect**. (If you don't see it: click **Configure account / repositories**,
   grant Render access to the repo, come back.)
3. Render reads **`render.yaml`** from the repo root and shows a preview of the four
   resources (`synthsales-api`, `synthsales-web`, `synthsales-db`,
   `synthsales-redis`).
4. Give the blueprint a name (e.g. `synthsales`) and pick a **region** (e.g. Oregon).
   Use the **same region** for all if asked.
5. Click **Apply** / **Create Resources**.
6. Render starts provisioning. The **first build will likely fail or stall** because
   the secret env vars aren't set yet — **that's expected**. Continue to Phase 3.

> ℹ️ **If `type: keyvalue` errors** (older Render accounts call Redis `type: redis`):
> open `render.yaml`, change `type: keyvalue` → `type: redis`, commit, push, and
> re-sync the blueprint. Redis is optional — you can also delete that service and
> the `REDIS_URL` line and the app falls back to an in-memory limiter (fine for a
> single instance).

---

## Phase 3 — Add your secret environment variables

The blueprint auto-wires `SECRET_KEY` (generated), `DATABASE_URL`, and `REDIS_URL`.
You must manually add the secrets (marked `sync: false`). **Open your local
`backend/.env`** and copy each value across.

1. In the Render dashboard, open the **`synthsales-api`** service.
2. Go to the **Environment** tab.
3. For each variable below, find it (or click **Add Environment Variable**) and paste
   the value from your local `backend/.env`:

**Required** (deploy is useless without these):

| Variable | Where to get the value |
|---|---|
| `SERPER_API_KEYS` | From `backend/.env` (comma-separated pool). **Mandatory** — DuckDuckGo is blocked from datacenter IPs, so without Serper the pipeline finds nothing. |
| `GEMINI_API_KEY` | From `backend/.env` (or set `GROQ_API_KEY`/`OPENROUTER_API_KEY` — at least one AI key). |
| `SMTP_USERNAME` | Your Gmail address (from `backend/.env`). |
| `SMTP_PASSWORD` | Your 16-char Gmail App Password (from `backend/.env`). |
| `SMTP_FROM` | e.g. `SynthSales <youraddress@gmail.com>` (from `backend/.env`). |

**Recommended** (the product is much better with these):

| Variable | Why |
|---|---|
| `GROQ_API_KEY`, `OPENROUTER_API_KEY` | AI failover backends. |
| `VERIFALIA_USERNAME` + `VERIFALIA_PASSWORD` | Paid email verification (preferred). |
| `ZEROBOUNCE_API_KEY` | Email verification fallback. |
| `HUNTER_API_KEY` | Better contact-email discovery. |
| `ADMIN_EMAILS` | Your email → auto-granted admin + access approval on signup. **Set this to your own email** so you can use the gated features. |
| `CONTACT_INBOX` | Where the marketing contact form delivers (defaults to a sensible value if unset). |
| `IMAP_USERNAME` + `IMAP_PASSWORD` | Global inbound-reply fallback mailbox. |

**Leave these alone** (already set by the blueprint): `ENVIRONMENT=production`,
`SECRET_KEY` (auto-generated), `DATABASE_URL`, `REDIS_URL`, `TRUST_PROXY=true`,
`CORS_ORIGINS`, `FRONTEND_URL`, `SEARCH_ORDER`, `AI_PROVIDERS`, `SMTP_HOST`,
`SMTP_PORT`, the three `GOOGLE_*_REDIRECT_URI` values.

4. Click **Save Changes**. Render will redeploy `synthsales-api` automatically.

> The frontend service (`synthsales-web`) needs **no** secrets — only
> `NEXT_PUBLIC_API_URL`, which the blueprint already set.

---

## Phase 4 — Trigger / watch the first real deploy

1. Open **`synthsales-api`** → **Logs** (or **Events**).
2. You should see (in order): Docker build → `alembic upgrade head` running the
   migrations → `Application startup complete` → `Uvicorn running`.
3. Wait for the service status to go **Live** (green).
4. Do the same for **`synthsales-web`** — watch it build (`npm ci` → `next build`)
   and go **Live**.

If a build fails, jump to **Troubleshooting** at the bottom.

---

## Phase 5 — Get your live URLs (and fix them if the names were taken)

1. Each web service shows its public URL near the top, e.g.
   `https://synthsales-api.onrender.com` and `https://synthsales-web.onrender.com`.
2. **If both URLs are exactly those** → skip to Phase 6. 🎉
3. **If Render appended a random suffix** (because the name was taken — e.g.
   `synthsales-api-x7k2.onrender.com`), you must update the URLs the services
   reference. In **`synthsales-api` → Environment**, fix:
   - `CORS_ORIGINS` → your real **web** URL
   - `FRONTEND_URL` → your real **web** URL
   - `GOOGLE_REDIRECT_URI` → `https://<real-api-url>/api/auth/google/callback`
   - `GOOGLE_CALENDAR_REDIRECT_URI` → `https://<real-api-url>/api/auth/google/calendar/callback`
   - `GOOGLE_MAILBOX_REDIRECT_URI` → `https://<real-api-url>/api/auth/google/mailbox/callback`

   Then in **`synthsales-web` → Environment**, fix:
   - `NEXT_PUBLIC_API_URL` → your real **api** URL
   - ⚠️ **Then click "Manual Deploy → Clear build cache & deploy" on `synthsales-web`** —
     `NEXT_PUBLIC_API_URL` is baked into the frontend **at build time**, so it only
     takes effect after a rebuild.

---

## Phase 6 — Wire up Google sign-in / Calendar / Gmail (optional)

Skip if you don't need "Continue with Google", auto-Meet-link meetings, or inbound
Gmail reading. Email/password signup works without this.

1. Go to **https://console.cloud.google.com** → your project → **APIs & Services →
   Credentials**.
2. Open your **OAuth 2.0 Client ID** (the one whose value is `GOOGLE_CLIENT_ID` in
   `.env`).
3. Under **Authorized redirect URIs**, click **Add URI** and add all three (use your
   real api URL from Phase 5):
   - `https://synthsales-api.onrender.com/api/auth/google/callback`
   - `https://synthsales-api.onrender.com/api/auth/google/calendar/callback`
   - `https://synthsales-api.onrender.com/api/auth/google/mailbox/callback`
4. **Save**.
5. Make sure the **Google Calendar API** and **Gmail API** are enabled (APIs &
   Services → Enabled APIs → + Enable APIs).
6. ⚠️ **Scope verification:** `calendar.events` and `gmail.readonly` are
   sensitive/restricted scopes. Until your app passes Google's verification, only
   **Test users** you add (OAuth consent screen → Test users) can connect Calendar/
   Gmail. Add your own email as a test user for now.

---

## Phase 7 — Verify the deployment works (smoke test)

Do these in order — each proves a layer is wired:

1. **Backend health:** open `https://<api-url>/health` in your browser. You should
   see JSON `{"status":"ok","app":"SynthSales API","integrations":{...}}`. Check the
   `integrations` block — `search` should show `serper(N keys)`, `ai` should be a
   backend name, `email_mode` should be `smtp`.
2. **Docs are off:** `https://<api-url>/docs` should return **404** (disabled in
   production — correct).
3. **Frontend loads:** open your **web** URL. The landing page should render.
4. **Sign up:** go to `/signup`, register with **your email** (the one in
   `ADMIN_EMAILS`). You should receive a real **OTP email** (via SMTP). Enter it.
5. **You're admin:** because your email is in `ADMIN_EMAILS`, you're auto-approved and
   admin — so the gated features (outreach/meetings) are unlocked.
6. **Run the pipeline:** create a campaign, upload a CSV of target companies (you have
   `sample-companies.csv` locally in `extra/`), fill the product/target steps, and
   click **Run all agents**. Watch the pipeline rail — companies should get
   **researched and scored** (this proves Serper + AI are live end-to-end).
7. **Turn on sending only when ready:** Settings → Email → enable outbound (off by
   default — the safety kill-switch). Until then, no email reaches a prospect.

If all 7 pass, **you are fully deployed.** ✅

---

## Phase 8 — Day-2 notes (costs, redeploys, gotchas)

- **Auto-deploy on push:** by default Render redeploys when you push to `main`. Push
  code → Render rebuilds and migrates automatically.
- **Free-tier spin-down:** free web services **sleep after ~15 min idle**; the first
  request afterward takes ~30–60s to wake. Fine for a demo; upgrade to a paid instance
  to keep it always-on.
- **Free Postgres expires in ~30 days.** Upgrade the database plan before then if this
  is more than a demo, or you'll lose the data.
- **Scaling:** the image runs a single web worker (keeps the on-boot migration
  race-free). To handle more load, increase the **instance count** in Render (the
  Redis-backed rate limiter + advisory-locked scheduler are already multi-instance
  safe) — don't add in-process workers.
- **Secrets/rotation:** change a key in the Render Environment tab → it redeploys.
  Never commit real keys.
- **Custom domain:** Render service → **Settings → Custom Domains** → add your domain
  and follow the DNS instructions (free HTTPS). Remember to also add the domain to
  `CORS_ORIGINS`/`FRONTEND_URL` and the Google redirect URIs.

---

## Troubleshooting

**Backend won't boot — "SECRET_KEY must be overridden…"**
The blueprint sets `SECRET_KEY` via `generateValue: true`. If you see this, the
service is missing it — add a `SECRET_KEY` env var (≥32 random chars:
`python -c "import secrets; print(secrets.token_urlsafe(48))"`) and redeploy.

**Backend boots but the pipeline finds nothing / research is empty**
`SERPER_API_KEYS` isn't set or is out of credits. Check `/health` → `search` should
read `serper(N keys)`, not `none`. Add/refresh the keys.

**Frontend loads but every API call fails / CORS errors in the browser console**
`NEXT_PUBLIC_API_URL` (web) doesn't match the real api URL, or `CORS_ORIGINS` (api)
doesn't include the real web URL. Fix both (Phase 5), and **clear-build-cache redeploy
the web service** so the new `NEXT_PUBLIC_API_URL` is baked in.

**Web build fails at `npm ci`**
The lockfile must match `package.json` and the node major must match what generated it
(the Dockerfile is pinned to **node:24-alpine** / npm 11). If you changed deps locally,
run `npm install` in `web/`, commit the updated `package-lock.json`, and push.

**OTP email never arrives**
SMTP isn't configured or the App Password is wrong. `/health` → `email_mode` should be
`smtp` (not `console`). For Gmail you need a 16-char **App Password**, not your normal
password. Check the api **Logs** for send errors.

**Google sign-in / Calendar connect fails ("redirect_uri_mismatch" or "access blocked")**
The redirect URI in Google Cloud must **exactly** match the deployed
`GOOGLE_*_REDIRECT_URI` (Phase 6), and for Calendar/Gmail your account must be a
**Test user** until the app is verified.

**`type: keyvalue` not recognized in the blueprint**
Change it to `type: redis` in `render.yaml` (older Render naming), or remove the Redis
service + `REDIS_URL` entirely (the limiter falls back to in-memory).

**Migrations didn't run / table missing**
The backend runs `alembic upgrade head` on boot — check the api **Logs** for the
Alembic lines. A failed migration usually means `DATABASE_URL` is wrong; the blueprint
wires it from `synthsales-db` automatically, so don't override it.

---

## Quick reference — the whole flow in 8 lines

1. render.com → sign up with GitHub.
2. New + → Blueprint → connect `Agentic-AI-Sales-CRM` → Apply.
3. `synthsales-api` → Environment → add `SERPER_API_KEYS`, an AI key, SMTP creds,
   `ADMIN_EMAILS` (copy from local `backend/.env`) → Save.
4. Watch both services build → **Live**.
5. If names were suffixed, fix the URL env vars + clear-cache-redeploy web.
6. (Optional) add the 3 prod redirect URIs in Google Cloud.
7. Open the web URL → sign up with your admin email → verify OTP.
8. Create a campaign → upload a CSV → Run all agents → confirm research+scoring. Done.
