"""Draft autosave — конфигуратор сохраняет JSON в Redis раз в N секунд.

Хранилище: Redis ключ `draft:user:{user_id}` с TTL 7 дней. Это не
переживёт миграцию инстанса Redis, но для фичи "вернуться к сохранённой
работе" достаточно. Когда Sprint 3 — переедем в Postgres-таблицу.

Эндпоинты:
- POST /drafts/me  — сохранить (upsert) черновик текущего пользователя.
- GET  /drafts/me  — получить.
- DELETE /drafts/me — удалить (на "Оформить заказ").

Гость (без auth) использует анонимный draft по cookie/local-id, который
шлёт фронт. См. draft_id_or_user.
"""

from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.cache import get_cache
from app.core.deps import get_current_user_optional


router = APIRouter()

DRAFT_TTL_SECONDS = 7 * 24 * 3600


class DraftPayload(BaseModel):
    """Произвольный JSON-конфиг (любой схемы — фронт владелец)."""
    config: Dict[str, Any] = Field(..., description="Снимок состояния конструктора")
    product: Optional[str] = None
    updated_at: Optional[float] = None


class DraftResponse(BaseModel):
    config: Dict[str, Any]
    product: Optional[str] = None
    updated_at: float
    owner: str


def _resolve_owner(current_user, anon_id: Optional[str]) -> str:
    if current_user is not None:
        return f"u:{current_user.id}"
    # Анонимный ID должен быть полноценным UUID, иначе короткий/угадываемый
    # идентификатор вида "12345678" даёт чужому пользователю доступ к черновику.
    if anon_id:
        try:
            parsed = uuid.UUID(anon_id)
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(status_code=400, detail="X-Anonymous-Id must be a UUID")
        return f"a:{parsed}"
    raise HTTPException(status_code=400, detail="Authentication or X-Anonymous-Id required")


def _key(owner: str) -> str:
    return f"draft:{owner}"


@router.post("/me", response_model=DraftResponse)
async def save_draft(
    payload: DraftPayload,
    current_user=Depends(get_current_user_optional),
    x_anonymous_id: Optional[str] = Header(None, alias="X-Anonymous-Id"),
):
    owner = _resolve_owner(current_user, x_anonymous_id)
    now = time.time()
    record = {
        "config": payload.config,
        "product": payload.product,
        "updated_at": now,
        "owner": owner,
    }
    cache = get_cache()
    try:
        await cache.set(_key(owner), json.dumps(record), ex=DRAFT_TTL_SECONDS)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"Cache unavailable: {e}")
    return record


@router.get("/me", response_model=Optional[DraftResponse])
async def get_draft(
    current_user=Depends(get_current_user_optional),
    x_anonymous_id: Optional[str] = Header(None, alias="X-Anonymous-Id"),
):
    owner = _resolve_owner(current_user, x_anonymous_id)
    cache = get_cache()
    try:
        raw = await cache.get(_key(owner))
    except Exception:
        return None
    if not raw:
        return None
    return json.loads(raw)


@router.delete("/me", status_code=204)
async def delete_draft(
    current_user=Depends(get_current_user_optional),
    x_anonymous_id: Optional[str] = Header(None, alias="X-Anonymous-Id"),
):
    owner = _resolve_owner(current_user, x_anonymous_id)
    cache = get_cache()
    try:
        await cache.delete(_key(owner))
    except Exception:
        pass
    return None
