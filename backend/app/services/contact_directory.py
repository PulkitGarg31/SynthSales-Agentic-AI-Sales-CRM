"""Verified-contact directory service — normalization + read/write helpers for
the global `verified_contacts` table. See the design spec."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.models import Company, Contact, VerifiedContact, utcnow


def domain_key(domain: str) -> str:
    """Normalize a website domain to a stable match key: lowercase, strip
    scheme + path/query, strip a leading 'www.'. Empty in → empty out."""
    d = (domain or "").strip().lower()
    if not d:
        return ""
    d = re.sub(r"^https?://", "", d)
    d = d.split("/", 1)[0].split("?", 1)[0]
    if d.startswith("www."):
        d = d[4:]
    return d


def name_key(name: str) -> str:
    """Normalize a company name to a fallback key: lowercase, non-alphanumerics
    collapsed to single spaces, trimmed."""
    n = (name or "").strip().lower()
    return re.sub(r"[^a-z0-9]+", " ", n).strip()


def record_verified(db: Session, company: Company) -> int:
    """Upsert every Verified contact on `company` into the directory. Idempotent
    on (domain_key, name_key, email). Returns the count recorded."""
    dk = domain_key(company.domain)
    nk = name_key(company.name)
    recorded = 0
    for c in company.contacts:
        if c.verification != "Verified" or not (c.email or "").strip():
            continue
        email = c.email.strip().lower()
        row = (
            db.query(VerifiedContact)
            .filter(
                VerifiedContact.domain_key == dk,
                VerifiedContact.name_key == nk,
                VerifiedContact.email == email,
            )
            .first()
        )
        if row is None:
            db.add(
                VerifiedContact(
                    domain_key=dk, name_key=nk, company_name=company.name,
                    contact_name=c.name, role=c.role or "", email=email,
                    linkedin=c.linkedin, confidence=c.confidence or 0,
                )
            )
        else:
            row.contact_name = c.name
            row.role = c.role or ""
            row.linkedin = c.linkedin
            row.confidence = c.confidence or 0
            row.last_verified_at = utcnow()
        recorded += 1
    if recorded:
        db.commit()
    return recorded


def seed_company(db: Session, company: Company) -> int:
    """Seed `company` with Verified contacts from the directory. Match by
    domain_key, falling back to name_key when the company has no domain. De-dupe
    by email against existing contacts. Returns the count seeded."""
    dk = domain_key(company.domain)
    nk = name_key(company.name)
    if dk:
        q = db.query(VerifiedContact).filter(VerifiedContact.domain_key == dk)
    elif nk:
        q = db.query(VerifiedContact).filter(VerifiedContact.name_key == nk)
    else:
        return 0
    existing = {(c.email or "").strip().lower() for c in company.contacts}
    seeded = 0
    for row in q.all():
        if row.email in existing:
            continue
        existing.add(row.email)
        db.add(
            Contact(
                company_id=company.id, name=row.contact_name, role=row.role or "",
                email=row.email, linkedin=row.linkedin, verification="Verified",
                confidence=row.confidence or 0, approved=None,
            )
        )
        seeded += 1
    if seeded:
        db.commit()
    return seeded
