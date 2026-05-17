"""Async-клиент Go HTTP-обёртки над C++ glb_unwrapper.

Бизнес-логика тут минимальная: маппим product/binding в имя GLB-модели
(она зашита в образ Go-сервиса) и оборачиваем сетевые ошибки. Тяжёлая
работа — парсинг GLB, экспорт SVG/print-kit — выполняется в C++.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.core.config import get_settings


log = logging.getLogger(__name__)


class GlbUnwrapperError(RuntimeError):
    """Любая ошибка при общении с glb_unwrapper-сервисом."""


# Mapping (activeProduct, bindingType) → имя модели внутри образа сервиса
# (см. microservices/glb-unwrapper/Dockerfile, секция COPY frontend/...).
# Если binding неизвестен — fallback на hard для ежедневника.
_MODEL_BY_PRODUCT: dict[tuple[str, Optional[str]], str] = {
    ("thermos", None): "termos",
    ("powerbank", None): "powerbank",
    ("notebook", "hard"): "notebook_hard",
    ("notebook", "soft"): "notebook_soft",
    ("notebook", "spiral"): "notebook_spiral",
}


def resolve_model_name(active_product: str, binding_type: Optional[str] = None) -> Optional[str]:
    if not active_product:
        return None
    key = (active_product, binding_type)
    if key in _MODEL_BY_PRODUCT:
        return _MODEL_BY_PRODUCT[key]
    if active_product == "notebook":
        return _MODEL_BY_PRODUCT.get((active_product, "hard"))
    return _MODEL_BY_PRODUCT.get((active_product, None))


def _base_url() -> str:
    return get_settings().glb_unwrapper_url.rstrip("/")


def _timeout() -> float:
    return float(get_settings().glb_unwrapper_timeout_seconds)


async def health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{_base_url()}/healthz")
            return resp.status_code == 200
    except httpx.HTTPError:
        return False


async def inspect_model(model_name: str) -> str:
    """`inspect` по предзагруженной модели → человекочитаемый текст."""
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        resp = await client.post(f"{_base_url()}/by-model/{model_name}/inspect")
        _raise_for_status(resp, "inspect")
        return resp.text


async def export_uv_svg(model_name: str, **flags: Any) -> str:
    """`export-uv-svg` по предзагруженной модели → SVG-строка."""
    params = {k: str(v) for k, v in flags.items() if v is not None}
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        resp = await client.post(
            f"{_base_url()}/by-model/{model_name}/export-uv-svg",
            params=params,
        )
        _raise_for_status(resp, "export-uv-svg")
        return resp.text


async def export_print_kit(model_name: str, dimensions_mm: dict[str, float] | None = None) -> bytes:
    """`export-print-kit` по предзагруженной модели → zip-архив (bytes).

    dimensions_mm — словарь с ключами вроде body_diameter_mm, bleed_mm и т.п.
    Не переданные параметры заполняются дефолтами на стороне C++.
    """
    payload = {k: float(v) for k, v in (dimensions_mm or {}).items() if v is not None}
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        resp = await client.post(
            f"{_base_url()}/by-model/{model_name}/export-print-kit",
            json=payload or None,
        )
        _raise_for_status(resp, "export-print-kit")
        return resp.content


async def export_print_kit_with_glb(glb_bytes: bytes, dimensions_mm: dict[str, float] | None = None) -> bytes:
    """Универсальный вариант: грузим произвольный GLB файл напрямую.

    Полезно для тестов и кастомных моделей, которых нет внутри образа.
    """
    payload = {k: float(v) for k, v in (dimensions_mm or {}).items() if v is not None}
    files = {"glb": ("model.glb", glb_bytes, "model/gltf-binary")}
    data = {"params": __import__("json").dumps(payload)} if payload else {}
    async with httpx.AsyncClient(timeout=_timeout()) as client:
        resp = await client.post(
            f"{_base_url()}/export-print-kit",
            files=files,
            data=data,
        )
        _raise_for_status(resp, "export-print-kit")
        return resp.content


def _raise_for_status(resp: httpx.Response, op: str) -> None:
    if resp.status_code >= 400:
        snippet = resp.text[:300] if resp.text else ""
        log.warning("glb_unwrapper %s -> %s: %s", op, resp.status_code, snippet)
        raise GlbUnwrapperError(f"{op} failed ({resp.status_code}): {snippet}")
