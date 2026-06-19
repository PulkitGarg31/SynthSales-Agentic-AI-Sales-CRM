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
- [ ] **WS pushes only `log` + `notification`** — *deferred this pass.* No entity/agent-progress events,
      so the pipeline page still polls `GET /api/campaigns/{id}/pipeline` while agents run. Candidate:
      push per-agent progress over WS. (Pure enhancement; polling works.)
- [x] **User-level delete for companies/contacts** — added 2026-06-19. `DELETE /api/companies/{id}` and
      `DELETE /api/contacts/{id}` (owner-scoped; children cascade). Blocked with `409` if the target has
      a live conversation (a sent `Thread`), overridable with `?force=true`. Threads are `SET NULL`, never
      destroyed.
- [x] **Logout / token revocation** — added 2026-06-19. Tokens now carry a `jti`; `POST /api/auth/logout`
      records it in a `revoked_tokens` blocklist, `get_current_user` rejects revoked tokens, and the
      scheduler purges expired rows hourly. The web sign-out calls it. **Refresh tokens remain deferred**
      (the 7-day token + revocation is sufficient for now).

## 2 · Production-hardening checklist (pre-deploy)

- [ ] **Alembic migrations** — *deferred this pass.* Still `create_all` + the idempotent `ALTER TABLE`
      block in `main.py::lifespan` (`alembic` is a dependency but unused). Fine for now; adopt when schema
      churn or a team makes raw ALTERs risky.
- [ ] **WS hub is in-process** (`realtime/ws.py`) — *deferred: moot at single-worker.* A multi-worker /
      multi-instance deploy would need Redis pub/sub (and would also need the in-process APScheduler moved
      to a single leader, or it double-fires follow-ups + inbound polls). Revisit only if scaling out.
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
