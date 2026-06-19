# Backend gaps & follow-ups

Originally compiled 2026-06-10 while auditing the backend for the **SynthSales** frontend rebuild;
last reviewed **2026-06-19**. Items marked `[x]` were closed in the **2026-06-19 deployment-hardening
pass** (target: a **single-worker** deploy — see `.claude/plans/2026-06-19-deployment-hardening.md`).
The remaining `[ ]` items are deliberately deferred (none block the app today); each carries a note on
why.

## 1 · Functional gaps (post-rebuild candidates)

- [x] **`email_sent` enumeration oracle on `POST /forgot-password`** — fixed 2026-06-19. Outside
      development the endpoint now always returns `email_sent: true` (+ `dev_otp: null`), so known and
      unknown emails are indistinguishable. Dev keeps the real values + OTP for testing.
- [x] **Pagination on list endpoints** — added 2026-06-19. Companies (`/api/campaigns/{id}/companies`),
      contacts, emails, and conversations accept optional `limit` (1–500) + `offset` via a shared
      `app/api/pagination.py::Page` dependency. Non-breaking: responses stay plain arrays; an omitted
      `limit` falls back to a 500-row safety ceiling. (`notifications` already took a `limit`; `/api/logs`
      already did.) True UI pagination (envelope + load-more) is still a future enhancement.
- [x] **Realtime push removed in favor of polling** (2026-06-19). The WebSocket hub only ever carried
      `log` + `notification`; rather than extend it with agent-progress events, the whole WS layer was
      deleted and the UI now polls REST everywhere (notifications 30s, activity + campaign live-log 5s,
      pipeline 3s). Simpler, and it removed the multi-worker WS blocker below.
- [x] **User-level delete for companies/contacts** — added 2026-06-19. `DELETE /api/companies/{id}` and
      `DELETE /api/contacts/{id}` (owner-scoped; children cascade). Blocked with `409` if the target has
      a live conversation (a sent `Thread`), overridable with `?force=true`. Threads are `SET NULL`, never
      destroyed.
- [x] **Logout / token revocation** — added 2026-06-19. Tokens now carry a `jti`; `POST /api/auth/logout`
      records it in a `revoked_tokens` blocklist, `get_current_user` rejects revoked tokens, and the
      scheduler purges expired rows hourly. The web sign-out calls it. **Refresh tokens remain deferred**
      (the 7-day token + revocation is sufficient for now).

## 2 · Production-hardening checklist (pre-deploy)

- [x] **Alembic migrations** — adopted 2026-06-19. `main.py::lifespan` runs `alembic upgrade head` on boot
      (`_run_migrations()`); `create_all` + the idempotent `ALTER TABLE` block are gone. Baseline revision
      `ab18fda68ae2` captures the prior schema (existing DBs `stamp`-ed to it); `alembic/env.py` pulls URL +
      metadata from app settings/models. Adopting it also fixed a latent missing `ix_users_google_sub`
      index (the old ALTER retrofit added the column but never its index). *Optional follow-up:* standardize
      `companies.score_factors` + `pipeline_snapshots.payload` from `JSON` to `JSONB` (one clean migration).
- [x] **WS hub is in-process** — resolved 2026-06-19 by removing the WebSocket layer entirely (the UI
      polls REST instead), so there's no socket left to back with Redis. The other multi-worker hazard —
      the in-process APScheduler double-firing follow-ups + inbound polls — is now guarded too: the two
      action jobs take a Postgres advisory lock per tick (`pg_try_advisory_xact_lock`), so any number of
      scheduler processes run each tick exactly once. (A dedicated scheduler process is still the cleaner
      shape at real horizontal scale, but no longer required for correctness. The rate-limiter below is the
      remaining per-process item.)
- [ ] **Rate limiter is in-memory per-process** (`core/ratelimit.py`) — *deferred: moot at single-worker.*
      Resets on restart; needs Redis only for multi-process.
- [x] **Seeding gated by environment** — fixed 2026-06-19. The `jordan@apexcloud.com` demo user is seeded
      only when `environment == "development"` or the new `SEED_DEMO_DATA` flag is set. Prod boots clean.
- [x] **`ENVIRONMENT` must not be `development` in prod** — enforced 2026-06-19. The env now gates
      `dev_otp` (already), the demo seed, AND interactive docs (`/docs`, `/redoc`, `/openapi.json` are
      disabled when `environment != "development"`).
- [x] **`SECRET_KEY` dev default** — guarded 2026-06-19. `main.py::lifespan` now **refuses to boot** when
      `environment != "development"` and `SECRET_KEY` is the dev default / empty / shorter than 32 chars.

## 3 · Deferred naming / cosmetic consistency (revisit at deploy)

*Deferred this pass (chose "skip naming" for the deployment work); none are user-facing bugs.*

- [ ] **Internal "Reachly" identifiers** — the backend deliberately keeps the old name:
      - *Needs a data migration* (do at deploy, if at all): `docker-compose.yml` container
        `reachly_postgres`, `POSTGRES_USER`/`POSTGRES_DB` `reachly`, volume `reachly_pgdata`, and the
        matching `DATABASE_URL` (db `reachly`) in `config.py` / `.env.example`.
      - *Cosmetic, no migration:* `config.py` `APP_NAME="Reachly API"` (only surfaces in `/health` JSON
        + Swagger title), the `main.py` logger name `"reachly"`, the `.env.example:2` header comment
        ("# Reachly backend configuration"), and the `models.py:1` module docstring
        ("…for the Reachly platform"). Safe to rename to SynthSales anytime.
- [ ] **Demo seed data** — `services/seed.py` activity-log row reads `"ZeroBounce: … → Unknown."`;
      ZeroBounce is now the *fallback* (Verifalia preferred). Update the demo entry to lead with the
      preferred provider for consistency.
- [ ] **README progress log** — the dated `## Progress log` entries still mention old names/state
      ("Sellari AI", "Reachly", "Claude", "ZeroBounce-only", "7-agent"). Kept as a timestamped record;
      if a clean public README is wanted at launch, archive or trim the log.
