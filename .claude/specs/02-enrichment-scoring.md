# Spec: Enrichment and Scoring Agents

> **Status note:** Phases 1–2 (`backend/app/agents/enrichment.py`, `scoring.py`) existed before
> this step. On the `feature/enrichment-scoring` branch they were **upgraded** to: a **5–8 bullet
> research profile**, a **per-metric confidence** signal (backend-only — feeds scoring, never shown
> to users), **real ICP-driven scoring** (AI-driven against the full campaign ICP, with a
> deterministic real-signal fallback that replaces the old `sha256(name)` baseline), AI-written
> match explanations, **concurrent enrichment**, and **domain-status caching**. This closes the
> gaps previously tracked as #11–#14. Sections tagged **[AS-BUILT]** describe behavior preserved
> from before; **[DONE]** marks what this step implemented.

## Overview

Enrichment and Scoring are pipeline stages 1 and 2 — the research brain that turns a bare
CSV row (name + domain + maybe industry/location) into a ranked, explainable shortlist of
companies worth contacting. 
**Enrichment** probes each company's domain for liveness (`live | parked | dead`), runs a DuckDuckGo search by name/domain, and asks the AI chain (Gemini → Groq → OpenRouter) to write an honest 5-8 pointer profile plus structured signals (industry, size, location, recent funding, recent news, active hiring) and a 0–100
`enrichment_confidence` for every metric.
**Scoring** then applies a weighted, six-factor heuristic against the
campaign's ICP (product, requirements, industry preferences), caps the result by `enrichment_confidence` so a thin/hallucinated profile can never out-rank a well-researched one, ranks every company, and promotes the top-N to `Qualified`. They sit at Step 02 because every later stage (employee finder, email guessing/verification, outreach) operates only on the `Qualified` set this stage produces — the quality of the entire outbound run is set here.

The core design principle, enforced throughout both agents, is **honesty over completeness**:
dead/parked domains get low-confidence summaries that say so plainly, the AI is instructed to
return `null` for any field a search snippet doesn't support, and confidence ceilings in scoring
keep evidence-free companies out of the "Strong"/"Good" bands. Both stages **degrade gracefully**
with zero credentials — no AI key falls back to a deterministic heuristic; no `ddgs` package
falls back to domain-status-only enrichment.

## Depends on

- **Step 01 (Registration)** — both agents are per-user scoped; they `mark()` status on the
  user's `AgentConfig` rows (created by `ensure_agents()` at registration) and write per-user
  audit logs. A verified, authenticated user is the precondition for owning a campaign.
- **Campaign + CSV upload** (already in the initial commit): `POST /api/campaigns` and
  `POST /api/campaigns/{id}/companies` create the `Campaign` (product, product_description,
  requirements, industry_pref, top_n) and the `Company` rows (`status="Researching"`) that
  enrichment/scoring consume.
- **Providers** (initial commit): `providers/search.py` (`domain_status`, `research_company`),
  `providers/ai.py` (the failover chain), and `services/events.py` (`add_log`).

## Routes

**[AS-BUILT]** — no routes are unique to enrichment/scoring; they're driven through the generic
campaign-pipeline endpoints in `backend/app/api/routers/campaigns.py`:

- `POST /api/campaigns/{campaign_id}/run` — kicks off the full Phase 1–6 pipeline as a
  background task (`run_campaign_pipeline`), which runs enrichment then scoring first. — **logged-in**
- `POST /api/campaigns/{campaign_id}/run-agent` — body `{key, force}`; runs a single stage
  on demand. `key` ∈ `RUNNABLE_KEYS` (includes `enrichment` and `scoring`). Enrichment maps
  `force` → `force_ai` (re-research even dead/parked domains). — **logged-in**
- `GET /api/campaigns/{campaign_id}/pipeline` — per-agent status/progress. For `enrichment`,
  completed = companies with a non-empty `research_summary`; for `scoring`, completed =
  companies with `rank > 0`. — **logged-in**
- `GET /api/companies/{id}` (research detail) and the campaign companies list — read the
  enrichment/scoring output fields. — **logged-in**

**No new routes.**

## Database changes

**[DONE] Two new JSON columns on `Company`** (`backend/app/models.py`), mirroring the existing
`score_factors` JSON pattern:

| Column | Type | Written by | Notes |
| --- | --- | --- | --- |
| `research_points` | JSON (list of strings) | enrichment | 5–8 bullet profile; **user-facing** |
| `metric_confidence` | JSON (dict `field→0–100`) | enrichment; read by scoring | **backend-only** — never in `CompanyOut`/UI |

