# Spec: Contact Search Enhancement

> **Status note:** This is a **forward enhancement** of Step 03's contact discovery — it rewrites the
> finder's *search strategy and filtering*, it does not add a new agent. It stays **100% zero-cost**
> (DuckDuckGo via `ddgs`, no paid search/data provider). Tags: **[NEW]** (built this step),
> **[GAP]** (still deferred).

## Overview

Step 03's employee finder is correct in principle but under-performs on DuckDuckGo: it fires a single
heavy, operator-stuffed query per company (`"Notion" site:linkedin.com/in/ "VP Sales" OR "CRO" OR …`)
which DuckDuckGo answers poorly, so most companies return **too few** contacts — and the loose
filters occasionally let **junk** through (e.g. for *Notion Labs* it surfaced a *Marketing Manager*
and an *Investment Analyst*). This step keeps the exact extraction model the user described —
**read the search-result title + snippet, pull the name/role, keep the link; never open the LinkedIn
page** — and improves the two weak links: **(1)** the queries become simpler, higher-recall, and
**escalating** (try precise first, broaden only when thin), searching the brand/domain aliases too,
not just the literal CSV name; **(2)** a **deterministic commercial-role gate** drops non-sales titles
*before and independent of* the AI, and the AI ranker stops falling back to the unfiltered raw list.
It also closes the standing **manual "add contact"** gap so a user can always fill a company the tool
can't crack. The honesty rule is unchanged: **real profiles or zero — never fabricate.** This sits at
Step 06 because contact quality is the current bottleneck — verification, outreach, and meetings all
depend on the finder producing real, reachable, *sales* people.

## Depends on

- **Step 03 (Contact Discovery & Verification)** — this enhances its `employee_finder` agent and the
  `providers/search.py::find_linkedin_profiles` it calls; downstream `email_guess_verification` and
  outreach consume the contacts it produces.
- **Step 02 (Enrichment & Scoring)** — the finder only runs over the `Qualified` set (via the
  orchestrator walk), unchanged.
- **Step 01 (Registration)** — per-user auth/ownership; the new manual-add route is owner-scoped.
- **Providers** (initial commit): `providers/search.py` (DuckDuckGo via `ddgs`), `providers/ai.py`
  (the failover chain used for optional ranking).

## Routes

**[NEW]**
- `POST /api/companies/{company_id}/contacts` — manually add a contact to a company (name, role,
  optional email/linkedin). Owner-scoped; creates a `Contact` the same shape the finder would. —
  **logged-in**

**[AS-BUILT]** (unchanged, still used to drive the finder):
- `POST /api/campaigns/{campaign_id}/run-agent` `{key:"employee_finder", force}` — runs the (improved)
  finder walk. — **logged-in**
- `POST /api/companies/{company_id}/find-contacts` — per-company finder + verify. — **logged-in**
- `GET /api/contacts?campaign_id=` / `PATCH /api/contacts/{id}` — list / edit. — **logged-in**

## Database changes

**No required database changes.** Verified against the `Contact` model (`backend/app/models.py`) and
`.\db.ps1` — manual contacts use the existing columns (`name`, `role`, `email`, `linkedin`,
`verification` default `Unknown`, `confidence` default `0`, `approved`). The new route writes those
directly.

**[GAP]** Optional (not built this step): a nullable `Contact.source` column
(`linkedin_search | manual`) to distinguish hand-added contacts — would need a matching idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `main.py::lifespan`. Deferred — not required for the
flow.

## Templates

React route pages (Next.js, not server templates):
- **Create:** None.
- **Modify:**
  - `web/src/app/(app)/contacts/page.tsx` — add a working **"Add contact"** control (per company)
    that calls the new route, so the empty-state's "add contacts manually" is finally actionable.

## Files to change

**[NEW] — backend search/finder core:**
- `backend/app/providers/search.py` — rewrite `find_linkedin_profiles` to an **escalating,
  higher-recall** strategy (details in Rules): simpler natural queries, all aliases (brand +
  domain-root, not just `aliases[:2]`), early-stop when enough good contacts are found, retry/backoff
  on `ddgs` throttling, and a **deterministic commercial-role gate** + broadened title/snippet
  extraction. Keep the existing helpers (`_company_aliases`, `_employer_matches`,
  `_is_former_employee`, `_matches_any_alias`) and the "read SERP only, never fetch LinkedIn" model.
- `backend/app/agents/employee_finder.py` — harden `_rank_with_ai`: on AI failure / no-key, return the
  **role-gated** list (not the raw list); on `{"picks":[]}` keep returning zero. The finder must never
  persist a contact the role gate would reject.

**[NEW] — manual add-contact:**
- `backend/app/api/routers/companies.py` — `POST /{company_id}/contacts` (owner-checked).
- `backend/app/schemas.py` — a `ContactCreate` request schema.
- `web/src/lib/api.ts`, `web/src/lib/api-types.ts` — client method + types for the add route.
- `web/src/app/(app)/contacts/page.tsx` — the add-contact UI.

