import json
import os
import re
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit, urlunsplit

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.core.deps import get_staff_user, request_id
from app.core.event_logger import event_logger
from app.services.imposition import qr_png_bytes


router = APIRouter()
settings = get_settings()

UPLOAD_DIR = "uploads/logos"
SESSION_DIR = "uploads/logo_sessions"
SESSION_TTL_MINUTES = 30
SESSION_ID_RE = re.compile(r"^[a-f0-9]{32}$")
ALLOWED_IMAGE_TYPES = {
    "image/png": ("png", lambda content: content.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": ("jpg", lambda content: content.startswith(b"\xff\xd8\xff")),
    "image/webp": ("webp", lambda content: content.startswith(b"RIFF") and content[8:12] == b"WEBP"),
}

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


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _parse_dt(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return _now_utc() - timedelta(seconds=1)


def _normalize_public_origin(base_url: str) -> str:
    parsed = urlsplit((base_url or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid base URL")
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", "")).rstrip("/")


def _read_session(session_id: str) -> dict | None:
    path = _session_path(session_id)
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as session_file:
            return json.load(session_file)
    except (OSError, json.JSONDecodeError):
        return None


def _write_session(session: dict) -> None:
    path = _session_path(session["id"])
    tmp_path = f"{path}.{uuid.uuid4().hex}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as session_file:
        json.dump(session, session_file, ensure_ascii=False)
    os.replace(tmp_path, path)


def _is_expired(session: dict) -> bool:
    return _parse_dt(session.get("expires_at", "")) <= _now_utc()


def _get_session_or_404(session_id: str) -> dict:
    session = _read_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Logo upload session not found")
    return session


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
            session = _read_session(session_id)
            if session and _is_expired(session):
                os.remove(_session_path(session_id))
        except OSError:
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
        result.update({
            "download_url": f"/api/v1/files/logo-upload-sessions/{session['id']}/file",
            "filename": session.get("filename"),
            "content_type": session.get("content_type"),
            "size": session.get("size"),
        })
    return result


async def _save_logo_file(file: UploadFile) -> dict:
    content_type = (file.content_type or "").split(";")[0].lower()
    file_meta = ALLOWED_IMAGE_TYPES.get(content_type)
    if not file_meta:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    extension, validate_signature = file_meta
    content = await file.read()
    if len(content) > settings.max_logo_bytes:
        raise HTTPException(status_code=413, detail="File is too large")
    if not validate_signature(content):
        raise HTTPException(status_code=400, detail="File content does not match declared type")

    new_filename = f"{uuid.uuid4().hex}.{extension}"
    file_path = os.path.join(UPLOAD_DIR, new_filename)

    async with aiofiles.open(file_path, "wb") as out_file:
        await out_file.write(content)

    original_filename = os.path.basename(file.filename or f"logo.{extension}")[:160]
    return {
        "url": f"/uploads/logos/{new_filename}",
        "path": file_path,
        "filename": original_filename or f"logo.{extension}",
        "content_type": content_type,
        "size": len(content),
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
    _write_session(session)
    return _session_payload(session)


@router.get("/logo-upload-sessions/{session_id}")
async def get_logo_upload_session(session_id: str):
    session = _get_session_or_404(session_id)
    return _session_payload(session)


@router.get("/logo-upload-sessions/{session_id}/qr.png")
async def get_logo_upload_session_qr(session_id: str):
    session = _get_session_or_404(session_id)
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
    file: UploadFile = File(...),
):
    session = _get_session_or_404(session_id)
    if _is_expired(session):
        raise HTTPException(status_code=410, detail="Logo upload session expired")

    saved = await _save_logo_file(file)
    session.update({
        "status": "ready",
        "uploaded_at": _iso(_now_utc()),
        "url": saved["url"],
        "file_path": saved["path"],
        "filename": saved["filename"],
        "content_type": saved["content_type"],
        "size": saved["size"],
    })
    _write_session(session)

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
        details={"content_type": saved["content_type"], "size": saved["size"]},
    )
    return _session_payload(session)


@router.get("/logo-upload-sessions/{session_id}/file")
async def download_logo_upload_session_file(session_id: str):
    session = _get_session_or_404(session_id)
    if _is_expired(session):
        raise HTTPException(status_code=410, detail="Logo upload session expired")
    if session.get("status") != "ready" or not session.get("file_path"):
        raise HTTPException(status_code=404, detail="Logo file not uploaded yet")
    if not os.path.exists(session["file_path"]):
        raise HTTPException(status_code=404, detail="Logo file not found")
    return FileResponse(
        session["file_path"],
        media_type=session.get("content_type") or "application/octet-stream",
        filename=session.get("filename") or "logo.png",
        headers={"Cache-Control": "no-store"},
    )
