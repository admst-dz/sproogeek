import base64
import json
import math
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import quote, urlsplit, urlunsplit

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from app.core.cache import get_cache
from app.core.config import get_settings
from app.core.deps import get_staff_user, request_id
from app.core.event_logger import event_logger
from app.services.background_removal import BackgroundRemovalError, remove_logo_background
from app.services.imposition import qr_png_bytes


router = APIRouter()
settings = get_settings()

UPLOAD_DIR = "uploads/logos"
SESSION_DIR = "uploads/logo_sessions"
SESSION_TTL_MINUTES = 30
SESSION_ID_RE = re.compile(r"^[a-f0-9]{32}$")
SESSION_REDIS_PREFIX = "logo-upload-session"
ALLOWED_IMAGE_TYPES = {
    "image/png": ("png", lambda content: content.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": ("jpg", lambda content: content.startswith(b"\xff\xd8\xff")),
    "image/webp": ("webp", lambda content: content.startswith(b"RIFF") and content[8:12] == b"WEBP"),
    "image/tiff": ("tiff", lambda content: content[:4] in {b"II*\x00", b"MM\x00*"}),
    "image/tif": ("tiff", lambda content: content[:4] in {b"II*\x00", b"MM\x00*"}),
    "application/pdf": ("pdf", lambda content: content[:5] == b"%PDF-"),
}

TIFF_EXTENSIONS = {".tif", ".tiff"}
TIFF_CONTENT_TYPES = {"image/tiff", "image/tif"}

PDF_RASTER_MAX_EDGE_PX = 2500
PDF_RASTER_MAX_DPI = 300
# Splitting a vector PDF cover into its visual logos: elements whose bounding
# boxes are within this gap are treated as one logo (merges glyphs/words within
# a logo, keeps spatially separated logos apart).
PDF_SPLIT_GAP_MM = 8.0
PDF_SPLIT_MAX_GROUPS = 24
PDF_SPLIT_MIN_AREA_PT = 4.0


def _pdf_first_page_png(content: bytes) -> bytes:
    """Rasterize the first PDF page to a PNG (vector logos arrive as PDF)."""
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="PDF support is not available") from exc
    try:
        with fitz.open(stream=content, filetype="pdf") as doc:
            if doc.page_count == 0:
                raise HTTPException(status_code=400, detail="PDF has no pages")
            page = doc.load_page(0)
            longest_pt = max(page.rect.width, page.rect.height) or 1.0
            zoom = min(PDF_RASTER_MAX_DPI / 72.0, PDF_RASTER_MAX_EDGE_PX / longest_pt)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=True)
            # Stamp the real DPI (72 * zoom) so the browser derives the true
            # physical size from the page geometry instead of assuming 72 DPI.
            dpi = max(1, round(72.0 * zoom))
            pixmap.set_dpi(dpi, dpi)
            return pixmap.tobytes("png")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not rasterize PDF") from exc


def _collect_pdf_item_boxes(page) -> list[tuple[float, float, float, float]]:
    """Bounding boxes of every drawable item on the page (vectors, raster
    images, text blocks) — the atoms we cluster into logos."""
    boxes: list[tuple[float, float, float, float]] = []
    for path in page.get_drawings():
        rect = path["rect"]
        if rect.width >= 0.5 and rect.height >= 0.5 and rect.width * rect.height >= PDF_SPLIT_MIN_AREA_PT:
            boxes.append((rect.x0, rect.y0, rect.x1, rect.y1))
    try:
        for image in page.get_image_info():
            bbox = image.get("bbox")
            if bbox:
                boxes.append(tuple(bbox))
    except Exception:  # noqa: BLE001 - image info is best-effort
        pass
    try:
        for block in page.get_text("dict").get("blocks", []):
            if block.get("type") == 0 and block.get("bbox"):
                boxes.append(tuple(block["bbox"]))
    except Exception:  # noqa: BLE001 - text info is best-effort
        pass
    return boxes


def _cluster_boxes(boxes: list[tuple], gap: float) -> list[tuple[float, float, float, float]]:
    """Union-find clustering: boxes whose separation is <= gap join one group.
    Returns the merged bounding box of each group."""
    n = len(boxes)
    parent = list(range(n))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def separation(a, b) -> float:
        dx = max(0.0, a[0] - b[2], b[0] - a[2])
        dy = max(0.0, a[1] - b[3], b[1] - a[3])
        return math.hypot(dx, dy)

    for i in range(n):
        for j in range(i + 1, n):
            if separation(boxes[i], boxes[j]) <= gap:
                parent[find(i)] = find(j)

    groups: dict[int, list[int]] = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(i)

    merged = []
    for members in groups.values():
        x0 = min(boxes[i][0] for i in members)
        y0 = min(boxes[i][1] for i in members)
        x1 = max(boxes[i][2] for i in members)
        y1 = max(boxes[i][3] for i in members)
        merged.append((x0, y0, x1, y1))
    return merged