**Docs:** `CLAUDE.md` (note the finder's escalating search + role gate), `README.md` (progress log).

## Files to create

**None required** — the work extends existing files. (A small internal helper for the role gate /
query builder may be added inside `search.py` rather than a new module.)

## New dependencies

**No new dependencies.** Search stays on `ddgs`; HTTP on `httpx`; AI on the existing chain — all
already present. Any additional free search **backend** is reached through `ddgs`'s existing backend
option, not a new package.

## Rules for implementation

- **Stay zero-cost.** DuckDuckGo (`ddgs`) remains the only source — **no** paid search/contact
  provider (Apollo/Hunter/SerpAPI). With no `ddgs` available, the finder returns zero gracefully.
- **Never open LinkedIn.** Extraction reads only the **search-result title + snippet** (as today),
  parses `Name — Role at Company`, and keeps the `linkedin.com/in/` URL as the link. Do **not** fetch
  or scrape the profile page.
- **Escalating, recall-first queries.** Replace the single heavy query with an ordered set, stopping
  as soon as `count` good contacts are found (keeps it fast + rate-limit-friendly):
  1. precise: `"<alias>" site:linkedin.com/in/ "<sales titles>"` (today's form, kept as tier 1);
  2. **simple/natural** (the high-recall win): `<brand> head of sales`, `<brand> vp sales`,
     `<brand> sales director`, `<brand> sales` — looser queries DuckDuckGo answers far better; then
     **keep only results whose URL is a `/in/` profile and whose title parses to a person + sales
     role** (this filter *is* the "read the title, if it matches, take the link");
  3. founder/CEO fallback for small companies.
  Search across **all** aliases (brand + domain-root included), not just the first two.
- **Deterministic commercial-role gate (the false-positive fix).** A parsed role is kept only if it
  contains a recognized **commercial keyword** (sales, revenue, CRO, account executive/director,
  go-to-market, commercial — *not* marketing/BD/partnerships) **or** a small-company leadership term
  (founder/CEO/president/managing director). Titles like *Marketing Manager* or *Investment Analyst*
  are dropped here — **before and independent of** the AI. Tighten the existing `_role_is_unusable`
  (today it only rejects single-token roles) so multi-token non-sales titles no longer slip through.
- **AI ranker is additive, never a junk source.** `_rank_with_ai` still filters/orders when AI is
  available, but on failure / no key it must return the **role-gated** candidate list, not the raw
  search list. `{"picks":[]}` still means "surface zero." Keep the strict prompt.
- **Preserve existing safety filters:** alias match, employer match, former-employee detection,
  per-URL dedup (now across all tiers). One bad query must not abort the search (continue on error);
  add light retry/backoff for `ddgs` throttling.
- **Honesty over completeness — unchanged.** Real profiles or **zero**. No hardcoded names, no
  heuristic name generation, no fabrication. A genuinely unfindable company ends with zero contacts.
- **Manual add-contact** is owner-scoped, validates input, and creates a `Contact` with
  `verification="Unknown"`, `confidence=0` (the email is still subject to the Step-03 ZeroBounce
  verify before outreach). Use `add_log()` for the audit line.
- **Frontend is Next.js 16** — read the relevant guide under `web/node_modules/next/dist/docs/` before
  routing/server-component work; Tailwind v4 `@theme` tokens, existing `Card`/`Button` primitives,
  **no hardcoded hex**.
- **Use `self.log()` / `add_log()`** for audit lines; never write `Log` rows directly.

## Definition of done

Verifiable by running the stack (`docker compose up -d`, uvicorn :8000, `npm run dev` :3000) and
inspecting with `.\db.ps1` / the Contacts page.

1. **Brand-name companies resolve.** Running the finder on a brand-vs-legal-name company (e.g. *Notion
   Labs* / notion.so) now searches the brand ("Notion") too and surfaces **real sales** contacts (or
   an honest zero) — and the previously-seen *Marketing Manager* / *Investment Analyst* do **not**
   appear.
2. **Simpler queries fire.** Logs/inspection show plain natural queries (`<brand> head of sales`,
   etc.) are issued, not only the `site:linkedin.com/in/` form; more sample companies yield ≥1 contact
   than before the change.
3. **Escalation + early stop.** The precise query runs first; broader tiers fire only when results are
   thin; the search stops once `count` good contacts are found (verify via query logs / call count).
4. **Role gate drops non-sales — without AI.** With the AI key removed, a candidate parsed as
   `… — Investment Analyst` or `… — Marketing Manager` is **not** saved; a `… — VP Sales` /
   `… — Head of Sales` is.
5. **AI-off fallback is clean.** With no AI key, the finder returns role-gated contacts (no junk), not
   the raw search list; with AI on, `{"picks":[]}` still yields zero.
6. **No LinkedIn scraping.** Only SERP title/snippet is used — no `httpx` GET to `linkedin.com/in/…`
   profile pages anywhere in the finder path.
7. **Manual add works.** `POST /api/companies/{id}/contacts` creates a contact (owner-scoped; 404 for
   another user's company); it appears on `/contacts`, and the page has a working "Add contact"
   control using `@theme` tokens (no hardcoded hex).
8. **Honesty preserved.** A company with genuinely no findable contacts still ends with **zero**
   (no fabricated names), and the "add contacts manually or re-run" log still fires.
9. **Build gate.** `npm run build` passes (typecheck) and the backend imports/compiles cleanly;
   `/health` 200.

**[GAP] — explicitly not in scope:** paid search/contact-data providers (Apollo/Hunter/SerpAPI), a
`Contact.source` column, per-contact re-verify, and approval-enforcement on outreach (still tracked
from Step 03).
