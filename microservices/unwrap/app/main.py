import base64
import io
import logging
import re
import zipfile
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Response

from app.render import render_unwrap_pdf
from app.schemas import UnwrapRequest, UnwrapResponse


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("unwrap")

app = FastAPI(title="Spruzhyk Unwrap Service", version="1.0.0")

_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")


def _safe(value: str) -> str:
    if not value or len(value) > 255 or value in {".", ".."} or not _SAFE.fullmatch(value):
        raise HTTPException(status_code=400, detail="invalid path component")
    return value


def _decal_filename(idx: int, logo) -> tuple[str, bytes] | None:
    if not logo.decal_data_url or not logo.decal_data_url.startswith("data:"):
        return None
    try:
        head, payload = logo.decal_data_url.split(",", 1)
        raw = base64.b64decode(payload)
    except Exception:
        return None
    ext = "png"
    m = re.match(r"data:image/([a-z0-9+]+);base64", head)
    if m:
        ext = m.group(1).replace("jpeg", "jpg")
    name = logo.filename or f"decal_{idx + 1}.{ext}"
    if "." not in name:
        name = f"{name}.{ext}"
    return name, raw


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/api/unwrap", response_model=UnwrapResponse)
def generate(req: UnwrapRequest):
    try:
        pdf, pages = render_unwrap_pdf(req)
    except Exception as exc:  # noqa: BLE001
        log.exception("unwrap render failed")
        raise HTTPException(500, f"unwrap render failed: {exc}") from exc
    return UnwrapResponse(bytes=len(pdf), pages=pages)


@app.post("/api/unwrap.pdf")
def generate_pdf(req: UnwrapRequest):
    _safe(req.order_id)
    try:
        pdf, _ = render_unwrap_pdf(req)
    except Exception as exc:  # noqa: BLE001
        log.exception("unwrap render failed")
        raise HTTPException(500, f"unwrap render failed: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="unwrap-{req.order_id}.pdf"'},
    )


@app.post("/api/unwrap.zip")
def generate_zip(req: UnwrapRequest):
    """Return a ZIP with the unwrap PDF and each decal as a separate file."""
    _safe(req.order_id)
    try:
        pdf, _ = render_unwrap_pdf(req)
    except Exception as exc:  # noqa: BLE001
        log.exception("unwrap render failed")
        raise HTTPException(500, f"unwrap render failed: {exc}") from exc

    buf = io.BytesIO()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(f"unwrap-{req.order_id}.pdf", pdf)
        seen: set[str] = set()
        for idx, logo in enumerate(req.logos):
            res = _decal_filename(idx, logo)
            if not res:
                continue
            name, raw = res
            if name in seen:
                stem, _, ext = name.rpartition(".")
                name = f"{stem}_{idx + 1}.{ext}" if ext else f"{name}_{idx + 1}"
            seen.add(name)
            zf.writestr(f"decals/{name}", raw)
        zf.writestr(
            "MANIFEST.txt",
            f"order={req.order_id}\nproduct={req.product_kind}\ngenerated_utc={ts}\n",
        )
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="unwrap-{req.order_id}.zip"'},
    )
