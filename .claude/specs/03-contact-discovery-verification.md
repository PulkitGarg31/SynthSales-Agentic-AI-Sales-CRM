# Spec: Contact Discovery and Verification

> **Status note:** Contact Discovery & Verification is pipeline stages **3–4**. The discovery half
> (`employee_finder`) and the guess-and-verify half are **already implemented and working** — so, like
> Steps 01–02, most of this spec is an as-built record. This step *additionally* makes two
> consolidating changes: it folds the former `email_guess` + `verification` agents into **one**
> `email_guess_verification` agent (display: "Email Guessing & Verification"), and it standardizes the
> paid verification layer on **ZeroBounce only**, removing Verifalia. Items are tagged **[AS-BUILT]**
> (already exists — verify, don't rebuild), **[CHANGES]** (code this step modifies), or **[GAP]** (not
> yet implemented — tracked follow-up). Nothing here is a from-scratch build.

## Overview

Contact Discovery & Verification is the middle of the pipeline — stages 3 and 4 — that turns the
ranked `Qualified` shortlist produced by Step 02 into a vetted list of **real, reachable
decision-makers** ready for outreach. It is **two** cooperating agents:

- **Employee Finder** (stage 3, `employee_finder`) searches the public web for genuine
  `site:linkedin.com/in/` profiles of the people who actually own inter-company deals — CRO / VP
  Sales / Head of Sales, with Founder/CEO as a fallback for sub-200-employee companies. The raw
  search hits are de-duped, employer-matched against the target (tolerating brand-vs-legal-name
  drift, e.g. "Notion Labs" → "Notion"), and former-employee profiles are dropped. When an AI key is
  present the candidates are additionally AI-ranked/filtered to reject non-commercial roles,
  similarly-named companies, and uncertain matches. The hard rule: **never fabricate** — the agent
  returns real profiles or **zero contacts**, never a hallucinated name.

- **Email Guessing & Verification** (stage 4, `email_guess_verification`) derives the most-likely
  mailbox from `name + domain` using standard corporate patterns ordered most→least common
  (`first.last@`, `firstlast@`, `flast@`, `first@`, …), then verifies each guess through a
  **two-layer** check: a free local layer that always runs (syntax → disposable-domain blocklist →
  role-account detection → **MX/A DNS** lookup) and, for survivors only, a paid layer
  (**ZeroBounce**). It tries each pattern in order and **stops at the first ZeroBounce-confirmed
  address**, storing it; if no guess is confirmed it stores **no address** (`email=""`,
  `verification="Unknown"`) — an honest "no confirmed address" rather than a speculative guess.

  **[CHANGES]** These were two separate agents (`email_guess` then `verification`); this step merges
  them into the single agent above, because guessing already runs *inside* the verification agent
  (`guess_emails()` is called per contact). `guess_emails()` survives unchanged as a helper — only
  the agent registration, run path, and pipeline accounting collapse from two entries into one. And also some decision makers are also removed from employee finder and as well as if no contact got verify keeping it as NaN

Stitching both together, `orchestrator._walk_for_contactable()` is the contact-finding **fallback**
the user explicitly asked for: walk the ranked companies running the finder until `campaign.top_n`
companies have at least one real contact; any Qualified company that yields nothing is demoted
`Qualified → Reviewed` and the next-best Reviewed company is promoted into the slot.

The governing principle, identical to enrichment/scoring, is **honesty over completeness**, and both
the search and paid-verification layers **degrade gracefully** with zero credentials.

## Depends on

- **Step 01 (Registration)** — both agents are per-user scoped: they `mark()` status on the user's
  `AgentConfig` rows (created by `ensure_agents()` at registration) and write per-user audit logs. An
  authenticated, verified account is the precondition.
- **Step 02 (Enrichment & Scoring)** — stage 3 only operates on the `Qualified`/`Reviewed` set that
  scoring produces (`_walk_for_contactable` queries `ai_score > 0` and `status in (Qualified,
  Reviewed)`, ordered by `rank`). Stage 4's address fallback uses `company.domain` (enriched in
  Step 02); a missing domain degrades to `"{name}.com"`.
- **Providers** (initial commit): `providers/search.py`
  (`find_linkedin_profiles`, alias/employer/former-employee filtering), `providers/verification.py`
  (free local layer + ZeroBounce), `providers/ai.py` (the Gemini → Groq → OpenRouter failover chain
  used to rank candidates), and `services/events.py` (`add_log`).
