"""Thin client over the Spruzhyk TechCard microservice."""
from __future__ import annotations

import logging
from typing import Any, List, Optional

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.crud import user as crud_user
from app.models.order import Order


log = logging.getLogger(__name__)


_PRODUCT_KIND = {
    "notebook": "notebook",
    "thermos": "thermos",
    "powerbank": "powerbank",
}


def _kind_for(product_config: dict[str, Any]) -> str:
    raw = product_config.get("activeProduct") or product_config.get("type") or "notebook"
    return _PRODUCT_KIND.get(str(raw).lower(), "souvenir")


def _items_payload(order: Order) -> List[dict[str, Any]]:
    config = order.configuration or {}
    cart = config.get("cart") or config.get("items")
    if isinstance(cart, list) and cart:
        items = []
        for idx, raw in enumerate(cart, 1):
            cfg = raw.get("config") or raw
            items.append(
                {
                    "index": idx,
                    "item_id": str(raw.get("id") or f"{order.id}-{idx}"),
                    "name": raw.get("productName") or raw.get("product_name") or order.product_name or "Товар",
                    "quantity": int(raw.get("quantity") or 1),
                    "description": raw.get("design") or raw.get("description") or "",
                    "product_kind": _kind_for(cfg),
                    "config": cfg,
                    "file_url": raw.get("renderUrl") or raw.get("file_url"),
                }
            )
        return items

    pc = config.get("productConfig") or config
    return [
        {
            "index": 1,
            "item_id": str(order.id),
            "name": order.product_name or "Товар",
            "quantity": int(order.quantity or 1),
            "description": "",
            "product_kind": _kind_for(pc),
            "config": pc,
            "file_url": None,
        }
    ]


async def _build_request(order: Order, db: AsyncSession) -> dict[str, Any]:
    client_name = ""
    client_email = order.user_email or ""
    client_id = order.user_id or ""
    if order.user_id:
        user = await crud_user.get_user(db, order.user_id)
        if user:
            client_name = user.display_name or user.company_name or ""
            client_email = client_email or user.email

    cfg = order.configuration or {}
    return {
        "order_id": str(order.id),
        "order_number": str(order.id)[:8].upper(),
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "client": {
            "id": str(client_id) if client_id else "",
            "name": client_name,
            "email": client_email,
            "requisites": cfg.get("clientRequisites") or "",
        },
        "manager": {
            "id": cfg.get("managerId") or "",
            "name": cfg.get("managerName") or "",
        },
        "items": _items_payload(order),
        "storage_location": cfg.get("storageLocation") or "",
        "notes": cfg.get("notes") or cfg.get("comment") or "",
    }


async def generate_techcard(order: Order, db: AsyncSession) -> dict[str, Any]:
    settings = get_settings()
    payload = await _build_request(order, db)
    async with httpx.AsyncClient(timeout=settings.techcard_timeout_seconds) as client:
        resp = await client.post(f"{settings.techcard_url}/api/techcard", json=payload)
        resp.raise_for_status()
        return resp.json()


async def generate_approval(order: Order, db: AsyncSession) -> dict[str, Any]:
    """Approval (согласование) PDF — same service, different template."""
    settings = get_settings()
    payload = await _build_request(order, db)
    cfg = order.configuration or {}
    payload["doc_type"] = "approval"
    payload["render_url"] = cfg.get("server_render_url")
    payload["total_price"] = float(order.total_price) if order.total_price else None
    payload["currency"] = order.currency or "BYN"
    async with httpx.AsyncClient(timeout=settings.techcard_timeout_seconds) as client:
        resp = await client.post(f"{settings.techcard_url}/api/techcard", json=payload)
        resp.raise_for_status()
        return resp.json()


async def fetch_techcard_pdf(order_id: str, filename: str) -> bytes:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.techcard_timeout_seconds) as client:
        resp = await client.get(f"{settings.techcard_url}/api/techcard/file/{order_id}/{filename}")
        resp.raise_for_status()
        return resp.content
