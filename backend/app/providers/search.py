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

    def find_linkedin_profiles(self, company_name: str, max_per_query: int = 8) -> list[dict]:
        """Search the web for real LinkedIn profiles employed at the company.

        Runs a few targeted queries against `site:linkedin.com/in/` so we only
        keep results that link to actual profile pages, then validates that the
        company name appears in the result (filters out coincidental mentions).

        Returns a deduped list of dicts: {name, role, linkedin, snippet}.
        Empty list if the company name is blank or no qualifying results.
        """
        import re

        company_name = (company_name or "").strip()
        if not company_name:
            return []

        # Senior / sales-relevant title hints. Multiple queries surface a wider
        # cross-section of the org than a single one.
        role_groups = [
            '"CEO" OR "Founder" OR "President"',
            '"CTO" OR "COO" OR "CFO" OR "CRO"',
            '"VP" OR "Vice President"',
            '"Head of" OR "Director"',
        ]
        seen: dict[str, dict] = {}
        cname_lower = company_name.lower()

        for roles in role_groups:
            query = f'"{company_name}" site:linkedin.com/in/ {roles}'
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
                # Validate the company name appears somewhere in the result —
                # filters out coincidental matches and unrelated profiles.
                if cname_lower not in (title + " " + body).lower():
                    continue
                # Parse "Name - Role at Company | LinkedIn" → name, role.
                clean_title = re.sub(r"\s*\|\s*LinkedIn.*$", "", title, flags=re.I).strip()
                m = re.match(r"^(.+?)\s+[-–]\s+(.+?)\s+at\s+", clean_title)
                if m:
                    name = m.group(1).strip()
                    role = m.group(2).strip()
                else:
                    parts = [p.strip() for p in re.split(r"\s+[-–]\s+", clean_title)]
                    name = parts[0] if parts else clean_title
                    role = parts[1] if len(parts) >= 2 else ""
                # Drop trailing "at Company" if any survived
                role = re.sub(r"\s+at\s+.+$", "", role, flags=re.I).strip()
                if not name or len(name) > 120 or len(role) > 200:
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
