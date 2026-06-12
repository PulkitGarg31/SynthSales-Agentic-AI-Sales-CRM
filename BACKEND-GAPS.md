# Backend gaps & follow-ups — pre-rebuild audit (2026-06-10)

Compiled while auditing the backend for the **Sellari AI** frontend rebuild.
Only §1 blocks the new frontend; everything else is here so it can be acted on later.

## 1 · Required by the new frontend — ✅ DONE with the rebuild (2026-06-11)

- [x] **Password-reset flow** — built exactly as suggested: `POST /api/auth/forgot-password` (always 200,
      throttled per IP+email) + `POST /api/auth/reset-password` (OTP ladder, policy validator, sets hash,
      clears OTP). Frontend page at `/forgot-password`; Settings links to it for logged-in changes.
      Verified end-to-end 2026-06-12 (request → DB code → reset → new login, old password rejected).
      Reset codes now go out as branded HTML email.
- [x] **`is_admin` in `UserOut`** — exposed; the sidebar/admin guard consume it.

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

- [x] **All USER-VISIBLE strings done (2026-06-12)**: `SMTP_FROM` (config default + live `.env`), OTP email
      subject/body, calendar event description, conversation message authors, default outreach footer,
      scraper user-agent. `services/seed.py` is clean.
- [ ] `APP_NAME` = "Reachly API" in `core/config.py` → "Sellari API" (surfaces in `/health` JSON and Swagger
      title only — no end user sees it; rename whenever).
- [ ] `.env.example` comments still say Reachly (`APP_NAME`, header comment, `SMTP_FROM` sample). Internal.
- [ ] **Recommendation: keep** the Docker container `reachly_postgres`, db/user `reachly`, volume `reachly_pgdata`
      for now — renaming them forces a data migration for zero functional gain; revisit at deploy time.
      (`db.ps1` hardcodes the container name if you ever do rename.)
- [x] Frontend-side rename (token key `sellari_token`, all copy, metadata, logo) — done in the rebuild.

## 4 · Functional gaps (post-rebuild candidates)

- [x] **OTP channel sharing** — FIXED 2026-06-12: codes now carry a `V`/`R` provenance prefix
      (`otp_code` widened to String(8) + idempotent ALTER in lifespan). `verify-otp` only accepts `V`
      codes, `reset-password` only `R` codes — verified live in all four directions (cross-channel
      rejected, own-channel accepted). A reset code can no longer flip `is_verified` or reach the
      `ADMIN_EMAILS` auto-grant. Codes issued before the fix are invalidated (users just request a new one).
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
- [ ] **`POST /api/conversations/{id}/reply` never sends real email** — it only appends a `Message` row
      (no `outbound_enabled` gate, no `email_provider.send` call), unlike `/send` which does both. The
      conversations composer therefore "sends" replies that no prospect ever receives. Either wire it
      through the same gated send path as `/send`, or label it a private note in the UI. (Found during
      the Task 21 frontend build — the UI defensively handles a 403 that is currently unreachable.)
- [ ] **Admin nested-tree endpoints return raw dicts** (no `response_model`) — frontend types for them are
      hand-maintained; schema drift won't be caught by anything.
- [ ] **`DELETE /api/admin/users/{id}` orphans Meetings** — campaigns/companies/contacts/drafts/threads
      cascade, but Meeting rows survive with a dangling owner. The admin UI's confirm copy says
      "…and meeting it owns" (per spec); either cascade meetings too or adjust the copy. (Found during
      the Task 25 frontend build.)

## 5 · Production-hardening checklist (pre-deploy)

- [ ] **Alembic migrations** — replace `create_all` + the idempotent `ALTER TABLE` block in `main.py::lifespan`.
- [ ] **WS hub is in-process** (`realtime/ws.py`) — a multi-worker deploy needs Redis pub/sub.
- [ ] **Rate limiter is in-memory per-process** (`core/ratelimit.py`) — resets on restart; Redis for multi-process.
- [ ] **Seeding always creates** `jordan@apexcloud.com` — gate it by environment.
- [ ] `ENVIRONMENT` must not be `development` in prod (it gates `dev_otp` exposure at signup).
- [ ] `SECRET_KEY` still has a dev default — must be overridden in prod.
