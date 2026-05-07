"""Server-Sent Events stream for real-time order updates."""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterator

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import STAFF_ROLES
from app.core.security import decode_token
from app.crud import user as crud_user
from app.database import AsyncSessionLocal
from app.services.event_hub import event_hub


log = logging.getLogger(__name__)
router = APIRouter()


async def _resolve_user_from_token(token: str):
    """SSE can't send Authorization headers via EventSource — accept token in query."""
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    async with AsyncSessionLocal() as db:  # type: AsyncSession
        user = await crud_user.get_user(db, user_id)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user


def _can_see_event(user, payload: dict) -> bool:
    """Filter rules: staff sees everything, owner of the order sees their own."""
    if user.role in STAFF_ROLES:
        return True
    user_id = payload.get("user_id")
    return user_id == user.id


@router.get("/orders")
async def stream_orders(
    request: Request,
    token: str = Query(..., description="JWT access token"),
):
    user = await _resolve_user_from_token(token)

    async def event_source() -> AsyncIterator[bytes]:
        # Tell the client immediately that we're alive
        yield b": connected\n\n"

        async with event_hub.subscribe() as queue:
            while True:
                if await request.is_disconnected():
                    log.debug("sse client disconnected user=%s", user.id)
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
                    if not _can_see_event(user, parsed.get("data") or {}):
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
