"""Гостевой запрос согласования по email.

Сценарий: пользователь спроектировал товар (notebook / thermos / powerbank),
ввёл email и нажал «получить согласование». Бэкенд:

 1) принимает PNG-превью (data URL из WebGL-канваса) + конфигурацию изделия
    без необходимости логина;
 2) поднимает PDF-документ согласования в сервисе techcard (там уже есть
    шаблон approval.html, который умеет вставлять <img src=render_url>);
 3) отправляет полученный PDF на указанный email как вложение.

Эндпоинт публичный, поэтому защищён rate-limit'ом, валидацией email и
ограничением размера тела (родительский SecurityHeaders/LimitUploadSize в
main.py + локальный лимит на render-data-url ниже).
"""
from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter

from app.core.client_ip import get_client_ip, slowapi_key
from app.core.config import get_settings
from app.core.deps import request_id
from app.core.email import is_email_configured, send_email
from app.core.event_logger import event_logger


log = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=slowapi_key)


# Лимит на data URL (≈12 МБ base64 = ~9 МБ PNG). Под LimitUploadSize
# (12 МБ) уже не пройдёт большее, но добавим явный sanity-check здесь.
_MAX_RENDER_BYTES = 12_000_000


class GuestApprovalRequest(BaseModel):
    email: EmailStr
    product_name: str = Field(..., min_length=1, max_length=120)
    # data URL от canvas.toDataURL('image/png'): "data:image/png;base64,iVBOR…"
    render_data_url: str = Field(..., min_length=32)
    # Полный конфиг (как в корзине): activeProduct, цвета, переплёт, лого и т.п.
    configuration: dict[str, Any] = Field(default_factory=dict)
    quantity: int = Field(1, ge=1, le=10_000)
    total_price: Optional[float] = Field(default=None, ge=0)
    currency: str = Field("BYN", min_length=3, max_length=8)
    # Опциональные дополнения, чтобы манагер знал, кому отвечать.
    name: Optional[str] = Field(default=None, max_length=120)
    phone: Optional[str] = Field(default=None, max_length=40)
    comment: Optional[str] = Field(default=None, max_length=4000)


def _kind_from_active_product(active_product: str) -> str:
    raw = (active_product or "").lower()
    if raw in {"notebook", "thermos", "powerbank"}:
        return raw
    return "souvenir"


def _build_techcard_payload(
    payload: GuestApprovalRequest,
    *,
    guest_order_id: str,
) -> dict[str, Any]:
    """Собираем запрос для microservices/techcard в формате TechCardRequest."""
    cfg = payload.configuration or {}
    product_config = cfg.get("productConfig") or cfg
    return {
        "order_id": guest_order_id,
        "order_number": guest_order_id[-8:].upper(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "client": {
            "id": "",
            "name": payload.name or "",
            "email": str(payload.email),
            "phone": payload.phone or "",
            "address": "",
            "requisites": "",
        },
        "manager": {"id": "", "name": ""},
        "items": [
            {
                "index": 1,
                "item_id": guest_order_id,
                "name": payload.product_name,
                "quantity": int(payload.quantity or 1),
                "description": payload.comment or "",
                "product_kind": _kind_from_active_product(product_config.get("activeProduct") or product_config.get("type") or ""),
                "config": product_config,
                "file_url": None,
            }
        ],
        "storage_location": "",
        "notes": payload.comment or "",
        "delivery": {"address": "", "phone": payload.phone or ""},
        "quote": {
            "price": payload.total_price,
            "currency": payload.currency,
            "production_days": None,
        },
        "doc_type": "approval",
        # render_url принимается шаблоном approval.html как-есть. WeasyPrint
        # поддерживает data: URI в <img src>, так что PNG едет inline без S3.
        "render_url": payload.render_data_url,
        "total_price": payload.total_price,
        "currency": payload.currency,
    }


async def _generate_approval_pdf(payload: GuestApprovalRequest, guest_order_id: str) -> bytes:
    settings = get_settings()
    request_body = _build_techcard_payload(payload, guest_order_id=guest_order_id)
    async with httpx.AsyncClient(timeout=settings.techcard_timeout_seconds) as client:
        resp = await client.post(f"{settings.techcard_url}/api/techcard", json=request_body)
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"techcard render failed: {resp.status_code} {resp.text[:200]}",
            )
        result = resp.json()
        s3_key = result.get("s3_key")
        if not s3_key:
            raise HTTPException(status_code=502, detail="techcard did not return s3_key")
        # Забираем сам PDF — для отправки в email нужны байты.
        order_part, _, filename = s3_key.partition("/")
        if not filename:
            raise HTTPException(status_code=502, detail="invalid s3_key format")
        file_resp = await client.get(
            f"{settings.techcard_url}/api/techcard/file/{order_part}/{filename}"
        )
        if file_resp.status_code >= 400:
            raise HTTPException(status_code=502, detail="cannot fetch approval pdf")
        return file_resp.content


