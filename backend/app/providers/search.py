"""Company research via DuckDuckGo (no API key required) + a domain-status
probe used by enrichment to avoid hallucinating about companies whose sites
are dead, parked, or otherwise empty."""
from __future__ import annotations

import logging
import re
import time
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


def _has_employer_evidence(title: str, body: str, title_employer: str, aliases: list[str]) -> bool:
    """True if an alias appears as the candidate's EMPLOYER — the parsed
    "Role at/- Company" employer, or with a LinkedIn employer marker
    ("at"/"@"/"·" <Company>) — not merely as a stray word. Prevents common-word
    company names (Segment, Square, Notion, …) from matching unrelated sales
    profiles (a "West Segment" sales territory, or "market segment" in a snippet)."""
    if title_employer and any(_employer_matches(title_employer, a.lower()) for a in aliases):
        return True
    text = f"{title} {body}"
    for a in aliases:
        esc = re.escape(a)
        if (
            re.search(rf"\bat\s+{esc}\b", text, re.IGNORECASE)
            or re.search(rf"@\s*{esc}\b", text, re.IGNORECASE)
            or re.search(rf"·\s*{esc}\b", text, re.IGNORECASE)
            or re.search(rf"\b{esc}\s*·", text, re.IGNORECASE)
        ):
            return True
    return False


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


# Free mailbox providers and data-aggregator domains that must NOT be mistaken
# for a company's own corporate mail domain.
_GENERIC_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "hotmail.com",
    "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com",
    "proton.me", "protonmail.com", "gmx.com", "mail.com", "zoho.com", "yandex.com",
}
_AGGREGATOR_DOMAINS = {
    "rocketreach.co", "email-format.com", "leadiq.com", "zoominfo.com", "apollo.io",
    "signalhire.com", "contactout.com", "hunter.io", "lusha.com", "kaspr.io",
    "snov.io", "clearbit.com", "linkedin.com", "facebook.com", "twitter.com",
    "x.com", "instagram.com", "youtube.com", "wikipedia.org", "crunchbase.com",
    "glassdoor.com", "indeed.com", "example.com", "sentry.io", "wixpress.com",
}
_EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@([a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})")

# File extensions that masquerade as email domains via the retina "logo@2x.png"
# trick or asset paths — never a real corporate mail domain.
_BAD_EMAIL_TLDS = {
    "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "tiff", "css",
    "js", "json", "xml", "pdf", "woff", "woff2", "ttf", "eot", "mp4", "mp3",
    "webm", "html", "htm", "php", "aspx",
}


def _is_corp_mail_domain(dom: str) -> bool:
    """True if `dom` is a plausible corporate mail domain — not free webmail, a
    data-aggregator, or an asset filename ("logo@2x.png" -> "2x.png")."""
    dom = (dom or "").lower().strip(".")
    if not dom or "." not in dom:
        return False
    tld = dom.rsplit(".", 1)[-1]
    if len(tld) < 2 or not tld.isalpha() or tld in _BAD_EMAIL_TLDS:
        return False
    return dom not in _GENERIC_EMAIL_DOMAINS and dom not in _AGGREGATOR_DOMAINS


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
                # Accept only if an alias appears (handles "Notion Labs" -> "Notion").
                if not _matches_any_alias(title + " " + body, aliases):
                    continue
                name, role, title_employer = _parse_linkedin_title(title, body)
                if not name or len(name) > 120 or len(role) > 200:
                    continue
                # Require the company to appear as the EMPLOYER (parsed employer,
                # or "at"/"@"/"·" <Company>) — not just a stray word. Stops
                # common-word names (Segment, Square) from matching unrelated
                # sales profiles ("VP of Sales, West Segment").
                if not _has_employer_evidence(title, body, title_employer, aliases):
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

    def find_email_domain(self, company_name: str, website_domain: str = "") -> str:
        """Find the company's real email domain (the part after '@') — e.g.
        Notion's site is notion.so but its mail is @makenotion.com. Tries the
        company's OWN website first (free, reliable — an info@/sales@/contact@ in
        the footer or contact page), then a web search; returns '' if neither is
        confident (the caller then falls back to the website domain)."""
        company_name = (company_name or "").strip()
        if not company_name:
            return ""
        aliases = _company_aliases(company_name, website_domain)
        if not aliases:
            return ""
        brand_roots = [a.lower().replace(" ", "") for a in aliases if len(a) >= 3]

        # 1) The company's own website — free and not rate-limited.
        site_dom = self._site_email_domain(website_domain, brand_roots)
        if site_dom:
            return site_dom

        # 2) Otherwise search the web for the email format.
        counts: dict[str, int] = {}
        for q in (f'"{company_name}" email format', f"{aliases[0]} email address"):
            for r in self._search_resilient(q, max_results=6):
                text = f"{r.get('title', '')} {r.get('body', '')}"
                for m in _EMAIL_RE.finditer(text):
                    dom = m.group(1).lower().strip(".")
                    if not _is_corp_mail_domain(dom):
                        continue
                    counts[dom] = counts.get(dom, 0) + 1
        return self._pick_email_domain(counts, brand_roots)

    @staticmethod
    def _pick_email_domain(counts: dict[str, int], brand_roots: list[str]) -> str:
        """Choose the best corporate mail domain from a {domain: hits} tally:
        prefer one that references the brand ("makenotion.com" for Notion), else
        a domain seen more than once. Ambiguous single hits -> '' (fall back)."""
        if not counts:
            return ""

        def is_brandy(dom: str) -> bool:
            root = dom.split(".")[0]
            return any(root in b or b in root for b in brand_roots)

        top, n = sorted(counts.items(), key=lambda kv: (is_brandy(kv[0]), kv[1]), reverse=True)[0]
        return top if (is_brandy(top) or n >= 2) else ""

    def _site_email_domain(self, website_domain: str, brand_roots: list[str]) -> str:
        """Fetch the company's own website (home + contact/about pages) and pull a
        corporate mail domain from any address it publishes (often an
        info@/sales@/contact@ in the footer). Free; returns '' on any failure."""
        root = (website_domain or "").strip().lower()
        for pre in ("https://", "http://", "www."):
            if root.startswith(pre):
                root = root[len(pre):]
        root = root.split("/")[0].rstrip("/")
        if not root or "." not in root:
            return ""
        headers = {"User-Agent": "Mozilla/5.0 (compatible; SynthSalesBot/1.0)"}
        counts: dict[str, int] = {}
        for path in ("", "contact", "contact-us", "about"):
            try:
                resp = httpx.get(f"https://{root}/{path}", timeout=7,
                                 follow_redirects=True, headers=headers)
                if resp.status_code != 200 or not resp.text:
                    continue
                emails = re.findall(r"mailto:([^\"'?>\s]+)", resp.text, re.IGNORECASE)
                emails += [m.group(0) for m in _EMAIL_RE.finditer(resp.text)]
                for e in emails:
                    dom = e.split("@")[-1].lower().strip(".")
                    if not _is_corp_mail_domain(dom):
                        continue
                    counts[dom] = counts.get(dom, 0) + 1
            except Exception:
                continue
            if counts:
                break  # found addresses on this page; stop fetching
        return self._pick_email_domain(counts, brand_roots)

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
