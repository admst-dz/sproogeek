import logging
import re
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Response

from app.render import render_pdf
from app.schemas import TechCardRequest, TechCardResponse
from app.storage import ensure_bucket, presign_get, upload_pdf, get_object


_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")


def _safe(value: str) -> str:
    if not value or len(value) > 255 or value in {".", ".."} or not _SAFE.fullmatch(value):
        raise HTTPException(status_code=400, detail="invalid path component")
    return value


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("techcard")

app = FastAPI(title="Spruzhyk TechCard Service", version="1.0.0")


@app.on_event("startup")
def _startup() -> None:
    try:
        ensure_bucket()
    except Exception as exc:  # noqa: BLE001
        log.warning("bucket bootstrap failed: %s", exc)


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/api/techcard", response_model=TechCardResponse)
def generate(req: TechCardRequest):
    try:
        pdf = render_pdf(req)
    except Exception as exc:  # noqa: BLE001
        log.exception("render failed")
        raise HTTPException(500, f"render failed: {exc}") from exc

    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    prefix = "approval" if req.doc_type == "approval" else "techcard"
    key = f"{_safe(req.order_id)}/{prefix}-{ts}.pdf"
    upload_pdf(key, pdf)
    return TechCardResponse(
        s3_key=key,
        download_url=presign_get(key),
        bytes=len(pdf),
    )


@app.get("/api/techcard/file/{order_id}/{filename}")
def fetch(order_id: str, filename: str):
    key = f"{_safe(order_id)}/{_safe(filename)}"
    try:
        data = get_object(key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(404, "not found") from exc
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_safe(filename)}"'},
    )
