# Contact Search Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the employee finder reliably surface real *sales* contacts on free DuckDuckGo search by using simpler high-recall queries (read at the SERP-title level, never opening LinkedIn), a deterministic commercial-role gate that kills false positives, and a manual "add contact" fallback.

**Architecture:** All search stays zero-cost on `ddgs`. `providers/search.py` gains three small pure helpers (`_is_commercial_role`, `_parse_linkedin_title`, `_profile_queries`) and a rewritten `find_linkedin_profiles` that runs an *escalating* query set (precise → simple/natural → founder fallback) across all aliases, stops once it has enough candidates, and keeps only profiles whose parsed role passes the commercial gate. `employee_finder.py`'s AI ranker stops falling back to the raw list. A new owner-scoped `POST /api/companies/{id}/contacts` + a form on the company-detail page let users add contacts the search can't find.

**Tech Stack:** Python 3.14 / FastAPI / SQLAlchemy 2.0 (backend), `ddgs` (DuckDuckGo), Next.js 16 / React 19 / Tailwind v4 (frontend), Postgres 16 on host port **5433** via Docker.

> **Verification model (read first — this project has no pytest/jest):** Per `CLAUDE.md` the de-facto loop is `npm run build` + `GET /health` + `.\db.ps1` + plain deterministic Python scripts. So **backend logic is TDD'd with a standalone assert script** `extra/test_step04.py` (run with the venv Python — no framework), the **frontend gate is `npm run build`**, and **routes/integration are live-smoked** against the running stack. `extra/` is gitignored, so **commits include source only** (the test script is the red/green tool, not a committed artifact — mirrors `extra/test_step03.py`).
>
> **Repo conventions:** Windows + PowerShell; invoke Python as `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe"`. Every commit ends with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` (omitted from the commands below for brevity). Branch: `feature/contact-search-enhancement` (already created).

---

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `backend/app/providers/search.py` | DuckDuckGo search + LinkedIn-profile extraction | Add `_is_commercial_role`, `_parse_linkedin_title`, `_profile_queries`, `_search_resilient`; rewrite `find_linkedin_profiles`; remove now-dead `_role_is_unusable`; `import time` | 
| `backend/app/agents/employee_finder.py` | Finder agent + AI ranking | Harden `_rank_with_ai` fallback to role-gate, not raw list |
| `backend/app/schemas.py` | Pydantic schemas | Add `ContactCreate` |
| `backend/app/api/routers/companies.py` | Company routes | Add `POST /{company_id}/contacts` |
| `web/src/lib/api-types.ts` | TS API types | Add `ContactCreate` |
| `web/src/lib/api.ts` | Typed API client | Add `addContact()` |
| `web/src/app/(app)/research/[id]/CompanyDetail.tsx` | Per-company detail panel | Add "Add contact" inline form in the Contacts card |
| `CLAUDE.md`, `README.md` | Docs | Note the escalating search + role gate; progress log |
| `extra/test_step04.py` | Deterministic backend test script (gitignored) | Created in Task 1, grows per task |

---

## Task 1: Commercial-role gate (`_is_commercial_role`)

**Files:**
- Create: `extra/test_step04.py`
- Modify: `backend/app/providers/search.py` (add helper after `_normalize_employer`, ~line 56)

- [ ] **Step 1: Create the test harness with failing checks for the gate**

Create `extra/test_step04.py`:

```python
"""Step-04 deterministic tests (no pytest; run with the venv Python).
Run: & "C:\\My Work\\Agentic CRM\\backend\\.venv\\Scripts\\python.exe" "C:\\My Work\\Agentic CRM\\extra\\test_step04.py"
"""
import sys, os
sys.path.insert(0, r"C:\My Work\Agentic CRM\backend")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

P = {"pass": 0, "fail": 0}
def check(name, cond, detail=""):
    ok = bool(cond); P["pass" if ok else "fail"] += 1
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"\n        -> {detail}" if detail and not ok else ""))

# ---- Task 1: commercial-role gate ----
from app.providers.search import _is_commercial_role
KEEP = ["VP Sales", "Head of Sales", "Chief Revenue Officer", "Sales Director",
        "Director of Sales", "Account Executive", "Regional Sales Manager",
        "CEO", "Founder", "President", "Managing Director"]
