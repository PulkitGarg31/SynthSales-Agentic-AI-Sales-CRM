# Backend gaps & follow-ups — pre-rebuild audit (2026-06-10)

Compiled while auditing the backend for the **Sellari AI** frontend rebuild.
Only §1 blocks the new frontend; everything else is here so it can be acted on later.

## 1 · Required by the new frontend (small — do with the rebuild)

- [ ] **Password-reset flow** — no reset endpoint exists anywhere; the old forgot-password page was a dead form.
      Suggested shape (reuses existing OTP machinery + rate limits in `api/routers/auth.py`):
      `POST /api/auth/forgot-password {email}` → always 200 (no account enumeration), throttled per IP+email,
      generates OTP into the existing `otp_code`/`otp_expires_at` fields and emails it;
      `POST /api/auth/reset-password {email, code, new_password}` → validates code (same lockout counter),
      runs the existing password-policy validator, sets hash, clears OTP.
      Also covers logged-in "change password" (Settings links to the same flow). **Effort: S**
- [ ] **Expose `is_admin` in `UserOut`** (`schemas.py`) — the sidebar can't know whether to show `/admin` without it. **Effort: XS**

## 2 · Docs ↔ code drift

- [ ] **CLAUDE.md describes a "24h cache before clear"** on `run_campaign_pipeline` — not implemented anywhere in
      `agents/orchestrator.py`. Decide: implement (snapshot cleared rows so an accidental run is restorable) or
      correct CLAUDE.md. The new UI ships the required confirmation warning either way.
- [ ] **Follow-up notification copy bug** — `agents/tracking.py` notification text says "no reply after
      {FOLLOWUP_INTERVAL_MINUTES} min" but the real trigger is `FOLLOWUP_DELAY_DAYS` (days). Cosmetic.
- [ ] **README staleness** — early sections still say "7-agent pipeline" and Claude/ZeroBounce-only providers
      (later progress-log entries are correct). Gets rewritten in the rename sweep anyway.
- [ ] **`requirements.txt` staleness** — still lists `anthropic` (provider was removed); `dnspython` is imported by
      `providers/verification.py` (MX lookups) but not pinned.

## 3 · Rename sweep (Reachly → Sellari AI) — backend side

- [ ] `APP_NAME` = "Reachly API" in `core/config.py` → "Sellari API" (surfaces in `/health` and Swagger title).
- [ ] `SMTP_FROM` default "Reachly <…>" in `core/config.py` / `.env.example` / live `.env`.
- [ ] `.env.example` comments & branding mentions.
- [ ] `services/seed.py` — any Reachly-branded demo strings.
- [ ] **Recommendation: keep** the Docker container `reachly_postgres`, db/user `reachly`, volume `reachly_pgdata`
      for now — renaming them forces a data migration for zero functional gain; revisit at deploy time.
      (`db.ps1` hardcodes the container name if you ever do rename.)
- Frontend-side rename (token key `sellari_token`, all copy, metadata, logo) is part of the rebuild itself.

## 4 · Functional gaps (post-rebuild candidates)

- [ ] **OTP channel sharing** — signup verification and password reset share `users.otp_code` with no
      provenance tag, so a reset-issued code also passes `POST /verify-otp` (flipping `is_verified` and,
      for `ADMIN_EMAILS` addresses, triggering the admin auto-grant via the forgot-password path) and a
      signup code works at `reset-password`. Inbox control is proven either way, but tag the codes
      (e.g. `R`/`V` prefix + widen `otp_code` to String(8) + idempotent ALTER) if the flows ever diverge.
- [ ] **`email_sent` is a soft enumeration oracle** on `POST /forgot-password` when real SMTP is
      configured (known email → true, unknown → false). Register already leaks existence, so no new
      info today — but in production consider always returning `email_sent: true` outside development.
- [ ] **OTP validation ladder duplicated** between `verify_otp` and `reset_password` (it already drifted
      once on lockout logging). On a third OTP consumer, extract a shared `_consume_otp(user, code)` helper.
- [ ] No **profile update** endpoint — name/email are immutable; only `outbound_enabled` is PATCHable.
      Settings → Profile stays read-only until this exists.
- [ ] No **pagination** on list endpoints (companies/contacts/emails/conversations/notifications) — only
      `/api/logs` has a `limit` (≤500). Fine at demo scale; will hurt at thousands of rows.
- [ ] **WS pushes only `log` + `notification`** — no entity/agent-progress events, so the pipeline page must poll
      `GET /api/campaigns/{id}/pipeline` while agents run. Candidate: push per-agent progress over WS.
- [ ] No **user-level delete** for companies/contacts (Exclude status or admin delete only).
- [ ] No **logout / token revocation / refresh** — stateless 7-day JWT; client just drops the token.
- [ ] `GET /api/conversations/{id}` **marks the thread read as a GET side effect** — consider an explicit PATCH.
- [ ] **Admin nested-tree endpoints return raw dicts** (no `response_model`) — frontend types for them are
      hand-maintained; schema drift won't be caught by anything.

## 5 · Production-hardening checklist (pre-deploy)

- [ ] **Alembic migrations** — replace `create_all` + the idempotent `ALTER TABLE` block in `main.py::lifespan`.
- [ ] **WS hub is in-process** (`realtime/ws.py`) — a multi-worker deploy needs Redis pub/sub.
- [ ] **Rate limiter is in-memory per-process** (`core/ratelimit.py`) — resets on restart; Redis for multi-process.
- [ ] **Seeding always creates** `jordan@apexcloud.com` — gate it by environment.
- [ ] `ENVIRONMENT` must not be `development` in prod (it gates `dev_otp` exposure at signup).
- [ ] `SECRET_KEY` still has a dev default — must be overridden in prod.
