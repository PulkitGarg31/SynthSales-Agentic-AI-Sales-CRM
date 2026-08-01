from datetime import timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_token
from app.models import RevokedToken, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/token", auto_error=True)


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = decode_token(token)
    if not payload:
        raise cred_exc
    # A purpose-tagged token (e.g. an OAuth-connect `state`) is NOT a session
    # credential — refuse to authenticate with it even though it's validly signed.
    if payload.get("purpose"):
        raise cred_exc
    subject = payload.get("sub")
    if subject is None:
        raise cred_exc
    # Revocation fails CLOSED: a token with no jti can't be checked against the
    # blocklist, so it is rejected rather than silently trusted.
    jti = payload.get("jti")
    if not jti:
        raise cred_exc
    if db.query(RevokedToken.id).filter(RevokedToken.jti == jti).first():
        raise cred_exc
    user = db.get(User, int(subject)) if subject.isdigit() else None
    if user is None:
        raise cred_exc
    # Password reset (and any future credential change) stamps password_changed_at;
    # tokens minted before that instant are invalidated so a stolen JWT can't
    # outlive the recovery that was meant to end it.
    changed = user.password_changed_at
    if changed is not None:
        iat = payload.get("iat")
        if iat is not None:
            if changed.tzinfo is None:
                changed = changed.replace(tzinfo=timezone.utc)
            if int(iat) < int(changed.timestamp()):
                raise cred_exc
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    """Guard for cross-tenant /api/admin/* routes. Regular users get 403."""
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
