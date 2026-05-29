import io
import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any
from uuid import UUID

import aiofiles
import sentry_sdk
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageCms
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

from app.core.config import get_settings
from app.core.deps import get_current_user, request_id
from app.core.email import send_email
from app.core.event_logger import event_logger
from app.crud import print_canvas as crud_print_canvas
from app.database import get_db
from app.schemas.print_canvas import PrintCanvasExportResponse


router = APIRouter()
settings = get_settings()

EXPORT_DIR = "uploads/print_canvas_exports"
os.makedirs(EXPORT_DIR, exist_ok=True)

TIFF_SIGNATURES = (b"II*\x00", b"MM\x00*")
UPLOAD_CHUNK_SIZE = 1024 * 1024


def _ensure_can_use_print_canvas(current_user) -> None:
    if current_user.role in {"admin", "owner"}:
        return
    if current_user.role == "client" and current_user.print_canvas_enabled:
        return
    raise HTTPException(status_code=403, detail="Print canvas is not enabled for this user")


def _is_tiff(content: bytes) -> bool:
    return len(content) >= 4 and content[:4] in TIFF_SIGNATURES


async def _save_tiff_upload(file: UploadFile, file_path: str) -> int:
    first_bytes = await file.read(4)
    if not _is_tiff(first_bytes):
        raise HTTPException(status_code=400, detail="File content is not TIFF")

    total_size = 0
    try:
        async with aiofiles.open(file_path, "wb") as out_file:
            await out_file.write(first_bytes)
            total_size += len(first_bytes)
            while True:
                chunk = await file.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                await out_file.write(chunk)
                total_size += len(chunk)
    except OSError as exc:
        raise HTTPException(status_code=500, detail="Could not save TIFF export") from exc

    return total_size


def _to_cmyk_tiff_from_path(file_path: str) -> bytes | None:
    """Convert the RGB export to CMYK for print.

    Returns None when the sheet is too large to transcode safely, so the
    already saved original TIFF can be kept without loading it into memory.
    """
    previous_limit = Image.MAX_IMAGE_PIXELS
    try:
        Image.MAX_IMAGE_PIXELS = None
        with Image.open(file_path) as img:
            width, height = img.size
            if width * height > settings.print_canvas_cmyk_max_pixels:
                logger.warning("print canvas too large for CMYK conversion: %sx%s", width, height)
                return None

            Image.MAX_IMAGE_PIXELS = max(previous_limit or 0, width * height + 1)
            try:
                rgb = img.convert("RGB")
                profile_path = settings.cmyk_icc_profile
                if profile_path and os.path.exists(profile_path):
                    cmyk = ImageCms.profileToProfile(
                        rgb,
                        ImageCms.createProfile("sRGB"),
                        ImageCms.getOpenProfile(profile_path),
                        outputMode="CMYK",
                    )
                else:
                    cmyk = rgb.convert("CMYK")
            finally:
                Image.MAX_IMAGE_PIXELS = previous_limit

        out = io.BytesIO()
        cmyk.save(out, format="TIFF", compression="tiff_lzw")
        return out.getvalue()
    except Exception as exc:  # noqa: BLE001 - never let color conversion break export
        logger.exception("CMYK conversion failed, keeping RGB export")
        sentry_sdk.capture_exception(exc)
        return None
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit


