"""Shared offset/limit pagination for list endpoints.

Responses stay plain arrays (no envelope) so existing callers are unaffected; an
omitted ``limit`` falls back to ``MAX_LIMIT`` as a safety ceiling against
unbounded result sets. True UI pagination (envelope + load-more) is a deferred
enhancement (see BACKEND-GAPS.md).
"""
from fastapi import Query

MAX_LIMIT = 500


class Page:
    """Class-based dependency carrying validated limit/offset query params."""

    def __init__(
        self,
        limit: int | None = Query(
            None,
            ge=1,
            le=MAX_LIMIT,
            description=f"Max rows to return (1-{MAX_LIMIT}). Omitted -> up to {MAX_LIMIT}.",
        ),
        offset: int = Query(0, ge=0, description="Rows to skip before returning."),
    ):
        self.limit = limit or MAX_LIMIT
        self.offset = offset


def paginate(query, page: "Page"):
    """Apply offset + limit to a SQLAlchemy query."""
    return query.offset(page.offset).limit(page.limit)