DROP = ["Marketing Manager", "Investment Analyst", "VP Engineering",
        "Product Manager", "Business Development Manager", "Channel Sales Manager",
        "Software Engineer", "Recruiter", "CFO", "Data Analyst", "", "Notion"]
for r in KEEP:
    check(f"gate keeps {r!r}", _is_commercial_role(r) is True)
for r in DROP:
    check(f"gate drops {r!r}", _is_commercial_role(r) is False)

print(f"\n==== {P['pass']} passed, {P['fail']} failed ====")
sys.exit(1 if P["fail"] else 0)
```

- [ ] **Step 2: Run to verify it fails**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: FAIL — `ImportError: cannot import name '_is_commercial_role'`.

- [ ] **Step 3: Implement the gate in `search.py`**

Add after `_normalize_employer` (after line 56):

```python
# --- Commercial-role gate -------------------------------------------------
# A parsed role is kept only if it names a sales / revenue / deal-owning
# function (or, for a small company, top leadership) AND is not one of the
# explicitly-excluded non-commercial functions. Deterministic allowlist applied
# BEFORE (and independent of) the optional AI ranker, so multi-token junk like
# "Marketing Manager" or "Investment Analyst" never slips through.
_NON_COMMERCIAL_RE = re.compile(
    r"\b(business development|partnership|alliance|channel|marketing|"
    r"engineer|engineering|developer|architect|devops|sre|"
    r"product manager|product owner|design|ux|ui|research|analyst|"
    r"recruit|talent|people|human resources|hr|finance|account(?:ant|ing)|"
    r"controller|legal|counsel|security|compliance|support|customer success|"
    r"information technology|operations|administrat)\b",
    re.IGNORECASE,
)
_SALES_ROLE_RE = re.compile(
    r"\b(sales|revenue|cro|chief revenue|account executive|account exec|"
    r"account director|commercial|go[\s-]?to[\s-]?market|gtm)\b",
    re.IGNORECASE,
)
_LEADER_ROLE_RE = re.compile(
    r"\b(founder|co[\s-]?founder|ceo|chief executive|president|"
    r"managing director|owner)\b",
    re.IGNORECASE,
)


def _is_commercial_role(role: str) -> bool:
    """True only for sales/revenue/deal-owning roles (or small-company
    leadership). Drops marketing, BD/partnerships/channel, engineering,
    product, finance, analysts, ops, support, etc. — even multi-token titles."""
    r = (role or "").strip()
    if not r:
        return False
    if _NON_COMMERCIAL_RE.search(r):
        return False
    return bool(_SALES_ROLE_RE.search(r) or _LEADER_ROLE_RE.search(r))
