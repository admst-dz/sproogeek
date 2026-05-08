"""In-process pub/sub for real-time order events delivered over SSE.

Trade-off: works for a single backend pod. If you scale horizontally,
swap the in-memory broker for Redis pub/sub or Kafka without changing
the public API (publish / subscribe).
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator


log = logging.getLogger(__name__)


class _EventHub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._lock = asyncio.Lock()

    async def publish(self, event_type: str, data: dict[str, Any]) -> None:
        payload = json.dumps({"type": event_type, "data": data}, default=str)
        async with self._lock:
            dead: list[asyncio.Queue[str]] = []
            for queue in self._subscribers:
                try:
                    queue.put_nowait(payload)
                except asyncio.QueueFull:
                    dead.append(queue)
            for queue in dead:
                self._subscribers.discard(queue)
        log.debug("event_hub published %s to %d subscribers", event_type, len(self._subscribers))

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[str]]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=64)
        async with self._lock:
            self._subscribers.add(queue)
        try:
            yield queue
        finally:
            async with self._lock:
                self._subscribers.discard(queue)


event_hub = _EventHub()


def fire_and_forget(coro) -> None:
    """Schedule an async publish from sync code without awaiting."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(coro)
