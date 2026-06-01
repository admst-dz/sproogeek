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
import io
import json
import logging
import os
import uuid
import zipfile
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Optional

import httpx
import sentry_sdk
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from PIL import Image, ImageColor, ImageDraw, ImageFont
from pydantic import BaseModel, EmailStr, Field
from slowapi import Limiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.client_ip import get_client_ip, slowapi_key
from app.core.config import get_settings
from app.core.deps import request_id
from app.core.email import is_email_configured, send_email
from app.core.event_logger import event_logger
from app.crud import order as crud_order
from app.database import get_db
from app.schemas.order import OrderCreate
from app.services.imposition import qr_png_bytes
from app.services.settings_store import read_settings
from app.services.unwrap_client import fetch_block_pdf, fetch_unwrap_zip


log = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=slowapi_key)


# Лимит на raw image bytes после base64 decode. Под LimitUploadSize
# (12 МБ) уже не пройдёт большее, но добавим явный sanity-check здесь.
_MAX_RENDER_BYTES = 12_000_000
_PRINT_ARCHIVE_TO = "info@sproogeek.com"
_RENDER_DIR = "uploads/renders"
GUEST_ARCHIVE_DIR = "uploads/guest_archives"
os.makedirs(_RENDER_DIR, exist_ok=True)
os.makedirs(GUEST_ARCHIVE_DIR, exist_ok=True)
_RENDER_MIME_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}
_STICKER_MAX_ASSET_BYTES = 10_000_000
_STICKER_DEFAULT_SHEET_WIDTH_MM = 100.0
_STICKER_DEFAULT_SHEET_HEIGHT_MM = 141.0
_STICKER_DEFAULT_SCENE_WIDTH_UNITS = 4.2
_STICKER_DEFAULT_SCENE_HEIGHT_UNITS = 5.92
_STICKER_DEFAULT_DPI = 300
_STICKER_SLOT_WIDTH_MM = 40.0
_STICKER_SLOT_HEIGHT_MM = 45.0
_STICKER_BACKGROUND_MAX_SIDE_UNITS = 3.2
_STICKER_LOGO_MAX_SIDE_UNITS = {"circle": 0.74, "square": 0.78}


class GuestApprovalRequest(BaseModel):
    email: EmailStr
    product_name: str = Field(..., min_length=1, max_length=120)
    # data URL от canvas.toDataURL(...): "data:image/jpeg;base64,/9j/…"
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
    # Только для 3D-стикеров: исходники и координаты для TIFF-файлов печати.
    sticker_print_payload: Optional[dict[str, Any]] = Field(default=None)


class ApprovalSettingsResponse(BaseModel):
    guest_approval_enabled: bool = True
    home_sections: dict[str, bool] = Field(default_factory=dict)
    dashboard_sections: dict[str, bool] = Field(default_factory=dict)


@router.get("/settings", response_model=ApprovalSettingsResponse)
async def get_approval_settings():
    return read_settings()


def _kind_from_active_product(active_product: str) -> str:
    raw = (active_product or "").lower()
    if raw in {"notebook", "thermos", "powerbank"}:
        return raw
    return "souvenir"


def _build_techcard_payload(
    payload: GuestApprovalRequest,
    *,
    guest_order_id: str,
    doc_type: str = "approval",
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
        "doc_type": doc_type,
        # render_url принимается шаблоном approval.html как-есть. WeasyPrint
        # поддерживает data: URI в <img src>, так что PNG едет inline без S3.
        "render_url": payload.render_data_url,
        "total_price": payload.total_price,
        "currency": payload.currency,
    }


async def _generate_techcard_pdf(
    payload: GuestApprovalRequest,
    guest_order_id: str,
    *,
    doc_type: str,
) -> bytes:
    settings = get_settings()
    request_body = _build_techcard_payload(payload, guest_order_id=guest_order_id, doc_type=doc_type)
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
            raise HTTPException(status_code=502, detail="cannot fetch techcard pdf")
        return file_resp.content


