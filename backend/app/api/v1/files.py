import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile

from app.core.config import get_settings
from app.core.deps import get_staff_user, request_id
from app.core.event_logger import event_logger


router = APIRouter()
settings = get_settings()

UPLOAD_DIR = "uploads/logos"
ALLOWED_IMAGE_TYPES = {
    "image/png": ("png", lambda content: content.startswith(b"\x89PNG\r\n\x1a\n")),
    "image/jpeg": ("jpg", lambda content: content.startswith(b"\xff\xd8\xff")),
    "image/webp": ("webp", lambda content: content.startswith(b"RIFF") and content[8:12] == b"WEBP"),
}

os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload-logo")
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    current_user=Depends(get_staff_user),
):
    file_meta = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
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

    url = f"/uploads/logos/{new_filename}"
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
        entity_id=new_filename,
        details={"content_type": file.content_type, "size": len(content), "url": url},
    )
    return {"url": url}
