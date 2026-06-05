# Spec: Registration

> **Status note:** Registration is **already implemented and working** in the codebase.
> This spec serves two purposes: (1) document the as-built flow as the canonical Step 01
> record, and (2) enumerate the remaining **gaps** so they can be picked up as follow-up work.
> Sections below are tagged **[AS-BUILT]** (already exists — verify, don't rebuild) or
> **[GAP]** (not yet implemented).

## Overview

Registration is the front door of the Reachly roadmap: it lets a company representative create an
account with name / work email / password, then proves ownership of that email via a 6-digit OTP
before any session token is issued. It exists at Step 01 because every downstream feature
(campaigns, the 8-agent pipeline, conversations, meetings) is scoped per-user and gated behind an
authenticated, **verified** account. The flow is email-provider-agnostic: with no SMTP/Gmail
credentials the backend runs in console mode and surfaces a `dev_otp` to the UI so registration is
fully testable with zero external setup.

## Depends on

- **None.** Registration is the first roadmap step and the root of the per-user data model. It only
  depends on the base stack already present in the initial commit: FastAPI + SQLAlchemy `User`
  model, `core/security.py` (hashing + JWT), the `email.py` provider, and the Next.js `(auth)`
  route group.

## Routes

**[AS-BUILT]** — all three already exist in `backend/app/api/routers/auth.py`:

- `POST /api/auth/register` — create unverified user, hash password, issue + email a 6-digit OTP
  (15-min expiry); returns `RegisterOut` (`email_sent`, and `dev_otp` in development). — **public**
- `POST /api/auth/verify-otp` — validate `{email, code}`, mark `is_verified`, clear OTP, auto-grant
  admin if email ∈ `ADMIN_EMAILS`, return a JWT `Token`. — **public**
- `POST /api/auth/resend-otp` — regenerate + resend the OTP for an existing user. — **public**

Related/adjacent (already exist, not part of registration proper): `POST /api/auth/login`,
`POST /api/auth/token` (OAuth2 for Swagger), `GET /api/auth/me`, `PATCH /api/auth/me`.

**[GAP]** routes that would close the gaps below:
- `GET /api/auth/google/login` + `GET /api/auth/google/callback` — Google OAuth signup/sign-in
  (the "Sign up with Google" button is currently inert). — **public**

## Database changes

**No database changes.** Verified against the `User` model in `backend/app/models.py` — every field
the flow needs already exists:
- `hashed_password: String(255)`
- `is_verified: Boolean default False`
- `otp_code: String(6) nullable`
- `otp_expires_at: DateTime(timezone) nullable`
- `is_admin: Boolean default False`, `outbound_enabled: Boolean default False`

(Per CLAUDE.md there is no Alembic; columns are created by `Base.metadata.create_all` plus idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `main.py::lifespan`. No new column → no new ALTER.)

**[GAP]** If Google OAuth is implemented, consider a nullable `google_sub` / `auth_provider` column
(plus matching idempotent ALTER) so OAuth users without a password can be distinguished. Not required
for the as-built flow.

## Templates

This is a Next.js + FastAPI app, not a server-rendered template stack — "templates" maps to React
route pages under `web/src/app/(auth)/`.

- **Create:** None for the as-built flow (all pages exist).
- **Modify (only if closing gaps):**
  - `web/src/app/(auth)/signup/page.tsx` — wire the currently-inert "Sign up with Google" button to
    the OAuth route; optionally add client-side password-strength feedback.

## Files to change

For documenting the as-built flow: **none** — this spec is a record, not a code change.

For the **[GAP]** follow-ups only:
- `backend/app/api/routers/auth.py` — add rate-limiting to `register`/`resend-otp`; add Google OAuth
  routes.
- `backend/app/schemas.py` — add password-policy validation to `RegisterIn` (e.g. min length).
- `web/src/app/(auth)/signup/page.tsx` — Google button handler + password-strength UI.
- `web/src/lib/api.ts` — client method(s) for the OAuth start route if needed.

## Files to create

For the as-built flow: **none**.

For the **[GAP]** follow-ups only:
- `backend/app/providers/oauth.py` (or similar) — Google OAuth token exchange, degrading gracefully
  with no client credentials (consistent with the providers pattern in CLAUDE.md).

## New dependencies

**No new dependencies** for the as-built flow. Hashing uses `passlib[pbkdf2_sha256]` and JWT/email are
already wired.

**[GAP]** Google OAuth would add an HTTP-based OAuth flow. Per CLAUDE.md's "no SDKs, call REST with
`httpx`" convention, prefer implementing the token exchange with the already-present `httpx` rather
than pulling in `authlib` — i.e. ideally still **no new dependency**.

## Rules for implementation

This codebase has its own conventions — follow them, **not** generic defaults:
- **Use SQLAlchemy 2.0** (`Mapped`/`mapped_column`) — this project is ORM-based. Do **not** hand-write
  SQL in app code.
- **Password hashing is `passlib` `pbkdf2_sha256`** via `core/security.py::hash_password` (chosen so
  no native bcrypt wheel is needed on Python 3.14). Do **not** introduce werkzeug or bcrypt.
- **Never return a session token to an unverified user.** `login`/`token` must 403 until
  `is_verified` is True; only `verify-otp` issues the first token.
- **OTP must never be logged to a real inbox-equivalent in production.** `dev_otp` is exposed *only*
  when `settings.environment == "development"` and email wasn't actually delivered. Preserve that
  guard exactly.
- **Email degrades gracefully** — console mode is the zero-credential default; registration must
  succeed (and remain testable via `dev_otp`) even with no SMTP/Gmail keys. Signup OTP is **exempt**
  from the `outbound_enabled` kill-switch (per CLAUDE.md), so it always sends.
- **Use `add_log()` from `services/events.py`** for audit entries — never write `Log` rows directly.
- **Frontend is Next.js 16** — read the relevant guide under `web/node_modules/next/dist/docs/`
  before changing routing/server-component behavior. Use the Tailwind v4 `@theme` design tokens in
  `globals.css` and the `.auth-input` / `Button` primitives — **never hardcode hex colors**.
- **Call `ensure_agents(db, user.id)` on registration** so a new user gets their `agent_configs`
  rows (already done — keep it).

## Definition of done

Each item is verifiable by running the stack (`docker compose up -d`, uvicorn on :8000, `npm run dev`
on :3000) and inspecting with `.\db.ps1`.

**[AS-BUILT] — confirm these still pass (regression checklist):**
1. `POST /api/auth/register` with a new email returns `201` and `email_sent`; in console mode the
   response includes a 6-digit `dev_otp`. A second register with the same email returns `400
   "Email already registered"`.
2. `.\db.ps1 user <email>` shows the new user with `is_verified = false`, a non-null `otp_code`, and a
   future `otp_expires_at`; `hashed_password` is a `pbkdf2_sha256$...` string, never plaintext.
3. `POST /api/auth/login` for that user returns `403` ("verify your email") before verification.
4. `POST /api/auth/verify-otp` with the correct code returns a JWT; an incorrect code returns `400
   "Invalid code"`; an expired code returns `400 "Code expired"`.
5. After verification, `.\db.ps1 user <email>` shows `is_verified = true` and `otp_code = null`;
   `POST /api/auth/login` now succeeds.
6. `POST /api/auth/resend-otp` issues a new code and invalidates reliance on the old one (new
   `otp_expires_at`).
7. UI: `/signup` completes the details → 6-box OTP flow (paste + keyboard nav work), the dev-OTP
   banner pre-fills the code in console mode, and a successful verify redirects to `/dashboard`.
8. An email in `ADMIN_EMAILS` that registers + verifies ends up with `is_admin = true`.

**[GAP] — explicitly NOT done (tracked follow-ups):**
9. "Sign up with Google" is a no-op button — OAuth signup is **not** implemented.
10. No password-strength/min-length enforcement on `RegisterIn` (any non-empty password is accepted).
11. No rate-limiting on `register` / `resend-otp` (OTP can be requested repeatedly).
12. OTP is single-code, no per-attempt lockout on `verify-otp` (unlimited guesses until expiry).
