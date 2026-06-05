# Plan: Enrichment & Scoring Agents — bullet profile, per-metric confidence, real ICP scoring, concurrency

Spec: `.claude/specs/02-enrichment-scoring.md` · Branch: `feature/enrichment-scoring`

## Context

Enrichment + Scoring are pipeline phases 1–2 — they turn a bare CSV row into a ranked, explainable
shortlist, and the quality of the whole outbound run is set here. Both agents already exist and work,
but the spec's Overview was edited to require two real upgrades, and the product owner expanded scope
to also close the long-standing scoring/perf gaps. Concretely, today:

- **Enrichment** writes a 2–3 sentence prose `research_summary` and a single `enrichment_confidence`.
  The owner wants a **5–8 bullet profile** and a **per-metric confidence (0–100 for every field)**.
- **Scoring** (`scoring.py::_score`) derives its baseline from `sha256(company.name)` — effectively
  *fabricated* — and reads only `campaign.industry_pref`, ignoring the rich ICP the campaign already
  captures (`product`, `product_description`, `value_proposition`, `icp`, `business_requirements`,
  `ranking_criteria`, `differentiators`, `geography`, `company_size`). This violates the repo's own
  "agents never fabricate" rule and makes the score weakly grounded.
- **Enrichment runs sequentially** (one company at a time: probe + DDG search + AI call) and
  **re-probes `domain_status` on every run**, so large CSVs are slow.

**Intended outcome:** enrichment produces an honest bullet profile plus a private per-metric
confidence; scoring uses the real ICP (AI-driven, with a deterministic real-signal fallback) and
*discounts each factor by how much we trust its underlying signal*; the per-company enrichment loop
runs concurrently and stops needlessly re-probing domains. **Per the owner: per-metric confidence is
a backend-only signal that makes scoring more correct — it is NOT shown to users. Users see only the
final score/match level.**

## Scope