async def _generate_approval_pdf(payload: GuestApprovalRequest, guest_order_id: str) -> bytes:
    return await _generate_techcard_pdf(payload, guest_order_id, doc_type="approval")


def _decode_render_image(data_url: str) -> Optional[dict[str, Any]]:
    """data:image/*;base64,xxxx → attachment metadata."""
    if not data_url or "," not in data_url:
        return None
    header, _, b64_payload = data_url.partition(",")
    if "base64" not in header.lower():
        return None
    mime_type = header.split(";", 1)[0].removeprefix("data:").lower()
    extension = _RENDER_MIME_EXTENSIONS.get(mime_type)
    if not extension:
        return None
    try:
        raw = base64.b64decode(b64_payload, validate=False)
    except Exception:  # noqa: BLE001
        return None
    if len(raw) > _MAX_RENDER_BYTES:
        return None
    return {
        "content": raw,
        "mime_type": mime_type,
        "extension": extension,
    }


def _decode_data_url_bytes(data_url: Any, *, max_bytes: int = _STICKER_MAX_ASSET_BYTES) -> Optional[dict[str, Any]]:
    if not isinstance(data_url, str) or "," not in data_url:
        return None
    header, _, b64_payload = data_url.partition(",")
    if "base64" not in header.lower():
        return None
    mime_type = header.split(";", 1)[0].removeprefix("data:").lower()
    extension = _RENDER_MIME_EXTENSIONS.get(mime_type)
    if not extension:
        return None
    try:
        raw = base64.b64decode(b64_payload, validate=False)
    except Exception:  # noqa: BLE001
        return None
    if not raw or len(raw) > max_bytes:
        return None
    return {"content": raw, "mime_type": mime_type, "extension": extension}


def _open_rgba_image(data_url: Any) -> Optional[Image.Image]:
    decoded = _decode_data_url_bytes(data_url)
    if not decoded:
        return None
    try:
        with Image.open(io.BytesIO(decoded["content"])) as image:
            return image.convert("RGBA")
    except Exception as exc:  # noqa: BLE001
        sentry_sdk.capture_exception(exc)
        return None


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _list2(value: Any, default: tuple[float, float] = (0.0, 0.0)) -> tuple[float, float]:
    if isinstance(value, (list, tuple)) and len(value) >= 2:
        return _float(value[0], default[0]), _float(value[1], default[1])
    return default


def _sticker_payload(payload: GuestApprovalRequest) -> Optional[dict[str, Any]]:
    product_config = (payload.configuration or {}).get("productConfig") or payload.configuration or {}
    active = str(product_config.get("activeProduct") or product_config.get("type") or "").lower()
    if active != "sticker":
        return None
    data = payload.sticker_print_payload if isinstance(payload.sticker_print_payload, dict) else None
    if data:
        return data
    return product_config if isinstance(product_config, dict) else None


def _sticker_is_square(shape: Any) -> bool:
    return str(shape or "").lower() == "square"


def _sticker_sheet_meta(data: dict[str, Any]) -> dict[str, float | int | str]:
    width_mm = max(20.0, _float(data.get("sheet_width_mm"), _STICKER_DEFAULT_SHEET_WIDTH_MM))
    height_mm = max(20.0, _float(data.get("sheet_height_mm"), _STICKER_DEFAULT_SHEET_HEIGHT_MM))
    scene_width = max(0.1, _float(data.get("scene_width_units"), _STICKER_DEFAULT_SCENE_WIDTH_UNITS))
    scene_height = max(0.1, _float(data.get("scene_height_units"), _STICKER_DEFAULT_SCENE_HEIGHT_UNITS))
    dpi = min(600, max(72, _safe_int(data.get("export_dpi"), _STICKER_DEFAULT_DPI)))
    return {
        "width_mm": width_mm,
        "height_mm": height_mm,
        "scene_width": scene_width,
        "scene_height": scene_height,
        "dpi": dpi,
        "sheet_color": str(data.get("sheet_color") or "#F6F1E7"),
    }


def _mm_to_px(mm: float, dpi: int) -> int:
    return max(1, round(mm / 25.4 * dpi))