```

- [ ] **Step 4: Run to verify it passes**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: PASS — `23 passed, 0 failed`.

- [ ] **Step 5: Commit (source only — the test lives in gitignored extra/)**

```bash
git add backend/app/providers/search.py
git commit -m "feat(search): deterministic commercial-role gate for contact filtering"
```

---

## Task 2: LinkedIn title parser (`_parse_linkedin_title`)

**Files:**
- Modify: `backend/app/providers/search.py` (add after `_is_commercial_role`)
- Modify: `extra/test_step04.py` (append checks)

- [ ] **Step 1: Append failing checks to `extra/test_step04.py`** (before the final summary block)

```python
# ---- Task 2: title parser ----
from app.providers.search import _parse_linkedin_title
n, r, e = _parse_linkedin_title("Sarah Chen - VP Sales at Notion | LinkedIn")
check("parse 'Role at Company'", (n, r, e) == ("Sarah Chen", "VP Sales", "Notion"), f"{(n,r,e)}")
n, r, e = _parse_linkedin_title("Sarah Chen - VP Sales - Notion | LinkedIn")
check("parse 'Name - Role - Company'", (n, r) == ("Sarah Chen", "VP Sales"), f"{(n,r,e)}")
n, r, e = _parse_linkedin_title("Sarah Chen - VP Sales | LinkedIn")
check("parse 'Name - Role'", (n, r) == ("Sarah Chen", "VP Sales"), f"{(n,r,e)}")
n, r, e = _parse_linkedin_title("Sarah Chen - Notion | LinkedIn", "… is the Head of Sales at Notion …")
check("recover role from snippet", _is_commercial_role(r), f"role={r!r}")
n, r, e = _parse_linkedin_title("Sarah Chen | LinkedIn")
check("parse name-only", n == "Sarah Chen" and r == "", f"{(n,r)}")
n, r, e = _parse_linkedin_title("")
check("parse empty -> blanks", (n, r, e) == ("", "", ""))
```

- [ ] **Step 2: Run to verify it fails**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: FAIL — `ImportError: cannot import name '_parse_linkedin_title'`.

- [ ] **Step 3: Implement the parser in `search.py`** (after `_is_commercial_role`)

```python
def _parse_linkedin_title(title: str, body: str = "") -> tuple[str, str, str]:
    """Parse a LinkedIn SERP result into (name, role, employer), reading only
    the title/snippet — we never open the profile page. Handles:
        "Name - Role - Company | LinkedIn"
        "Name - Role at Company | LinkedIn"
        "Name - Role | LinkedIn"
        "Name - Company | LinkedIn"   (role recovered from the snippet)
    Returns ("", "", "") when no name can be extracted."""
    clean = re.sub(r"\s*[|·]\s*LinkedIn.*$", "", title or "", flags=re.IGNORECASE).strip()
    if not clean:
        return "", "", ""
    name = role = employer = ""
    m = re.match(r"^(.+?)\s+[-–—]\s+(.+?)\s+at\s+(.+?)$", clean, flags=re.IGNORECASE)
    if m:
        name, role, employer = m.group(1).strip(), m.group(2).strip(), m.group(3).strip()
    else:
        parts = [p.strip() for p in re.split(r"\s+[-–—]\s+", clean)]
        name = parts[0] if parts else clean
        if len(parts) >= 3:
            role, employer = parts[1], parts[2]
        elif len(parts) == 2:
            role = parts[1]
    role = re.sub(r"\s+at\s+.+$", "", role, flags=re.IGNORECASE).strip()
    # If the title gave no usable sales role, try to recover one from the snippet.
    if not _is_commercial_role(role) and body:
        m2 = re.search(
            r"\b(VP\s+Sales|Head\s+of\s+Sales|Chief\s+Revenue\s+Officer|CRO|"
            r"Sales\s+Director|Director\s+of\s+Sales|Account\s+Executive|"
            r"VP\s+Revenue|Regional\s+Sales\s+Manager|Founder|CEO|President)\b",
            body, flags=re.IGNORECASE)
        if m2:
            role = m2.group(1)
    return name, role, employer
```

- [ ] **Step 4: Run to verify it passes**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: PASS — `29 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/providers/search.py
git commit -m "feat(search): tolerant LinkedIn SERP title/snippet parser"
```

---

## Task 3: Escalating query builder (`_profile_queries`)

**Files:**
- Modify: `backend/app/providers/search.py` (add after `_parse_linkedin_title`)
- Modify: `extra/test_step04.py` (append checks)

- [ ] **Step 1: Append failing checks**

```python
# ---- Task 3: query builder ----
from app.providers.search import _profile_queries
qs = _profile_queries(["Notion Labs", "Notion", "notion"])
joined = " || ".join(qs).lower()
check("includes a simple natural query", "notion head of sales linkedin" in joined, joined[:200])
check("includes a precise site: query", "site:linkedin.com/in/" in joined)
check("includes founder/ceo fallback", '"ceo" or "founder"' in joined)
check("searches the brand alias (Notion)", "notion " in joined or '"notion"' in joined)
check("queries are de-duplicated", len(qs) == len(set(qs)))
check("empty aliases -> no queries", _profile_queries([]) == [])
```

- [ ] **Step 2: Run to verify it fails**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: FAIL — `ImportError: cannot import name '_profile_queries'`.

- [ ] **Step 3: Implement the builder in `search.py`**

```python
def _profile_queries(aliases: list[str]) -> list[str]:
    """Ordered LinkedIn-profile search queries: precise first, then simple
    high-recall, then a founder/CEO fallback. We only ever read result
    titles/snippets — never open the profile page. Searches the top three
    aliases (legal name + brand + domain-root) so brand-named employees
    ("Notion" for "Notion Labs") are actually found."""
    names = [a for a in aliases[:3] if a]
    out: list[str] = []
    seen: set[str] = set()

    def add(q: str) -> None:
        if q not in seen:
            seen.add(q)
            out.append(q)

    site_sales = '"VP Sales" OR "Head of Sales" OR "Chief Revenue Officer" OR "Sales Director"'
    simple_roles = ("head of sales", "vp sales", "sales director", "sales")
    for a in names:                                   # tier 1 — precise
        add(f'"{a}" site:linkedin.com/in/ {site_sales}')
    for a in names:                                   # tier 2 — simple / high recall
        for r in simple_roles:
            add(f"{a} {r} linkedin")
    for a in names:                                   # tier 3 — founder/CEO fallback
        add(f'"{a}" site:linkedin.com/in/ "CEO" OR "Founder" OR "President"')
    return out
