# Plan: Contact Discovery & Verification — Agent Merge, ZeroBounce-Only, Finder Trim (Step 03)

> Spec: `.claude/specs/03-contact-discovery-verification.md` · Branch: `feature/contact-discovery-verification`
> Builds on Steps 01 (Registration) and 02 (Enrichment & Scoring), both already implemented.
>
> **Status — Implemented** on `feature/contact-discovery-verification` (2026-06-05). One deviation from
> the plan below: the two agent files were *physically consolidated* into a single
> `backend/app/agents/email_guess_verification.py` (with the `guess_emails()` helper inside), and the old
> `email_guess.py` + `verification.py` were **deleted** — not just registry-merged as Workstream 1
> originally described. The "optional" landing-page relabel (8→7) and a dead-code cleanup
> (`web/src/lib/mock.ts` + `types.ts` removed; `TONES` hoisted to `lib/constants.ts`) were also done. See
> the README progress log (2026-06-05) for the full as-built record.

## Context

Pipeline stages 3–4 (discovery + guess/verify) already work, so most of this step is *changes to
working code*, not a from-scratch build. Four owner-confirmed changes drive the work:

1. **Merge agents.** `email_guess` and `verification` become one agent, `email_guess_verification`
   ("Email Guessing & Verification"). Guessing already runs *inside* the verification agent, so the
   two registry entries are redundant. Pipeline drops **8 → 7 agents**.
2. **ZeroBounce-only.** Remove Verifalia entirely; ZeroBounce is the sole paid verification provider.
3. **Strict verify-or-drop.** Per contact: guess → free layer → (if it passes) ZeroBounce. Store the
   address **only** on a ZeroBounce `Verified` and stop guessing; if no guess verifies, store **no
   address** (`email=""`, `verification="Unknown"`, `confidence=0`). Today's "keep the best-ranked
   Risky/Unknown guess" fallback is removed. **Require ZeroBounce** (owner decision): with no
   ZeroBounce key the free layer never yields `Verified`, so no contact gets an address and outreach
   drafts nothing — an accepted consequence, not a bug.
4. **Trim finder roles.** The employee finder stops targeting **Business Development / Partnerships /
   Alliances / Channel Sales**. It keeps Top-commercial (CRO/VP Sales/Head of Sales/VP Revenue),
   Mid-level sales (Sales/Account Director, Regional Sales Mgr), and the Founder/CEO fallback.

Intended outcome: a leaner 7-agent pipeline where a contact carries an email **only** when ZeroBounce
confirmed it deliverable, outreach only drafts for contacts that have such an address, and discovery
targets a tighter set of commercial roles.

## Scope

**In scope:** the four changes above + the frontend timeline and docs they touch.
**Out of scope (remain [GAP] in the spec):** enforcing `Contact.approved` on outreach, manual
add-contact route, per-contact re-verify route, `verified_at`/TTL, paid contact-data providers,
broadening the disposable blocklist. No schema changes.

## Decisions locked (from clarifications)

- Merge → single key `email_guess_verification`, display "Email Guessing & Verification" (the
  `VerificationAgent` class/instance keep their internal names; only `.key` + registry change).
- Finder keeps role groups 1, 2, 4; **drops group 3 (BD/Partnerships/Alliances/Channel)**.
- Resolve stores an address **only** on ZeroBounce `Verified`; otherwise `email=""`,
  `verification="Unknown"`, `confidence=0`. No free-layer fallback (ZeroBounce required).
- Outreach gate becomes "contact has a non-empty `email`" (covers ZeroBounce-verified + any
  human-edited address), replacing the `verification ∈ {Verified,Risky,Unknown}` gate.

## Workstream 1 — Merge `email_guess` + `verification` → `email_guess_verification` (7 agents)

`guess_emails()` in `agents/email_guess.py` stays as a helper (no agent class lives there). Only the
agent **key/registry/run-path/stats** collapse.

- **`backend/app/agents/base.py:13–14`** — replace the two `AGENT_REGISTRY` tuples with one:
  `("email_guess_verification", "Email Guessing & Verification", "<desc: guesses likely addresses, then verifies via free syntax/MX checks and ZeroBounce; stores only a ZeroBounce-confirmed address>")`.
  Registry is now 7 entries (orders shift: outreach 5, tracking 6, meeting 7).
- **`backend/app/agents/verification.py:12`** — `key = "email_guess_verification"`.
- **`backend/app/agents/orchestrator.py:118`** (`RUNNABLE_KEYS`) — drop `"email_guess"`, rename
  `"verification"` → `"email_guess_verification"`.
- **`backend/app/agents/orchestrator.py:239`** — `elif key in ("email_guess", "verification"):`
  becomes `elif key == "email_guess_verification":` (body unchanged — still
  `verification_agent.run(...)` over `_qualified_companies`).
- **`backend/app/api/routers/campaigns.py:246,248`** — collapse the two `stats()` branches into one:
  ```python
  if key == "email_guess_verification":
      return len(contacts), sum(1 for ct in contacts if (ct.email or "").strip())
  ```
  (completed = contacts with a stored address — consistent with the new outreach gate).
