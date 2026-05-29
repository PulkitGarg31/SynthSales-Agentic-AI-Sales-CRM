import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.agents.orchestrator import ensure_agents
from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models import User, utcnow
from app.core.config import settings
from app.providers.email import email_provider
from app.schemas import (
    LoginIn,
    RegisterIn,
    RegisterOut,
    Token,
    UserOut,
    UserUpdate,
    VerifyOtpIn,
)
from app.services.events import add_log

router = APIRouter(prefix="/api/auth", tags=["auth"])

def _new_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


def _send_otp(email: str, otp: str) -> bool:
    """Email the OTP. Returns True only when actually delivered to a real inbox
    (via SMTP/Gmail) — console mode counts as not delivered."""
    # Put the code + time in the subject so Gmail doesn't thread/collapse
    # multiple OTP emails — you can always see which one is newest.
    stamp = datetime.now(timezone.utc).astimezone().strftime("%H:%M")
    subject = f"Reachly code {otp} (sent {stamp})"
    body = (
        f"Welcome to Reachly!\n\n"
        f"Your verification code is: {otp}\n\n"
        f"Sent at {stamp}. It expires in 15 minutes and replaces any earlier code.\n"
        f"If you didn't request this, ignore this email."
    )
    sent = email_provider.send(email, subject, body)
    return sent and email_provider.mode in ("smtp", "gmail")


def _dev_otp(otp: str, delivered: bool) -> str | None:
    """Expose the OTP only in development when it wasn't actually emailed."""
    if settings.environment == "development" and (
        not delivered or email_provider.mode == "console"
    ):
        return otp
    return None


@router.post("/register", response_model=RegisterOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    otp = _new_otp()
    user = User(
        name=payload.name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        is_verified=False,
        otp_code=otp,
        otp_expires_at=utcnow() + timedelta(minutes=15),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    ensure_agents(db, user.id)
    delivered = _send_otp(user.email, otp)
    add_log(
        db, user.id, "User",
        f"Registered {user.email}; OTP {'emailed' if delivered else 'issued (not emailed)'}.",
    )
    out = RegisterOut.model_validate(user)
    out.email_sent = delivered
    out.dev_otp = _dev_otp(otp, delivered)
    return out


@router.post("/verify-otp", response_model=Token)
def verify_otp(payload: VerifyOtpIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or user.otp_code != payload.code:
        raise HTTPException(status_code=400, detail="Invalid code")
    if user.otp_expires_at and user.otp_expires_at < utcnow():
        raise HTTPException(status_code=400, detail="Code expired")
    user.is_verified = True
    user.otp_code = None
    # Auto-grant admin if this email is in the configured admin list.
    if user.email.lower() in settings.admin_emails_list:
        user.is_admin = True
    db.commit()
    return Token(access_token=create_access_token(str(user.id)))


@router.post("/resend-otp")
def resend_otp(payload: LoginIn | None = None, email: str = "", db: Session = Depends(get_db)):
    target = email or (payload.email if payload else "")
    user = db.query(User).filter(User.email == target).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    otp = _new_otp()
    user.otp_code = otp
    user.otp_expires_at = utcnow() + timedelta(minutes=15)
    db.commit()
    delivered = _send_otp(user.email, otp)
    return {
        "detail": "OTP resent" if delivered else "OTP regenerated (email not configured)",
        "email_sent": delivered,
        "dev_otp": _dev_otp(otp, delivered),
    }


@router.post("/login", response_model=Token)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Please verify your email before signing in. Check your inbox for the code.",
        )
    return Token(access_token=create_access_token(str(user.id)))


@router.post("/token", response_model=Token, include_in_schema=True)
def token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """OAuth2 password flow — lets Swagger's Authorize button work."""
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Email not verified")
    return Token(access_token=create_access_token(str(user.id)))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.outbound_enabled is not None:
        user.outbound_enabled = payload.outbound_enabled
        add_log(
            db,
            user.id,
            "User",
            f"Outbound email sending {'ENABLED' if payload.outbound_enabled else 'PAUSED'}.",
        )
    db.commit()
    db.refresh(user)
    return user
