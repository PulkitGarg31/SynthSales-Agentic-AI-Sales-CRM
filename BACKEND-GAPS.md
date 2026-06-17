# Backend gaps & follow-ups

Originally compiled 2026-06-10 while auditing the backend for the **SynthSales** frontend rebuild;
last reviewed **2026-06-17** (resolved items removed). Nothing below blocks the app today — these are
known non-blocking gaps and pre-deploy hardening items, kept so they can be acted on later.

## 1 · Docs ↔ code drift

- [ ] **README staleness** — the architecture diagram (`README.md:50-52`), the env/feature blurb
      (`:94-95`), and the status table (`:128-135`) still say "7-agent pipeline", "ai (Claude)" /
      `ANTHROPIC_API_KEY`, "ZeroBounce via REST" (no Verifalia), and "Calendar … is a stub". The later
      progress-log entries are correct (Gemini→Groq→OpenRouter at `:348-356`; Verifalia-preferred at
      `:734-735`; real per-user Google Calendar/Meet). Update the top sections to 8 agents (add
      `reply_classifier`), the AI chain, Verifalia→ZeroBounce, and real calendar booking.
- [ ] **`requirements.txt` staleness** — still lists `anthropic` (`requirements.txt:28`; provider
      removed, AI chain is Gemini/Groq/OpenRouter). `dnspython` is a hard dependency (imported as
      `dns.resolver` at `providers/verification.py:24` for MX lookups) but is **absent** from
      `requirements.txt` — add it. Also `alembic` is listed (`:9`) but unused (no migrations — see §3).

## 2 · Functional gaps (post-rebuild candidates)

- [ ] **`email_sent` is a soft enumeration oracle** on `POST /forgot-password` when real SMTP is
      configured (known email → true, unknown → false). Register already leaks existence, so no new
      info today — but in production consider always returning `email_sent: true` outside development.
- [ ] **OTP validation ladder duplicated** between `verify_otp` and `reset_password` (it already drifted
      once on lockout logging). On a third OTP consumer, extract a shared `_consume_otp(user, code)` helper.
- [ ] No **profile update** endpoint — name/email are immutable; only `outbound_enabled` /
      `autonomous_replies` are PATCHable. Settings → Profile stays read-only until this exists.
- [ ] No **pagination** on list endpoints — companies (`campaigns.py:121`), contacts (`contacts.py:19`),
      emails (`emails.py:25`), and conversations (`conversations.py:74`) still return all rows.
      (`notifications` now takes a `limit` ≤500, and `/api/logs` already did.) Fine at demo scale; will
      hurt at thousands of rows.
- [ ] **WS pushes only `log` + `notification`** — no entity/agent-progress events, so the pipeline page must
      poll `GET /api/campaigns/{id}/pipeline` while agents run. Candidate: push per-agent progress over WS.
- [ ] No **user-level delete** for companies/contacts (Exclude status or admin delete only).
- [ ] No **logout / token revocation / refresh** — stateless 7-day JWT; client just drops the token.
- [ ] `GET /api/conversations/{id}` **marks the thread read as a GET side effect** — consider an explicit PATCH.
- [ ] **`POST /api/conversations/{id}/reply` never sends real email** — it only appends a `Message` row
      (no `outbound_enabled` gate, no `email_provider.send` call), unlike `/send` which does both. The
      conversations composer therefore "sends" replies that no prospect ever receives. Either wire it
      through the same gated send path as `/send`, or label it a private note in the UI. (The UI
      defensively handles a 403 that is currently unreachable.)
- [ ] **Admin nested-tree endpoints return raw dicts** (no `response_model`) — `GET /api/admin/users/{id}`
      and `GET /api/admin/campaigns/{id}`; their frontend types are hand-maintained, so schema drift
      won't be caught by anything. (The flat list endpoints do have models.)
- [ ] **`DELETE /api/admin/users/{id}` does not remove the user's Meetings** — `Meeting` has no owner FK
      and sits outside the User→Campaign→Company cascade; its only link is `campaign_id`
      (`ondelete=SET NULL`), so deleting a user nulls each meeting's `campaign_id` and leaves an
      ownerless `Meeting` row behind. Either give `Meeting` an owner FK with cascade (or delete meetings
      explicitly in `delete_user`), or adjust the admin UI confirm copy that claims meetings are removed.

## 3 · Production-hardening checklist (pre-deploy)

- [ ] **Alembic migrations** — replace `create_all` + the idempotent `ALTER TABLE` block in
      `main.py::lifespan` (`alembic` is already a dependency but unused).
- [ ] **WS hub is in-process** (`realtime/ws.py`) — a multi-worker deploy needs Redis pub/sub.
- [ ] **Rate limiter is in-memory per-process** (`core/ratelimit.py`) — resets on restart; Redis for multi-process.
- [ ] **Seeding always creates** `jordan@apexcloud.com` — gate it by environment.
- [ ] `ENVIRONMENT` must not be `development` in prod (it gates `dev_otp` exposure at signup).
- [ ] `SECRET_KEY` still has a dev default — must be overridden in prod.