Owner-confirmed: **Enrichment + Scoring + Performance** (closes spec GAPs #11–#14).

1. **Data model & migration** — two new JSON columns on `Company`.
2. **Enrichment agent** — 5–8 bullet profile, per-metric confidence, honest fallbacks, domain cache.
3. **Scoring agent** — AI ICP-driven score + deterministic real-signal fallback + per-metric discount + AI-written explanation, preserving the load-bearing confidence ceiling.
4. **Concurrency** — bounded parallel enrichment with per-thread DB sessions.
5. **API schema + frontend** — expose `research_points` (user-facing); keep `metric_confidence` private; render bullets on the detail page.
6. **Spec reconciliation** — update `02-enrichment-scoring.md` so its "Database changes / Files to change / Definition of done" reflect the now-closed gaps.

**Out of scope (tracked follow-ups):** paid search provider (GAP #15); a `domain_checked_at` TTL
column (the force button covers re-checks); batched/one-shot multi-company scoring to amortize AI cost;
locking `ai._cooldown` (benign GIL-atomic race).

---

## Workstream 1 — Data model & migration

**`backend/app/models.py`** (`Company`, mirror the existing `score_factors: Mapped[list] = mapped_column(JSON, default=list)` pattern at line 121; `JSON` already imported):

```python
# after research_summary (line 119) — 5-8 bullet profile, the new primary narrative.
research_points: Mapped[list] = mapped_column(JSON, default=list)
# after enrichment_confidence (line 128) — BACKEND-ONLY; never serialized to users.
# {industry,size,location,recent_funding,recent_news,active_hiring,summary} -> 0-100.
metric_confidence: Mapped[dict] = mapped_column(JSON, default=dict)
```

**`backend/app/main.py`** lifespan — add two idempotent ALTERs inside the existing
`with engine.begin() as conn:` block (after the `domain_status` ALTER at line 51–56), matching style.
SQLAlchemy `JSON` maps to `JSONB` on Postgres, so model and DDL agree:

```python
conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS research_points JSONB NOT NULL DEFAULT '[]'::jsonb"))
conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS metric_confidence JSONB NOT NULL DEFAULT '{}'::jsonb"))
```

**Decision — keep `research_summary`, derive it from `research_points`.** `research_summary` is consumed
by `outreach.py:52,68` (email prompt + fallback), the pipeline-progress `stats()` at `campaigns.py:241`,
`admin.py:225,278`, and `seed.py:75-79`. Rather than touch all of those, enrichment will set
`research_summary = " ".join(p.rstrip(". ") + "." for p in points)` (space-join, so
`outreach.py:68`'s `.split('.')[0]` still yields a clean lead sentence and no `\n` leaks into emails).
It becomes a derived mirror authored only inside enrichment (+ static demo seed). No consumer changes.

---

## Workstream 2 — Enrichment agent (`backend/app/agents/enrichment.py`)

**2a. New AI JSON contract** (rewrite the prompt block ~lines 186–212). Replace prompt rule 4
("2–3 sentences") with "5–8 short factual bullets (each < ~160 chars, no leading dash), each grounded
in a snippet or CSV fact; return FEWER honest bullets if evidence is thin — never pad." Keep the
overall `confidence` rule and ADD a per-field `metric_confidence` rule. New return shape:

```jsonc
{ "industry": "string|null", "size": "one of SIZES|null", "location": "string|null",
  "research_points": ["...", ...],            // 5-8 strings
  "recent_funding": "string|null", "recent_news": "string|null", "active_hiring": true,
  "confidence": 0,                            // overall 0-100 -> enrichment_confidence (KEPT)
  "metric_confidence": { "industry":0,"size":0,"location":0,
    "recent_funding":0,"recent_news":0,"active_hiring":0,"summary":0 } }
```

**2b. Parsing** (rewrite ~lines 225–248): keep the existing industry/size/location and the
`confidence >= 50` gating of funding/news/hiring **verbatim**. Add:
- `research_points`: clean each (`str().strip().lstrip("-• ")`), drop blanks, cap to 8; if empty → `_fallback_points(reason="ai_unusable")`. Then `research_summary = _summary_from_points(points)`.
- `metric_confidence = _clean_metric_conf(data.get("metric_confidence"))` — validate dict, clamp each known key to 0–100, ignore the rest.
- **Sync gate:** when `confidence < 50` (funding/news/hiring nulled), also cap those three keys in `metric_confidence` to ≤20 — otherwise scoring would read a stale-high confidence for a now-empty field.

New helpers: `_summary_from_points(points) -> str`, `_clean_metric_conf(raw) -> dict`,
`_fallback_points(company, reason) -> list[str]`.

**2c. Honest fallbacks (no fabrication).** `_enrich_heuristic` (251–278), `_mark_dead_domain` (110–125),
`_mark_parked_domain` (127–144): replace the prose `research_summary` with `_fallback_points(...)` (a
short list including a "no funding/news/hiring confirmed" bullet), derive `research_summary` from it,
and set `metric_confidence = {}`. Keep their existing `recent_*=None`, `active_hiring=False`, and the
`enrichment_confidence` values (10/15/20/22/30) unchanged. The `force_ai` dead/parked warning (90–96)
becomes a leading **point** prepended to `research_points`, then re-derive the summary.

**2d. `domain_status` cache (GAP #14).** Replace the always-probe at lines 60–63 with a guard:

```python
known = (company.domain_status or "").strip().lower()
if force_ai or known in ("", "unknown"):
    status = search.domain_status(company.domain); company.domain_status = status
else:
    status = known
```

First run probes (`unknown` default); non-force bulk re-runs reuse; the per-company **Re-research**
button (force) always re-probes, covering domain recovery. No TTL column.

**Status promotion (lines 101–102) is unchanged** — still keys off `enrichment_confidence >= 40`.

---

## Workstream 3 — Scoring agent (`backend/app/agents/scoring.py`)

Keep `FACTORS` (six labels, weights sum to 1.0) and `run()` (load-all → score → sort by `ai_score` →
rank → Qualified ≤ top_n / Reviewed, preserving user-set states) **unchanged**. Delete `_h()` and
`import hashlib`; add `from app.providers.ai import ai`. Rewrite `_score()` as a dispatcher:

**3a. Dispatcher:** `AI path if ai.available else heuristic`; AI path falls back to heuristic if the AI
response is unusable. Both paths produce `(factors, explanation)`, then:
`raw = round(sum(w*score))` → `ai_score = _apply_confidence_ceiling(raw, c)` → set `match_level`, `match_explanation`.

**3b. Preserve the load-bearing ceiling** — extract lines 83–97 verbatim into a helper both paths use,
so the `enrichment_confidence` → ceiling mapping (`<20→45, <40→60, <60→75, <75→87, else 99`) is
untouched. This is the **final clamp**; the per-metric discount (below) acts on factors *before* it.

**3c. Per-metric discount** (the mechanism that makes per-metric confidence "feed scoring"):

```python
def _disc(c, key, floor=0.4):   # absent key -> 1.0, so legacy rows are unaffected
    mc = getattr(c, "metric_confidence", None) or {}
    if key not in mc: return 1.0
    return floor + (1.0 - floor) * (clamp(int(mc[key]), 0, 100) / 100.0)
```

Apply to the relevant AI/heuristic factor scores: **Industry alignment** ×`_disc("industry")`;
**Growth indicators** ×`max(_disc("recent_funding"), _disc("active_hiring"))`; **Market compatibility**
×`_disc("location")`. `floor=0.4` keeps a known-but-unverified signal from zeroing a factor (tunable).

**3d. AI ICP path** (`_score_ai`): build a prompt from the **verified** campaign ICP fields —
`product`, `product_description`, `value_proposition`, `industry`, `differentiators`, `icp`,
`industry_pref`, `business_requirements`, `ranking_criteria`, `geography`, `company_size` — plus the
company's `research_points` + signals. Ask for `{"scores": {<the six labels>: 0-100},
"match_explanation": "2-3 sentences"}`. Parse via `ai.complete_json` (returns `None` on garbage →
fall back); clamp each label to 0–100 (default 50 on missing), apply 3c discounts, clamp to 5–99.
Use the AI's `match_explanation`, with a deterministic backstop.

**3e. Deterministic fallback** (`_score_heuristic`, replaces the name-hash — closes GAP #11): build
factor scores from **real signals only** — `base = 45 + min(len(research_points),6)*3` (research depth,
not randomness), `+industry_match`, `+funding/+hiring` and `-news_penalty` (all naturally 0 on
heuristic-enriched rows since those signals stay None/False), plus a small bump when
`business_requirements` is set and there's real evidence. Apply 3c discounts; clamp 5–99. A
dead-domain company (0 points, conf 10) lands at `base=45` then the `conf<20→45` ceiling → **Weak**,
never Strong; a well-researched, ICP-matching company climbs into Strong. Identical names no longer
collide into fabricated scores.

**3f. AI-written `match_explanation` (closes GAP #12):** from the AI in the AI path; a deterministic
`_auto_explanation(c, factors)` (mirroring the current prose at 105–122, citing confidence) as the
backstop and the heuristic-path explanation.

---

## Workstream 4 — Concurrency (`backend/app/agents/orchestrator.py`)

**Approach (safest):** bounded `ThreadPoolExecutor`; **each worker opens its own `SessionLocal()`**,
re-fetches `Company` + `Campaign` by id, runs the existing `enrichment_agent.run` on that private
session, commits, closes. This needs **zero change to `enrichment_agent.run`'s body or signature** and
sidesteps SQLAlchemy's non-thread-safe `Session` (the orchestrator's ORM objects must never cross into
a worker — pass plain ids).

```python
import concurrent.futures as _futures
from app.core.database import SessionLocal
ENRICH_MAX_WORKERS = 4   # external rate limits (DDG throttle, AI 429 cooldown) dominate, not CPU

def _enrich_one(company_id, campaign_id, owner_id, force_ai):
    db = SessionLocal()
    try:
        co, camp = db.get(Company, company_id), db.get(Campaign, campaign_id)
        if co and camp: enrichment_agent.run(db, co, camp, owner_id, force_ai=force_ai)
    except Exception:
        try: enrichment_agent.log(db, owner_id, f"Enrichment failed for company {company_id}.", level="error")
        except Exception: pass
    finally: db.close()

def _run_enrichment_concurrent(companies, campaign_id, owner_id, force_ai):
    ids = [c.id for c in companies]                       # capture ids BEFORE submitting
    if not ids: return
    with _futures.ThreadPoolExecutor(max_workers=min(ENRICH_MAX_WORKERS, len(ids)),
                                     thread_name_prefix="enrich") as pool:
        for f in _futures.as_completed([pool.submit(_enrich_one, i, campaign_id, owner_id, force_ai) for i in ids]):
            f.result()
```

Rewire both enrichment call sites to call `_run_enrichment_concurrent(companies, campaign.id, owner_id, force_ai=...)`:
the full-pipeline Phase 1 (lines 216–220, `force_ai=False`) and the on-demand branch (164–174,
`force_ai=force`). The single-company **Re-research** route (`companies.py`, request session) stays serial.

**Why this is correct:**
- `_phase` + `mark()` stay single-threaded on the **main** session; `_run_enrichment_concurrent`
  **blocks until the pool joins**, so `mark("Idle")` and Phase-2 scoring only run after every worker
  has committed — the enrichment→scoring ordering is preserved.
- Per-company `self.log` runs on the worker's private session; the WS push in `add_log → notify` is
  already designed for threadpool callers (`ws.py` schedules on the captured main loop; CLAUDE.md confirms).
- `_enrich_one` swallows+logs per-company errors → one bad company can't abort the batch (mirrors the
  finder's tolerance at `orchestrator.py:131-137`).

**Pool coupling (must-do):** the engine is unsized (`core/database.py:8` → default pool_size 5 +
overflow 10 = 15). 4 workers is safe. To prevent silent drift if anyone raises the worker count, pin
sizing explicitly: `create_engine(settings.database_url, pool_pre_ping=True, future=True,
pool_size=ENRICH_MAX_WORKERS + 5, max_overflow=10)`. (Optionally surface `ENRICH_MAX_WORKERS` via
`settings`.)

---

## Workstream 5 — API schema & frontend

- **`backend/app/schemas.py`** — add **only** `research_points: list[str] = []` to `CompanyOut`
  (after `research_summary`, line 184). **Do NOT add `metric_confidence`** to any schema — omitting it
  guarantees Pydantic never serializes it (it flows nowhere user-facing). `serializers.py::company_out`
  uses `CompanyOut.model_validate` (`from_attributes=True`) → no serializer change; `CompanyDetailOut`
  inherits the field; `companies.py:29`'s `model_dump()` carries it to the detail response.
- **`web/src/lib/api-types.ts`** — add `research_points: string[];` to `interface Company` (after
  `research_summary`, line 71). Do **not** add `metric_confidence`. (`enrichment_confidence` stays
  defined-but-unrendered.)
- **`web/src/app/(app)/research/[id]/CompanyDetail.tsx`** — replace the single `<p>` at line 155 with a
  bullet `<ul>` over `research_points` (dot marker `bg-brand-600`, text `text-ink-700` — existing
  `@theme` tokens, no hex), **falling back** to the `research_summary` `<p>` when `research_points` is
  empty (legacy rows), then to "Not yet researched." The surrounding Card / `recent_news` /
  `match_explanation` blocks are unchanged. It's a `"use client"` component, so Next.js 16
  server-component rules don't apply here (still: read `web/node_modules/next/dist/docs/` before any
  server-side/routing change).
- **List view (`research/page.tsx`) — no change.** It shows rank/score/match/status only; the owner
  wants confidence hidden and only the final score shown, which is already the case.
- **Optional debug (low priority):** add `"research_points"` (and, admin-only, `"metric_confidence"`)
  to the hand-rolled dicts in `admin.py:225,278`; add `jsonb_array_length(research_points) AS pts` to
  the `db.ps1` companies SELECT (81–95). The `db.ps1` single-company `SELECT *` already shows both new columns.

---

## Backward-compatibility & consumer audit

| Consumer | Field | Status |
| --- | --- | --- |
| `outreach.py:52` (email prompt) | `research_summary` | SAFE — derived mirror, always populated |
| `outreach.py:68` (`.split('.')[0]`) | `research_summary` | SAFE — space-join keeps a clean first sentence |
| `campaigns.py:241` (enrichment stats) | `research_summary` | SAFE — non-empty when ≥1 point (fallbacks guarantee ≥1) |
| `scoring.py` ceiling | `enrichment_confidence` | SAFE — preserved verbatim in `_apply_confidence_ceiling` |
| `companies.py:29` `model_dump()` | CompanyOut fields | SAFE — `research_points` flows; `metric_confidence` absent by design |
| `admin.py:225,278`, `seed.py:75-79` | `research_summary` | SAFE — column retained (optionally enrich seed with points) |
| Legacy/un-enriched rows | `research_points=[]`, `metric_confidence={}` | SAFE — `_disc` returns 1.0; FE guards on length; heuristic base=45 |

---

## Risks & mitigations

1. **DB pool ceiling** (top risk). 4 workers + orchestrator + API ≪ 15. Pin `pool_size=ENRICH_MAX_WORKERS+5` so worker count and pool can't drift (raising workers without the pool would silently serialize on `pool_timeout`).
2. **AI cost/latency** — scoring now makes ~1 AI call per company (was zero). The failover chain + 429 cooldown degrades to the deterministic heuristic mid-run (graceful). Flag token budget; batched scoring is a future optimization.
3. **Email-copy shift** — outreach now gets bullet-joined text instead of authored prose. Likely equal/better (more facts); sanity-check one generated email post-change.
4. **Tuning** — `floor=0.4`, the heuristic `base` curve, and 5/99 clamps interplay with the unchanged ceiling thresholds. Do one calibration pass against the seeded Apex companies.
5. **Domain cache staleness** — recovery not re-detected on non-force bulk runs; the per-company Re-research (force) button covers it.
6. **`metric_confidence` leakage** — guaranteed not serialized (absent from every Pydantic schema and `api-types.ts`). Verify with a curl of `/api/companies/{id}`.

---

## Verification plan

Stack: `docker compose up -d` (Postgres :5433) · `uvicorn app.main:app --reload --port 8000` ·
`npm run dev` (:3000). Inspect with `.\db.ps1`. There is no automated suite; `npm run build` is the
frontend typecheck gate.

1. **Migration** — boot backend; `.\db.ps1 sql "SELECT research_points, metric_confidence FROM companies LIMIT 1"` returns the new columns (`[]` / `{}` on old rows). Confirm no boot error.
2. **Bullet profile** — upload a CSV (mix of real/parked/dead domains), Run all agents; `GET /api/companies/{id}` returns `research_points` (5–8 for live+AI; ≥1 honest bullet for fallbacks); the detail page renders bullets; dead/parked rows render the honest low-evidence bullets.
3. **`metric_confidence` is private** — confirm it is **absent** from `/api/companies/{id}` JSON and the UI, but present in `.\db.ps1 sql "SELECT metric_confidence FROM companies WHERE ..."`.
4. **Real ICP scoring** — set a campaign with distinctive `business_requirements`/`industry_pref`; verify a clearly-matching company outscores a clearly-irrelevant one with the *same name length* (proving the name-hash is gone); `score_factors` has the six factors (weights sum to 1.0); `match_explanation` reads as AI prose (or the deterministic backstop with no AI key).
5. **Confidence discount + ceiling** — a low per-metric-confidence company has its Industry/Growth/Market factors visibly discounted; a dead-domain company stays **Weak** (ceiling intact).
6. **Graceful degradation** — with no AI key (`/health` shows AI absent), both agents still complete: bullets are CSV-derived/honest, scoring uses the deterministic real-signal fallback, no fabricated signals.
7. **Concurrency** — Run all agents on a ~20–50 company CSV; confirm wall-clock drops vs. before, logs show interleaved per-company enrichment lines, ranks/scores are complete (ordering preserved), and no session/connection errors in the backend log.
8. **Domain cache** — re-run enrichment non-force; confirm no re-probe (status reused) in logs; click per-company Re-research; confirm it re-probes.
9. **Regression (spec DoD #1–#10)** — re-confirm the AS-BUILT checklist still passes (status lifecycle, user-set state preservation on re-score, force re-research warning, pipeline `completed` counts).
10. **Frontend build** — `npm run build` passes (typechecks the new `research_points` field and JSX).

---

## Spec reconciliation (housekeeping)

Update `.claude/specs/02-enrichment-scoring.md` so it stops contradicting the new scope: change
"Database changes: none" → the two new JSON columns; move GAPs #11–#14 from "explicitly NOT done" into
the implemented set; update DoD item 4 (summary is now bullets) and add the new verification items
above. Keep it the canonical Step-02 record.

## Files touched (summary)

- **Backend:** `models.py` (2 columns), `main.py` (2 ALTERs), `agents/enrichment.py` (profile +
  per-metric conf + cache + honest fallbacks), `agents/scoring.py` (ICP AI + deterministic fallback +
  discount + AI explanation; remove name-hash), `agents/orchestrator.py` (concurrency helpers + 2
  rewires), `core/database.py` (pin pool size), `schemas.py` (`research_points` on `CompanyOut`).
  Optional: `admin.py`, `db.ps1` debug fields.
- **Frontend:** `lib/api-types.ts` (`research_points`), `research/[id]/CompanyDetail.tsx` (bullet list).
- **Docs:** `.claude/specs/02-enrichment-scoring.md`, and `README.md` (running context log, per CLAUDE.md).
