"""Сервис двусторонней синхронизации заказа Spruzhyk ↔ сделки Bitrix24.

Поток "сайт → Bitrix":
 * order_created  →  contact_find_by_email | contact_add → deal_add → сохранить link
 * order_updated  →  deal_update (поля + STAGE_ID) + timeline-комментарий

Поток "Bitrix → сайт" (опционально, через outgoing webhook Bitrix):
 * сделка изменена → /api/v1/bitrix/webhook → status orderа обновляется

Все вызовы выполняются в фоне (asyncio.create_task) из обработчика заказа,
чтобы лежащий Bitrix не валил основной API. Ошибки логируются и
ретраятся ограниченное число раз с экспоненциальной задержкой.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.event_logger import event_logger
from app.crud import user as crud_user
from app.models.order import Order
from app.services.bitrix.client import BitrixClient
from app.services.bitrix.exceptions import BitrixError, BitrixNotConfigured
from app.services.bitrix.mappers import contact_fields, deal_fields


log = logging.getLogger(__name__)


class BitrixSyncService:
    """Бизнес-логика синхронизации. ``client`` инжектится из lifespan."""

    def __init__(self, client: BitrixClient) -> None:
        self._client = client

    # ── публичный API ──────────────────────────────────────────────
    async def push_order_created(self, db: AsyncSession, order: Order) -> Optional[int]:
        """Создать сделку и сохранить bitrix_deal_id в Order.configuration."""
        try:
            user = await crud_user.get_user(db, order.user_id) if order.user_id else None
            contact_id = await self._ensure_contact(user, order)

            fields = deal_fields(order, user)
            if contact_id:
                fields["CONTACT_ID"] = contact_id

            deal_id = await self._client.deal_add(fields)
            await self._store_link(db, order, deal_id, contact_id)
            event_logger.log(
                "BITRIX_DEAL_CREATED",
                f"Сделка Bitrix создана для заказа {order.id}",
                details={"deal_id": deal_id, "order_id": str(order.id)},
            )
            return deal_id
        except BitrixError as exc:
            log.warning("Bitrix push_order_created failed for %s: %s", order.id, exc)
            event_logger.log(
                "BITRIX_DEAL_CREATE_FAILED",
                f"Не удалось создать сделку для {order.id}",
                details={"error": str(exc), "order_id": str(order.id)},
            )
            return None

    async def push_order_updated(self, db: AsyncSession, order: Order, comment: str | None = None) -> bool:
        """Обновить сделку. Если линка нет — создать."""
        deal_id = _link_deal_id(order)
        if not deal_id:
            new_id = await self.push_order_created(db, order)
            return new_id is not None

        try:
            user = await crud_user.get_user(db, order.user_id) if order.user_id else None
            await self._client.deal_update(deal_id, deal_fields(order, user))
            if comment:
                await self._client.deal_add_comment(deal_id, comment)
            event_logger.log(
                "BITRIX_DEAL_UPDATED",
                f"Сделка Bitrix обновлена для заказа {order.id}",
                details={"deal_id": deal_id, "order_id": str(order.id)},
            )
            return True
        except BitrixError as exc:
            log.warning("Bitrix push_order_updated failed for %s: %s", order.id, exc)
            event_logger.log(
                "BITRIX_DEAL_UPDATE_FAILED",
                f"Не удалось обновить сделку для {order.id}",
                details={"error": str(exc), "deal_id": deal_id, "order_id": str(order.id)},
            )
            return False

    # ── внутренности ──────────────────────────────────────────────
    async def _ensure_contact(self, user, order: Order) -> Optional[int]:
        email = (user.email if user else None) or order.user_email
        if not email:
            return None
        existing = await self._client.contact_find_by_email(email)
        if existing:
            return existing
        return await self._client.contact_add(contact_fields(user, order))

    async def _store_link(
        self, db: AsyncSession, order: Order, deal_id: int, contact_id: int | None
    ) -> None:
        """Сохраняем deal_id в configuration.bitrix — без отдельной таблицы.

        Если в проекте позже понадобится более жёсткая связь (foreign key,
        отчётность), переехать в выделенную таблицу — задача на 1 alembic
        миграцию (см. inst.txt → раздел 7).
        """
        cfg = dict(order.configuration or {})
        cfg["bitrix"] = {
            "deal_id": deal_id,
            "contact_id": contact_id,
            "portal": get_settings().bitrix_portal_host,
        }
        order.configuration = cfg
        from sqlalchemy.orm.attributes import flag_modified

        flag_modified(order, "configuration")
        await db.commit()


def _link_deal_id(order: Order) -> int | None:
    cfg = order.configuration or {}
    link = cfg.get("bitrix") or {}
    deal_id = link.get("deal_id")
    try:
        return int(deal_id) if deal_id is not None else None
    except (TypeError, ValueError):
        return None


# ── fire-and-forget обёртки для вызова из OrderService ─────────────
async def _run_with_retries(coro_factory, retries: int = 3, base_delay: float = 1.0) -> None:
    delay = base_delay
    for attempt in range(1, retries + 1):
        try:
            await coro_factory()
            return
        except Exception as exc:  # noqa: BLE001 — фоновая задача, нельзя падать
            log.warning("Bitrix sync attempt %s/%s failed: %s", attempt, retries, exc)
            if attempt == retries:
                event_logger.log(
                    "BITRIX_SYNC_GIVEUP",
                    "Bitrix sync исчерпал попытки",
                    details={"error": str(exc)},
                )
                return
            await asyncio.sleep(delay)
            delay *= 2


def schedule_push_created(service: BitrixSyncService, session_factory, order_id: str) -> None:
    """Запустить push_order_created в фоне, создав свежую сессию БД."""

    async def _run() -> None:
        async def _do() -> None:
            async with session_factory() as db:
                order = await db.get(Order, order_id)
                if order is None:
                    log.warning("Order %s not found for Bitrix push", order_id)
                    return
                await service.push_order_created(db, order)

        await _run_with_retries(_do)

    asyncio.create_task(_run())


def schedule_push_updated(
    service: BitrixSyncService, session_factory, order_id: str, comment: str | None = None
) -> None:
    async def _run() -> None:
        async def _do() -> None:
            async with session_factory() as db:
                order = await db.get(Order, order_id)
                if order is None:
                    return
                await service.push_order_updated(db, order, comment=comment)

        await _run_with_retries(_do)

    asyncio.create_task(_run())


def is_configured() -> bool:
    try:
        return bool(get_settings().bitrix_webhook_url)
    except BitrixNotConfigured:
        return False
