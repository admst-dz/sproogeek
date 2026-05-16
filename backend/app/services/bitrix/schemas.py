"""Pydantic-схемы для входящих webhook'ов Bitrix24.

Bitrix отправляет данные в ``application/x-www-form-urlencoded`` со
структурой:

    event=ONCRMDEALUPDATE
    event_handler_id=123
    data[FIELDS][ID]=42
    auth[application_token]=...
    auth[domain]=...
    auth[member_id]=...
    ts=1700000000

FastAPI парсит form-data в плоский dict; ниже — расширяемая модель,
которой пользуется обработчик /api/v1/bitrix/webhook.
"""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class BitrixWebhookEvent(BaseModel):
    event: str
    deal_id: Optional[int] = None
    application_token: Optional[str] = None
    domain: Optional[str] = None

    @classmethod
    def from_form(cls, form: dict[str, str]) -> "BitrixWebhookEvent":
        deal_raw = form.get("data[FIELDS][ID]") or form.get("data[ID]")
        try:
            deal_id = int(deal_raw) if deal_raw else None
        except ValueError:
            deal_id = None
        return cls(
            event=form.get("event", ""),
            deal_id=deal_id,
            application_token=form.get("auth[application_token]"),
            domain=form.get("auth[domain]"),
        )