- **`backend/app/main.py`** (lifespan, inside the existing `with engine.begin() as conn:` block,
  after the admin-promotion stmt ~line 97) — idempotent data migration:
  ```python
  conn.execute(text("DELETE FROM agent_configs WHERE key IN ('email_guess','verification')"))
  conn.execute(text(
      "INSERT INTO agent_configs (owner_id, key, name, description, enabled, \"order\", status) "
      "SELECT u.id, 'email_guess_verification', 'Email Guessing & Verification', '', true, 4, 'Idle' "
      "FROM users u WHERE NOT EXISTS (SELECT 1 FROM agent_configs ac "
      "WHERE ac.owner_id = u.id AND ac.key = 'email_guess_verification')"))
  ```
  Removes stale rows and back-fills the merged row for existing users (new users get it via
  `ensure_agents`). Downstream agents' stale order numbers (6/7/8) are cosmetic — `get_pipeline`
  sorts by order, so relative order stays correct.
- **`web/src/app/(app)/campaigns/[id]/page.tsx:33–34`** — in `resultsLink`, replace
  `case "email_guess":` / `case "verification":` with a single `case "email_guess_verification":`
  (both already fall through to the `/contacts` link). No other live frontend agent-key usage exists
  (`agents/page.tsx` is generic; `Topbar`/notifications `"verification"` is a NotificationType;
  `mock.ts`/`types.ts` are legacy/unused).

## Workstream 2 — ZeroBounce-only (remove Verifalia)

- **`backend/app/providers/verification.py`** — delete `_verifalia()`, `_VF_MAP`, the
  `VERIFALIA_BASE` const, and the Verifalia branches in `paid_mode` (lines 86–87) and `verify`
  (lines 100–101). `paid_mode` returns `"zerobounce"` or `None`; `verify()` calls `_zerobounce` or
  returns `"Unknown"`.
- **`backend/app/core/config.py:41–44`** — remove `verifalia_username` / `verifalia_password` and
  trim the comment to name only ZeroBounce.
- **`backend/.env.example:46–48`** and local **`backend/.env`** — remove the `VERIFALIA_USERNAME` /
  `VERIFALIA_PASSWORD` block (the user has `.env` open; note: I can edit `.env.example`, the user
  edits `.env`).
- **`backend/requirements.txt:30`** — remove the "verifalia REST API…" comment line.
- **`backend/app/services/seed.py:171`** — relabel the demo log `"Verifalia: greg.hollis@… → Unknown."`
  → `"ZeroBounce: …"` (or "Email verification: …").
- `/health` needs no change — it already reports `verification.paid_mode` generically, which now
  yields `"zerobounce"` or `"free (syntax+MX)"`.

## Workstream 3 — Strict ZeroBounce-Verified resolve + outreach gate

- **`backend/app/agents/verification.py` `_resolve()`** — replace the best-ranked fallback with
  verify-or-drop:
  ```python
  def _resolve(self, contact, candidates, db, owner_id):
      for i, email in enumerate(candidates):
          if verifier.verify(email) == "Verified":     # verify() = free layer → ZeroBounce
              contact.email = email
              contact.verification = "Verified"
              contact.confidence = max(self._CONF["Verified"] - i * 3, 5)
              return
      contact.email = ""                                # no confirmed address
      contact.verification = "Unknown"
      contact.confidence = 0
  ```
  `_RANK` and the non-`Verified` entries of `_CONF` become unused → trim them. The `force` path
  (clears email/verification/confidence first) and the "Verified X/Y" rollup log stay.
- **`backend/app/agents/orchestrator.py`** — both `_draft_all` closures (in
  `run_campaign_pipeline` ~line 309 and `run_agent_for_campaign` ~line 253) change the gate from
  `if contact.verification in ("Verified", "Risky", "Unknown"):` to
  `if (contact.email or "").strip():` — draft only for contacts that actually have an address.

**Consequence (intended):** stored `verification` is now only ever `Verified` (with email) or
`Unknown` (blank). `Risky`/`Invalid` are never persisted, so those badges in the Contacts UI become
unreachable (leave the types — harmless). With no ZeroBounce key, every contact ends `Unknown`/blank
and outreach drafts nothing.

## Workstream 4 — Trim finder roles (drop BD/Partnerships)

- **`backend/app/providers/search.py`** (`find_linkedin_profiles`, `role_groups` ~lines 226–231) —
  remove the third group: `'"Business Development" OR "Partnerships" OR "Alliances" OR "Channel Sales"'`.
  Keep the other three.
- **`backend/app/agents/employee_finder.py`** (`_rank_with_ai` prompt) — remove "Business Development /
  Partnerships / Alliances leaders. They own inter-company deals." from the STRONGLY PREFER list, and
  add Business Development / Partnerships / Alliances / Channel Sales to the REJECT list (so a BD
  profile surfaced incidentally by another query is dropped). Keep the existing hard-reject and
  former-employee logic untouched.