def _number(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _int_number(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _metadata_from_form(raw: str) -> dict:
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid export metadata") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail="Invalid export metadata")
    return parsed


def _email_body(item, metadata: dict) -> str:
    logos = metadata.get("logos") if isinstance(metadata.get("logos"), list) else []
    logo_lines = []
    for logo in logos[:30]:
        if not isinstance(logo, dict):
            continue
        size_mm = ""
        if logo.get("width_mm") and logo.get("height_mm"):
            size_mm = f" — {logo.get('width_mm')} x {logo.get('height_mm')} мм"
        logo_lines.append(
            f"- {logo.get('name') or 'logo'}: {logo.get('quantity', 0)} шт., "
            f"{logo.get('width_px', 0)} x {logo.get('height_px', 0)} px{size_mm}"
        )
    if len(logos) > 30:
        logo_lines.append(f"- ...и ещё {len(logos) - 30}")

    created = item.created_at.isoformat() if item.created_at else datetime.utcnow().isoformat()
    return "\n".join([
        "Новая выгрузка полотна на печать",
        "",
        f"ID выгрузки: {item.id}",
        f"Дата: {created}",
        f"Клиент: {item.user_email or item.user_id or '—'}",
        "",
        "Параметры полотна:",
        f"- ширина полотна: {item.sheet_width_mm} мм",
        f"- занятая ширина: {round(item.used_width_mm)} мм",
        f"- использованная длина: {round(item.used_height_mm)} мм",
        f"- максимальная длина рулона: {item.max_length_m} м",
        f"- расстояние между логотипами: {item.logo_gap_mm:g} мм",
        f"- элементов: {item.items_count}",
        f"- плотность: {item.density}%",
        f"- TIFF: {item.filename}",
        f"- размер TIFF: {round(item.file_size / 1024 / 1024, 2)} МБ",
        f"- DPI экспорта: {item.export_dpi}",
        "",
        "Файлы в раскладке:",
        *(logo_lines or ["- нет данных"]),
        "",
        "TIFF сохранён на сервере и доступен клиенту в личном кабинете во вкладке «Полотно на печать».",
    ])


async def _send_export_email(item, metadata: dict, file_path: str) -> None:
    attachments = []
    if item.file_size <= settings.print_canvas_email_attachment_max_bytes:
        try:
            with open(file_path, "rb") as export_file:
                attachments.append({
                    "filename": item.filename,
                    "content": export_file.read(),
                    "mime_type": "image/tiff",
                })
        except OSError as exc:
            sentry_sdk.capture_exception(exc)

    await run_in_threadpool(
        send_email,
        to=settings.print_canvas_notify_to,
        subject=f"Полотно на печать #{str(item.id)[:8]} от {item.user_email or 'клиента'}",
        body=_email_body(item, metadata),
        reply_to=item.user_email,
        attachments=attachments,
    )


@router.post("/exports", response_model=PrintCanvasExportResponse, status_code=201)
async def create_print_canvas_export(
    request: Request,
    background_tasks: BackgroundTasks,
    metadata: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_can_use_print_canvas(current_user)
    parsed = _metadata_from_form(metadata)

    content_type = (file.content_type or "").split(";")[0].lower()
    if content_type not in {"", "image/tiff", "image/tif", "image/x-tiff", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="Only TIFF export is supported")

    export_id = uuid.uuid4()
    filename = f"print-canvas-{export_id.hex}.tiff"
    file_path = os.path.join(EXPORT_DIR, filename)

    file_size = await _save_tiff_upload(file, file_path)

    # Print is produced in CMYK when the sheet can be transcoded safely.
    converted = await run_in_threadpool(_to_cmyk_tiff_from_path, file_path)
    if converted is not None:
        async with aiofiles.open(file_path, "wb") as out_file:
            await out_file.write(converted)
        file_size = len(converted)
    else:
        file_size = os.path.getsize(file_path)

    item = await crud_print_canvas.create_export(db, {
        "id": export_id,
        "user_id": current_user.id,
        "user_email": current_user.email,
        "filename": filename,
        "file_path": file_path,
        "file_size": file_size,
        "content_type": "image/tiff",
        "sheet_width_mm": _int_number(parsed.get("sheet_width_mm"), 0),
        "used_width_mm": _number(parsed.get("used_width_mm"), 0),
        "used_height_mm": _number(parsed.get("used_height_mm"), 0),
        "max_length_m": _int_number(parsed.get("max_length_m"), 0),
        "logo_gap_mm": _number(parsed.get("logo_gap_mm"), 0),
        "items_count": _int_number(parsed.get("items_count"), 0),
        "density": _int_number(parsed.get("density"), 0),
        "export_dpi": _int_number(parsed.get("export_dpi"), 150),
        "export_metadata": parsed,
    })

    background_tasks.add_task(_send_export_email, item, parsed, file_path)
    event_logger.log(
        "PRINT_CANVAS_EXPORT_CREATED",
        "Client exported print canvas TIFF",
        direction="client->backend",
        actor_type=current_user.role,
        actor_id=str(current_user.id),
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=201,
        request_id=request_id(request),
        entity_type="print_canvas_export",
        entity_id=str(item.id),
        details={
            "filename": item.filename,
            "file_path": item.file_path,
            "file_size": item.file_size,
            "sheet_width_mm": item.sheet_width_mm,
            "used_width_mm": item.used_width_mm,
            "used_height_mm": item.used_height_mm,
            "max_length_m": item.max_length_m,
            "logo_gap_mm": item.logo_gap_mm,
            "items_count": item.items_count,
            "density": item.density,
            "export_dpi": item.export_dpi,
            "email_to": settings.print_canvas_notify_to,
        },
    )
    return item


@router.get("/exports", response_model=list[PrintCanvasExportResponse])
async def list_print_canvas_exports(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    _ensure_can_use_print_canvas(current_user)
    return await crud_print_canvas.list_exports_for_user(db, current_user.id)


@router.get("/exports/{export_id}/download")
async def download_print_canvas_export(
    export_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    item = await crud_print_canvas.get_export(db, export_id)
    if not item:
        raise HTTPException(status_code=404, detail="Print canvas export not found")
    if item.user_id != current_user.id and current_user.role not in {"admin", "owner"}:
        raise HTTPException(status_code=403, detail="Access denied")
    if not os.path.exists(item.file_path):
        raise HTTPException(status_code=404, detail="TIFF file not found")
    return FileResponse(
        item.file_path,
        media_type="image/tiff",
        filename=item.filename,
    )
