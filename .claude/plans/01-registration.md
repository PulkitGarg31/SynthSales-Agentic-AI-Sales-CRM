# Plan: Registration — Hardening & Gap Closure (Step 01)

> Implementation plan for the gaps documented in `.claude/specs/01-registration.md`.
> The core register → OTP → verify flow is **already built and working**; this plan does
> **not** rebuild it. It (1) verifies the as-built flow as a regression gate and (2) closes the
> four `[GAP]` items: password strength, rate-limiting, OTP brute-force lockout, and Google OAuth.

## Context

Registration is the root of Reachly's per-user data model — every downstream feature is scoped to a
verified account. The existing flow (`backend/app/api/routers/auth.py` + `web/src/app/(auth)/signup`)
is functional but has four security/UX gaps the spec calls out: any non-empty password is accepted,
the `register`/`resend-otp`/`verify-otp` endpoints have **no throttle or lockout** (a 6-digit OTP can
be brute-forced in seconds; OTP emails can be weaponized as inbox spam), and the "Sign up with Google"
button is inert. This plan closes all four while preserving the codebase's two non-negotiable
philosophies: **everything degrades gracefully with zero credentials**, and **the signup OTP stays
exempt from the `outbound_enabled` kill-switch**. Phase A (hardening) ships with no new dependencies
and no external setup; Phase B (OAuth) is fully mergeable with no Google credentials (button hidden,
routes 404, `npm run build` green) and only "lights up" once credentials are added.

## Scope & approach

- **Phase A — Backend security hardening.** Backend-only, zero new deps, no schema change except one
  additive column. Self-contained and high-value. Do this first.
- **Phase B — Google OAuth.** New provider + 2 routes + 1 nullable column + frontend callback page +
  button wiring. Graceful-degrade is a hard requirement.
- All new error/throttle messages are plain strings (4xx) or pydantic 422 arrays — both already
  rendered verbatim by the frontend (`api.ts:80-90` reads `data.detail`, flattens arrays via
  `detail.map(d => d.msg).join(", ")`). **No frontend change needed for Phase A.**

Verified facts that shape the plan (do not re-derive):
- Hasher is **`pbkdf2_sha256`**, not bcrypt (`core/security.py:9`) → **no 72-byte truncation issue**;
  cap password length at 128 only as a pbkdf2 DoS guard.
- Handlers are sync `def` → run in the anyio threadpool → any in-memory store **must be thread-safe**.
- No reverse proxy today (CORS-only) → trust `request.client.host`, not `X-Forwarded-For`.
- `resend_otp` reads email from a **query param** (`api.ts:111` calls `?email=`), signature is
  `resend_otp(payload: LoginIn | None = None, email: str = "", db=...)` — the throttle key must read
  email the same way: `email or (payload.email if payload else "")`.
- Next.js 16: a page using `useSearchParams` **must be wrapped in `<Suspense>`** or `npm run build`
  fails ("Missing Suspense boundary"). The OAuth callback page must follow this.

---

## Phase A — Backend security hardening

### A1 · Password-strength validation
**File:** `backend/app/schemas.py` (on `class RegisterIn`, line 14).

- Add `import re`; extend the pydantic import to include `field_validator`.
- Add a module-level helper `_validate_password_strength(value) -> str` enforcing: **len ≥ 8**,
  **len ≤ 128** (pbkdf2 DoS guard — *not* 72), and **≥ 2 of 4 character classes**
  (lowercase / uppercase / digit / symbol). Raise `ValueError("<message>")` on failure; return `value`.
- On `RegisterIn`, set the first-in-codebase pydantic-v2 validator pattern:
  ```python
  @field_validator("password")
  @classmethod
  def _password_strength(cls, v: str) -> str:
      return _validate_password_strength(v)
  ```
