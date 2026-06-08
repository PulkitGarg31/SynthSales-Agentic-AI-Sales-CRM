"""Company research via DuckDuckGo (no API key required) + a domain-status
probe used by enrichment to avoid hallucinating about companies whose sites
are dead, parked, or otherwise empty."""
from __future__ import annotations

import logging
import re
from typing import Literal

import httpx

logger = logging.getLogger(__name__)

DomainStatus = Literal["live", "parked", "dead"]

# Substrings (case-insensitive) commonly found on domain-parking pages and
# placeholder responses. If any appears in the homepage HTML we treat the
# site as parked rather than a real company website.
_PARKING_MARKERS = (
    "/lander",                       # Bodis / common parking redirect
    "this domain is for sale",
    "buy this domain",
    "domain is for sale",
    "domain parking",
    "domain may be for sale",
    "parked domain",
    "godaddy",
    "sedo",
    "afternic",
    "dan.com",
    "hugedomains",
    "namecheap-host",
    "domainmarket",
    "park-web",
    "future home of",
    "coming soon",
    "site is under construction",
    "default web page",
)


# Common corporate suffixes stripped before fuzzy-matching an employer
# string from a LinkedIn title against the target company name.
_CORP_SUFFIX_RE = re.compile(
    r"\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|"
    r"holdings|group|gmbh|sa|ag|plc|nv|bv|pty|kg)\b\.?",
    re.IGNORECASE,
)


