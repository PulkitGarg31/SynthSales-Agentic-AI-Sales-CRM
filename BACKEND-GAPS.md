# Backend gaps & follow-ups

Originally compiled 2026-06-10 while auditing the backend for the **SynthSales** frontend rebuild;
**last reviewed 2026-06-19.** Per this file's convention, resolved items are removed once done.

The **2026-06-19 deployment pass** closed the last remaining items (see the README progress log):

- **Rate limiter** — `core/ratelimit.py` now has an optional Redis backend (`REDIS_URL`) behind the
  same `check()`/`reset()` interface, with graceful fallback to the in-memory limiter. Buckets are
  shared across workers/instances when Redis is configured, so a multi-worker / multi-instance deploy
  is correct; the auth/contact limiter also became proxy-aware (`TRUST_PROXY` → keys on the
  `X-Forwarded-For` client IP behind a PaaS proxy).
- **"Reachly" → "SynthSales" rename** — fully retired the old name: `APP_NAME`, `DATABASE_URL`
  (db/user `synthsales`), the docker-compose container/user/db/volume, `db.ps1`, `.env`/`.env.example`,
  the `main.py` logger, and the `models.py` docstring. No internal "reachly" identifier remains.
- **Demo seed label** — the `services/seed.py` verification log row now leads with Verifalia (the
  preferred provider) instead of ZeroBounce.
- **Deployment / CI-CD** — production `backend/Dockerfile` + `web/Dockerfile` (Next.js standalone),
  a Render `render.yaml` blueprint (api + web + Postgres + Redis), and `DEPLOY.md`. The managed-Postgres
  `postgresql://` scheme is auto-normalized to the `+psycopg` driver in `config.py`.

## Remaining (intentional, non-blocking)

- [ ] **README progress log** — the dated `## Progress log` entries still mention old names/state
      ("Sellari AI", "Reachly", "Claude", "ZeroBounce-only", "7-agent"). **Kept deliberately** as a
      timestamped running record (the README is the context log). If a clean public README is wanted at
      launch, archive or trim the historical log — purely cosmetic, no code impact.
