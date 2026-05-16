"""Тонкий async-клиент над Bitrix24 REST.

Bitrix24 предоставляет два способа аутентификации:
 1. Входящий webhook (рекомендуется для server-to-server) — URL вида
    ``https://<portal>.bitrix24.ru/rest/<user_id>/<token>/``. Этот URL и есть
    "ключ"; в .env он лежит как BITRIX_WEBHOOK_URL.
 2. OAuth-приложение — сложнее, нужен только если ставим интеграцию
    из маркетплейса. В рамках MVP не используется.

Клиент намеренно тонкий: возвращает сырой ``result`` из ответа Bitrix и
бросает BitrixError при ошибке. Бизнес-логика — в sync.py.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.services.bitrix.exceptions import BitrixAuthError, BitrixError, BitrixNotConfigured


log = logging.getLogger(__name__)


class BitrixClient:
    """Один экземпляр на процесс. Использует общий ``httpx.AsyncClient``.

    Создаётся в lifespan FastAPI и пробрасывается через depend / сервис.
    """

    def __init__(self, webhook_url: str, timeout: float = 15.0) -> None:
        if not webhook_url:
            raise BitrixNotConfigured("BITRIX_WEBHOOK_URL is empty")
        # webhook URL обязан оканчиваться слешем — иначе Bitrix отдаст 404
        self._base = webhook_url.rstrip("/") + "/"
        self._client = httpx.AsyncClient(timeout=timeout)

    async def close(self) -> None:
        await self._client.aclose()

    async def call(self, method: str, params: dict[str, Any] | None = None) -> Any:
        """Универсальный вызов REST-метода (``crm.deal.add`` и т.п.).

        Возвращает содержимое поля ``result``. Поднимает BitrixError при
        любом сбое — сетевом, HTTP, либо логическом (поле ``error``).
        """
        url = self._base + method.lstrip("/")
        try:
            resp = await self._client.post(url, json=params or {})
        except httpx.HTTPError as exc:
            raise BitrixError(f"Network error calling {method}: {exc}") from exc

        if resp.status_code == 401:
            raise BitrixAuthError(f"Bitrix returned 401 for {method} — токен отозван?")
        if resp.status_code >= 400:
            raise BitrixError(f"Bitrix HTTP {resp.status_code} for {method}: {resp.text[:300]}")

        try:
            payload = resp.json()
        except ValueError as exc:
            raise BitrixError(f"Bitrix non-JSON response for {method}: {resp.text[:300]}") from exc

        if "error" in payload:
            raise BitrixError(
                f"Bitrix logical error on {method}: "
                f"{payload.get('error')} / {payload.get('error_description')}"
            )
        return payload.get("result")

    # ── удобные обёртки ─────────────────────────────────────────────
    async def deal_add(self, fields: dict[str, Any]) -> int:
        result = await self.call("crm.deal.add", {"fields": fields})
        return int(result)

    async def deal_update(self, deal_id: int, fields: dict[str, Any]) -> bool:
        return bool(await self.call("crm.deal.update", {"id": deal_id, "fields": fields}))

    async def deal_get(self, deal_id: int) -> dict[str, Any]:
        return await self.call("crm.deal.get", {"id": deal_id}) or {}

    async def contact_find_by_email(self, email: str) -> int | None:
        if not email:
            return None
        result = await self.call(
            "crm.contact.list",
            {
                "filter": {"EMAIL": email},
                "select": ["ID"],
            },
        )
        if not result:
            return None
        return int(result[0]["ID"])

    async def contact_add(self, fields: dict[str, Any]) -> int:
        return int(await self.call("crm.contact.add", {"fields": fields}))

    async def deal_add_comment(self, deal_id: int, text: str) -> int:
        result = await self.call(
            "crm.timeline.comment.add",
            {
                "fields": {
                    "ENTITY_ID": deal_id,
                    "ENTITY_TYPE": "deal",
                    "COMMENT": text,
                }
            },
        )
        return int(result)