Per CLAUDE.md (no Alembic) the matching idempotent statements were added to `main.py::lifespan`:
`ALTER TABLE companies ADD COLUMN IF NOT EXISTS research_points JSONB NOT NULL DEFAULT '[]'::jsonb`
and `... metric_confidence JSONB NOT NULL DEFAULT '{}'::jsonb`. `research_summary` is retained and
auto-derived from `research_points` (space-joined) so existing consumers keep working unchanged. All
other fields (`ai_score`, `rank`, `match_level`, `match_explanation`, `score_factors`,
`enrichment_confidence`, `domain_status`, `recent_*`, `active_hiring`, `status`) are unchanged.

## Templates

This is a Next.js + FastAPI app, not a server-rendered template stack — "templates" maps to React
route pages. Both surfaces below already exist and consume the as-built fields.

- **Create:** None.
- **Modify (only if closing gaps):**
  - `web/src/app/(app)/research/[id]/CompanyDetail.tsx` — where the research summary,
    `domain_status` banner, `score_factors` breakdown, `match_level`, and
    `enrichment_confidence` are shown. Any UI gap work lands here.
  - `web/src/app/(app)/campaigns/[id]/page.tsx` — the per-agent pipeline timeline with the
    enrichment/scoring **Run** / **Re-run (force)** buttons and progress counts.

## Files to change

**[DONE]** on `feature/enrichment-scoring`:
- `backend/app/models.py` — `research_points`, `metric_confidence` columns.
- `backend/app/main.py` — two idempotent `ALTER TABLE` migrations.
- `backend/app/agents/enrichment.py` — bullet profile + per-metric confidence + honest fallbacks +
  domain-status cache; `research_summary` now derived from points.
- `backend/app/agents/scoring.py` — AI ICP scoring + deterministic real-signal fallback (name-hash
  removed) + per-metric discount + AI-written explanation; the `enrichment_confidence` ceiling
  preserved as the final clamp.
- `backend/app/agents/orchestrator.py` — `_enrich_one` / `_run_enrichment_concurrent` (bounded
  ThreadPoolExecutor, one private session per worker) wired into Phase 1 and the on-demand branch.
- `backend/app/core/database.py` — pinned engine `pool_size`/`max_overflow` to hold the workers.
- `backend/app/schemas.py` — `research_points` added to `CompanyOut` (`metric_confidence` excluded).
- `web/src/lib/api-types.ts` — `research_points: string[]` on `Company`.
- `web/src/app/(app)/research/[id]/CompanyDetail.tsx` — bullet list with prose fallback.
- `backend/app/api/routers/admin.py`, `db.ps1`, `backend/app/services/seed.py` — debug/demo surfaces.

## Files to create

**None.**

## New dependencies

**No new dependencies.** Search uses `ddgs`, AI uses `httpx` (no SDKs, per CLAUDE.md), both
already present. **[GAP]** parallelizing enrichment would use the stdlib (`concurrent.futures`)
or the existing async stack — still no new package.

## Rules for implementation

Follow this codebase's conventions, **not** generic defaults:

- **Agents never fabricate.** Enrichment returns honest low-confidence summaries for parked/dead
  domains and instructs the AI to return `null` for any field no snippet supports. Do **not**
  reintroduce hash-derived fake signals (`recent_funding`/`recent_news`/`active_hiring` must stay
  `None`/`False` in the heuristic fallback — the old name-hash version let dead domains score ~99).
- **Confidence caps are load-bearing.** `enrichment_confidence` caps `ai_score` ceilings in
  scoring (`<20→45`, `<40→60`, `<60→75`, `<75→87`, else `99`). Never let a low-evidence company
  reach "Strong"/"Good". Enrichment also caps confidence ≤25 when `force_ai` runs on a dead/parked
  domain, and ≤25 when there were no real search snippets.
- **Status lifecycle:** a company leaves `Researching` only after enrichment. Scoring sets
  `Qualified` (rank ≤ `top_n`) or `Reviewed` (below), and must **preserve user-set states**
  (`Excluded`, `Approved`, `Contacted`) — only toggle the automatic `Researching/Qualified/Reviewed`.
- **Use the failover AI chain via `providers/ai.py`** (`ai.complete_json`) — never call an LLM
  SDK directly. Honor `ai.available`: with no key, take the heuristic path.
- **Graceful degradation is mandatory.** Both stages must complete with zero credentials
  (no AI, no `ddgs`) and produce sensible, clearly-labeled fallback output.
