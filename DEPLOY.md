# Deploying SynthSales

Production deployment guide. The app is two services (FastAPI backend + Next.js
frontend) plus managed Postgres and an optional Redis. Everything is
containerized, so the same images run on Render, Railway, Fly.io, or any Docker
host.

- `backend/Dockerfile` — the API (`uvicorn`, binds `$PORT`). Migrations run on
  boot (`alembic upgrade head`), so there's no separate migrate step.
- `web/Dockerfile` — the frontend (Next.js 16 standalone, `node server.js`).
- `render.yaml` — a Render Blueprint that wires all of it together.

## Architecture & how the pieces connect

```
 Browser ──► synthsales-web (Next.js)
                  │  NEXT_PUBLIC_API_URL  (baked in at BUILD time)
                  ▼
            synthsales-api (FastAPI) ──► Postgres (DATABASE_URL)
                                    └──► Redis    (REDIS_URL, optional)
```

Two wiring rules matter:

1. **`NEXT_PUBLIC_API_URL` is build-time.** Next.js inlines it into the client
   bundle during `next build` — it is *not* read at runtime. It must be set
   before/at image build and point at the backend's public URL.
2. **`CORS_ORIGINS` (backend) must list the frontend's public URL,** and
   **`FRONTEND_URL`** must be it too (used for the OAuth post-login redirect).

## Deploy on Render (Blueprint — recommended)

1. Push this repo to GitHub/GitLab.
2. Render → **New + → Blueprint** → select the repo. Render reads `render.yaml`
   and provisions: `synthsales-db` (Postgres), `synthsales-redis` (Key Value),
   `synthsales-api`, and `synthsales-web`.
3. **Set the secret env vars** (everything marked `sync: false`) in each
   service's **Environment** tab — see the checklist below. `SECRET_KEY`,
   `DATABASE_URL`, and `REDIS_URL` are wired automatically.
4. Deploy. First boot runs the Alembic migrations and (because
   `ENVIRONMENT=production`) skips the demo seed and disables `/docs`.

> **If a service name was taken,** Render appends a random suffix, so the real
> URLs won't be `synthsales-api/web.onrender.com`. Update these to match the
> actual hostnames: backend `CORS_ORIGINS` + `FRONTEND_URL` +
> `GOOGLE_*_REDIRECT_URI`, and frontend `NEXT_PUBLIC_API_URL` (then redeploy the
> web service so the new value is rebuilt into the bundle).

> **Redis type:** `render.yaml` uses `type: keyvalue` (Render's current name).
> Older accounts may need `type: redis`. Redis is optional — delete that service
> and `REDIS_URL` and the limiter falls back to in-memory (fine at one web
> instance; see "Scaling").

## Required vs optional configuration

**Required for a working deploy:**

| Var | Why |
|-----|-----|
| `SECRET_KEY` | The app **refuses to boot** in non-dev without a strong key (≥32 chars). Render's `generateValue` handles it. |
| `DATABASE_URL` | Wired from the managed DB. (A bare `postgresql://` URL is auto-normalized to the `+psycopg` driver — paste any provider's string as-is.) |
| `SERPER_API_KEYS` | **Web search.** `ddgs` (DuckDuckGo) is rate-limited from datacenter IPs and fails on a deploy — without Serper the pipeline runs blind (no research, no contacts). Comma-separated pool. Get keys at https://serper.dev. |
| At least one AI key | `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENROUTER_API_KEY`. Without one, AI degrades to deterministic heuristics. |

**Strongly recommended:**

- **Email sending** — `SMTP_USERNAME` + `SMTP_PASSWORD` (Gmail App Password) +
  `SMTP_FROM`. Without it, email is "console" mode (logged, not delivered);
  signup OTPs won't reach users. (`outbound_enabled` is still off per-user by
  default — the kill-switch.)
- **Email verification** — `VERIFALIA_USERNAME`/`VERIFALIA_PASSWORD` (preferred)
  or `ZEROBOUNCE_API_KEY`. Without a paid key, contacts stay `Unknown` and
  outreach drafts nothing. `HUNTER_API_KEY` improves contact-email discovery.
- **`ADMIN_EMAILS`** — comma-separated; these accounts are auto-granted admin
  (and access-approval) on signup, so you can approve other users.

**Optional:**

- **Google OAuth** (`GOOGLE_CLIENT_ID`/`SECRET`) for "Continue with Google",
  per-user Calendar (real Meet links), and Gmail reply reading. Register the
  three `GOOGLE_*_REDIRECT_URI` values (pointing at the **deployed backend**) in
  the OAuth client's Authorized redirect URIs, and enable the Calendar + Gmail
  APIs. `calendar.events`/`gmail.readonly` are sensitive/restricted scopes —
  Google requires app verification before external production use.
- **IMAP** (`IMAP_HOST`/`USERNAME`/`PASSWORD`) — a single global inbound
  fallback when no per-user Gmail is connected.
- **`CONTACT_INBOX`** — where the marketing contact form delivers.

## Scaling (single vs multi-instance)

- The Dockerfile runs **one uvicorn worker**, which keeps the on-boot Alembic
  upgrade race-free. To handle more load, **scale the web service horizontally**
  (more instances) rather than adding in-process workers.
- For correctness across multiple instances, set **`REDIS_URL`** (the blueprint
  wires it) so rate-limit buckets are shared, and set **`TRUST_PROXY=true`** so
  the limiter keys on the real client IP behind the platform proxy. Both are set
  by default in `render.yaml`.
- The background scheduler's action jobs take a Postgres advisory lock per tick,
  so they never double-fire even with many instances running.

## Railway / Fly.io / other Docker hosts

The Dockerfiles are platform-agnostic; only the wiring differs.

- **Railway:** add the repo, create two services from `backend/` and `web/`
  Dockerfiles, add the Postgres (and Redis) plugins, then set the same env vars.
  Railway also exposes service vars to the Docker build, so `NEXT_PUBLIC_API_URL`
  works as a build arg.
- **Fly.io:** `fly launch` in each of `backend/` and `web/`, attach Fly Postgres
  (`fly postgres create` + `attach`), set secrets with `fly secrets set`. Pass
  the frontend's API URL at build: `fly deploy --build-arg NEXT_PUBLIC_API_URL=…`.
- Any host: build with `docker build`, ensuring the web image gets
  `--build-arg NEXT_PUBLIC_API_URL=https://your-api-host`.

## Local production-parity smoke test

```bash
# Backend image
docker build -t synthsales-api ./backend
docker run --rm -p 8000:8000 \
  -e ENVIRONMENT=production \
  -e SECRET_KEY=$(python -c "import secrets;print(secrets.token_urlsafe(48))") \
  -e DATABASE_URL=postgresql://synthsales:synthsales_dev_pw@host.docker.internal:5433/synthsales \
  synthsales-api
# → GET http://localhost:8000/health should return {"status":"ok", ...}

# Frontend image (API URL baked in at build)
docker build -t synthsales-web \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:8000 ./web
docker run --rm -p 3000:3000 synthsales-web
```

## Post-deploy verification

1. `GET https://<api-host>/health` → `200` with an `integrations` block showing
   which providers are live (e.g. `"search": "serper(N keys)"`, the AI backend,
   `email_mode`). `/docs` should be **404** (disabled in production).
2. Open the frontend, sign up, and confirm the OTP arrives (real SMTP) — or
   check logs for the console OTP if email isn't configured yet.
3. Create a campaign, upload `sample-companies.csv`, run the pipeline, and
   confirm companies get researched + scored (proves Serper + AI are wired).
