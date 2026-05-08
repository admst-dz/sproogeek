"""Server-Sent Events stream for real-time order updates."""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.deps import STAFF_ROLES, get_current_user
from app.core.security_utils import issue_event_token, verify_event_token
from app.services.event_hub import event_hub


limiter = Limiter(key_func=get_remote_address)


log = logging.getLogger(__name__)
router = APIRouter()


def _can_see_event(user_id: str, role: str, payload: dict) -> bool:
    """Filter rules: staff sees everything, owner of the order sees their own."""
    if role in STAFF_ROLES:
        return True
    return payload.get("user_id") == user_id


@router.post("/token")
@limiter.limit("30/minute")
async def issue_token(request: Request, current_user=Depends(get_current_user)):
    """Mint a short-lived event token (HMAC-signed, 1 h TTL).

    Bound to user_id+role; safe to put in EventSource URL since the
    raw access JWT never leaves Authorization headers.
    """
    return {
        "token": issue_event_token(current_user.id, current_user.role),
        "expires_in": 3600,
    }


@router.get("/orders")
async def stream_orders(
    request: Request,
    token: str = Query(..., description="Event token (from POST /events/token)", min_length=10, max_length=512),
):
    user_id, role = verify_event_token(token)

    async def event_source() -> AsyncIterator[bytes]:
        # Tell the client immediately that we're alive
        yield b": connected\n\n"

        async with event_hub.subscribe() as queue:
            while True:
                if await request.is_disconnected():
                    log.debug("sse client disconnected user=%s", user_id)
                    return

                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=20.0)
                except asyncio.TimeoutError:
                    # Heartbeat keeps proxies / browsers from killing the connection
                    yield b": keep-alive\n\n"
                    continue

                # Light-touch authorisation — strip events the user shouldn't see
                import json
                try:
                    parsed = json.loads(payload)
                    if not _can_see_event(user_id, role, parsed.get("data") or {}):
                        continue
                except (json.JSONDecodeError, AttributeError):
                    continue

                yield f"data: {payload}\n\n".encode()

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )
