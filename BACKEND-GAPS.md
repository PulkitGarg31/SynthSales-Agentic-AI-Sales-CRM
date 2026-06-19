# Backend gaps & follow-ups

Originally compiled 2026-06-10 while auditing the backend for the **SynthSales** frontend rebuild;
**last reviewed 2026-06-19.** Per this file's convention, resolved items are removed once done — the
2026-06-19 deployment-hardening pass closed every functional gap plus the config/security checklist
(SECRET_KEY boot-guard, ENVIRONMENT enforcement, env-gated seeding, forgot-password oracle, pagination,
user-level delete, logout/revocation, Alembic migrations, WS→polling, scheduler multi-worker guard — see
the README progress log for the details).

Everything below is what **remains**: all non-blocking and deferred by choice, each with a note on why
and when to revisit.

## 1 · Multi-worker / horizontal scale (moot at single-worker)

- [ ] **Rate limiter is in-memory per-process** (`core/ratelimit.py`) — the buckets live in memory, so
      they reset on restart and, under multiple workers, each process keeps its own (the effective limit is
      multiplied by the worker count). Fine at the current single-worker target; back it with Redis for a
      multi-process deploy. This is now the *only* remaining per-process concern — the WebSocket hub was
      removed and the scheduler's action jobs are advisory-locked.

## 2 · Schema polish (optional)

- [ ] **Standardize `JSON` → `JSONB`** — `companies.score_factors` and `pipeline_snapshots.payload` are
      still generic `JSON`, while the other document columns are `JSONB`. One clean Alembic migration would
      make them consistent (JSONB is indexable and dedups keys). Cosmetic; no functional impact.

## 3 · Naming / cosmetic consistency (revisit at deploy)

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