def _sticker_unit_to_mm(
    x_units: float,
    y_units: float,
    meta: dict[str, float | int | str],
) -> tuple[float, float]:
    width_mm = float(meta["width_mm"])
    height_mm = float(meta["height_mm"])
    scene_width = float(meta["scene_width"])
    scene_height = float(meta["scene_height"])
    return (
        width_mm / 2 + (x_units / scene_width) * width_mm,
        height_mm / 2 - (y_units / scene_height) * height_mm,
    )


def _paste_transformed(
    canvas: Image.Image,
    image: Image.Image,
    *,
    center_x_px: int,
    center_y_px: int,
    max_side_px: int,
    rotation_rad: float,
) -> tuple[int, int, int, int]:
    source = image.copy()
    source.thumbnail((max_side_px, max_side_px), Image.Resampling.LANCZOS)
    angle_degrees = -rotation_rad * 180 / 3.141592653589793
    if abs(angle_degrees) > 0.001:
        source = source.rotate(angle_degrees, expand=True, resample=Image.Resampling.BICUBIC)
    left = int(round(center_x_px - source.width / 2))
    top = int(round(center_y_px - source.height / 2))
    _alpha_composite_clipped(canvas, source, left, top)
    return left, top, left + source.width, top + source.height


def _alpha_composite_clipped(canvas: Image.Image, source: Image.Image, left: int, top: int) -> None:
    src_left = max(0, -left)
    src_top = max(0, -top)
    dst_left = max(0, left)
    dst_top = max(0, top)
    width = min(source.width - src_left, canvas.width - dst_left)
    height = min(source.height - src_top, canvas.height - dst_top)
    if width <= 0 or height <= 0:
        return
    cropped = source.crop((src_left, src_top, src_left + width, src_top + height))
    canvas.alpha_composite(cropped, (dst_left, dst_top))