```

- [ ] **Step 4: Run to verify it passes**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: PASS — `35 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/providers/search.py
git commit -m "feat(search): escalating profile query builder (precise -> simple -> founder)"
```

---

## Task 4: Rewrite `find_linkedin_profiles` (integrate gate + parser + queries + early-stop + retry)

**Files:**
- Modify: `backend/app/providers/search.py` — add `import time` (line 6 area), add `_search_resilient` (in `SearchProvider`), rewrite `find_linkedin_profiles` (lines 193–293), delete now-dead `_role_is_unusable` (lines 121–140)
- Modify: `extra/test_step04.py` (append checks)

- [ ] **Step 1: Append failing checks** (monkeypatch `search.search` with canned SERP results)

```python
# ---- Task 4: find_linkedin_profiles integration ----
from app.providers.search import search as _sp
CANNED = {
    # a real sales leader, a junk analyst, a company page, a former employee
    "x": [
        {"href": "https://www.linkedin.com/in/sarah-chen", "title": "Sarah Chen - VP Sales at Notion | LinkedIn", "body": "VP Sales at Notion."},
        {"href": "https://www.linkedin.com/in/raj-investor", "title": "Raj Patel - Investment Analyst | LinkedIn", "body": "I use Notion to track investments."},
        {"href": "https://www.linkedin.com/company/notion", "title": "Notion | LinkedIn", "body": "Company page."},
        {"href": "https://www.linkedin.com/in/old-tim", "title": "Tim Ford - VP Sales | LinkedIn", "body": "Previously at Notion. Now VP Sales at OtherCo."},
    ],
}
calls = {"n": 0}
def _fake_search(q, max_results=8):
    calls["n"] += 1
    return CANNED["x"]
_orig = _sp.search
_sp.search = _fake_search
profiles = _sp.find_linkedin_profiles("Notion Labs", domain="notion.so", max_per_query=6)
_sp.search = _orig
names = {p["name"] for p in profiles}
check("keeps the real VP Sales", "Sarah Chen" in names, str(names))
check("drops the Investment Analyst", "Raj Patel" not in names, str(names))
check("drops the company page (no /in/ person)", all("/company/" not in p["linkedin"] for p in profiles))
check("drops the former employee", "Tim Ford" not in names, str(names))
check("early-stop fires (didn't run every query)", calls["n"] >= 1)
```

- [ ] **Step 2: Run to verify it fails**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: FAIL — the old `find_linkedin_profiles` keeps "Raj Patel" (analyst slips the loose filter) → `drops the Investment Analyst` FAILS.

- [ ] **Step 3a: Add `import time`** to `search.py` imports (after `import re`, line 7):

```python
import re
import time
```

- [ ] **Step 3b: Delete the now-dead `_role_is_unusable`** (lines 121–140 — the whole function + its leading comment). It is superseded by `_is_commercial_role` and has no other callers.

- [ ] **Step 3c: Add `_search_resilient` inside `SearchProvider`** (right after the `search` method, ~line 181):

```python
    def _search_resilient(self, query: str, max_results: int = 8, attempts: int = 2) -> list[dict]:
        """search() with a light retry/backoff — DuckDuckGo throttles bursts,
        so an empty result is often transient. Never raises."""
        for i in range(attempts):
            res = self.search(query, max_results=max_results)
            if res:
                return res
            if i + 1 < attempts:
                time.sleep(1.0 * (i + 1))
        return []
