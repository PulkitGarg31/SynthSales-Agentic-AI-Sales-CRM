# Design Spec — Verified-Contact Directory + Pipeline Undo

- **Date:** 2026-06-13
- **Status:** Implemented 2026-06-13 (backend; frontend Undo button still a follow-up)
- **Scope:** Backend only (`backend/`). Frontend Undo button + confirmation pop-up are a follow-up.
- **Migrations:** No Alembic. Two brand-new tables come up via `Base.metadata.create_all` in `main.py::lifespan` — no `ALTER` needed.

## Context

Two **independent** backend features for the Sellari AI agent pipeline:

1. **Verified-contact directory** — a global, cross-tenant table of verified contacts keyed by company. A company's contact verified once is reused everywhere, saving the employee-finder's time and the verification API credits.
2. **Cascade-clear + one-level undo** — re-running a pipeline agent clears its successors' output (matching CLAUDE.md's intent, which the code never fully implemented take care of exception mention in it). A single 24h-restorable snapshot per campaign lets the user undo the last destructive operation. Live conversations are structurally protected and disable undo.

They share no code beyond both touching `agents/orchestrator.py` and `agents/email_guess_verification.py`. They can be built and reviewed separately.

---

## Feature 1 — Verified-contact directory

### Goal
When the merged guess-verify agent confirms a contact (`verification == "Verified"` with a real address), record it in a global table keyed by the company. When **any** user later processes the same company, seed those contacts directly and **skip the finder + verification** for that company. Decision (confirmed): *reuse & skip* — the directory is authoritative; reuse is unconditional (applies on first run and on forced re-runs).

### New table `verified_contacts`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `domain_key` | str(200), indexed | Normalized website domain. Primary match key. `""` when the company has no domain. |
| `name_key` | str(200), indexed | Normalized company name. Fallback match when `domain_key == ""`. |
| `company_name` | str(200) | Display / provenance. |
| `contact_name` | str(120) | |
| `role` | str(120) | |
| `email` | str(255) | The verified address. |
| `linkedin` | str(255) nullable | |
| `confidence` | int | Carried from the source contact. |
| `first_seen_at` | datetime, default `utcnow` | |
| `last_verified_at` | datetime, default `utcnow` | Bumped on every re-confirm. Stored for a future staleness/refresh policy (not used now). |

**Unique constraint:** `(domain_key, name_key, email)` — makes the write an idempotent upsert and covers both the domain-keyed and the blank-domain/name-keyed cases without collision.

### Normalization (a small pure helper, e.g. `services/contact_directory.py`)
- `domain_key(domain)` → lowercase, strip scheme (`https://`), strip path/query, strip leading `www.`. Empty in → empty out.
- `name_key(name)` → lowercase, keep alphanumerics, collapse whitespace.

### New service module `app/services/contact_directory.py`
- `record_verified(db, company) -> int` — for every `company.contact` that is `Verified` with an email, upsert into `verified_contacts` keyed by `(domain_key, name_key, email)`; on conflict bump `last_verified_at` + fields. Returns count recorded.
- `seed_company(db, company) -> int` — look up rows by `domain_key` (or `name_key` when the company has no domain); for each hit whose email isn't already on the company, insert a `Contact(company_id=company.id, name, role, email, linkedin, verification="Verified", confidence, approved=None)`. Returns count seeded.

### Write integration — `agents/email_guess_verification.py`
At the **end** of `EmailGuessVerificationAgent.run()` (after the existing rollup `db.commit()`), call `contact_directory.record_verified(db, company)`. Only `Verified` contacts are recorded (never `Risky`/best-guess).

### Read integration — `agents/orchestrator.py::_walk_for_contactable`
Inside the per-candidate loop, **before** invoking the finder for a company that needs contacts:
```
seeded = contact_directory.seed_company(db, c)
if seeded:
    # company is contactable from the directory — skip the finder entirely
else:
    employee_finder_agent.run(db, c, owner_id, force=force)
```
The seed must run **after** the force-wipe at the top of `_walk_for_contactable` so it isn't deleted. De-dupe by email so a surviving locked contact (see Feature 2) isn't duplicated.

### Net effect
A company already in the directory costs **0 finder searches** and **0 verification credits**: seeded contacts are `Verified`, so the guess-verify phase's existing `_confirmed()` short-circuit skips Hunter and the paid verifier for them. Enrichment + scoring still run (we still need a research summary and a score to rank the company).

