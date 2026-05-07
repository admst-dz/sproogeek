"""Hardening helpers shared across endpoints."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException

from app.core.config import get_settings


# ─── Filename / path safety ──────────────────────────────────────────────────
_SAFE_FILENAME = re.compile(r"^[A-Za-z0-9._-]+$")


def safe_filename(value: str, *, max_length: int = 255) -> str:
    """Reject anything that could break out of an S3 prefix / directory.

    Only allows ASCII letters, digits, dot, dash, underscore. No slashes,
    no '..', no nulls, no control chars. Raises HTTPException(400) on bad input.
    """
    if not value or len(value) > max_length:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if value in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not _SAFE_FILENAME.fullmatch(value):
        raise HTTPException(status_code=400, detail="Invalid filename")
    return value


_SAFE_PATH_SEGMENT = re.compile(r"^[A-Za-z0-9._-]+$")


def safe_path_segment(value: str, *, max_length: int = 128) -> str:
    """Same as safe_filename but used for individual S3 prefix segments / IDs."""
    if not value or len(value) > max_length or not _SAFE_PATH_SEGMENT.fullmatch(value):
        raise HTTPException(status_code=400, detail="Invalid path segment")
    return value


# ─── Order status enum (single source of truth) ───────────────────────────────
ALLOWED_ORDER_STATUSES = frozenset({
    "draft", "new", "processing", "production", "in_delivery", "done",
    "approved", "rejected", "cancelled",
})


def validate_status(status: str) -> str:
    if status not in ALLOWED_ORDER_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status: {status}")
    return status


# ─── Short-lived event tokens for SSE ─────────────────────────────────────────
# Why not use the JWT directly? EventSource forces token-in-URL.
# Long-lived JWT in URL leaks to browser history, proxy logs and HTTP referrers.
# Solution: HMAC-signed event token, scoped to user_id+role, valid 60 minutes,
# issued by an authenticated endpoint.

_EVENT_TOKEN_TTL = 60 * 60  # 1 hour


def issue_event_token(user_id: str, role: str) -> str:
    settings = get_settings()
    expires = int(time.time()) + _EVENT_TOKEN_TTL
    payload = f"{user_id}.{role}.{expires}"
    sig = hmac.new(
        settings.secret_key.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload}.{sig}"


def verify_event_token(token: str) -> tuple[str, str]:
    settings = get_settings()
    parts = token.split(".")
    if len(parts) != 4:
        raise HTTPException(status_code=401, detail="Invalid event token")
    user_id, role, expires_raw, sig = parts
    payload = f"{user_id}.{role}.{expires_raw}"
    expected = hmac.new(
        settings.secret_key.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid event token")
    try:
        expires = int(expires_raw)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid event token") from None
    if expires < int(time.time()):
        raise HTTPException(status_code=401, detail="Event token expired")
    return user_id, role


# ─── Constant-time secret check (admin backdoor) ──────────────────────────────
def constant_time_equals(a: str, b: str) -> bool:
    if not a or not b:
        return False
    return hmac.compare_digest(a.encode(), b.encode())