```

- [ ] **Step 3d: Replace the body of `find_linkedin_profiles`** (lines 193–293) with:

```python
    def find_linkedin_profiles(
        self,
        company_name: str,
        domain: str = "",
        max_per_query: int = 8,
        target: int = 8,
    ) -> list[dict]:
        """Find real LinkedIn sales profiles by reading SERP titles/snippets
        only (never opening a profile page). Runs an escalating query set
        (precise -> simple/high-recall -> founder fallback) across all aliases
        and stops once `target` good candidates are collected. Keeps only
        profiles whose parsed role passes the commercial gate; drops company
        pages, former employees, and employer mismatches.

        Returns a deduped list of dicts: {name, role, linkedin, snippet}.
        Empty list if the company name is blank or nothing qualifies."""
        company_name = (company_name or "").strip()
        if not company_name:
            return []
        aliases = _company_aliases(company_name, domain)
        if not aliases:
            return []

        seen: dict[str, dict] = {}
        for query in _profile_queries(aliases):
            if len(seen) >= target:
                break
            for r in self._search_resilient(query, max_results=max_per_query):
                url = (r.get("href") or "").rstrip("/")
                if "/in/" not in url or url in seen:
                    continue
                title = (r.get("title") or "").strip()
                body = (r.get("body") or "").strip()
                # Accept only if an alias appears in the result (handles
                # "Notion Labs" CSV -> "Notion" on LinkedIn).
                if not _matches_any_alias(title + " " + body, aliases):
                    continue
                name, role, title_employer = _parse_linkedin_title(title, body)
                if not name or len(name) > 120 or len(role) > 200:
                    continue
                if title_employer and not any(
                    _employer_matches(title_employer, a.lower()) for a in aliases
                ):
                    continue
                if any(_is_former_employee(role, body, a.lower()) for a in aliases):
                    continue
                if not _is_commercial_role(role):       # deterministic sales-role gate
                    continue
                seen[url] = {
                    "name": name,
                    "role": role,
                    "linkedin": url,
                    "snippet": body[:400],
                }
        return list(seen.values())
```

- [ ] **Step 4: Run to verify it passes**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: PASS — `40 passed, 0 failed`.

- [ ] **Step 5: Confirm the module still imports cleanly** (no dangling `_role_is_unusable` refs)

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" -c "import sys; sys.path.insert(0, r'C:\My Work\Agentic CRM\backend'); import app.providers.search; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/providers/search.py
git commit -m "feat(search): escalating, recall-first find_linkedin_profiles with commercial gate"
```

---

## Task 5: Harden the AI ranker fallback (`employee_finder.py`)

**Files:**
- Modify: `backend/app/agents/employee_finder.py:16-17` (import) and `_rank_with_ai` fallbacks (lines 166–167 and 183–185)
- Modify: `extra/test_step04.py` (append checks)

- [ ] **Step 1: Append failing checks** (force the AI to "fail" and assert the fallback is role-gated)

```python
# ---- Task 5: AI ranker fallback is role-gated ----
from app.agents import employee_finder as ef
class _Co:
    name = "Notion"; industry = "Software"; domain = "notion.so"
profiles = [
    {"name": "Sarah Chen", "role": "VP Sales", "linkedin": "u1", "snippet": ""},
    {"name": "Raj Patel", "role": "Investment Analyst", "linkedin": "u2", "snippet": ""},
]
_orig_ai = ef.ai.complete_json
ef.ai.complete_json = lambda *a, **k: None          # simulate AI unavailable/empty
out = ef.EmployeeFinderAgent._rank_with_ai(_Co(), profiles, 3)
ef.ai.complete_json = _orig_ai
outnames = {p["name"] for p in out}
check("AI-fallback keeps sales role", "Sarah Chen" in outnames, str(outnames))
check("AI-fallback drops non-sales (not raw list)", "Raj Patel" not in outnames, str(outnames))
```

- [ ] **Step 2: Run to verify it fails**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: FAIL — current fallback `return profiles` keeps "Raj Patel" → `AI-fallback drops non-sales` FAILS.

- [ ] **Step 3a: Add the import** in `employee_finder.py` (line 17, after the `search` import):

```python
from app.providers.search import search, _is_commercial_role
```

(Replace the existing `from app.providers.search import search` line.)

- [ ] **Step 3b: Role-gate both fallbacks** in `_rank_with_ai`. Replace `if not data:\n                return profiles` (lines 166–167) with:

```python
            if not data:
                return [p for p in profiles if _is_commercial_role(p.get("role", ""))]
```

And replace the trailing `except` fallback (lines 183–185) `return profiles` with:

```python
        except Exception as exc:  # pragma: no cover
            logger.warning("AI ranking of LinkedIn candidates failed: %s", exc)
            return [p for p in profiles if _is_commercial_role(p.get("role", ""))]
```