## Workstream 5 — Docs (and optional marketing)

- **`CLAUDE.md`** — update the pipeline line to 7 agents:
  `enrichment → scoring → employee_finder → email_guess_verification → outreach → tracking → meeting`,
  and revise the "`email_guess` has no standalone run path — guessing happens inside
  `verification_agent.run()`" note to describe the single merged agent.
- **Optional / cosmetic:** `web/src/app/page.tsx` hero pipeline labels (8→7), and the legacy
  `web/src/lib/mock.ts` 8-agent list — not consumed by live pages; skip unless tidying.

## Files touched (summary)

- **Backend:** `agents/base.py`, `agents/verification.py`, `agents/orchestrator.py`,
  `agents/employee_finder.py`, `providers/verification.py`, `providers/search.py`,
  `api/routers/campaigns.py`, `core/config.py`, `main.py`, `services/seed.py`, `.env.example`,
  `requirements.txt` (+ user-edited `.env`).
- **Frontend:** `app/(app)/campaigns/[id]/page.tsx` (req'd); `app/page.tsx` (optional).
- **Docs:** `CLAUDE.md`; spec reconciliation (below).

## Consequences & risks

- **ZeroBounce now required for any outreach** (owner-confirmed). The seeded demo (`jordan@…`, zero
  keys) will research/score/find-contacts but produce **no emails and no drafts**. Call this out in
  README/CLAUDE.md so it isn't read as a regression; configuring `ZEROBOUNCE_API_KEY` restores the
  full run.
- **Verdict vocabulary effectively reduces** to Verified/Unknown in stored data; Risky/Invalid badges
  become unreachable (left in place, harmless).
- **Existing AgentConfig rows**: the idempotent DELETE+INSERT in `main.py` handles the merge; downstream
  agents keep non-contiguous `order` values (cosmetic only).
- **Direct callers unaffected:** `companies.py::find_contacts` calls `employee_finder_agent.run()` +
  `verification_agent.run()` by reference, so the key rename doesn't touch it; it inherits the new
  resolve behavior automatically.

## Verification plan

Run the stack: `docker compose up -d`, uvicorn :8000, `npm run dev` :3000; inspect with `.\db.ps1`.

1. **7 agents.** `GET /api/campaigns/{id}/pipeline` returns 7 rows incl. `email_guess_verification`
   and **no** `email_guess`/`verification`; the campaign timeline renders 7 rows. `.\db.ps1 sql
   "SELECT key FROM agent_configs WHERE owner_id=…"` shows the old keys gone and the merged key present.
2. **Merged run path.** `POST /run-agent` with `key=email_guess_verification` guesses+verifies in one
   pass; `key=email_guess` and `key=verification` return 400.
3. **Strict resolve, no key.** With `ZEROBOUNCE_API_KEY` blank (`/health` shows
   `email_verification: "free (syntax+MX)"`), run the pipeline: every contact ends `email=""`,
   `verification="Unknown"`, `confidence=0`; `email-review` shows **no drafts**.
4. **Strict resolve, with key.** Set a real `ZEROBOUNCE_API_KEY`, re-run with force: contacts whose
   guessed address ZeroBounce returns `valid` get `verification="Verified"` + that `email`; all others
   stay `Unknown`/blank. No `Risky`/`Invalid` rows are written.
5. **Stop-on-verified.** For a Verified contact, confirm only the first matching pattern is stored
   (confidence = `95 − 3·index`) and later patterns aren't probed (ZeroBounce call count / logs).
6. **Outreach gate.** Drafts are generated only for contacts with a non-empty `email`; blank-email
   contacts get none. A human-edited email (PATCH `/api/contacts/{id}`) makes that contact draftable.
7. **Verifalia gone.** `grep -ri verifalia backend/` returns nothing functional; `verification.py`
   has no `_verifalia`/`_VF_MAP`; `config.py`/`.env.example`/`requirements.txt`/`seed.py` mention no
   Verifalia; `paid_mode` only returns `zerobounce`/`None`.
8. **Finder trim.** Inspect the LinkedIn search queries/logs: no BD/Partnerships/Alliances/Channel
   query runs; a seeded/sample company with only a "VP Partnerships" surfaced is rejected by the AI
   ranker. Top-commercial, mid-level sales, and (small-co) founder profiles still pass.
9. **Build gate.** `npm run build` passes (frontend typecheck), and the backend boots clean
   (`/health` 200, lifespan migration idempotent on a second boot).

## Spec reconciliation (housekeeping)

After implementation, tighten `.claude/specs/03-contact-discovery-verification.md` so it matches the
locked decisions: (a) finder keeps groups 1/2/4 and drops BD/Partnerships; (b) the Overview's "keeps
it as NaN" → the precise verify-or-drop rule; (c) the outreach Rule changes from
`verification ∈ {Verified,Risky,Unknown}` to "non-empty `email`"; (d) add the **Require ZeroBounce**
consequence to the Rules + a `[CHANGES]` DoD item; (e) note Risky/Invalid are no longer persisted.