- **Do not** add this to `LoginIn` — legacy/weaker existing passwords must still log in.
- Failure → **422**; UI shows e.g. `Value error, Password must be at least 8 characters.` (the
  `"Value error, "` prefix is pydantic's default; keep it for v1).

### A2 · Rate-limiting on `register` + `resend-otp`
**New file:** `backend/app/core/ratelimit.py` (sits beside `config.py`/`security.py`, imports no app code).

- Thread-safe sliding-window limiter, **zero deps**:
  - `class RateLimiter` with `self._hits: dict[str, list[float]]` + `threading.Lock`.
  - `check(key, limit, window_seconds) -> bool`: under the lock, prune entries older than
    `time.monotonic() - window` (monotonic = clock-change-immune), return `False` if `len >= limit`
    else append now and return `True`. `reset(key)` pops the bucket.
  - Module-bottom singleton `limiter = RateLimiter()`.
  - Comment the honest limitations: **per-process** (×N uvicorn workers), **resets on restart**; Redis
    is the future swap behind the same `.check()` interface.

**Wire into** `backend/app/api/routers/auth.py` (inline, not a dependency — resend's email arg makes a
generic dependency awkward):
- `from fastapi import Request`; `from app.core.ratelimit import limiter`; add constants
  `THROTTLE_MSG`, `RESEND_THROTTLE_MSG` and a `_client_ip(request)` helper
  (`request.client.host if request.client else "unknown"`).
- Key by **both IP and email** (trip if either exceeds), distinct namespaces:
  `register:ip:{ip}` 5/600s, `register:email:{email}` 3/600s; `resend:ip:{ip}` 5/600s,
  `resend:email:{email}` 3/600s.
- `register`: add `request: Request`; check both buckets at the top; on trip
  `add_log(db, None, "User", "...throttled...", level="warning")` then `raise HTTPException(429, THROTTLE_MSG)`.
- `resend_otp`: resolve `target = (email or (payload.email if payload else "")).strip()` first, then
  check the limiter **before** the DB lookup (also blunts enumeration); 429 + warning-log on trip.

### A3 · OTP attempt lockout on `verify-otp`
**Model:** `backend/app/models.py`, in `class User` after `otp_expires_at` (~line 47):
`otp_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)` (`Integer` already imported).
**Migration:** `backend/app/main.py` lifespan, inside the existing `with engine.begin() as conn:` block
(alongside the other ALTERs, ~line 66):
`conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0"))`.

**Logic** in `auth.py` (constant `MAX_OTP_ATTEMPTS = 5` at top):
- Reset `otp_attempts = 0` whenever a new code is issued: in `register` (constructor), in `resend_otp`
  (alongside `user.otp_code = otp`), and on verify success (alongside `user.otp_code = None`).
- Rewrite `verify_otp` body in this order: unknown email → **400 "Invalid code"** (non-disclosure);
  expired → **400 "Code expired. Request a new code."** (checked *before* lock — self-healing);
  locked (`otp_code is not None and otp_attempts >= MAX`) → **429 "Too many incorrect codes…"** +
  warning-log; wrong code → `otp_attempts += 1; db.commit()`, then 429 if now ≥ MAX else **400**;
  correct → verify, clear code, reset attempts, admin auto-grant, return `Token`.
- Unlock path: only a new code (via `resend-otp`) resets attempts; codes also self-expire in 15 min.
- **Coupling note (avoid a footgun):** lockout forces a resend, and resend is capped 3/email/10min —
  5 fast wrong tries + 1 resend (well under the cap) unlocks. Keep these thresholds in sync.

---

## Phase B — Google OAuth (graceful-degrade)

Server-side **Authorization Code** flow. Backend builds the consent URL → Google → backend `callback`
exchanges code→tokens (httpx, no SDK) → fetches userinfo → mints our JWT → 307-redirects to the SPA
`/oauth-callback?token=…`, which `setToken`s and `router.replace`s to `/dashboard`.

### B1 · Config
`backend/app/core/config.py` — add after the email block (scalars, `""` defaults → auto-load from
SCREAMING_SNAKE env, default to "unconfigured"):
```python
google_client_id: str = ""
google_client_secret: str = ""
google_redirect_uri: str = "http://127.0.0.1:8000/api/auth/google/callback"
frontend_url: str = "http://localhost:3000"   # backend 302s the SPA here after callback
```
Append a documented block to `backend/.env.example` (mirror existing "leave blank to disable" style).

### B2 · Provider
**New file** `backend/app/providers/oauth.py` — mirror `EmailProvider` (`.available` prop + bottom
singleton + **httpx**, no Google SDK). Hard-code Google endpoint constants:
`AUTH=https://accounts.google.com/o/oauth2/v2/auth`,
`TOKEN=https://oauth2.googleapis.com/token`,
`USERINFO=https://openidconnect.googleapis.com/v1/userinfo`, scopes `openid email profile`.
- `available` → `bool(settings.google_client_id and settings.google_client_secret)`.
- `authorization_url(state)` → urlencode `client_id, redirect_uri, response_type=code, scope, state,
  access_type=online, prompt=select_account`.
- `exchange_code(code) -> dict | None` → httpx POST (timeout 15) form body; JSON or None on non-200.
- `fetch_userinfo(access_token) -> dict | None` → httpx GET with bearer; JSON or None.
- `oauth_provider = GoogleOAuthProvider()` at bottom. **Never log** secret/code/tokens; on httpx
  exception return None and `logger.warning("Google %s failed: %s", step, exc)` (message only).

### B3 · Schema
`backend/app/models.py` — in `class User` after `otp_expires_at`:
`google_sub: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)`
(`index=True` — callback looks up by it). **No `auth_provider` column** — presence of `google_sub` ⇒
Google-linked; absence ⇒ password-only. Keeps the User model lean.
`backend/app/main.py` lifespan ALTER block:
`conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)"))` (plain
nullable). Also add `"google_oauth": oauth_provider.available` to the `/health` `integrations` dict
(`main.py:146`).

### B4 · Routes
`backend/app/api/routers/auth.py` — new imports `secrets`, `from fastapi import Request`,
`from fastapi.responses import RedirectResponse`, `from app.providers.oauth import oauth_provider`.
- `GET /api/auth/providers` (unauthenticated) → `{"google": oauth_provider.available}` — the auth pages
  call this to decide whether to render the button.
- `GET /api/auth/google/start`: if not available → `HTTPException(404)`. CSRF via **double-submit
  cookie** (no server session store exists): `state = secrets.token_urlsafe(24)`; `RedirectResponse`
  (307) to `authorization_url(state)`, `set_cookie("oauth_state", state, max_age=600, httponly=True,
  samesite="lax", path="/api/auth")`.
- `GET /api/auth/google/callback(request, code="", state="", error="", db=Depends(get_db))`. Every
  failure **302s to `{frontend_url}/oauth-callback?error=<reason>`** (never raw JSON in the browser):
  `error` present → `denied`; not available → 404; `state != request.cookies["oauth_state"]` → `state`;
  no code → `missing_code`; `exchange_code` None → `exchange`; `fetch_userinfo` None → `userinfo`;
  missing sub/email → `userinfo`; **`email_verified` not truthy → `unverified_google`** (never trust an
  unverified Google email). Then resolve the account:
  - by `google_sub` → log in;
  - else by `email`: found (password user) → **link** (`google_sub = sub; is_verified = True`); else
    **create** `User(name, email, hashed_password=hash_password(secrets.token_urlsafe(32)),
    is_verified=True, google_sub=sub)` then **`ensure_agents(db, user.id)`** (required for every new
    user — mirrors `register` at `auth.py:74`);
  - admin auto-grant (mirror `auth.py:96`); `db.commit()`;
    `add_log(db, user.id, "User", "Signed in with Google (...).")` (no token in log).
  - Mint `create_access_token(str(user.id))`; `RedirectResponse` (307) to
    `{frontend_url}/oauth-callback?token=…`; `delete_cookie("oauth_state", path="/api/auth")`.

### B5 · Frontend
- `web/src/lib/api-types.ts` — add `export interface AuthProviders { google: boolean; }` (`Token`
  already exists, reused by the callback).
- `web/src/lib/api.ts` — add `authProviders: () => request<AuthProviders>("/api/auth/providers",
  { auth: false })` to the `api` object, and a nav helper
  `export const googleStartUrl = () => `${API_URL}/api/auth/google/start`;` (the button is a full-page
  navigation, not a fetch — OAuth must leave the SPA). `API_URL` is already exported (`api.ts:21`).
- **New** `web/src/app/(auth)/oauth-callback/page.tsx` → route `/oauth-callback`, inside the existing
  `(auth)` brand shell. **Must** be a `<Suspense>`-wrapped inner client component (Next.js 16
  requirement for `useSearchParams`): the inner component reads `token`/`error` from
  `useSearchParams()`; on `token` → `setToken(token); router.replace("/dashboard")` (replace strips the
  token from history); on `error` → friendly card mapping known codes (`denied`, `state`, `exchange`,
  `userinfo`, `unverified_google`, `missing_code`, `email_exists`) to short copy. Reuse `Loading` and
  the `bg-danger/10 text-danger` pattern from `components/ui.tsx` — **no hardcoded hex**.
- `web/src/app/(auth)/signup/page.tsx` (button at line 198) **and** `login/page.tsx` (line 38): add
  `const [googleOn, setGoogleOn] = useState(false); useEffect(() => {
  api.authProviders().then(p => setGoogleOn(p.google)).catch(() => {}); }, []);`. Wrap the Google
  button **and its following "or" divider** in `{googleOn && ( … )}` so the whole block vanishes when
  unconfigured. Give the button `type="button"` (critical on signup so it doesn't submit the form) and
  `onClick={() => { window.location.href = googleStartUrl(); }}`. Keep existing classes / the
  `text-accent` "G" (a real multi-color Google glyph would need 4 brand hex values that break the token
  system — leave the text "G" unless product explicitly wants the glyph as a documented exception).

---

## Files to create / change

**Create**
- `backend/app/core/ratelimit.py` — thread-safe sliding-window `RateLimiter` + `limiter` singleton.
- `backend/app/providers/oauth.py` — `GoogleOAuthProvider` + `oauth_provider` singleton.
- `web/src/app/(auth)/oauth-callback/page.tsx` — Suspense-wrapped OAuth callback.

**Change**
- `backend/app/schemas.py` — `field_validator` import + password-strength validator on `RegisterIn`.
- `backend/app/models.py` — `User.otp_attempts`, `User.google_sub`.
- `backend/app/main.py` — two idempotent ALTERs (`otp_attempts`, `google_sub`); `/health` flag.
- `backend/app/core/config.py` — 4 Google/OAuth settings keys.
- `backend/.env.example` — documented Google OAuth block.
- `backend/app/api/routers/auth.py` — throttle on register/resend; lockout rewrite of verify-otp;
  `otp_attempts` resets; `/providers`, `/google/start`, `/google/callback` routes.
- `web/src/lib/api-types.ts` — `AuthProviders` type.
- `web/src/lib/api.ts` — `authProviders()` + `googleStartUrl()`.
- `web/src/app/(auth)/signup/page.tsx`, `web/src/app/(auth)/login/page.tsx` — wire + conditionally
  render the Google button.

**New dependencies:** none. `httpx` is already a backend dep; no new npm packages.

## Implementation order
1. **A3 schema + migration** (`models.py` + `main.py`) and **B3 column** together — additive, safe.
2. **A2** `ratelimit.py` (isolated, unit-testable).
3. **A1** password validator (independent).
4. **A** wiring in `auth.py` (throttle + lockout) — app boots after each step.
5. **B1/B2** config + provider, then **B4** routes, then **B5** frontend (build gate).

## Open decisions — defaults chosen (override if desired)
- Password rule: **2-of-4 classes, 8–128 chars** (alt: length-only). Keep pydantic's `"Value error, "`
  prefix for v1.
- Rate limits: **register 5/IP·3/email per 10 min; resend 5/IP·3/email per 10 min** (tighten resend
  email to 2 if product wants). In-memory, per-process — documented limitation.
- `MAX_OTP_ATTEMPTS = 5`; lock returns **429**; hard-lock-until-resend (codes expire in 15 min anyway).
- OAuth account-linking: existing-password-email + Google → **link** (safer UX; alt: reject via
  `?error=email_exists`).
- Keep the text "G" (no multi-color glyph) to honor the no-hardcoded-hex rule.

---

## Verification

Boot once so lifespan runs the ALTERs. Backend `http://127.0.0.1:8000`; inspect with `.\db.ps1`. Use a
throwaway unique email per run; `dev_otp` is returned by register/resend in dev console mode.

**Regression — as-built still works (gate):**
- `jordan@apexcloud.com / password123` logs in; `/signup` completes details → 6-box OTP → `/dashboard`;
  unverified login returns 403; `.\db.ps1 user <email>` shows `hashed_password` is `pbkdf2_sha256$…`,
  never plaintext.

**A1 password strength:** `register` with `"short"` → 422 readable message; `"abcdefgh"` (1 class) →
422; `"Abcd1234"` → 201 + `dev_otp`.

**A2 rate limiting:** 6 rapid `register` calls (distinct emails) → 201×5 then **429** (IP bucket);
4 rapid `resend-otp?email=…` (same email) → 200×3 then **429** (email bucket, also proves `Request`
injection on resend's mixed signature). `.\db.ps1 sql "SELECT level,LEFT(message,70) FROM logs WHERE
level='warning' ORDER BY id DESC LIMIT 5;"` shows throttle logs.

**A3 OTP lockout:** register, then 5 wrong `verify-otp` → **400×4 then 429**;
`.\db.ps1 sql "SELECT otp_attempts FROM users WHERE email=…"` = 5; correct code now → **429** (locked);
`resend-otp` → `otp_attempts` back to 0; correct new code → **200** + token. Expiry-beats-lock: set
`otp_expires_at` in the past → next verify returns the **400 expired** message, not 429.

**B unconfigured (no creds — fully offline, the mergeable default):**
- `GET /api/auth/providers` → `{"google": false}`; `/google/start` and `/google/callback` → **404**;
  `/health` → `integrations.google_oauth: false`.
- `cd web; npm run build` → **passes** (proves the `/oauth-callback` Suspense boundary — the Next.js 16
  gotcha that would otherwise fail the build).
- `npm run dev`: `/login` and `/signup` show **no Google button and no "or" divider**; email→OTP flow
  unaffected; demo login still works.

**B configured (real Google "Web application" OAuth client; redirect URI exactly
`http://127.0.0.1:8000/api/auth/google/callback`):**
- `/api/auth/providers` → `{"google": true}`; button + divider appear.
- New user: click → consent → `/oauth-callback?token=…` → `/dashboard`; DB row created,
  `is_verified=true`, `google_sub` set, agents seeded, "Signed in with Google" log present, **no token
  in logs**. Returning Google user: no duplicate row. Account-link: password user with same Gmail →
  links onto the same row. Tampered `state` → `?error=state` friendly card. Denied consent →
  `?error=denied`. Unverified Google email → `?error=unverified_google`, no account created.

## Out of scope / follow-ups
- Redis-backed (cross-process) rate-limiting and dynamic `Retry-After`.
- Stripping pydantic's `"Value error, "` prefix via a `RequestValidationError` handler.
- Atomic OTP-attempt increment (`UPDATE … SET otp_attempts = otp_attempts + 1`) to close the
  concurrent-verify micro-race.
- Switching OAuth from token-in-URL to an HttpOnly-cookie session (would rework the `Bearer` model in
  `api.ts`).
- Official multi-color Google glyph as a documented hex exception.
