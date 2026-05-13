"""Thin client over the Spruzhyk Unwrap microservice (PDF) and Block Builder."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.models.order import Order


log = logging.getLogger(__name__)


_KIND_BY_LOGO_KEY = {
    "thermosLogos": "thermos",
    "powerbankLogos": "powerbank",
    "logos": "notebook",
}


def _detect_kind(product_config: dict[str, Any]) -> str:
    raw = product_config.get("activeProduct") or product_config.get("type")
    if raw:
        kind = str(raw).lower()
        if kind in {"thermos", "powerbank", "notebook"}:
            return kind
    for key, kind in _KIND_BY_LOGO_KEY.items():
        if isinstance(product_config.get(key), list) and product_config.get(key):
            return kind
    return "notebook"


def _logo_target(kind: str, item: dict[str, Any]) -> str:
    if kind == "thermos":
        return str(item.get("target") or "body")
    if kind == "powerbank":
        return str(item.get("target") or item.get("side") or "outer")
    return str(item.get("target") or item.get("side") or "front")


def _logo_position(item: dict[str, Any]) -> list[float]:
    raw = item.get("position") or [0.0, 0.0]
    if not isinstance(raw, (list, tuple)) or len(raw) < 2:
        return [0.0, 0.0]
    try:
        return [float(raw[0]), float(raw[1])]
    except (TypeError, ValueError):
        return [0.0, 0.0]


def _logos_for(kind: str, product_config: dict[str, Any]) -> list[dict[str, Any]]:
    bucket_key = {
        "thermos": "thermosLogos",
        "powerbank": "powerbankLogos",
        "notebook": "logos",
    }[kind]
    raw = product_config.get(bucket_key) or []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        out.append({
            "id": str(item.get("id") or ""),
            "target": _logo_target(kind, item),
            "side": item.get("side"),
            "mode": item.get("mode") or "decal",
            "position": _logo_position(item),
            "rotation": float(item.get("rotation") or 0.0),
            "scale": float(item.get("scale") or 0.3),
            "filename": item.get("filename"),
            "decal_data_url": item.get("texture") if isinstance(item.get("texture"), str) and item["texture"].startswith("data:") else None,
        })
    return out


def _dimensions_for(kind: str, product_config: dict[str, Any]) -> dict[str, dict[str, float]]:
    if kind == "thermos":
        return {
            "thermos": {
                "body_diameter_mm": float(product_config.get("bodyDiameterMm") or 70.0),
                "body_height_mm": float(product_config.get("bodyHeightMm") or 190.0),
                "cap_diameter_mm": float(product_config.get("capDiameterMm") or 55.0),
                "cap_side_height_mm": float(product_config.get("capSideHeightMm") or 35.0),
            }
        }
    if kind == "powerbank":
        return {
            "powerbank": {
                "width_mm": float(product_config.get("widthMm") or 95.0),
                "height_mm": float(product_config.get("heightMm") or 65.0),
                "depth_mm": float(product_config.get("depthMm") or 22.0),
            }
        }
    return {
        "notebook": {
            "width_mm": float(product_config.get("widthMm") or 145.0),
            "height_mm": float(product_config.get("heightMm") or 210.0),
            "spine_thickness_mm": float(product_config.get("spineThicknessMm") or 12.0),
        }
    }


def build_unwrap_payload(order: Order) -> dict[str, Any]:
    cfg = order.configuration or {}
    pc = cfg.get("productConfig") or {}
    kind = _detect_kind(pc)
    payload: dict[str, Any] = {
        "order_id": str(order.id),
        "product_kind": kind,
        "logos": _logos_for(kind, pc),
    }
    payload.update(_dimensions_for(kind, pc))
    return payload


async def fetch_unwrap_pdf(order: Order) -> bytes:
    settings = get_settings()
    payload = build_unwrap_payload(order)
    async with httpx.AsyncClient(timeout=settings.unwrap_timeout_seconds) as client:
        resp = await client.post(f"{settings.unwrap_url}/api/unwrap.pdf", json=payload)
        resp.raise_for_status()
        return resp.content


async def fetch_unwrap_zip(order: Order) -> bytes:
    settings = get_settings()
    payload = build_unwrap_payload(order)
    async with httpx.AsyncClient(timeout=settings.unwrap_timeout_seconds) as client:
        resp = await client.post(f"{settings.unwrap_url}/api/unwrap.zip", json=payload)
        resp.raise_for_status()
        return resp.content


_PATTERN_TO_RULING = {
    "blank": "blank",
    "lined": "lined",
    "tlined": "lined",
    "grid": "grid",
    "dotted": "dotted",
    "planner": "planner",
}


def _build_block_payload(order: Order) -> dict[str, Any]:
    cfg = order.configuration or {}
    pc = cfg.get("productConfig") or {}
    pattern = str(pc.get("paperPattern") or pc.get("ruling") or pc.get("blockType") or "lined")
    template_ids_raw = pc.get("blockPages") or pc.get("template_ids") or []
    template_ids: list[int] = []
    if isinstance(template_ids_raw, list):
        for tid in template_ids_raw:
            try:
                template_ids.append(int(tid))
            except (TypeError, ValueError):
                continue
    contact = (cfg.get("contact") or {}) if isinstance(cfg.get("contact"), dict) else {}
    return {
        "order_id": str(order.id),
        "width_mm": float(pc.get("widthMm") or 145.0),
        "height_mm": float(pc.get("heightMm") or 210.0),
        "pages": int(pc.get("pages") or pc.get("pageCount") or 120),
        "ruling": _PATTERN_TO_RULING.get(pattern, "lined"),
        "line_spacing_mm": float(pc.get("lineSpacingMm") or 7.0),
        "page_numbers": bool(pc.get("pageNumbers", True)),
        "title": pc.get("blockTitle"),
        "template_ids": template_ids,
        "paper_type": pc.get("paperType"),
        "client_name": contact.get("name") or order.user_email,
        "product_name": order.product_name,
    }


async def fetch_block_pdf(order: Order) -> bytes | None:
    """Notebook-only: PDF of the inner block. Returns None if not a notebook."""
    cfg = order.configuration or {}
    pc = cfg.get("productConfig") or {}
    if _detect_kind(pc) != "notebook":
        return None
    settings = get_settings()
    payload = _build_block_payload(order)
    async with httpx.AsyncClient(timeout=settings.block_builder_timeout_seconds) as client:
        resp = await client.post(f"{settings.block_builder_url}/api/block.pdf", json=payload)
        resp.raise_for_status()
        return resp.content
