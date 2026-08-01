"""Public "contact us" form on the marketing site.

Unauthenticated by design (visitors aren't users), so it is throttled per IP
and the response never reveals delivery internals. The message is forwarded to
CONTACT_INBOX via the email provider; in console mode it is logged, which keeps
the zero-credential dev experience intact.
"""
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from app.core.config import settings
from app.core.ratelimit import client_ip, limiter
from app.providers.email import email_provider

router = APIRouter(prefix="/api/contact", tags=["contact"])
logger = logging.getLogger("synthsales")

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

    # Strip CR/LF from the name before it reaches an email Subject header
    # (defence-in-depth against header injection).
    name = payload.name.replace("\r", " ").replace("\n", " ").strip()
    body = (
        f"From: {name} <{payload.email}>\n"
        f"IP: {ip}\n\n"
        f"{payload.message.strip()}\n"
    )
    if not settings.contact_inbox:
        # No delivery mailbox configured — accept + log rather than 502 (keeps the
        # zero-config dev experience working without a hardcoded address in source).
        logger.info("[contact-form] from %s <%s>", name, payload.email)
        return {"detail": "Message sent. We read everything."}
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
