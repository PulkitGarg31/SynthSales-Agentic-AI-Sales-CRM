"""Access gating — the single source of truth for which pipeline stages and which
send paths require an admin-approved access grant (anti-abuse). `User.has_access`
is the boolean; this module holds the agent-key partition + a 403 guard."""
from __future__ import annotations

from fastapi import HTTPException, status

from app.models import User

# Free for everyone (research + list-building on the user's own uploaded data).
FREE_AGENT_KEYS = {"enrichment", "scoring", "employee_finder", "email_guess_verification"}
# Gated behind an approved access grant (reach out / send).
GATED_AGENT_KEYS = {"outreach", "tracking", "meeting", "reply_classifier"}

ACCESS_REQUIRED_DETAIL = (
    "This feature needs access approval. Request access in Settings; "
    "an admin will review it."
)


def require_access(user: User) -> None:
    """Raise 403 unless the user has an approved grant (or is an admin)."""
    if not user.has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail=ACCESS_REQUIRED_DETAIL
        )