def _pdf_split_logos_png(content: bytes) -> list[bytes]:
    """Split a single-page PDF cover into its visual logos.

    Clusters the page's drawable items by proximity and renders each cluster to
    an isolated PNG (with correct DPI). Falls back to a single full-page render
    when the page is one blob (e.g. an enclosing frame) or too fragmented."""
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="PDF support is not available") from exc
    try:
        with fitz.open(stream=content, filetype="pdf") as doc:
            if doc.page_count == 0:
                raise HTTPException(status_code=400, detail="PDF has no pages")
            page = doc.load_page(0)
            boxes = _collect_pdf_item_boxes(page)
            gap_pt = PDF_SPLIT_GAP_MM * 72.0 / 25.4
            clusters = _cluster_boxes(boxes, gap_pt) if boxes else []
            if len(clusters) <= 1 or len(clusters) > PDF_SPLIT_MAX_GROUPS:
                return [_pdf_first_page_png(content)]
            clusters.sort(key=lambda b: (round(b[1]), round(b[0])))
            images: list[bytes] = []
            for x0, y0, x1, y1 in clusters:
                rect = fitz.Rect(x0, y0, x1, y1)
                longest_pt = max(rect.width, rect.height) or 1.0
                zoom = min(PDF_RASTER_MAX_DPI / 72.0, PDF_RASTER_MAX_EDGE_PX / longest_pt)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=rect, alpha=True)
                dpi = max(1, round(72.0 * zoom))
                pixmap.set_dpi(dpi, dpi)
                images.append(pixmap.tobytes("png"))
            return images
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not split PDF") from exc


def _tiff_to_png(content: bytes) -> bytes:
    """Convert a TIFF logo to browser-friendly PNG while preserving DPI."""
    try:
        import io

        out = io.BytesIO()
        with Image.open(io.BytesIO(content)) as image:
            image.seek(0)
            dpi = image.info.get("dpi")
            if image.mode not in {"RGB", "RGBA"}:
                has_alpha = image.mode in {"LA", "PA"} or "transparency" in image.info
                image = image.convert("RGBA" if has_alpha else "RGB")
            save_kwargs = {}
            if (
                isinstance(dpi, tuple)
                and len(dpi) >= 2
                and dpi[0]
                and dpi[1]
            ):
                save_kwargs["dpi"] = (float(dpi[0]), float(dpi[1]))
            image.save(out, format="PNG", **save_kwargs)
        return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Could not convert TIFF") from exc

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(SESSION_DIR, exist_ok=True)


class LogoUploadSessionCreate(BaseModel):
    base_url: str = Field(..., min_length=8, max_length=300)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _session_path(session_id: str) -> str:
    if not SESSION_ID_RE.fullmatch(session_id or ""):
        raise HTTPException(status_code=404, detail="Logo upload session not found")
    return os.path.join(SESSION_DIR, f"{session_id}.json")


def _session_key(session_id: str) -> str:
    if not SESSION_ID_RE.fullmatch(session_id or ""):
        raise HTTPException(status_code=404, detail="Logo upload session not found")
    return f"{SESSION_REDIS_PREFIX}:{session_id}"