- **`force` semantics:** for enrichment, `force=True` → `force_ai=True` ("re-research even a
  dead/parked domain, search by name"). The bulk pipeline calls enrichment with `force_ai=False`
  (skip AI for dead/parked to save tokens) but always re-runs scoring fresh.
- **Use `add_log()` from `services/events.py`** (via `self.log()` on the agent) for audit lines —
  never write `Log` rows directly. Use `self.mark(db, owner_id, "Running"|"Idle"|"Error")` to
  drive the per-user agent status the UI reads; the orchestrator's `_phase()` already wraps this.
- **`scoring` runs across the whole campaign at once** (`scoring_agent.run(db, campaign, owner_id)`),
  not per-company — it needs the full set to rank. Don't change that contract.
- **Frontend is Next.js 16** — read the relevant guide under `web/node_modules/next/dist/docs/`
  before touching routing/server-component behavior. Use Tailwind v4 `@theme` tokens in
  `globals.css` — **never hardcode hex colors**.

## Definition of done

Each item is verifiable by running the stack (`docker compose up -d`, uvicorn on :8000,
`npm run dev` on :3000) and inspecting with `.\db.ps1`.

**[AS-BUILT] — confirm these still pass (regression checklist):**
1. Upload a CSV of companies (mix of real, parked, and dead domains) and click **Run all
   agents**. `.\db.ps1 user <email>` shows every company moved out of `Researching` and given a
   non-empty `research_summary`, an `ai_score > 0`, a `rank`, and a `match_level`.
2. A company with a **dead** domain ends with `domain_status = dead`, `enrichment_confidence ≤ 15`,
   `recent_funding/recent_news = null`, `active_hiring = false`, and a summary that explicitly
   says the site didn't respond — and its `match_level` is **Weak** (never Strong/Good).
3. A company with a **parked** domain ends with `domain_status = parked`, low confidence, and a
   summary naming the placeholder/parking page.
4. With an AI key configured and a **live** company, `research_points` holds a **5–8 bullet**
   web-sourced profile (rendered as a list on the detail page), `enrichment_confidence` is
   meaningfully higher, and signals reflect actual snippets.
5. With **no** AI key (`/health` shows AI absent), enrichment still completes via the heuristic
   fallback: `research_points` is CSV-derived and labeled as such, confidence is the heuristic value
   (`no_ai_key`≈30 / `no_snippets`≈20 / `ai_unusable`≈22), and no fake signals appear.
6. Scoring `score_factors` JSON has the six labeled factors with weights summing to 1.0
   (Product fit .30, Industry alignment .20, Company relevance .15, Requirement satisfaction .15,
   Market compatibility .10, Growth indicators .10), and `match_explanation` cites confidence.
7. After scoring, exactly `min(top_n, n)` companies are `Qualified` (top by rank); the rest are
   `Reviewed`. Re-running **scoring** alone does not flip a manually `Excluded`/`Approved` company.
8. **Re-run enrichment with force** on a dead/parked company: the AI path runs anyway (search by
   name), confidence is capped ≤25, and the summary is prefixed with a site-status warning.
9. `GET /api/campaigns/{id}/pipeline` reports enrichment `completed` = companies with a summary
   and scoring `completed` = companies with `rank > 0`; the UI timeline reflects the same counts.
10. The research detail page renders the **bullet** `research_points` (falling back to the prose
    `research_summary` for legacy rows), a `domain_status` banner, the `score_factors` breakdown,
    and the `match_level` badge — no hardcoded hex (uses `@theme` tokens).

**[DONE] — implemented this step (closes prior GAPs #11–#14):**
11. **Real ICP scoring.** `_score()` no longer uses `sha256(name)`. With an AI key it scores against
    the full ICP (`product`, `product_description`, `value_proposition`, `icp`, `industry_pref`,
    `business_requirements`, `ranking_criteria`, `geography`, `company_size`, `differentiators`)
    using the enrichment profile; with no key, a deterministic real-signal heuristic (research depth
    + industry/funding/hiring/news) drives it. Per-metric `metric_confidence` discounts the relevant
    factors; the `enrichment_confidence` ceiling remains the final clamp.
12. **AI-written `match_explanation`** in the AI path, with a deterministic backstop.
13. **Concurrent enrichment** — bounded thread pool, one private DB session per worker (engine pool
    pinned to match); **`domain_status` is cached** (re-probed only on force or when `unknown`).
14. **Per-metric confidence** is produced for every metric and consumed by scoring (backend-only;
    absent from `CompanyOut`/UI — verify it never appears in `GET /api/companies/{id}`).

**[GAP] — explicitly NOT done (tracked follow-ups):**
15. **Search is DuckDuckGo-only** with no paid/fallback search provider, so coverage for
    low-footprint companies is thin (by design for zero-cost; a paid option is absent). No
    `domain_checked_at` TTL column (the per-company Re-research force button covers re-checks);
    scoring makes one AI call per company (batched scoring is a future optimization).
