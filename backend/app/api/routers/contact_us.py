"""Public "contact us" form on the marketing site.

Unauthenticated by design (visitors aren't users), so it is throttled per IP
and the response never reveals delivery internals. The message is forwarded to
CONTACT_INBOX via the email provider; in console mode it is logged, which keeps
the zero-credential dev experience intact.
"""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.ratelimit import client_ip, limiter
from app.providers.email import email_provider

router = APIRouter(prefix="/api/contact", tags=["contact"])

_RL_WINDOW = 600  # seconds (10 minutes)
THROTTLE_MSG = "Too many messages. Please wait a few minutes and try again."


class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    message: str = Field(min_length=10, max_length=5000)


@router.post("", status_code=202)
def contact_us(payload: ContactIn, request: Request):
    ip = client_ip(request)
    if not limiter.check(f"contact:ip:{ip}", 3, _RL_WINDOW):
        raise HTTPException(status_code=429, detail=THROTTLE_MSG)

    name = payload.name.strip()
    body = (
        f"From: {name} <{payload.email}>\n"
        f"IP: {ip}\n\n"
        f"{payload.message.strip()}\n"
    )
    sent = email_provider.send(
        to=settings.contact_inbox,
        subject=f"[SynthSales contact] {name}",
        body=body,
    )
    if not sent:
        # The provider is configured but the send failed (e.g. SMTP outage).
        raise HTTPException(
            status_code=502,
            detail="We couldn't send your message right now. Please try again later.",
        )
    return {"detail": "Message sent. We read everything."}
