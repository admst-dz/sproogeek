import logging
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Response

from app.render import render_pdf
from app.schemas import TechCardRequest, TechCardResponse
from app.storage import ensure_bucket, presign_get, upload_pdf, get_object


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
    key = f"{req.order_id}/techcard-{ts}.pdf"
    upload_pdf(key, pdf)
    return TechCardResponse(
        s3_key=key,
        download_url=presign_get(key),
        bytes=len(pdf),
    )


@app.get("/api/techcard/file/{order_id}/{filename}")
def fetch(order_id: str, filename: str):
    key = f"{order_id}/{filename}"
    try:
        data = get_object(key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(404, "not found") from exc
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