### Notes / decisions
- **Cross-tenant reuse is intentional** (User B benefits from User A's verified contacts — standard for B2B data tooling).
- **No expiry/refresh** of directory entries for now (YAGNI). `last_verified_at` is captured so a future refresh policy is possible.
- A forced finder re-run on a company in the directory re-seeds from the directory rather than re-searching (consistent with *reuse & skip*).

---

## Feature 2 — Cascade-clear + one-level undo

### Pipeline output order and per-agent owned output
Output-producing agents, in order (tracking / meeting / reply_classifier are **not** part of this):

| # | Agent | Owned output |
|---|---|---|
| 1 | enrichment | `Company`: `research_summary, research_points, recent_funding, recent_news, active_hiring, enrichment_confidence, metric_confidence, domain_status` (+ AI-filled `industry/size/location`) |
| 2 | scoring | `Company`: `ai_score, rank, match_level, match_explanation, score_factors`, and `status` **only** when toggling among `Researching/Qualified/Reviewed` |
| 3 | employee_finder | `Contact` rows |
| 4 | email_guess_verification | `Contact.email, verification, confidence` (on non-`Verified` contacts) |
| 5 | outreach | `EmailDraft` rows |

### Conversation lock invariant (the core protection)
- **`locked(contact)` ⟺ a `Thread` exists with `thread.contact_id == contact.id`** (a `/send` created it → real conversation). Verified earlier: `/send` creates the `Thread(contact_id=…)`, the outbound `Message`, sets `draft.state="Sent"` and `company.status="Contacted"`.
- **No clear path ever deletes a locked contact.** This holds for the per-agent cascade re-run, the full pipeline, the finder's force-wipe, and undo-restore. Threads, all their messages, and the contact link therefore survive untouched, so `reply_classifier` / `tracking` keep replying.
- **Meetings** are inherently safe — `Meeting` stores `company`/`contact` as plain strings + a `campaign_id`, with no FK to `contacts`; no agent deletes meeting rows.
- **Unsent drafts are not protected** (confirmed) — they are cleared freely as a side effect of clearing their (non-locked) contact.

### Cascade-clear map — `orchestrator.clear_successors(db, campaign, from_key)`
Clears the output of every agent **after** `from_key`, always preserving locked contacts:

| Re-run `from_key` | `clear_successors` does |
|---|---|
| enrichment | reset scoring fields on all companies†; delete **non-locked** contacts (CASCADE wipes their unsent drafts) |
| scoring | delete **non-locked** contacts (CASCADE wipes drafts) |
| employee_finder | no-op — the finder's own force preserves locked contacts and re-creates the rest (fresh `email=""`), cascade-deleting their drafts |
| email_guess_verification | delete drafts of **non-locked** contacts |
| outreach | no-op (no successor output agents) |

† **reset scoring fields** = `ai_score=0, rank=0, match_level="Moderate", match_explanation="", score_factors=[]`, and `status: Qualified|Reviewed → Researching` (preserve `Excluded/Approved/Contacted`).

`run_agent_for_campaign(key, force)` becomes: when **`force=True`** (the *Re-run* button) **snapshot → `clear_successors(key)` → run the agent** (the agent's own force handles its own output). When `force=False` (the incremental *Run* button) neither the snapshot nor the cascade runs — that path is additive and non-destructive.

### Agent-level guards required by the lock invariant
- **`employee_finder` force / `_walk_for_contactable` force-wipe:** delete only **non-locked** contacts (today they delete all). Companies whose only contacts are locked are already contactable — keep them.
- **`email_guess_verification` force reset:** skip **locked** contacts (in addition to the existing `_confirmed()`/`Verified` skip).
- **`outreach` drafting gate:** also skip **locked** contacts (they already have a sent thread; don't generate a new Queued draft for them).

### Full pipeline (`run_campaign_pipeline`)
Unchanged behavior except it now also honors the lock invariant (its force-wipe deletes only non-locked contacts) and takes a snapshot first. It remains a deliberate clean redo that regenerates drafts; it is undo-protected (while the campaign is not live).

### New table `pipeline_snapshots`
| Column | Type | Notes |
|---|---|---|
| `id` | int PK | |
| `campaign_id` | FK `campaigns.id` ON DELETE CASCADE, indexed | **One row per campaign** — a new snapshot deletes the prior one. |
| `owner_id` | FK `users.id` ON DELETE CASCADE | |
| `trigger` | str(40) | `"pipeline"` or `"agent:<key>"` |
| `label` | str(120) | e.g. *"Full pipeline run"*, *"Re-run: Employee Finder"* |
| `payload` | JSON | see below |
| `created_at` | datetime, default `utcnow` | |
| `expires_at` | datetime | `created_at + 24h` |

**Payload shape** (whole campaign pipeline picture — Approach ①):
```json
{
  "campaign": { "status": "Running" },
  "companies": [ { "id": 12, "ai_score": 0, "rank": 0, "match_level": "...",
                   "match_explanation": "...", "score_factors": [],
                   "research_summary": "...", "research_points": [],
                   "recent_funding": null, "recent_news": null, "active_hiring": false,
                   "enrichment_confidence": 50, "metric_confidence": {},
                   "domain_status": "live", "mail_domain": "", "status": "Qualified" } ],
  "contacts": [ { "id": 88, "company_id": 12, "name": "...", "role": "...",
                  "email": "...", "linkedin": "...", "verification": "Verified",
                  "confidence": 95, "approved": null, "do_not_contact": false } ],
  "drafts":  [ { "id": 41, "contact_id": 88, "subject": "...", "body": "...",
                 "footer": "...", "state": "Queued" } ]
}
```

### Snapshot capture — `orchestrator.snapshot_campaign(db, campaign, trigger, label)`
- **If the campaign has any `Thread` → skip** (it's live; undo is blocked anyway — see below).
- Else: serialize `campaign.status` + every company's agent fields + all campaign contacts + all their drafts to `payload`; delete any prior snapshot row for this campaign; insert a new row with `expires_at = utcnow + 24h`.
- Called at the **top** of `run_campaign_pipeline` (always), and inside `run_agent_for_campaign` only when `force=True` **and** `key` is an output-mutating key `{enrichment, scoring, employee_finder, email_guess_verification, outreach}` — never for `tracking` or a non-forced incremental run.
- **Caveat (documented):** restore reverts the campaign to the snapshot, so any change made *after* the snapshot (e.g. a manually-added contact) is also rolled back. This is standard one-level-undo behavior.

### Restore — `POST /api/campaigns/{id}/restore`
1. Ownership check (mirror `_owned`).
2. **If the campaign has any `Thread` → 409** `"Undo unavailable: this campaign has active conversations."`
3. Load the latest non-expired snapshot. **None / expired → 404** `"Nothing to undo."`
4. Restore in one transaction:
   - `campaign.status = payload.campaign.status`.
   - For each company in payload: UPDATE the live row by `id`, setting the agent fields (skip if the company no longer exists).
   - Delete all current campaign contacts (CASCADE wipes drafts). No locked contacts exist (campaign isn't live).
   - Re-insert payload contacts with **fresh** ids; build `old_id → new_id`.
   - Re-insert payload drafts, remapping `contact_id` via that map.
   - **Delete the snapshot row** (consumed → enforces one-level undo, no re-undo).
   - `add_log` + `add_notification`.
5. Return the campaign rollup (`campaign_rollups`).

### Availability — `GET /api/campaigns/{id}/snapshot`
- Ownership check.
- Campaign has a `Thread` → `{ "available": false, "reason": "conversation_active" }`.
- No non-expired snapshot → `{ "available": false, "reason": "none" }` (purge expired on read).
- Else → `{ "available": true, "trigger": "...", "label": "...", "created_at": "...", "expires_at": "..." }`.

### Expiry
- **Lazy:** restore + availability treat `expires_at < utcnow` as absent and delete it.
- **Scheduler purge:** add a small `_purge_snapshots` job to `workers/scheduler.py` (interval ~60 min, gated by `enable_scheduler`) that deletes globally-expired rows so idle campaigns don't leave stale snapshots.

### API summary
| Method | Path | Result |
|---|---|---|
| POST | `/api/campaigns/{id}/restore` | 200 rollup · 404 nothing to undo · 409 conversation active |
| GET | `/api/campaigns/{id}/snapshot` | availability descriptor |

---

## Migration
- Add `VerifiedContact` and `PipelineSnapshot` models to `models.py` (imported at startup, so `create_all` in `lifespan` creates them). No `ALTER` block needed — both tables are brand new.

## Out of scope (follow-ups)
- Frontend Undo button + confirmation pop-up (consumes `GET /snapshot` + `POST /restore`); the warning modal for destructive runs already exists.
- Directory staleness / refresh policy.
- Multi-level undo (explicitly one level only).
- Making the full "Run all agents" preserve unsent drafts (it regenerates them by design).
- Doc refresh (README/CLAUDE.md) once cascade-clear + the 24h cache are real — handle in the plan.

## Verification plan (manual — no automated test suite)
**Feature 1**
1. User A: run a campaign that verifies a contact for company X (needs a paid verify key or Hunter). Confirm a `verified_contacts` row via `.\db.ps1 sql "SELECT * FROM verified_contacts"`.
2. User B: add company X to a new campaign, run the pipeline. Confirm company X is seeded with the verified contact, and the finder/verify logs show it was skipped (no verify credit spent).

**Feature 2 — cascade + undo**
3. Run a pipeline. Re-run **scoring** → non-locked contacts + their drafts cleared, scores recomputed. `GET /snapshot` → `available:true`. `POST /restore` → contacts, drafts, scores, `campaign.status` all back; second `POST /restore` → 404 (consumed).
4. Re-run an agent, then `/send` a draft (creates a Thread). `GET /snapshot` → `available:false, reason:"conversation_active"`; `POST /restore` → 409.
5. With a locked (sent) contact present, re-run **enrichment**/**scoring**/**finder** → the locked contact and its thread/messages survive; non-locked contacts are cleared/refreshed.

**Both:** backend boots clean (`GET /health`); smoke the two new endpoints via `/docs`. (Frontend untouched — no `npm run build` impact.)
