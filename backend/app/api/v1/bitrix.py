"""Эндпоинты интеграции с Bitrix24.

Назначение:
 * POST /api/v1/bitrix/webhook — приём outgoing webhook'ов от портала Bitrix
   (изменения сделок), чтобы статус заказа на сайте подтягивался автоматически.
 * POST /api/v1/bitrix/resync/{order_id} — ручной retry, на случай если
   фоновая синхронизация при создании заказа упала (Bitrix лежал).

Аутентификация:
 * webhook  — секрет передаётся в query (?token=...) либо в form-поле
   ``auth[application_token]``. Сравнивается с BITRIX_INCOMING_TOKEN.
 * resync   — admin / dealer / manufacturer JWT (стандартный get_current_user).
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user
from app.database import get_db
from app.services.bitrix.client import BitrixClient
from app.services.bitrix.schemas import BitrixWebhookEvent
from app.services.bitrix.sync import BitrixSyncService
from app.services.bitrix.webhook import handle_event, verify


log = logging.getLogger(__name__)
router = APIRouter()


def _client(request: Request) -> BitrixClient:
    client: Optional[BitrixClient] = getattr(request.app.state, "bitrix_client", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Bitrix integration is not configured")
    return client


def _sync_service(request: Request) -> BitrixSyncService:
    svc: Optional[BitrixSyncService] = getattr(request.app.state, "bitrix_sync", None)
    if svc is None:
        raise HTTPException(status_code=503, detail="Bitrix integration is not configured")
    return svc


@router.post("/webhook", status_code=200)
async def bitrix_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Outgoing webhook от Bitrix24. Параметры приходят в form-urlencoded."""
    form = dict((await request.form()).items())
    token = request.query_params.get("token") or form.get("auth[application_token]")
    if not verify(token):
        # 200, чтобы Bitrix не ретраил вечно из-за неправильного токена,
        # но в логи событие пишем — заметим в Sentry/event_logger.
        log.warning("Bitrix webhook rejected: invalid token")
        raise HTTPException(status_code=401, detail="Invalid token")

    event = BitrixWebhookEvent.from_form(form)
    client = _client(request)
    ok = await handle_event(event, db, client)
    return {"ok": ok, "event": event.event, "deal_id": event.deal_id}


@router.post("/resync/{order_id}", status_code=202)
async def manual_resync(
    order_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Ручная пересинхронизация одного заказа.

    Разрешён только админам, дилерам, производственникам — то есть тем,
    кто реально работает в Bitrix.
    """
    allowed_roles = {"admin", "dealer", "manufacturer"}
    if user.role not in allowed_roles:
        raise HTTPException(status_code=403, detail="Forbidden")

    from app.models.order import Order

    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    svc = _sync_service(request)
    deal_id = await svc.push_order_created(db, order) if not (order.configuration or {}).get(
        "bitrix"
    ) else None
    if deal_id is None:
        await svc.push_order_updated(db, order, comment="Ручная пересинхронизация со Spruzhyk")
    return {"status": "accepted"}
