"""Thread-safe sliding-window rate limiter with an optional Redis backend.

Used to throttle abuse-prone auth endpoints (registration, OTP resend, password
reset, contact form). The request handlers are sync ``def`` functions that
FastAPI runs in the anyio threadpool, so the in-memory store is guarded by a
``threading.Lock`` and the Redis client is the (thread-safe) sync ``redis-py``.

Two backends behind one ``check()`` / ``reset()`` interface — call sites never
change:

- **In-memory** (default, ``REDIS_URL`` unset): per-process buckets. Correct at
  single-worker; under multiple workers each process keeps its own dict, so the
  effective limit is multiplied by the worker count, and buckets reset on
  restart. Fine for the single-worker target.
- **Redis** (``REDIS_URL`` set): buckets shared across every worker/instance, so
  the limit holds for a multi-worker / multi-instance deploy and survives
  restarts. On any Redis error the limiter **degrades gracefully** to a
  per-process in-memory fallback rather than failing a request.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid

logger = logging.getLogger("synthsales")


class InMemoryRateLimiter:
    """Fixed-capacity sliding window keyed by an arbitrary string, in memory."""

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


# Atomic check-and-record sliding window over a Redis sorted set. Mirrors the
# in-memory semantics exactly: prune aged-out hits, reject without recording
# when full, otherwise record and refresh the key TTL.
_CHECK_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
if redis.call('ZCARD', key) >= limit then
  return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, math.ceil(window * 1000))
return 1
"""


class RedisRateLimiter:
    """Sliding window backed by Redis, shared across workers/instances.

    Falls back to a per-process in-memory limiter on any Redis error so a flaky
    cache never takes the auth endpoints down with it.
    """

    def __init__(self, url: str) -> None:
        import redis  # imported lazily — only needed when REDIS_URL is set

        self._client = redis.Redis.from_url(
            url, socket_timeout=2, socket_connect_timeout=2
        )
        self._script = self._client.register_script(_CHECK_LUA)
        self._fallback = InMemoryRateLimiter()
        self._degraded = False

    def _on_error(self, exc: Exception) -> None:
        # Log the first transition into degraded mode, then stay quiet.
        if not self._degraded:
            self._degraded = True
            logger.warning(
                "Rate limiter Redis backend unavailable (%s); "
                "falling back to in-memory.",
                exc,
            )

    def check(self, key: str, limit: int, window_seconds: float) -> bool:
        now = time.time()  # wall clock: shared, comparable across processes
        member = f"{now:.6f}:{uuid.uuid4().hex}"
        try:
            allowed = self._script(
                keys=[f"rl:{key}"], args=[now, window_seconds, limit, member]
            )
            if self._degraded:  # a success means Redis is back
                self._degraded = False
                logger.info("Rate limiter Redis backend recovered.")
            return bool(allowed)
        except Exception as exc:  # redis.RedisError + connection issues
            self._on_error(exc)
            return self._fallback.check(key, limit, window_seconds)

    def reset(self, key: str) -> None:
        try:
            self._client.delete(f"rl:{key}")
        except Exception as exc:
            self._on_error(exc)
        # Always clear the fallback too, so a reset is honored regardless of
        # which backend recorded the hits.
        self._fallback.reset(key)


def _build_limiter():
    from app.core.config import settings

    if settings.redis_url:
        try:
            limiter = RedisRateLimiter(settings.redis_url)
            logger.info("Rate limiter using Redis backend.")
            return limiter
        except Exception as exc:  # bad URL / redis package missing
            logger.warning(
                "Could not initialize Redis rate limiter (%s); "
                "using in-memory backend.",
                exc,
            )
    return InMemoryRateLimiter()


# Process-wide singleton — import this, not the classes.
limiter = _build_limiter()


def client_ip(request) -> str:
    """Best-effort client IP for rate-limit keying.

    When ``trust_proxy`` is set — a trusted reverse proxy fronts the app, as on
    every PaaS — use the left-most ``X-Forwarded-For`` entry (the original
    client the proxy recorded). Without a proxy, ``X-Forwarded-For`` is
    attacker-controlled, so we trust only the direct peer address. ``request`` is
    a Starlette/FastAPI ``Request``.
    """
    from app.core.config import settings

    if settings.trust_proxy:
        xff = request.headers.get("x-forwarded-for")
        if xff:
            first = xff.split(",")[0].strip()
            if first:
                return first
    return request.client.host if request.client else "unknown"