def _normalize_employer(s: str) -> str:
    s = _CORP_SUFFIX_RE.sub("", s)
    s = re.sub(r"[,.&]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


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


def _employer_matches(title_employer: str, target_lower: str) -> bool:
    """True if the employer string parsed from a LinkedIn title plausibly
    refers to our target company. Tolerates corporate suffixes ("Inc",
    "LLC", "Holdings"), punctuation, and casing differences."""
    a = _normalize_employer(title_employer)
    b = _normalize_employer(target_lower)
    if not a or not b:
        return False
    return a in b or b in a


def _company_aliases(name: str, domain: str = "") -> list[str]:
    """Generate likely LinkedIn-display variations of a company name.

    CSVs often have the legal/canonical name ("Notion Labs",
    "A.P. Moller-Maersk") while LinkedIn profiles use the brand name
    ("Notion", "Maersk"). Searching the literal CSV name in quotes then
    misses every real employee. We solve this by producing an ordered list
    of aliases — the highest-precision first — and using any of them for
    both the search query and the snippet validation.

    Order: original name, suffix-stripped name, domain-root name, first
    word of the name. Deduped, case-preserved on first occurrence.
    """
    out: list[str] = []
    seen: set[str] = set()

    def push(s: str) -> None:
        s = s.strip()
        if not s or s.lower() in seen:
            return
        seen.add(s.lower())
        out.append(s)

    if name:
        push(name)
        stripped = _normalize_employer(name).strip()
        if stripped:
            push(stripped)

    if domain:
        d = domain.strip().lower()
        for prefix in ("https://", "http://", "www."):
            if d.startswith(prefix):
                d = d[len(prefix):]
        root = d.split(".")[0]
        if root and len(root) >= 3:
            push(root)

    if name:
        first = name.split()[0].strip(",.")
        # Skip 1-2 letter initials like "A.P."
        if first and len(first) >= 3 and not first.endswith("."):
            push(first)

    return out


def _matches_any_alias(text: str, aliases: list[str]) -> bool:
    t = text.lower()
    return any(a.lower() in t for a in aliases if a)


def _role_is_unusable(role: str, company_lower: str) -> bool:
    """True if the parsed role string can't support a meaningful pitch:
    blank, just the target company name, a single ambiguous word, or so
    short we have nothing to anchor outreach on. Belt-and-braces for the
    AI ranker, which sometimes accepts profiles like "Thomas Wyatt — Twilio"
    even though we tell it not to."""
    r = (role or "").strip().lower()
    if not r:
        return True
    if r == "unknown role":
        return True
    # Exact company-name role ("VP Sales at Twilio | LinkedIn" → role="Twilio"
    # after our trailing-"at"-strip).
    if r == company_lower:
        return True
    # A single short word like "Twilio", "Datadog", "Snowflake" — meaningless
    # without a function. (Roles with 2+ tokens always slip through.)
    if len(r.split()) == 1 and len(r) < 25:
        return True
    return False


def _is_former_employee(role: str, snippet: str, company_lower: str) -> bool:
    """Detect snippets/titles where the target company is clearly listed as
    a PAST job. Conservative: only matches when 'former/ex/previously/past'
    appears near the company name, never on bare keywords (so 'CEO at
    Acquired by' style language doesn't trigger false rejections)."""
    haystack = f"{role} {snippet}".lower()
    if not company_lower:
        return False
    esc = re.escape(company_lower)
    patterns = (
        rf"\bformer\b[^.]{{0,80}}{esc}",
        rf"\bex[- ]{esc}\b",
        rf"\bpreviously\b[^.]{{0,80}}{esc}",
        rf"\bpast:\s*[^.]{{0,80}}{esc}",
        rf"\balumn[ai]\b[^.]{{0,80}}{esc}",
        rf"{esc}[^.]{{0,40}}\(\s*former\b",
    )
    return any(re.search(p, haystack) for p in patterns)


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


class SearchProvider:
    @property
    def available(self) -> bool:
        try:
            import ddgs  # noqa: F401

            return True
        except Exception:
            return False

    def search(self, query: str, max_results: int = 6) -> list[dict]:
        try:
            from ddgs import DDGS

            with DDGS() as ddg:
                return list(ddg.text(query, max_results=max_results))
        except Exception as exc:  # pragma: no cover
            logger.warning("DuckDuckGo search failed for %r: %s", query, exc)
            return []

    def research_company(self, name: str, domain: str = "") -> dict:
        """Return raw snippets the AI agent can summarize into a profile."""
        target = f"{name} {domain}".strip()
        return {
            "overview": self.search(f"{target} company overview"),
            "funding": self.search(f"{target} funding round investment"),
            "news": self.search(f"{target} news"),
            "hiring": self.search(f"{target} careers hiring jobs"),
        }

    def find_linkedin_profiles(
        self,
        company_name: str,
        domain: str = "",
        max_per_query: int = 8,
    ) -> list[dict]:
        """Search the web for real LinkedIn profiles employed at the company.

        Biased toward commercial / revenue-side roles (Sales leaders, CRO /
        VP Revenue, Sales / Account Directors) because those are the people who
        actually own and close inter-company deals. A founder/CEO query is kept
        as a fallback for small companies where the founder still owns
        commercial conversations.

        Returns a deduped list of dicts: {name, role, linkedin, snippet}.
        Profiles whose title or snippet identifies them as a FORMER employee
        of the target company are filtered out here (before AI ranking).
        Empty list if the company name is blank or no qualifying results.
        """
        import re

        company_name = (company_name or "").strip()
        if not company_name:
            return []

        # CSV names ("Notion Labs", "A.P. Moller-Maersk") rarely match LinkedIn's
        # brand display ("Notion", "Maersk"). Generate aliases from the name +
        # domain so we both search and validate against the same forgiving set.
        aliases = _company_aliases(company_name, domain)
        if not aliases:
            return []

        # Commercial / deal-owner role queries. Each query surfaces a different
        # slice of the company's go-to-market org; deduped by profile URL below.
        role_groups = [
            '"VP Sales" OR "Chief Revenue Officer" OR "CRO" OR "Head of Sales" OR "VP Revenue"',
            '"Director of Sales" OR "Sales Director" OR "Account Director" OR "Regional Sales Manager"',
            '"CEO" OR "Founder" OR "President" OR "Managing Director"',
        ]
        seen: dict[str, dict] = {}

        # Search using each alias — different brand names surface different
        # profiles. Cap to the first 2 aliases so we don't blow the search
        # budget (original + most-likely-brand).
        for query_name in aliases[:2]:
            for roles in role_groups:
                query = f'"{query_name}" site:linkedin.com/in/ {roles}'
                try:
                    results = self.search(query, max_results=max_per_query)
                except Exception:
                    continue
                for r in results:
                    url = (r.get("href") or "").rstrip("/")
                    if "/in/" not in url:
                        continue
                    if url in seen:
                        continue
                    title = (r.get("title") or "").strip()
                    body = (r.get("body") or "").strip()
                    # Accept if ANY alias appears in the result — handles
                    # "Notion Labs" CSV → "Notion" on LinkedIn.
                    if not _matches_any_alias(title + " " + body, aliases):
                        continue
                    # Parse "Name - Role at Company | LinkedIn" → name, role, employer.
                    clean_title = re.sub(r"\s*\|\s*LinkedIn.*$", "", title, flags=re.I).strip()
                    title_employer = ""
                    m = re.match(r"^(.+?)\s+[-–]\s+(.+?)\s+at\s+(.+?)$", clean_title)
                    if m:
                        name = m.group(1).strip()
                        role = m.group(2).strip()
                        title_employer = m.group(3).strip()
                    else:
                        parts = [p.strip() for p in re.split(r"\s+[-–]\s+", clean_title)]
                        name = parts[0] if parts else clean_title
                        role = parts[1] if len(parts) >= 2 else ""
                    # Drop trailing "at Company" if any survived in role.
                    role = re.sub(r"\s+at\s+.+$", "", role, flags=re.I).strip()
                    if not name or len(name) > 120 or len(role) > 200:
                        continue
                    # Employer mismatch — check against EVERY alias so
                    # "VP Sales at Notion" still matches "Notion Labs" CSV.
                    if title_employer and not any(
                        _employer_matches(title_employer, a.lower()) for a in aliases
                    ):
                        continue
                    # Former-employee check uses every alias too.
                    if any(_is_former_employee(role, body, a.lower()) for a in aliases):
                        continue
                    # Hard-drop profiles whose parsed role is unusable for a
                    # sales pitch: blank, just the company name, or so short
                    # we can't tell what they actually do. Check against every
                    # alias so "Twilio" and "twilio.com root" both filter out.
                    if any(_role_is_unusable(role, a.lower()) for a in aliases):
                        continue
                    seen[url] = {
                        "name": name,
                        "role": role or "Unknown role",
                        "linkedin": url,
                        "snippet": body[:400],
                    }
        return list(seen.values())

    # ----------------------------------------------------- domain liveness
    @staticmethod
    def domain_status(domain: str) -> DomainStatus:
        """Inspect a company's domain. Returns:
          * "live"   — server responds AND the homepage has substantive content
          * "parked" — server responds but the page is a parking/placeholder
                       (tiny body, parking-page markers, JS-only redirects)
          * "dead"   — DNS doesn't resolve / connection refused / timeout

        A plain HEAD-only liveness check isn't enough: parked domains (e.g.
        vertexhealth.org → a 114-byte JS redirect to /lander) return 200 OK
        but have no real company content for the AI to summarize.

        Empty domain → "live" (we can't verify, but don't punish on the basis
        of a missing CSV field — enrichment will use other signals).
        """
        if not domain or not domain.strip():
            return "live"
        d = domain.strip().lower()
        for prefix in ("https://", "http://"):
            if d.startswith(prefix):
                d = d[len(prefix):]
        d = d.rstrip("/")

        text = None
        for scheme in ("https", "http"):
            url = f"{scheme}://{d}"
            try:
                # Use GET (not HEAD) so we can inspect content for parking markers.
                # Cap response read so giant pages don't slow us down.
                resp = httpx.get(url, timeout=10, follow_redirects=True)
                if 200 <= resp.status_code < 400:
                    text = resp.text[:6000]
                    break
            except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
                continue
            except Exception as exc:
                logger.debug("domain_status %s probe failed: %s", url, exc)
                continue

        if text is None:
            return "dead"

        lowered = text.lower()
        # Parking markers in body (or in a redirect script).
        if any(marker in lowered for marker in _PARKING_MARKERS):
            return "parked"

        # Strip HTML to estimate visible content; tiny bodies are almost always
        # placeholders. A real company homepage typically has hundreds of words.
        visible = re.sub(r"<[^>]+>", " ", text)
        visible = re.sub(r"\s+", " ", visible).strip()
        if len(visible) < 200:
            return "parked"

        return "live"

    # Back-compat alias used by callers that only care about reachability.
    @classmethod
    def domain_alive(cls, domain: str) -> bool:
        return cls.domain_status(domain) != "dead"


search = SearchProvider()