def _session_file_key(session_id: str, index: int = 0) -> str:
    if not SESSION_ID_RE.fullmatch(session_id or ""):
        raise HTTPException(status_code=404, detail="Logo upload session not found")
    return f"{SESSION_REDIS_PREFIX}:file:{session_id}:{index}"


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _parse_dt(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return _now_utc() - timedelta(seconds=1)


def _ttl_seconds(session: dict) -> int:
    expires_at = _parse_dt(session.get("expires_at", ""))
    return max(1, int((expires_at - _now_utc()).total_seconds()))


def _normalize_public_origin(base_url: str) -> str:
    parsed = urlsplit((base_url or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid base URL")
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", "")).rstrip("/")


async def _read_session(session_id: str) -> dict | None:
    try:
        cached = await get_cache().get(_session_key(session_id))
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    path = _session_path(session_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as session_file:
            return json.load(session_file)
    except (OSError, json.JSONDecodeError):
        return None


async def _write_session(session: dict) -> None:
    try:
        await get_cache().set(
            _session_key(session["id"]),
            json.dumps(session, ensure_ascii=False).encode("utf-8"),
            ex=_ttl_seconds(session),
        )
        return
    except Exception:
        pass

    path = _session_path(session["id"])
    tmp_path = f"{path}.{uuid.uuid4().hex}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as session_file:
        json.dump(session, session_file, ensure_ascii=False)
    os.replace(tmp_path, path)


def _is_expired(session: dict) -> bool:
    return _parse_dt(session.get("expires_at", "")) <= _now_utc()


async def _get_session_or_404(session_id: str) -> dict:
    session = await _read_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Logo upload session not found")
    return session


async def _write_session_file(session_id: str, content: bytes, session: dict, index: int = 0) -> str | None:
    try:
        key = _session_file_key(session_id, index)
        await get_cache().set(key, content, ex=_ttl_seconds(session))
        return key
    except Exception:
        return None


async def _read_session_file(file_meta: dict) -> bytes | None:
    file_key = file_meta.get("file_key")
    if not file_key:
        return None
    try:
        return await get_cache().get(file_key)
    except Exception:
        return None


def _session_files(session: dict) -> list[dict]:
    files = session.get("files")
    if isinstance(files, list):
        return [item for item in files if isinstance(item, dict)]
    if session.get("file_path") or session.get("file_key"):
        return [{
            "url": session.get("url"),
            "file_path": session.get("file_path"),
            "file_key": session.get("file_key"),
            "filename": session.get("filename"),
            "content_type": session.get("content_type"),
            "size": session.get("size"),
        }]
    return []


def _cleanup_expired_sessions() -> None:
    try:
        names = os.listdir(SESSION_DIR)
    except OSError:
        return
    for name in names:
        if not name.endswith(".json"):
            continue
        session_id = name[:-5]
        if not SESSION_ID_RE.fullmatch(session_id):
            continue
        try:
            session = None
            path = _session_path(session_id)
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as session_file:
                    session = json.load(session_file)
            if session and _is_expired(session):
                os.remove(_session_path(session_id))
        except (OSError, json.JSONDecodeError):
            continue


def _session_payload(session: dict) -> dict:
    if _is_expired(session):
        return {
            "session_id": session["id"],
            "status": "expired",
            "expires_at": session.get("expires_at"),
            "upload_url": session.get("upload_url"),
        }
    result = {
        "session_id": session["id"],
        "status": session.get("status", "pending"),
        "expires_at": session.get("expires_at"),
        "upload_url": session.get("upload_url"),
        "qr_url": f"/api/v1/files/logo-upload-sessions/{session['id']}/qr.png",
    }
    if session.get("status") == "ready":
        files = _session_files(session)
        result.update({
            "download_url": f"/api/v1/files/logo-upload-sessions/{session['id']}/file",
            "files": [
                {
                    "download_url": f"/api/v1/files/logo-upload-sessions/{session['id']}/file?index={index}",
                    "filename": item.get("filename"),
                    "content_type": item.get("content_type"),
                    "size": item.get("size"),
                }
                for index, item in enumerate(files)
            ],
            "filename": files[0].get("filename") if files else session.get("filename"),
            "content_type": files[0].get("content_type") if files else session.get("content_type"),
            "size": files[0].get("size") if files else session.get("size"),
        })
    return result


async def _read_logo_upload(file: UploadFile, max_bytes: int | None = settings.max_logo_bytes) -> dict:
    content_type = (file.content_type or "").split(";")[0].lower()
    original_filename = os.path.basename(file.filename or "")[:160]
    filename_extension = os.path.splitext(original_filename)[1].lower()
    if not content_type and filename_extension in TIFF_EXTENSIONS:
        content_type = "image/tiff"
    file_meta = ALLOWED_IMAGE_TYPES.get(content_type)
    if not file_meta:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    extension, validate_signature = file_meta
    content = await file.read()
    if max_bytes is not None and len(content) > max_bytes:
        raise HTTPException(status_code=413, detail="File is too large")
    if not validate_signature(content):
        raise HTTPException(status_code=400, detail="File content does not match declared type")
    if not original_filename:
        original_filename = f"logo.{extension}"

    if content_type == "application/pdf":
        content = await run_in_threadpool(_pdf_first_page_png, content)
        extension = "png"
        content_type = "image/png"
        original_filename = f"{os.path.splitext(original_filename)[0] or 'logo'}.png"
    elif content_type in TIFF_CONTENT_TYPES:
        content = await run_in_threadpool(_tiff_to_png, content)
        extension = "png"
        content_type = "image/png"
        original_filename = f"{os.path.splitext(original_filename)[0] or 'logo'}.png"

    return {
        "extension": extension,
        "filename": original_filename or f"logo.{extension}",
        "content_type": content_type,
        "size": len(content),
        "content": content,
    }


async def _save_logo_file(file: UploadFile) -> dict:
    upload = await _read_logo_upload(file)
    extension = upload["extension"]
    content = upload["content"]

    new_filename = f"{uuid.uuid4().hex}.{extension}"
    file_path = os.path.join(UPLOAD_DIR, new_filename)

    async with aiofiles.open(file_path, "wb") as out_file:
        await out_file.write(content)

    return {
        "url": f"/uploads/logos/{new_filename}",
        "path": file_path,
        "filename": upload["filename"],
        "content_type": upload["content_type"],
        "size": upload["size"],
        "content": content,
    }


@router.post("/upload-logo")
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    current_user=Depends(get_staff_user),
):
    saved = await _save_logo_file(file)
    url = saved["url"]
    event_logger.log(
        "FILE_UPLOADED",
        "Staff user uploaded logo file",
        direction="user->backend",
        actor_type=current_user.role,
        actor_id=current_user.id,
        actor_email=current_user.email,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        entity_type="upload",
        entity_id=os.path.basename(saved["path"]),
        details={"content_type": saved["content_type"], "size": saved["size"], "url": url},
    )
    return {"url": url}


@router.post("/remove-logo-background")
async def remove_uploaded_logo_background(
    request: Request,
    file: UploadFile = File(...),
    trim: bool = True,
):
    upload = await _read_logo_upload(file)
    try:
        result = await run_in_threadpool(
            remove_logo_background,
            upload["content"],
            max_edge=settings.background_removal_max_edge,
            trim=trim,
        )
    except BackgroundRemovalError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    base_name = os.path.splitext(upload["filename"])[0] or "logo"
    output_filename = f"{base_name[:120]}-no-bg.png"
    ascii_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", output_filename).strip("._") or "logo-no-bg.png"
    event_logger.log(
        "LOGO_BACKGROUND_REMOVED",
        "Logo background removed on backend",
        direction="user->backend",
        actor_type="anonymous",
        actor_id=None,
        actor_email=None,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        entity_type="logo_background",
        entity_id=uuid.uuid4().hex,
        details={
            "engine": result.engine,
            "source_content_type": upload["content_type"],
            "source_size": upload["size"],
            "output_size": len(result.content),
            "width": result.width,
            "height": result.height,
            "removed_ratio": round(result.removed_ratio, 4),
        },
    )
    return Response(
        content=result.content,
        media_type="image/png",
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": (
                f'inline; filename="{ascii_filename}"; filename*=UTF-8\'\'{quote(output_filename)}'
            ),
            "X-Background-Removal-Engine": result.engine,
            "X-Background-Removed-Ratio": f"{result.removed_ratio:.4f}",
        },
    )


@router.post("/prepare-logo-pdf")
async def prepare_pdf_logos(file: UploadFile = File(...)):
    """Split a single-page PDF into its visual logos as base64 PNGs."""
    content_type = (file.content_type or "").split(";")[0].lower()
    name = os.path.basename(file.filename or "").lower()
    if content_type != "application/pdf" and not name.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF is supported")
    content = await file.read()
    if settings.max_logo_bytes is not None and len(content) > settings.max_logo_bytes:
        raise HTTPException(status_code=413, detail="File is too large")
    if content[:5] != b"%PDF-":
        raise HTTPException(status_code=400, detail="File content is not PDF")
    images = await run_in_threadpool(_pdf_split_logos_png, content)
    return {"images": [base64.b64encode(png).decode("ascii") for png in images]}


@router.post("/prepare-logo")
async def prepare_logo_for_browser(file: UploadFile = File(...)):
    upload = await _read_logo_upload(file, max_bytes=None)
    output_filename = upload["filename"] or "logo.png"
    ascii_filename = re.sub(r"[^A-Za-z0-9._-]+", "_", output_filename).strip("._") or "logo.png"
    return Response(
        content=upload["content"],
        media_type=upload["content_type"],
        headers={
            "Cache-Control": "no-store",
            "Content-Disposition": (
                f'inline; filename="{ascii_filename}"; filename*=UTF-8\'\'{quote(output_filename)}'
            ),
        },
    )


@router.post("/logo-upload-sessions")
async def create_logo_upload_session(payload: LogoUploadSessionCreate):
    _cleanup_expired_sessions()
    session_id = uuid.uuid4().hex
    origin = _normalize_public_origin(payload.base_url)
    expires_at = _now_utc() + timedelta(minutes=SESSION_TTL_MINUTES)
    session = {
        "id": session_id,
        "status": "pending",
        "created_at": _iso(_now_utc()),
        "expires_at": _iso(expires_at),
        "upload_url": f"{origin}/mobile-logo/{session_id}",
    }
    await _write_session(session)
    return _session_payload(session)


@router.get("/logo-upload-sessions/{session_id}")
async def get_logo_upload_session(session_id: str):
    session = await _get_session_or_404(session_id)
    return _session_payload(session)


@router.get("/logo-upload-sessions/{session_id}/qr.png")
async def get_logo_upload_session_qr(session_id: str):
    session = await _get_session_or_404(session_id)
    if _is_expired(session):
        raise HTTPException(status_code=410, detail="Logo upload session expired")
    return Response(
        content=qr_png_bytes(session["upload_url"]),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/logo-upload-sessions/{session_id}/upload")
async def upload_logo_to_session(
    session_id: str,
    request: Request,
    file: UploadFile | None = File(None),
    files: list[UploadFile] | None = File(None),
):
    session = await _get_session_or_404(session_id)
    if _is_expired(session):
        raise HTTPException(status_code=410, detail="Logo upload session expired")

    upload_files = list(files or [])
    if file is not None:
        upload_files.insert(0, file)
    if not upload_files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    saved_files = []
    for index, item in enumerate(upload_files):
        saved = await _save_logo_file(item)
        file_key = await _write_session_file(session_id, saved["content"], session, index)
        saved_files.append({
            "url": saved["url"],
            "file_path": saved["path"],
            "file_key": file_key,
            "filename": saved["filename"],
            "content_type": saved["content_type"],
            "size": saved["size"],
        })

    first_file = saved_files[0]
    session.update({
        "status": "ready",
        "uploaded_at": _iso(_now_utc()),
        "files": saved_files,
        "url": first_file["url"],
        "file_path": first_file["file_path"],
        "file_key": first_file["file_key"],
        "filename": first_file["filename"],
        "content_type": first_file["content_type"],
        "size": first_file["size"],
    })
    await _write_session(session)

    event_logger.log(
        "LOGO_SESSION_FILE_UPLOADED",
        "Anonymous user uploaded logo through QR session",
        direction="user->backend",
        actor_type="anonymous",
        actor_id=None,
        actor_email=None,
        method=request.method,
        path=request.url.path,
        status_code=200,
        request_id=request_id(request),
        entity_type="logo_upload_session",
        entity_id=session_id,
        details={
            "count": len(saved_files),
            "content_types": [item["content_type"] for item in saved_files],
            "total_size": sum(item["size"] for item in saved_files),
        },
    )
    return _session_payload(session)


@router.get("/logo-upload-sessions/{session_id}/file")
async def download_logo_upload_session_file(session_id: str, index: int = 0):
    session = await _get_session_or_404(session_id)
    if _is_expired(session):
        raise HTTPException(status_code=410, detail="Logo upload session expired")
    if session.get("status") != "ready":
        raise HTTPException(status_code=404, detail="Logo file not uploaded yet")
    files = _session_files(session)
    if index < 0 or index >= len(files):
        raise HTTPException(status_code=404, detail="Logo file not found")

    file_meta = files[index]
    content = await _read_session_file(file_meta)
    if content is not None:
        return Response(
            content=content,
            media_type=file_meta.get("content_type") or "application/octet-stream",
            headers={"Cache-Control": "no-store"},
        )
    if not file_meta.get("file_path"):
        raise HTTPException(status_code=404, detail="Logo file not uploaded yet")
    if not os.path.exists(file_meta["file_path"]):
        raise HTTPException(status_code=404, detail="Logo file not found")
    return FileResponse(
        file_meta["file_path"],
        media_type=file_meta.get("content_type") or "application/octet-stream",
        filename=file_meta.get("filename") or "logo.png",
        headers={"Cache-Control": "no-store"},
    )
