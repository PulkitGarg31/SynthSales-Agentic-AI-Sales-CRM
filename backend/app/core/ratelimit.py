"""A tiny, dependency-free, thread-safe sliding-window rate limiter.

Used to throttle abuse-prone auth endpoints (registration, OTP resend). The
request handlers are sync ``def`` functions that FastAPI runs in the anyio
threadpool, so the shared store is guarded by a ``threading.Lock``.

Honest limitations (acceptable for the current single-process dev/deploy):
- **Per-process.** Each uvicorn worker keeps its own dict, so the effective
  limit is multiplied by the number of workers.
- **Resets on restart.** The buckets live in memory only.
- **Unbounded key growth.** Negligible at auth volume; distinct keys are pruned
  lazily as their windows empty, but the dict itself is never compacted.

When any of these matter, swap the implementation for Redis behind the same
``check()`` / ``reset()`` interface — call sites won't change.
"""
from __future__ import annotations

import threading
import time


class RateLimiter:
    """Fixed-capacity sliding window keyed by an arbitrary string."""

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_seconds: float) -> bool:
        """Record a hit for ``key`` and report whether it is allowed.

        Returns ``True`` when the hit is within ``limit`` over the trailing
        ``window_seconds``; ``False`` when the limit is already exhausted (in
        which case the hit is *not* recorded, so a blocked caller doesn't keep
        extending its own window).
        """
        now = time.monotonic()  # monotonic: immune to wall-clock adjustments
        cutoff = now - window_seconds
        with self._lock:
            hits = self._hits.get(key)
            if hits is None:
                hits = []
                self._hits[key] = hits
            # Drop timestamps that have aged out of the window.
            hits[:] = [t for t in hits if t > cutoff]
            if len(hits) >= limit:
                return False
            hits.append(now)
            return True

    def reset(self, key: str) -> None:
        """Forget all recorded hits for ``key``."""
        with self._lock:
            self._hits.pop(key, None)


# Process-wide singleton — import this, not the class.
limiter = RateLimiter()
