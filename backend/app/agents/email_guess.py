from __future__ import annotations

import re


def _parts(name: str) -> tuple[str, str]:
    cleaned = re.sub(r"[^a-zA-Z ]", "", name).strip().lower().split()
    if not cleaned:
        return "", ""
    first = cleaned[0]
    last = cleaned[-1] if len(cleaned) > 1 else ""
    return first, last


def guess_emails(name: str, domain: str) -> list[str]:
    """Standard name+domain patterns, ordered most→least common (PRD §4)."""
    first, last = _parts(name)
    domain = domain.strip().lstrip("@") or "company.com"
    if not first:
        return [f"contact@{domain}"]
    candidates = []
    if last:
        candidates += [
            f"{first}.{last}@{domain}",
            f"{first}{last}@{domain}",
            f"{first[0]}{last}@{domain}",
            f"{first}@{domain}",
            f"{first}.{last[0]}@{domain}",
            f"{first[0]}.{last}@{domain}",
        ]
    else:
        candidates.append(f"{first}@{domain}")
    # de-dupe, keep order
    seen, out = set(), []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out