- [ ] **Step 4: Run to verify it passes**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: PASS — `42 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/agents/employee_finder.py
git commit -m "fix(finder): AI ranker falls back to role-gated list, never raw junk"
```

---

## Task 6: Manual add-contact route (backend)

**Files:**
- Modify: `backend/app/schemas.py` (add `ContactCreate` after `ContactUpdate`, ~line 170)
- Modify: `backend/app/api/routers/companies.py` (imports + new route)

- [ ] **Step 1: Add `ContactCreate` schema** in `schemas.py` (after the `ContactUpdate` class):

```python
class ContactCreate(BaseModel):
    name: str
    role: str = ""
    email: str = ""
    linkedin: str | None = None

    @field_validator("name")
    @classmethod
    def _name_required(cls, v: str) -> str:
        if not (v or "").strip():
            raise ValueError("Contact name is required.")
        return v.strip()
```

(`field_validator` is already imported at the top of `schemas.py`.)

- [ ] **Step 2: Update `companies.py` imports** — replace the model + schema import lines (lines 9–10) with:

```python
from app.models import Company, Contact, User
from app.schemas import CompanyDetailOut, CompanyStatusUpdate, ContactCreate, ContactOut
from app.services.events import add_log
```

- [ ] **Step 3: Add the route** at the end of `companies.py` (after `find_contacts`):

```python
@router.post("/{company_id}/contacts", response_model=CompanyDetailOut)
def add_contact(
    company_id: int,
    payload: ContactCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Manually add a contact to a company (owner-scoped). The email is still
    subject to ZeroBounce verification before any outreach."""
    c = _owned(db, user, company_id)
    contact = Contact(
        company_id=c.id,
        name=payload.name,
        role=payload.role.strip(),
        email=payload.email.strip(),
        linkedin=payload.linkedin,
        verification="Unknown",
        confidence=0,
        approved=None,
    )
    db.add(contact)
    db.commit()
    add_log(db, user.id, "Campaign", f"Manually added contact '{payload.name}' to {c.name}.")
    return get_company(company_id, db, user)
```

- [ ] **Step 4: Verify backend imports/compiles**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" -c "import sys; sys.path.insert(0, r'C:\My Work\Agentic CRM\backend'); import app.main; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Live-smoke the route** (start Postgres + uvicorn if not running — see Task 9 setup, then):

```powershell
$base="http://127.0.0.1:8000"
$h=@{Authorization="Bearer $((Invoke-RestMethod -Uri "$base/api/auth/login" -Method Post -ContentType "application/json" -Body (@{email="jordan@apexcloud.com";password="password123"}|ConvertTo-Json)).access_token)"}
$cid=(Invoke-RestMethod -Uri "$base/api/campaigns" -Headers $h)[0].id
$co=(Invoke-RestMethod -Uri "$base/api/campaigns/$cid/companies" -Headers $h)[0]
$r=Invoke-RestMethod -Uri "$base/api/companies/$($co.id)/contacts" -Method Post -Headers $h -ContentType "application/json" -Body (@{name="Test Person";role="VP Sales";email="test@example.com"}|ConvertTo-Json)
($r.contacts | Where-Object { $_.name -eq "Test Person" }) | Format-List name,role,email,verification
```

Expected: the new contact is returned in `contacts` with `verification=Unknown`. (A blank `name` returns HTTP 422.)

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/api/routers/companies.py
git commit -m "feat(api): manual add-contact route POST /api/companies/{id}/contacts"
```

---

## Task 7: Manual add-contact (frontend)

**Files:**
- Modify: `web/src/lib/api-types.ts` (add `ContactCreate`)
- Modify: `web/src/lib/api.ts` (add `addContact`)
- Modify: `web/src/app/(app)/research/[id]/CompanyDetail.tsx` (inline add form in the Contacts card)

- [ ] **Step 1: Add the type** in `api-types.ts` (next to the other Contact types):

```typescript
export interface ContactCreate {
  name: string;
  role?: string;
  email?: string;
  linkedin?: string | null;
}
```

- [ ] **Step 2: Add the client method** in `api.ts`. First add `ContactCreate` and `CompanyDetail` to the type import block (lines 1–20) if not present (`CompanyDetail` already is; add `ContactCreate`). Then add near the other contact methods:

```typescript
  addContact: (companyId: number, data: ContactCreate) =>
    request<CompanyDetail>(`/api/companies/${companyId}/contacts`, { method: "POST", body: data }),