def _clip_to_sticker_shape(layer: Image.Image, shape: str, width_px: int, height_px: int) -> Image.Image:
    mask = Image.new("L", layer.size, 0)
    draw = ImageDraw.Draw(mask)
    if _sticker_is_square(shape):
        draw.rounded_rectangle([0, 0, width_px - 1, height_px - 1], radius=max(4, width_px // 16), fill=255)
    else:
        side = min(width_px, height_px)
        left = (width_px - side) // 2
        top = (height_px - side) // 2
        draw.ellipse([left, top, left + side - 1, top + side - 1], fill=255)
    out = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    out.alpha_composite(layer)
    alpha = out.getchannel("A")
    out.putalpha(Image.composite(alpha, Image.new("L", layer.size, 0), mask))
    return out


def _draw_sticker_guides(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    *,
    slot_meta: list[dict[str, Any]],
    dpi: int,
) -> None:
    font = ImageFont.load_default()
    line = max(1, _mm_to_px(0.25, dpi))
    for slot in slot_meta:
        cx = int(slot["center_x_px"])
        cy = int(slot["center_y_px"])
        half_w = int(slot["width_px"] / 2)
        half_h = int(slot["height_px"] / 2)
        box = [cx - half_w, cy - half_h, cx + half_w, cy + half_h]
        color = (225, 0, 140, 255)
        if _sticker_is_square(slot["shape"]):
            draw.rounded_rectangle(box, radius=max(4, half_w // 8), outline=color, width=line)
        else:
            side = min(slot["width_px"], slot["height_px"])
            circle = [cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2]
            draw.ellipse(circle, outline=color, width=line)
        draw.line([cx - _mm_to_px(2, dpi), cy, cx + _mm_to_px(2, dpi), cy], fill=color, width=line)
        draw.line([cx, cy - _mm_to_px(2, dpi), cx, cy + _mm_to_px(2, dpi)], fill=color, width=line)
        text = (
            f"#{slot['index'] + 1} "
            f"X={slot['center_x_mm']:.2f}mm "
            f"Y={slot['center_y_mm']:.2f}mm"
        )
        draw.text((box[0], max(0, box[1] - _mm_to_px(4, dpi))), text, fill=(0, 0, 0, 255), font=font)


def _sticker_slot_list(data: dict[str, Any], meta: dict[str, float | int | str]) -> list[dict[str, Any]]:
    raw_slots = data.get("slots") if isinstance(data.get("slots"), list) else []
    fallback = [
        {"x_units": -1.08, "y_units": 2.05},
        {"x_units": 1.08, "y_units": 1.52},
        {"x_units": -1.08, "y_units": 0.28},
        {"x_units": 1.08, "y_units": -0.34},
        {"x_units": -1.08, "y_units": -1.58},
        {"x_units": 1.08, "y_units": -2.05},
    ]
    slots = raw_slots or fallback
    return [slot for slot in slots[:6] if isinstance(slot, dict)]


def _build_sticker_print_files(payload: GuestApprovalRequest, guest_order_id: str) -> Optional[dict[str, Any]]:
    data = _sticker_payload(payload)
    if not data:
        return None

    meta = _sticker_sheet_meta(data)
    dpi = int(meta["dpi"])
    sheet_width_px = _mm_to_px(float(meta["width_mm"]), dpi)
    sheet_height_px = _mm_to_px(float(meta["height_mm"]), dpi)
    try:
        sheet_rgb = ImageColor.getrgb(str(meta["sheet_color"]))
    except ValueError:
        sheet_rgb = ImageColor.getrgb("#F6F1E7")
    base = Image.new("RGBA", (sheet_width_px, sheet_height_px), (*sheet_rgb[:3], 255))
    px_per_scene_x = sheet_width_px / float(meta["scene_width"])
    px_per_scene_y = sheet_height_px / float(meta["scene_height"])
    px_per_mm = dpi / 25.4

    background_items = data.get("background_images") if isinstance(data.get("background_images"), list) else []
    for item in background_items[:12]:
        if not isinstance(item, dict):
            continue
        image = _open_rgba_image(item.get("texture"))
        if image is None:
            continue
        pos_x, pos_y = _list2(item.get("position"))
        center_x_mm, center_y_mm = _sticker_unit_to_mm(pos_x, pos_y, meta)
        max_side_units = _STICKER_BACKGROUND_MAX_SIDE_UNITS * max(0.1, _float(item.get("scale"), 1.0))
        max_side_px = max(1, round(max_side_units * min(px_per_scene_x, px_per_scene_y)))
        _paste_transformed(
            base,
            image,
            center_x_px=round(center_x_mm * px_per_mm),
            center_y_px=round(center_y_mm * px_per_mm),
            max_side_px=max_side_px,
            rotation_rad=_float(item.get("rotation"), 0.0),
        )

    slot_shapes: dict[int, str] = {}
    sticker_items = data.get("sticker_images") if isinstance(data.get("sticker_images"), list) else []
    for item in sticker_items[:6]:
        if isinstance(item, dict):
            slot = _safe_int(item.get("slot"), _safe_int(item.get("index"), 0))
            if 0 <= slot < 6:
                slot_shapes[slot] = "square" if _sticker_is_square(item.get("shape")) else "circle"

    slot_meta: list[dict[str, Any]] = []
    for index, slot in enumerate(_sticker_slot_list(data, meta)):
        center_x_mm = _float(slot.get("center_x_mm"), None) if slot.get("center_x_mm") is not None else None
        center_y_mm = _float(slot.get("center_y_mm"), None) if slot.get("center_y_mm") is not None else None
        if center_x_mm is None or center_y_mm is None:
            center_x_mm, center_y_mm = _sticker_unit_to_mm(
                _float(slot.get("x_units"), 0.0),
                _float(slot.get("y_units"), 0.0),
                meta,
            )
        shape = slot_shapes.get(index, "square" if index in {1, 3, 4} else "circle")
        slot_meta.append({
            "index": index,
            "shape": shape,
            "center_x_mm": center_x_mm,
            "center_y_mm": center_y_mm,
            "center_x_px": round(center_x_mm * px_per_mm),
            "center_y_px": round(center_y_mm * px_per_mm),
            "width_mm": _STICKER_SLOT_WIDTH_MM,
            "height_mm": _STICKER_SLOT_HEIGHT_MM,
            "width_px": _mm_to_px(_STICKER_SLOT_WIDTH_MM, dpi),
            "height_px": _mm_to_px(_STICKER_SLOT_HEIGHT_MM, dpi),
        })

    sticker_by_slot: dict[int, dict[str, Any]] = {}
    for index, item in enumerate(sticker_items[:6]):
        if not isinstance(item, dict):
            continue
        slot = _safe_int(item.get("slot"), index)
        if 0 <= slot < 6 and slot not in sticker_by_slot:
            sticker_by_slot[slot] = item

    for slot in slot_meta:
        item = sticker_by_slot.get(int(slot["index"]))
        if not item:
            continue
        image = _open_rgba_image(item.get("texture"))
        if image is None:
            continue
        shape = "square" if _sticker_is_square(item.get("shape")) else "circle"
        pos_x, pos_y = _list2(item.get("position"))
        local_x_px = round(pos_x * px_per_scene_x)
        local_y_px = round(-pos_y * px_per_scene_y)
        max_side_units = _STICKER_LOGO_MAX_SIDE_UNITS.get(shape, 0.74) * max(0.1, _float(item.get("scale"), 0.72))
        max_side_px = max(1, round(max_side_units * min(px_per_scene_x, px_per_scene_y)))
        layer = Image.new("RGBA", (int(slot["width_px"]), int(slot["height_px"])), (0, 0, 0, 0))
        _paste_transformed(
            layer,
            image,
            center_x_px=int(slot["width_px"] / 2 + local_x_px),
            center_y_px=int(slot["height_px"] / 2 + local_y_px),
            max_side_px=max_side_px,
            rotation_rad=_float(item.get("rotation"), 0.0),
        )
        layer = _clip_to_sticker_shape(layer, shape, int(slot["width_px"]), int(slot["height_px"]))
        left = int(round(slot["center_x_px"] - slot["width_px"] / 2))
        top = int(round(slot["center_y_px"] - slot["height_px"] / 2))
        _alpha_composite_clipped(base, layer, left, top)
        slot["artwork"] = {
            "filename": item.get("filename") or "",
            "local_x_units": pos_x,
            "local_y_units": pos_y,
            "rotation_rad": _float(item.get("rotation"), 0.0),
            "scale": _float(item.get("scale"), 0.72),
        }

    technical = base.copy()
    draw = ImageDraw.Draw(technical)
    grid_step_px = _mm_to_px(10, dpi)
    for x in range(0, sheet_width_px, grid_step_px):
        draw.line([x, 0, x, sheet_height_px], fill=(0, 0, 0, 34), width=1)
    for y in range(0, sheet_height_px, grid_step_px):
        draw.line([0, y, sheet_width_px, y], fill=(0, 0, 0, 34), width=1)
    draw.rectangle([0, 0, sheet_width_px - 1, sheet_height_px - 1], outline=(0, 0, 0, 255), width=max(1, _mm_to_px(0.2, dpi)))
    _draw_sticker_guides(technical, draw, slot_meta=slot_meta, dpi=dpi)

    def to_tiff_bytes(image: Image.Image) -> bytes:
        out = io.BytesIO()
        image.convert("CMYK").save(out, format="TIFF", compression="tiff_lzw", dpi=(dpi, dpi))
        return out.getvalue()

    spec = {
        "guest_order_id": guest_order_id,
        "product": "sticker",
        "sheet": {
            "width_mm": float(meta["width_mm"]),
            "height_mm": float(meta["height_mm"]),
            "dpi": dpi,
            "pixel_size": [sheet_width_px, sheet_height_px],
            "color": meta["sheet_color"],
        },
        "coordinate_system": {
            "origin": "top-left",
            "units": "millimeters",
            "x_axis": "left-to-right",
            "y_axis": "top-to-bottom",
        },
        "slots": slot_meta,
        "background_count": len(background_items),
    }
    return {
        "plain_tiff": to_tiff_bytes(base),
        "technical_tiff": to_tiff_bytes(technical),
        "spec_json": json.dumps(spec, ensure_ascii=False, indent=2, default=str).encode("utf-8"),
    }


def _short_id() -> str:
    return f"guest-{uuid.uuid4().hex[:12]}"


def _guest_configuration(payload: GuestApprovalRequest) -> dict[str, Any]:
    """Конфиг в форме, которую понимает админка (productConfig + contact)."""
    configuration = dict(payload.configuration or {})
    if isinstance(configuration.get("productConfig"), dict):
        product_config = dict(configuration["productConfig"])
    else:
        product_config = dict(configuration)
    configuration["productConfig"] = product_config

    contact = configuration.get("contact") if isinstance(configuration.get("contact"), dict) else {}
    configuration["contact"] = {
        **contact,
        "name": payload.name or contact.get("name") or "",
        "phone": payload.phone or contact.get("phone") or "",
        "email": str(payload.email),
        "comment": payload.comment or contact.get("comment") or "",
    }
    configuration["comment"] = payload.comment or configuration.get("comment") or ""
    configuration["notes"] = payload.comment or configuration.get("notes") or ""
    return configuration


def _guest_order_like(payload: GuestApprovalRequest, guest_order_id: str) -> SimpleNamespace:
    configuration = _guest_configuration(payload)

    return SimpleNamespace(
        id=guest_order_id,
        user_id=None,
        user_email=str(payload.email),
        product_name=payload.product_name,
        status="guest",
        configuration=configuration,
        quantity=int(payload.quantity or 1),
        total_price=payload.total_price,
        currency=payload.currency,
        created_at=datetime.now(timezone.utc),
    )


def _guest_payload_json(payload: GuestApprovalRequest, guest_order_id: str) -> str:
    return json.dumps(
        {
            "guest_order_id": guest_order_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "email": str(payload.email),
            "name": payload.name,
            "phone": payload.phone,
            "comment": payload.comment,
            "product_name": payload.product_name,
            "quantity": payload.quantity,
            "total_price": payload.total_price,
            "currency": payload.currency,
            "configuration": payload.configuration,
        },
        ensure_ascii=False,
        indent=2,
        default=str,
    )


async def _build_guest_print_archive(
    payload: GuestApprovalRequest,
    guest_order_id: str,
    *,
    approval_pdf: bytes,
    render_image: dict[str, Any] | None,
) -> bytes:
    """Собирает гостевой архив по той же идее, что production-package.zip."""
    order_like = _guest_order_like(payload, guest_order_id)
    out = io.BytesIO()

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        try:
            techcard_pdf = await _generate_techcard_pdf(payload, guest_order_id, doc_type="techcard")
            zf.writestr(f"techcard/techcard-{guest_order_id}.pdf", techcard_pdf)
        except Exception as exc:  # noqa: BLE001
            sentry_sdk.capture_exception(exc)
            zf.writestr("techcard/ERROR.txt", f"techcard generation failed: {exc}\n")

        zf.writestr(f"approval/soglasovanie-{guest_order_id[-8:]}.pdf", approval_pdf)

        if render_image:
            zf.writestr(
                f"render/design-{guest_order_id[-8:]}.{render_image['extension']}",
                render_image["content"],
            )

        try:
            sticker_print_files = _build_sticker_print_files(payload, guest_order_id)
            if sticker_print_files:
                suffix = guest_order_id[-8:]
                zf.writestr(f"print/sticker-print-{suffix}.tiff", sticker_print_files["plain_tiff"])
                zf.writestr(
                    f"print/sticker-print-with-coordinates-{suffix}.tiff",
                    sticker_print_files["technical_tiff"],
                )
                zf.writestr(f"print/sticker-print-spec-{suffix}.json", sticker_print_files["spec_json"])
        except Exception as exc:  # noqa: BLE001
            sentry_sdk.capture_exception(exc)
            zf.writestr("print/ERROR.txt", f"sticker TIFF generation failed: {exc}\n")

        try:
            unwrap_bytes = await fetch_unwrap_zip(order_like)
            with zipfile.ZipFile(io.BytesIO(unwrap_bytes)) as inner:
                for info in inner.infolist():
                    if info.is_dir():
                        continue
                    zf.writestr(f"unwrap/{info.filename}", inner.read(info.filename))
        except Exception as exc:  # noqa: BLE001
            sentry_sdk.capture_exception(exc)
            zf.writestr("unwrap/ERROR.txt", f"unwrap render failed: {exc}\n")

        try:
            block_pdf = await fetch_block_pdf(order_like)
            if block_pdf is not None:
                zf.writestr(f"block/block-{guest_order_id}.pdf", block_pdf)
        except Exception as exc:  # noqa: BLE001
            sentry_sdk.capture_exception(exc)
            zf.writestr("block/ERROR.txt", f"block render failed: {exc}\n")

        try:
            qr = qr_png_bytes(f"spruzhyk://guest-order/{guest_order_id}")
            zf.writestr(f"qr/order-{guest_order_id}.png", qr)
        except Exception as exc:  # noqa: BLE001
            sentry_sdk.capture_exception(exc)

        zf.writestr("order/request.json", _guest_payload_json(payload, guest_order_id))

    return out.getvalue()


async def _deliver_guest_print_archive(
    payload: GuestApprovalRequest,
    *,
    guest_order_id: str,
    approval_pdf: bytes,
    render_image: dict[str, Any] | None,
    ip: str,
    req_id: str,
    order_id: str | None = None,
) -> None:
    try:
        archive_bytes = await _build_guest_print_archive(
            payload,
            guest_order_id,
            approval_pdf=approval_pdf,
            render_image=render_image,
        )
        if order_id:
            try:
                with open(os.path.join(GUEST_ARCHIVE_DIR, f"{order_id}.zip"), "wb") as archive_file:
                    archive_file.write(archive_bytes)
            except OSError as exc:
                sentry_sdk.capture_exception(exc)
        subject = f"[Spruzhyk] Гостевой архив для печати — {payload.product_name} — {guest_order_id}"
        body = "\n".join([
            "Гостевой пользователь запросил макет на email без авторизации.",
            "",
            f"ID: {guest_order_id}",
            f"Email клиента: {payload.email}",
            f"Имя: {payload.name or '—'}",
            f"Телефон: {payload.phone or '—'}",
            f"Изделие: {payload.product_name}",
            f"Тираж: {payload.quantity}",
            f"IP: {ip or '—'}",
            "",
            "Во вложении архив с информацией для печати.",
        ])
        loop = asyncio.get_running_loop()
        sent = await loop.run_in_executor(
            None,
            lambda: send_email(
                to=_PRINT_ARCHIVE_TO,
                subject=subject,
                body=body,
                reply_to=str(payload.email),
                attachments=[{
                    "filename": f"production-package-{guest_order_id}.zip",
                    "content": archive_bytes,
                    "mime_type": "application/zip",
                }],
            ),
        )
        event_logger.log(
            "GUEST_PRINT_ARCHIVE_EMAIL_SENT" if sent else "GUEST_PRINT_ARCHIVE_EMAIL_FAILED",
            "Guest print archive email processed",
            direction="backend->email",
            actor_type="anonymous",
            actor_email=str(payload.email),
            status_code=202 if sent else 500,
            request_id=req_id,
            entity_type="guest_order",
            entity_id=guest_order_id,
            details={"to": _PRINT_ARCHIVE_TO, "archive_bytes": len(archive_bytes), "sent": sent},
        )
    except Exception as exc:  # noqa: BLE001
        log.exception("guest print archive delivery failed")
        sentry_sdk.capture_exception(exc)
        event_logger.log(
            "GUEST_PRINT_ARCHIVE_EMAIL_FAILED",
            "Guest print archive email failed",
            direction="backend->email",
            actor_type="anonymous",
            actor_email=str(payload.email),
            status_code=500,
            request_id=req_id,
            entity_type="guest_order",
            entity_id=guest_order_id,
            details={"to": _PRINT_ARCHIVE_TO, "error_type": type(exc).__name__},
        )


@router.post("/guest", status_code=202)
@limiter.limit("5/minute")
async def request_guest_approval(
    request: Request,
    payload: GuestApprovalRequest,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Сгенерировать PDF-согласование и отправить на указанный email.

    Возвращает 202 — фактическая отправка идёт в фоне, чтобы не держать
    клиента на медленном SMTP. PDF-генерация — синхронно (нужно поймать
    ошибки techcard и сообщить пользователю).
    """
    if not read_settings().get("guest_approval_enabled", True):
        raise HTTPException(status_code=403, detail="guest approval is disabled")
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

    render_image = _decode_render_image(payload.render_data_url)
    ip = get_client_ip(request)

    # Сохраняем гостевую заявку как заказ (is_guest=True), чтобы она была видна
    # в админке (вкладка Orders), а не только в почте. Падение персиста не должно
    # ломать основной сценарий — письмо клиенту важнее записи в БД.
    order_id: str | None = None
    try:
        configuration = _guest_configuration(payload)
        configuration["_guest"] = {"ip": ip, "is_guest_lead": True}
        order = await crud_order.create_order(
            db,
            OrderCreate(
                user_id=None,
                user_email=str(payload.email),
                product_name=payload.product_name,
                configuration=configuration,
                quantity=int(payload.quantity or 1),
                total_price=payload.total_price,
                currency=(payload.currency or "BYN")[:3].upper(),
                is_guest=True,
            ),
        )
        order_id = str(order.id)

        render_url = None
        if render_image:
            render_name = f"guest-{order_id}.{render_image['extension']}"
            try:
                with open(os.path.join(_RENDER_DIR, render_name), "wb") as render_file:
                    render_file.write(render_image["content"])
                render_url = f"/uploads/renders/{render_name}"
            except OSError as exc:
                sentry_sdk.capture_exception(exc)

        order.configuration = {
            **configuration,
            "_guest": {**configuration["_guest"], "render_url": render_url, "archive_available": True},
        }
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        log.exception("guest order persistence failed")
        sentry_sdk.capture_exception(exc)

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
    if render_image:
        attachments.append({
            "filename": f"design-{guest_order_id[-8:]}.{render_image['extension']}",
            "content": render_image["content"],
            "mime_type": render_image["mime_type"],
        })

    sticker_print_files = None
    try:
        sticker_print_files = _build_sticker_print_files(payload, guest_order_id)
    except Exception as exc:  # noqa: BLE001
        log.exception("sticker print TIFF generation failed")
        sentry_sdk.capture_exception(exc)

    if sticker_print_files:
        suffix = guest_order_id[-8:]
        attachments.extend([
            {
                "filename": f"sticker-print-{suffix}.tiff",
                "content": sticker_print_files["plain_tiff"],
                "mime_type": "image/tiff",
            },
            {
                "filename": f"sticker-print-with-coordinates-{suffix}.tiff",
                "content": sticker_print_files["technical_tiff"],
                "mime_type": "image/tiff",
            },
            {
                "filename": f"sticker-print-spec-{suffix}.json",
                "content": sticker_print_files["spec_json"],
                "mime_type": "application/json",
            },
        ])
        body_lines.insert(4, "Для 3D-стикеров также прикреплены TIFF-файлы для печати.")
        body_lines.insert(5, "")

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
            "render_bytes": len(render_image["content"]) if render_image else 0,
            "render_mime_type": render_image["mime_type"] if render_image else None,
            "sticker_print_files": bool(sticker_print_files),
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
    background.add_task(
        _deliver_guest_print_archive,
        payload,
        guest_order_id=guest_order_id,
        approval_pdf=pdf_bytes,
        render_image=render_image,
        ip=ip,
        req_id=request_id(request),
        order_id=order_id,
    )
    return {
        "status": "accepted",
        "guest_order_id": guest_order_id,
        "order_id": order_id,
        "pdf_bytes": len(pdf_bytes),
    }
