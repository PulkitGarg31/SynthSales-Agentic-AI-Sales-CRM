"""Very small in-process WebSocket hub keyed by user id.

Good enough for a single-process dev server. For multi-process/production,
back this with Redis pub/sub.
"""
import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# The app's main event loop, captured at startup so sync request handlers
# (which run in a threadpool) can schedule broadcasts without blocking.
_main_loop: asyncio.AbstractEventLoop | None = None


def set_main_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop


class ConnectionManager:
    def __init__(self) -> None:
        self._conns: dict[int, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: int, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._conns[user_id].add(ws)

    async def disconnect(self, user_id: int, ws: WebSocket) -> None:
        async with self._lock:
            self._conns[user_id].discard(ws)

    def has(self, user_id: int) -> bool:
        return bool(self._conns.get(user_id))

    async def send(self, user_id: int, event: str, data: dict) -> None:
        payload = json.dumps({"event": event, "data": data}, default=str)
        for ws in list(self._conns.get(user_id, ())):
            try:
                await ws.send_text(payload)
            except Exception:
                await self.disconnect(user_id, ws)


manager = ConnectionManager()


def notify(user_id: int, event: str, data: dict) -> None:
    """Fire-and-forget broadcast. Never blocks the caller (safe from sync
    request handlers running in the threadpool). No-op when nobody is connected."""
    if not manager.has(user_id):
        return

    coro = manager.send(user_id, event, data)
    try:
        # Already on an event loop (async context): schedule a task.
        loop = asyncio.get_running_loop()
        loop.create_task(coro)
        return
    except RuntimeError:
        pass

    # Called from a worker thread: schedule on the main loop without waiting.
    if _main_loop is not None and _main_loop.is_running():
        try:
            asyncio.run_coroutine_threadsafe(coro, _main_loop)
            return
        except Exception as exc:  # pragma: no cover
            logger.debug("notify schedule failed: %s", exc)
    coro.close()