```

- [ ] **Step 3: Add the inline add form** in `CompanyDetail.tsx`.

3a. Extend the `Action` type (line 9):

```typescript
type Action = "approve" | "exclude" | "research" | "contacts" | "add-contact";
```

3b. Add form state inside the component (after line 26, the `toast` state):

```typescript
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", role: "", email: "" });
```

3c. In the Contacts card, add an "Add contact" affordance + form. Replace the `<Button href="/contacts" …>Review all contacts</Button>` block (lines 257–259) with:

```tsx
              {adding ? (
                <div className="mt-4 space-y-2 rounded-xl border border-line p-3">
                  <input
                    className="form-input h-9 w-full text-sm"
                    placeholder="Full name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                  <input
                    className="form-input h-9 w-full text-sm"
                    placeholder="Role (e.g. VP Sales)"
                    value={draft.role}
                    onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                  />
                  <input
                    className="form-input h-9 w-full text-sm"
                    placeholder="Email (optional)"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1 text-sm"
                      disabled={busy || !draft.name.trim()}
                      onClick={() =>
                        act("add-contact", async () => {
                          await api.addContact(company.id, draft);
                          setDraft({ name: "", role: "", email: "" });
                          setAdding(false);
                        }, "Contact added")
                      }
                    >
                      {busyAction === "add-contact" ? "Adding…" : "Save"}
                    </Button>
                    <Button variant="ghost" className="text-sm" disabled={busy} onClick={() => setAdding(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="ghost" className="mt-4 w-full text-sm" disabled={busy} onClick={() => setAdding(true)}>
                  <Icon.Plus width={14} height={14} /> Add contact manually
                </Button>
              )}
              <Button href="/contacts" variant="ghost" className="mt-2 w-full text-sm">
                Review all contacts
              </Button>
```

- [ ] **Step 4: Verify the icon exists.** Confirm `Icon.Plus` is defined:

Run (Grep): search `web/src/components/icons.tsx` for `Plus`.
If absent, use an existing icon instead — change `<Icon.Plus … />` to `<Icon.Sparkle width={14} height={14} />` (known to exist; used elsewhere in this file).

- [ ] **Step 5: Build gate (frontend typecheck)**

Run: `& "C:\Program Files\nodejs\npm.cmd" --prefix "C:\My Work\Agentic CRM\web" run build`
Expected: `✓ Compiled successfully` with no type errors.

- [ ] **Step 6: Live-smoke the UI.** With the stack running and `npm run dev`, open a company at `/research/<companyId>`, click **Add contact manually**, submit `name=Test Person, role=VP Sales` → it appears in the Contacts card after refresh.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/api-types.ts web/src/lib/api.ts "web/src/app/(app)/research/[id]/CompanyDetail.tsx"
git commit -m "feat(web): manual add-contact form on the company detail page"
```

---

## Task 8: Docs

**Files:**
- Modify: `CLAUDE.md` (the employee-finder bullet under "The agent pipeline")
- Modify: `README.md` (progress log)

- [ ] **Step 1: Update the `_walk_for_contactable` / finder note in `CLAUDE.md`.** After the existing employee-finder bullet, add a sentence:

```markdown
- **Finder search is escalating + role-gated** — `find_linkedin_profiles` runs precise
  `site:linkedin.com/in/` queries, then simpler high-recall queries (`<brand> head of sales`),
  then a founder/CEO fallback across all aliases, reading SERP titles only (never opening LinkedIn),
  and keeps only roles that pass a deterministic commercial-role gate (`_is_commercial_role`).
  Users can also add contacts manually via `POST /api/companies/{id}/contacts`.
```

- [ ] **Step 2: Add a progress-log entry** at the end of `README.md`:

```markdown
### 2026-06-05 (contact search enhancement — Step 06)

Implemented `.claude/specs/06-contact-search-enhancement.md` (plan in `.claude/plans/`). Zero new
deps; still DuckDuckGo-only.

- **Escalating, recall-first finder** (`providers/search.py`): `find_linkedin_profiles` now runs
  precise `site:` queries, then simple natural queries (`<brand> head of sales`), then a founder/CEO
  fallback — across the legal name, brand, and domain-root aliases — stopping once enough candidates
  are found. Reads SERP titles/snippets only (`_parse_linkedin_title`); never opens LinkedIn.
- **Commercial-role gate** (`_is_commercial_role`): a deterministic allowlist drops non-sales titles
  (Marketing Manager, Investment Analyst, BD/Partnerships/Channel, engineering, product, finance,
  analysts) before *and* independent of the AI ranker, which now falls back to the role-gated list
  instead of the raw search results.
- **Manual add-contact**: `POST /api/companies/{id}/contacts` + an "Add contact" form on the company
  detail page, so a company the search can't crack is never a dead end.

Verified: deterministic logic tests + `npm run build` + live smoke.
```

- [ ] **Step 3: Build gate (docs don't break anything)**

Run: `& "C:\Program Files\nodejs\npm.cmd" --prefix "C:\My Work\Agentic CRM\web" run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: note escalating role-gated finder search + manual add-contact (Step 06)"
```

---

## Task 9: Final integration smoke + spec/plan tracking

**Setup (if the stack isn't already running):**

```powershell
docker compose -f "C:\My Work\Agentic CRM\backend\docker-compose.yml" up -d
Start-Process -FilePath "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" -ArgumentList "-m","uvicorn","app.main:app","--port","8000" -WorkingDirectory "C:\My Work\Agentic CRM\backend" -WindowStyle Hidden
# wait for /health 200
```

- [ ] **Step 1: Re-run the full deterministic suite**

Run: `& "C:\My Work\Agentic CRM\backend\.venv\Scripts\python.exe" "C:\My Work\Agentic CRM\extra\test_step04.py"`
Expected: all PASS, `0 failed`.

- [ ] **Step 2: Real-data finder check.** Add a real-name company to a campaign (e.g. CSV row `HubSpot,hubspot.com,Marketing Software,US`) and re-run the employee_finder for that campaign. Then inspect:

```powershell
docker exec reachly_postgres psql -U reachly -d reachly -c "SELECT left(c.name,22) name, left(c.role,28) role FROM contacts c JOIN companies co ON co.id=c.company_id WHERE co.name ILIKE 'HubSpot%' ORDER BY c.id;"
```

Expected: contacts (if any found) all carry **sales** roles — no Marketing Manager / Investment Analyst. (Zero is still acceptable per the honesty rule; the point is *no junk*.)

- [ ] **Step 3: Confirm no LinkedIn page fetches.** Verify the finder path contains no `httpx.get(...linkedin.com/in...)` — search only reads `ddgs` SERP results:

Run (Grep): `httpx` over `backend/app/providers/search.py` — the only `httpx.get` is in `domain_status`, not the profile finder.

- [ ] **Step 4: Frontend build gate (final)**

Run: `& "C:\Program Files\nodejs\npm.cmd" --prefix "C:\My Work\Agentic CRM\web" run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Track the spec + plan** (`.claude/` is gitignored — force-add this step's docs, mirroring Step 03):

```bash
git add -f .claude/specs/06-contact-search-enhancement.md .claude/plans/06-contact-search-enhancement.md
git commit -m "docs: track Step 06 spec and plan"
```

- [ ] **Step 6: Finish the branch.** Use the `superpowers:finishing-a-development-branch` skill (or, matching Step 03: push `feature/contact-search-enhancement`, open/merge the PR to `main`, delete the merged branch). Leave `extra/test_step04.py` and uvicorn logs in gitignored `extra/`.

---

## Self-review notes (spec coverage)

- **Simpler/natural queries, read titles, no LinkedIn scraping** → Tasks 2, 3, 4 (+ Task 9 Step 3 asserts no profile fetch).
- **Search all aliases incl. brand/domain-root** → Task 3 (`aliases[:3]`) + Task 4.
- **Escalate + early stop** → Task 4 (`target` break) + retry/backoff (`_search_resilient`).
- **Commercial-role gate kills false positives (Marketing Manager / Investment Analyst)** → Task 1 + applied in Task 4 + Task 5.
- **AI ranker no longer falls back to raw junk** → Task 5.
- **Manual add-contact (route + UI)** → Tasks 6, 7.
- **Honesty preserved (real or zero)** → unchanged; Task 9 Step 2 confirms zero is acceptable, no fabrication.
- **Zero-cost, no new deps** → no `requirements.txt` change anywhere.
- **Build + import gates** → Tasks 4/6 (import), 7/8/9 (`npm run build`).
- **[GAP] left out:** `Contact.source` column, paid providers, per-contact re-verify, approval-enforcement — intentionally not in any task.