def _decode_render_png(data_url: str) -> Optional[bytes]:
    """data:image/png;base64,xxxx → bytes. Используется как вторичное
    вложение к письму (PNG отдельным файлом для удобства просмотра)."""
    if not data_url or "," not in data_url:
        return None
    header, _, b64_payload = data_url.partition(",")
    if "base64" not in header.lower():
        return None
    try:
        raw = base64.b64decode(b64_payload, validate=False)
    except Exception:  # noqa: BLE001
        return None
    if len(raw) > _MAX_RENDER_BYTES:
        return None
    return raw


def _short_id() -> str:
    return f"guest-{uuid.uuid4().hex[:12]}"


@router.post("/guest", status_code=202)
@limiter.limit("5/minute")
async def request_guest_approval(
    request: Request,
    payload: GuestApprovalRequest,
    background: BackgroundTasks,
):
    """Сгенерировать PDF-согласование и отправить на указанный email.

    Возвращает 202 — фактическая отправка идёт в фоне, чтобы не держать
    клиента на медленном SMTP. PDF-генерация — синхронно (нужно поймать
    ошибки techcard и сообщить пользователю).
    """
    if len(payload.render_data_url) > _MAX_RENDER_BYTES * 4 // 3:
        raise HTTPException(status_code=413, detail="render image too large")

    settings = get_settings()
    if not is_email_configured():
        raise HTTPException(status_code=503, detail="email service is not configured")

    guest_order_id = _short_id()
    try:
        pdf_bytes = await _generate_approval_pdf(payload, guest_order_id)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("guest approval generation failed")
        raise HTTPException(status_code=502, detail=f"approval render failed: {exc}") from exc

    png_bytes = _decode_render_png(payload.render_data_url)

    subject = f"[Spruzhyk] Согласование макета — {payload.product_name}"
    body_lines = [
        f"Здравствуйте{f', {payload.name}' if payload.name else ''}!",
        "",
        "Во вложении — PDF-согласование вашего макета.",
        f"Внутри документа: визуализация изделия, параметры конфигурации, тираж ({payload.quantity} шт).",
        "",
        "Если все устраивает — ответьте на это письмо или оформите заказ на сайте.",
        "Если нужно скорректировать дизайн — также напишите в ответ, мы поможем.",
        "",
        "— Sproogeek 3D",
    ]
    if payload.comment:
        body_lines.insert(2, f"Ваш комментарий: {payload.comment}")
        body_lines.insert(3, "")

    attachments: list[dict] = [
        {
            "filename": f"soglasovanie-{guest_order_id[-8:]}.pdf",
            "content": pdf_bytes,
            "mime_type": "application/pdf",
        }
    ]
    if png_bytes:
        attachments.append({
            "filename": f"design-{guest_order_id[-8:]}.png",
            "content": png_bytes,
            "mime_type": "image/png",
        })

    ip = get_client_ip(request)
    event_logger.log(
        "GUEST_APPROVAL_REQUESTED",
        "Guest requested design approval PDF by email",
        direction="user->backend",
        actor_type="anonymous",
        actor_email=str(payload.email),
        method=request.method,
        path=request.url.path,
        status_code=202,
        request_id=request_id(request),
        details={
            "guest_order_id": guest_order_id,
            "product_name": payload.product_name,
            "quantity": payload.quantity,
            "pdf_bytes": len(pdf_bytes),
            "png_bytes": len(png_bytes) if png_bytes else 0,
            "ip": ip,
            "name": payload.name,
            "phone": payload.phone,
        },
    )

    async def _deliver() -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            lambda: send_email(
                to=str(payload.email),
                subject=subject,
                body="\n".join(body_lines),
                reply_to=settings.feedback_to or None,
                attachments=attachments,
            ),
        )

    background.add_task(_deliver)
    return {
        "status": "accepted",
        "guest_order_id": guest_order_id,
        "pdf_bytes": len(pdf_bytes),
    }