- **Campaign + CSV upload** (initial commit): `Company` rows must exist and be scored before any
  contact work runs.

## Routes

**[AS-BUILT]** — no routes are unique to this step; contact work is driven through the generic
campaign-pipeline endpoints plus the dedicated contact/company endpoints that already exist:

- `POST /api/campaigns/{campaign_id}/run` — kicks off the full pipeline as a background task; Phase 3
  runs the finder walk (with `force=True`), Phase 4 runs guessing+verification on the resulting
  contactable set (`force=True`). — **logged-in**
- `POST /api/campaigns/{campaign_id}/run-agent` — body `{key, force}`; runs a single stage on demand.
  **[CHANGES]** `RUNNABLE_KEYS` collapses the old `email_guess` + `verification` keys into one
  `email_guess_verification` key, so for this step's stages `key ∈ {employee_finder,
  email_guess_verification}`. The merged agent guesses then verifies in one pass; the old `email_guess`
  and `verification` keys are no longer accepted (→ 400). — **logged-in**
- `GET /api/campaigns/{campaign_id}/pipeline` — per-agent status/progress. `employee_finder` completed
  = Qualified companies with ≥1 contact. **[CHANGES]** the former separate `email_guess` (email
  filled) and `verification` (verdict settled) progress rows merge into one
  `email_guess_verification` row whose completed = contacts with a settled verdict
  (`verification != "Unknown"`). — **logged-in**
- `GET /api/contacts?campaign_id=` — list contacts for the user (optionally scoped to one campaign);
  returns `ContactOut[]`. — **logged-in**
- `PATCH /api/contacts/{contact_id}` — human approval layer: edit `email`, set `approved`
  (true/false), edit `name`/`role`. — **logged-in**
- `POST /api/companies/{company_id}/find-contacts` — per-company discovery: runs the finder then
  verification **synchronously** for that single company (no walk, no `force`). — **logged-in**
- `GET /api/companies/{company_id}` — `CompanyDetailOut`, includes the company's `contacts[]`. —
  **logged-in**

**No new routes** (the merge changes a key inside an existing endpoint; it does not add a route).

**[GAP]** routes that would close the gaps below (not yet implemented):
- `POST /api/companies/{company_id}/contacts` — manually add a contact (the finder's empty-state log
  already tells users to "add contacts manually", but there is no create endpoint). — **logged-in**
- `POST /api/contacts/{contact_id}/verify` — re-verify a single contact's address on demand
  (currently verification only re-runs at company/campaign granularity). — **logged-in**

## Database changes

**No database changes** to the `Contact` table. Verified against `backend/app/models.py` (and
`.\db.ps1`) — every field the flow needs already exists and is populated by the agents:

| Column | Type | Written by | Notes |
| --- | --- | --- | --- |
| `name`, `role`, `linkedin` | String | employee_finder | real LinkedIn profile data; `linkedin` nullable |
| `email` | String(255), default `""` | email_guess_verification | filled with the chosen guessed address |
| `verification` | String(20), default `Unknown` | email_guess_verification | `Verified \| Risky \| Unknown \| Invalid` |
| `confidence` | Integer, default `0` | email_guess_verification | 0–95, decremented by pattern index |
| `approved` | Boolean, **nullable** | user (PATCH) | tri-state: `null` = pending, `true`/`false` = human decision |

`Contact` cascades from `Company`; `EmailDraft` cascades from `Contact` (so `force` re-runs that
delete contacts also wipe their stale drafts).

**[CHANGES]** The merge touches **no schema**, but it does change seeded per-user data: `AgentConfig`
rows are keyed by agent. After the registry change, `ensure_agents()` will create the new
`email_guess_verification` row on next boot/registration, while existing users keep stale
`email_guess` / `verification` rows. They're harmless (the pipeline view only reads keys it knows),
but per CLAUDE.md's no-Alembic convention add a one-time idempotent cleanup in `main.py::lifespan`
(`DELETE FROM agent_configs WHERE key IN ('email_guess','verification')`) so the timeline shows
exactly seven agents.

**[GAP]** If the follow-ups are taken up, candidate nullable columns (each with a matching idempotent
ALTER): `verified_at: DateTime` (verification recency/TTL), `source: String` (how the contact was
found — `linkedin_search` vs `manual`), `email_pattern: String` (the winning pattern, to seed future
guesses for the same domain). None are required for the as-built flow.

## Templates

This is a Next.js + FastAPI app, not a server-rendered template stack — "templates" maps to React
route pages. Every surface below already exists and consumes the as-built fields.

- **Create:** None.
- **Modify:**
  - **[CHANGES]** `web/src/app/(app)/campaigns/[id]/page.tsx` — the per-agent pipeline timeline. Its
    `switch` on agent key (`case "email_guess":` / `case "verification":`, ~lines 33–34) and any
    label/icon/order map collapse to the single `email_guess_verification` agent, so the timeline
    renders **seven** rows instead of eight.
  - **[GAP]** `web/src/app/(app)/contacts/page.tsx` — the **"Contact Discovery Review"** page:
    contacts grouped by company, verification badge + confidence, approve / reject / inline-edit-email.
    Gap work (enforce-approval messaging, manual-add, bulk approve, per-contact re-verify) lands here.
  - **[GAP]** `web/src/app/(app)/research/[id]/CompanyDetail.tsx` — the per-company "Find contacts"
    button and the discovered-contacts list on the research detail page.

## Files to change

For documenting the as-built flow: **none** — that part of this spec is a record, not a code change.

**[CHANGES] — the consolidation this step implements:**

*Merge `email_guess` + `verification` → one `email_guess_verification` agent:*
- `backend/app/agents/base.py` — `AGENT_REGISTRY`: replace the two entries (`email_guess`,
  `verification`) with one `email_guess_verification` ("Email Guessing & Verification", description
  rewritten to cover guess + free MX/syntax + ZeroBounce, **no Verifalia**). Pipeline is now 7 agents.
- `backend/app/agents/orchestrator.py` — `RUNNABLE_KEYS`: drop `email_guess`, rename `verification` →
  `email_guess_verification`; collapse the `run_agent_for_campaign` branch
  `elif key in ("email_guess", "verification")` to `elif key == "email_guess_verification"`. The
  full-pipeline and walk logic are unchanged (already a single guess+verify `_phase` call).
- `backend/app/api/routers/campaigns.py` — `GET /pipeline` `stats()`: merge the `email_guess` and
  `verification` branches into one `email_guess_verification` branch (completed = settled verdicts).
- `backend/app/main.py` — idempotent `DELETE FROM agent_configs WHERE key IN ('email_guess',
  'verification')` in `lifespan` so existing users' timelines show seven agents.
- `web/src/app/(app)/campaigns/[id]/page.tsx` — timeline switch/label/order for the merged key (above).
- `CLAUDE.md` — update the pipeline description from 8 → 7 agents
  (`enrichment → scoring → employee_finder → email_guess_verification → outreach → tracking →
  meeting`) and the note that "`email_guess` has no standalone run path" (now the single merged agent).

*Drop Verifalia (ZeroBounce-only paid layer):*
- `backend/app/providers/verification.py` — remove `_verifalia()`, `_VF_MAP`, and the `verifalia`
  branches of `paid_mode` / `verify`; ZeroBounce becomes the only paid provider.
- `backend/app/core/config.py` — remove `verifalia_username` / `verifalia_password` (and trim the
  comment that names Verifalia as an alternative).
- `backend/.env.example` and the local `backend/.env` — remove the `VERIFALIA_USERNAME` /
  `VERIFALIA_PASSWORD` block.
- `backend/requirements.txt` — remove the "verifalia REST API…" comment line.
- `backend/app/services/seed.py` — the seeded demo log message `"Verifalia: greg.hollis@… → Unknown."`
  → relabel to ZeroBounce (or a generic "Email verification:") so seed data matches the new provider.

**[GAP] follow-ups only:**
- `backend/app/agents/orchestrator.py` — gate outreach drafting on `approved is not False` (or only
  `approved is True`) so the Contacts approve/reject actually controls what gets contacted.
- `backend/app/api/routers/contacts.py` — add the `POST .../verify` re-verify route.
- `backend/app/api/routers/companies.py` — add the `POST .../contacts` manual-add route; optionally
  make `find-contacts` a background task for consistency with the campaign-level runs.
- `backend/app/providers/verification.py` — broaden the built-in `DISPOSABLE_DOMAINS` blocklist (or
  load from a maintained list).
- `web/src/lib/api.ts`, `web/src/lib/api-types.ts` — client methods/types for any new routes.
- `web/src/app/(app)/contacts/page.tsx` — manual-add form, bulk approve, per-contact re-verify, and
  make the approval state visibly consequential.

## Files to create

For the as-built flow and the [CHANGES] above: **none** — both the merge and the Verifalia removal
edit existing files only.

For the **[GAP]** follow-ups: none strictly required — the gaps extend existing files. (A maintained
disposable-domain list could live in a new `backend/app/providers/data/disposable.txt`, but inlining
remains acceptable per the providers pattern.)

## New dependencies

**No new dependencies, and none removed.** Search uses `ddgs`, AI uses `httpx` (no SDKs), syntax
validation uses `email-validator`, and MX lookups use `dns.resolver` from **dnspython** — already
present transitively (an `email-validator` dependency) and guarded by a `try/except` so verification
still runs if it's ever absent. ZeroBounce is called directly over REST with `httpx` (per CLAUDE.md's
"no SDKs" rule). **[CHANGES]** Dropping Verifalia removes **no** package (it was httpx-based too) —
only its config keys and code path go away; the one remaining paid key, `ZEROBOUNCE_API_KEY`, already
exists in `backend/.env.example`.

## Rules for implementation

Follow this codebase's conventions, **not** generic defaults:

- **Agents never fabricate contacts.** The employee finder returns **real** `site:linkedin.com/in/`
  profiles or **zero** contacts — do **not** reintroduce hardcoded name lists or heuristic
  name-generation. Zero real contacts is the correct, honest outcome; the walk handles the empty case
  by promoting the next company.
- **No live SMTP probing, ever.** Verification is reputation-safe by design: free local layer
  (syntax → disposable → role-account → MX/A DNS) then an optional paid API. Do not add `RCPT TO`
  probing.
- **[CHANGES] Verify-or-drop resolution.** `_resolve()` stores an address **only** on the first
  ZeroBounce-`Verified` guess and stops (confidence = `max(95 − 3·index, 5)`); if no guess verifies it
  stores **no address** (`email=""`, `verification="Unknown"`, `confidence=0`). The old "keep the
  best-ranked Risky/Unknown guess" fallback is **removed**, so a stored `Contact.verification` is now
  only ever `Verified` (with an address) or `Unknown` (blank). The provider's `verify()` still
  classifies `Verified|Risky|Invalid|Unknown` via `_ZB_MAP` (never leak raw provider strings), but
  `Risky`/`Invalid` are no longer persisted on a contact.
- **[CHANGES] ZeroBounce is required to produce a contactable address.** Because only a
  ZeroBounce-`Verified` result is stored and the free layer never returns `Verified`, with no
  `ZEROBOUNCE_API_KEY` every contact ends `Unknown`/blank and outreach drafts nothing. This is the
  owner-chosen behavior — the zero-key demo researches/scores/finds contacts but produces no drafts;
  configure ZeroBounce to get contactable emails.
- **[CHANGES] ZeroBounce is the only paid provider.** After this step, `paid_mode` returns
  `"zerobounce"` or `None` — no Verifalia branch, no `_VF_MAP`, no Verifalia settings. The free local
  layer still always runs; the paid layer still confirms survivors only.
- **Free layer always runs; paid layer only on survivors.** Never spend a paid credit on an address
  the local layer already proved `Invalid`/`Risky`. Role accounts (`info@`, `sales@`, …) and
  disposable domains are `Risky`; a domain with no MX **and** no A record is `Invalid`; an
  inconclusive/transient DNS result must **not** be punished (treat as pass).
- **[CHANGES] Guessing and verification are one agent.** `guess_emails()` remains a helper called
  *inside* the merged `email_guess_verification` agent (`verification_agent.run()`); do **not** keep a
  separate `email_guess` registry entry or run path. Update `AGENT_REGISTRY`, `RUNNABLE_KEYS`, the
  pipeline `stats()`, the campaign-timeline UI, and CLAUDE.md together so the 7-agent pipeline stays
  internally consistent, and seed the new key via `ensure_agents()`.
- **`_walk_for_contactable` semantics must be preserved.** Walk ranked companies; fill exactly
  `min(top_n, scored)` slots with companies that yield real contacts; demote empties
  `Qualified → Reviewed` and promote the next-best; one bad company must never abort the walk
  (per-company exceptions are swallowed and treated as "no contacts"). Preserve user-set states
  (`Excluded`, `Approved`, `Contacted`) — only toggle the automatic `Qualified/Reviewed`.
- **`force=True` means "discard prior output and redo".** It wipes stale contacts (CASCADE wipes
  their drafts) before the finder re-searches, and clears `email`/`verification`/`confidence` before
  re-verifying — so a re-run is a clean picture, never stale+new. The full pipeline passes
  `force=True` to the finder and the guess+verify phase; on-demand bulk runs default to `False`.
- **[CHANGES] Outreach is gated on having an address, not on verdict.** Drafting/sending now runs only
  for contacts with a **non-empty `email`** (a ZeroBounce-verified or human-edited address), replacing
  the old `verification ∈ {Verified, Risky, Unknown}` gate. `approved` is still **not** enforced (a
  tracked [GAP]); if you implement that, add an `approved` check without re-introducing a verdict gate.
- **These stages never send email.** Discovery/guessing/verification touch no outbound mailbox, so
  the `outbound_enabled` kill-switch doesn't apply here — but do not introduce any send from these
  agents; sending stays in outreach/tracking/meeting and remains gated.
- **Use the failover AI chain via `providers/ai.py`** (`ai.complete_json`) for candidate ranking —
  never call an LLM SDK directly. Honor `ai.available`: with no key, skip AI ranking and keep the
  search-filtered list. With no `ddgs`, the finder returns zero contacts gracefully.
- **Use `self.log()` / `self.mark()`** (which wrap `add_log` and the per-user `AgentConfig` status) —
  never write `Log` rows directly. The orchestrator's `_phase()` already drives Running/Idle/Error.
- **Frontend is Next.js 16** — read the relevant guide under `web/node_modules/next/dist/docs/`
  before touching routing/server-component behavior. Use Tailwind v4 `@theme` tokens in `globals.css`
  and the existing `Badge`/`Card`/`Button` primitives — **never hardcode hex colors**.

## Definition of done

Each item is verifiable by running the stack (`docker compose up -d`, uvicorn on :8000,
`npm run dev` on :3000) and inspecting with `.\db.ps1`.

**[AS-BUILT] — confirm these still pass (regression checklist):**

1. **Discovery finds real people or none.** After **Run all agents** on a campaign with live
   companies, `.\db.ps1 user <email>` shows the top-N Qualified companies with `Contact` rows whose
   `linkedin` is a real `linkedin.com/in/...` URL and whose `role` is a commercial title. A company
   with no findable commercial contacts has **zero** contacts (no fabricated names) and a log line
   "No LinkedIn profiles found … add contacts manually or re-run."
2. **Walk fallback demotes/promotes.** A Qualified company that yields no contacts ends `Reviewed`,
   and a lower-ranked Reviewed company that *does* yield contacts is promoted to `Qualified` — the
   number of Qualified-with-contacts companies is `min(top_n, scorable)`. Re-running the finder with
   **force** wipes every campaign contact first, then refills from rank 1.
3. **Guessing produces ordered patterns.** With a contact named e.g. "Jane Doe" at `acme.com`, the
   chosen `email` is one of the standard patterns (`jane.doe@`, `janedoe@`, `jdoe@`, `jane@`,
   `jane.d@`, `j.doe@`) — most-common first; a single-word name falls back to `jane@acme.com`, and a
   blank name to `contact@<domain>`.
4. **Free verification layer works with no paid key.** With `/health` showing no ZeroBounce key: a
   syntactically bad address → `Invalid`; a role account (`sales@…`) or disposable domain
   (`…@mailinator.com`) → `Risky`; a domain with no MX/A record → `Invalid`; an address that passes
   syntax+MX but can't be mailbox-confirmed → `Unknown` (never falsely `Verified`).
5. **Paid layer confirms survivors only.** With a `ZEROBOUNCE_API_KEY` set, an address that passed the
   local layer is resolved to `Verified`/`Risky`/`Invalid`/`Unknown` per the ZeroBounce mapping;
   addresses the local layer already marked `Invalid`/`Risky` do **not** trigger a paid call (verify
   via logs / no credit spend).
6. **First-verified wins; else no address.** When multiple guessed patterns are tried, `_resolve()`
   stops at the first ZeroBounce-`Verified` and sets `confidence` = `max(95 − 3·index, 5)`; if none
   verify, the contact stores **no address** (`email=""`, `verification="Unknown"`, `confidence=0`) —
   the old best-ranked fallback is gone, so `Risky`/`Invalid` are never persisted on a contact.
7. **Per-company "Find contacts" works.** `POST /api/companies/{id}/find-contacts` (the research
   detail button) runs finder+verification for that one company synchronously and the returned
   `CompanyDetailOut.contacts` reflects the new rows.
8. **Contacts Review UI.** `/contacts` lists discovered contacts grouped by company with the
   verification `Badge` (Verified=ok, Risky=warn, Invalid=danger, Unknown=neutral), confidence %,
   LinkedIn link, and working Approve / Reject / inline edit-email controls (PATCH
   `/api/contacts/{id}`) — using `@theme` tokens, no hardcoded hex.
9. **No outreach without an address.** Outreach drafts are generated only for contacts with a
   non-empty `email` (ZeroBounce-verified or human-edited); a contact with no stored address gets none.

**[CHANGES] — verify the consolidation this step implements:**

10. **One merged agent, seven total.** `GET /api/campaigns/{id}/pipeline` returns **seven** agents
    (`enrichment, scoring, employee_finder, email_guess_verification, outreach, tracking, meeting`) —
    no `email_guess` or standalone `verification` row — and the campaign timeline renders seven rows.
    `.\db.ps1` shows existing users' stale `email_guess`/`verification` `agent_configs` rows cleaned up
    and an `email_guess_verification` row present.
11. **Merged run path.** `POST /api/campaigns/{id}/run-agent` with `key=email_guess_verification`
    guesses **and** verifies in one pass (contacts get an `email` and a settled `verification`); the
    old `key=email_guess` and `key=verification` are rejected with 400. Its `/pipeline` progress row
    reports completed = contacts with a non-empty `email`.
12. **Re-run force is clean, not additive.** Re-running `email_guess_verification` with `force=true`
    re-guesses and re-verifies (clears `email`/`verification`/`confidence` first); re-running
    `employee_finder` with `force=true` deletes prior contacts (and their drafts via CASCADE) before
    re-searching — no stale+new mix remains.
13. **Verifalia is gone.** `verification.py` has no `_verifalia` / `_VF_MAP`; `paid_mode` only ever
    returns `"zerobounce"` or `None`; `config.py`, `.env.example`, `requirements.txt`, the `base.py`
    registry description, and the `seed.py` demo log contain **no** mention of Verifalia. With only
    `ZEROBOUNCE_API_KEY` configured the paid layer still works; with no paid key the free layer still
    works.

**[GAP] — explicitly NOT done (tracked follow-ups):**

14. **Approval is advisory, not enforced.** `Contact.approved` is set by the Contacts UI but read by
    **nothing** in the pipeline — `orchestrator` gates outreach on `verification` only, so rejecting a
    contact does **not** stop a draft/send. Enforcing approval (gate on `approved is not False`) is not
    implemented.
15. **No manual add-contact path.** The finder's empty-state log says "add contacts manually," but
    there is **no** create-contact route or UI — a user can only edit contacts the finder already
    created. (Tracked route: `POST /api/companies/{id}/contacts`.)
16. **No per-contact re-verify / re-find.** Verification and discovery only re-run at company- or
    campaign-granularity; there's no single-contact "re-verify this address" action, and no
    `verified_at`/TTL so verdicts never auto-expire or re-check.
17. **Email guessing is pattern-only.** It permutes `name + domain` and never learns a company's
    *actual* email convention from a confirmed address (no pattern-memory across contacts of the same
    domain), and there is no catch-all detection beyond what the paid provider returns.
18. **Discovery is DuckDuckGo-only.** Coverage is thin for low-footprint companies (by design for
    zero-cost); there is **no** paid contact-data provider (Apollo / Hunter / Clearbit) and the
    built-in `DISPOSABLE_DOMAINS` blocklist is a small (~21-entry) inline set, not a maintained list.
