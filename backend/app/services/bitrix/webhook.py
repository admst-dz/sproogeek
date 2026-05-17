"""Обработка outgoing-webhook'ов из Bitrix24 в сторону Spruzhyk.

Сценарий: менеджер в Bitrix перетащил сделку в другой STAGE_ID —
прилетает событие ONCRMDEALUPDATE → находим Order по deal_id (хранится
в configuration.bitrix.deal_id) → подтягиваем сделку через REST → пишем
статус в Order.

Безопасность:
 * проверяем ``auth[application_token]`` или секрет в URL (BITRIX_INCOMING_TOKEN);
 * trust только запросам с доменом из BITRIX_PORTAL_HOST.
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import cast, String, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.event_logger import event_logger
from app.crud import order as crud_order
from app.models.order import Order
from app.services.bitrix.client import BitrixClient
from app.services.bitrix.schemas import BitrixWebhookEvent


log = logging.getLogger(__name__)


# Обратный маппинг STAGE_ID → внутренний статус.
# Пользователь должен дублировать любые кастомные коды через ENV
# BITRIX_REVERSE_STAGE_MAP — см. inst.txt раздел 4.
_DEFAULT_REVERSE = {
    "NEW": "new",
    "PREPARATION": "in_progress",
    "EXECUTING": "production",
    "FINAL_INVOICE": "shipped",
    "WON": "completed",
    "LOSE": "cancelled",
}


def _reverse_stage_map() -> dict[str, str]:
    settings = get_settings()
    if not settings.bitrix_reverse_stage_map:
        return _DEFAULT_REVERSE
    try:
        pairs = dict(item.split("=", 1) for item in settings.bitrix_reverse_stage_map.split(","))
        return {k.strip(): v.strip() for k, v in pairs.items()}
    except ValueError:
        return _DEFAULT_REVERSE


def _stage_code(stage_id: str) -> str:
    """STAGE_ID может быть "NEW" или "C1:NEW" — нас интересует часть после ':'."""
    return stage_id.split(":", 1)[-1] if stage_id else ""


def verify(token_from_request: Optional[str]) -> bool:
    expected = get_settings().bitrix_incoming_token
    if not expected:
        # явная конфигурация — если токен не задан, webhook отключён
        return False
    return bool(token_from_request) and token_from_request == expected


async def find_order_by_deal(db: AsyncSession, deal_id: int) -> Optional[Order]:
    # JSONB path-запрос: configuration->'bitrix'->>'deal_id' == :deal_id
    stmt = select(Order).where(
        cast(Order.configuration["bitrix"]["deal_id"].astext, String) == str(deal_id)
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def handle_event(
    event: BitrixWebhookEvent,
    db: AsyncSession,
    client: BitrixClient,
) -> bool:
    if event.event not in {"ONCRMDEALUPDATE", "ONCRMDEALADD"}:
        # игнорируем то, что не подписывали — но не ругаемся
        return True
    if not event.deal_id:
        return False

    order = await find_order_by_deal(db, event.deal_id)
    if not order:
        log.info("No Spruzhyk order for Bitrix deal %s — ignoring", event.deal_id)
        return True

    deal = await client.deal_get(event.deal_id)
    new_stage = _stage_code(deal.get("STAGE_ID", ""))
    new_status = _reverse_stage_map().get(new_stage)
    if not new_status or new_status == order.status:
        return True

    await crud_order.update_status(
        db, str(order.id), new_status, comment=f"Bitrix: смена этапа на {new_stage}"
    )
    event_logger.log(
        "BITRIX_STATUS_PULLED",
        f"Статус заказа {order.id} обновлён из Bitrix",
        details={"deal_id": event.deal_id, "stage_id": new_stage, "status": new_status},
    )
    return True
