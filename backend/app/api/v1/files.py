import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.storage import s3_storage


router = APIRouter()


@router.post("/upload-logo")
async def upload_logo(file: UploadFile = File(...)):
    allowed_types = ["image/svg+xml", "image/png", "application/postscript"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported file format")

    file_ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
    new_filename = f"{uuid.uuid4().hex}.{file_ext}"
    content = await file.read()

    return await s3_storage.upload_bytes(
        content=content,
        folder="logos",
        filename=new_filename,
        content_type=file.content_type,
    )
