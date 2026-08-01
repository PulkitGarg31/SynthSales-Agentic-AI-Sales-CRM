import secrets
from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.core.config import settings

# pbkdf2_sha256 is pure-python — no native bcrypt wheel needed on Python 3.14.
# Rounds are pinned to OWASP's current PBKDF2-HMAC-SHA256 guidance (600k) rather
# than passlib's 2016-era default (~29k); `deprecated="auto"` + `needs_rehash`
# (below) transparently upgrades any legacy-cost hash the next time its owner
# signs in.
pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto",
    pbkdf2_sha256__default_rounds=600_000,
)

# JWTs are always HS256, signed with our own key — pin the algorithm on decode so
# a token can never dictate its own verification algorithm (alg-confusion / "none").
_JWT_ALG = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def needs_rehash(hashed: str) -> bool:
    """True when a stored hash uses outdated parameters (e.g. the old round
    count) and should be re-computed from the verified plaintext on next login."""
    return pwd_context.needs_update(hashed)


def create_access_token(
    subject: str,
    expires_minutes: int | None = None,
    purpose: str | None = None,
) -> str:
    """Mint a signed JWT for ``subject``.

    ``purpose`` tags a *non-session* token (e.g. an OAuth-connect ``state``).
    Session tokens carry no purpose; ``get_current_user`` rejects any token that
    does, so a purpose-scoped token can never be replayed as a Bearer credential.
    """
    now = datetime.now(timezone.utc)
    expire = now + timedelta(
        minutes=expires_minutes or settings.access_token_expire_minutes
    )
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "jti": secrets.token_urlsafe(16),
    }
    if purpose:
        payload["purpose"] = purpose
    return jwt.encode(payload, settings.secret_key, algorithm=_JWT_ALG)


def decode_token(token: str) -> dict | None:
    """Decode + verify a token, returning the full claims payload (or None).

    Requires a valid signature, a present+unexpired ``exp``, and a ``sub``; the
    algorithm is pinned to HS256 regardless of any configured value.
    """
    try:
        return jwt.decode(
            token,
            settings.secret_key,
            algorithms=[_JWT_ALG],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        return None


def decode_access_token(token: str) -> str | None:
    payload = decode_token(token)
    return payload.get("sub") if payload else None
