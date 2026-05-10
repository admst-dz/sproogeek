"""Notebook block PDF builder.

Two modes:
1. **Procedural** (default): generate ruled pages from scratch (blank/lined/grid/dotted/planner).
2. **Template assembly**: stitch user-selected pages from the catalog of pre-designed
   PDFs (1..50). The print shop sees a cover page with order metadata and the
   chosen paper type, followed by the requested templates in order.
"""
from __future__ import annotations

import io
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, black
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("block_builder")

app = FastAPI(title="Spruzhyk Block Builder", version="2.0.0")

_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")
TEMPLATES_DIR = Path(os.environ.get("BLOCK_TEMPLATES_DIR", "/app/templates/pages"))


def _safe(value: str) -> str:
    if not value or len(value) > 255 or value in {".", ".."} or not _SAFE.fullmatch(value):
        raise HTTPException(status_code=400, detail="invalid path component")
    return value


RulingStyle = Literal["blank", "lined", "grid", "dotted", "planner"]
PaperType = Literal["offset_80", "offset_100", "offset_110", "coated_115", "coated_130"]


PAPER_LABELS: dict[str, str] = {
    "offset_80": "Офсетная 80 г/м²",
    "offset_100": "Офсетная 100 г/м²",
    "offset_110": "Офсетная 110 г/м²",
    "coated_115": "Мелованная 115 г/м²",
    "coated_130": "Мелованная 130 г/м²",
}


class BlockRequest(BaseModel):
    order_id: str = Field(..., min_length=1, max_length=80)
    width_mm: float = Field(145.0, gt=10, le=600)
    height_mm: float = Field(210.0, gt=10, le=600)
    pages: int = Field(120, ge=1, le=400)
    ruling: RulingStyle = "lined"
    line_spacing_mm: float = Field(7.0, ge=3.0, le=15.0)
    page_numbers: bool = True
    margin_mm: float = Field(12.0, ge=0.0, le=30.0)
    title: Optional[str] = None

    # Template-assembly mode
    template_ids: List[int] = Field(default_factory=list)
    paper_type: Optional[PaperType] = None
    client_name: Optional[str] = None
    product_name: Optional[str] = None


GRID_COLOR = HexColor("#94A3B8")
RULE_COLOR = HexColor("#CBD5F5")
TEXT_GRAY = HexColor("#64748B")


def _draw_lined(c: canvas.Canvas, w: float, h: float, m: float, spacing: float) -> None:
    c.setStrokeColor(RULE_COLOR)
    c.setLineWidth(0.3)
    y = m + spacing
    while y < h - m:
        c.line(m, y, w - m, y)
        y += spacing


def _draw_grid(c: canvas.Canvas, w: float, h: float, m: float, spacing: float) -> None:
    c.setStrokeColor(RULE_COLOR)
    c.setLineWidth(0.25)
    x = m
    while x <= w - m:
        c.line(x, m, x, h - m)
        x += spacing
    y = m
    while y <= h - m:
        c.line(m, y, w - m, y)
        y += spacing


def _draw_dotted(c: canvas.Canvas, w: float, h: float, m: float, spacing: float) -> None:
    c.setFillColor(GRID_COLOR)
    r = 0.3
    y = m
    while y <= h - m:
        x = m
        while x <= w - m:
            c.circle(x, y, r, fill=1, stroke=0)
            x += spacing
        y += spacing


def _draw_planner(c: canvas.Canvas, w: float, h: float, m: float, spacing: float) -> None:
    c.setFillColor(HexColor("#F1F5F9"))
    c.rect(m, h - m - 18 * mm, w - 2 * m, 18 * mm, fill=1, stroke=0)
    c.setFillColor(TEXT_GRAY)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(m + 4 * mm, h - m - 7 * mm, "DATE")
    c.drawString(m + 60 * mm, h - m - 7 * mm, "PRIORITIES")
    c.setStrokeColor(RULE_COLOR)
    c.setLineWidth(0.3)
    y = m + spacing
    top = h - m - 22 * mm
    while y < top:
        c.line(m, y, w - m, y)
        y += spacing


_DRAW = {
    "lined": _draw_lined,
    "grid": _draw_grid,
    "dotted": _draw_dotted,
    "planner": _draw_planner,
}


def _render_procedural_pdf(req: BlockRequest) -> bytes:
    buf = io.BytesIO()
    page = (req.width_mm * mm, req.height_mm * mm)
    c = canvas.Canvas(buf, pagesize=page)
    c.setTitle(f"block-{req.order_id}")

    w, h = page
    m = req.margin_mm * mm
    spacing = req.line_spacing_mm * mm
    draw = _DRAW.get(req.ruling)

    for n in range(1, req.pages + 1):
        if draw is not None:
            draw(c, w, h, m, spacing)
        if n == 1 and req.title:
            c.setFillColor(black)
            c.setFont("Helvetica-Bold", 18)
            c.drawCentredString(w / 2, h / 2 + 10 * mm, req.title)
        if req.page_numbers:
            c.setFillColor(TEXT_GRAY)
            c.setFont("Helvetica", 7)
            c.drawRightString(w - m, m / 2, str(n))
        c.showPage()

    c.save()
    return buf.getvalue()


def _render_cover_page(req: BlockRequest) -> bytes:
    """One-page production cover with order metadata and paper type."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    c.setFillColor(black)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, h - 30 * mm, "Производственный блок")

    c.setFont("Helvetica", 11)
    c.setFillColor(TEXT_GRAY)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        f"Заказ: {req.order_id}",
        f"Дата: {ts}",
    ]
    if req.product_name:
        lines.append(f"Товар: {req.product_name}")
    if req.client_name:
        lines.append(f"Клиент: {req.client_name}")
    if req.paper_type:
        lines.append(f"Бумага: {PAPER_LABELS.get(req.paper_type, req.paper_type)}")
    if req.template_ids:
        lines.append(f"Страниц в блоке: {len(req.template_ids)}")
        lines.append(f"Формат страницы: {req.width_mm:.0f} × {req.height_mm:.0f} мм")

    y = h - 45 * mm
    for line in lines:
        c.drawString(20 * mm, y, line)
        y -= 7 * mm

    if req.template_ids:
        c.setFillColor(black)
        c.setFont("Helvetica-Bold", 10)
        y -= 5 * mm
        c.drawString(20 * mm, y, "Состав блока (по порядку):")
        c.setFillColor(TEXT_GRAY)
        c.setFont("Helvetica", 9)
        y -= 6 * mm
        per_line = 14
        for i in range(0, len(req.template_ids), per_line):
            chunk = req.template_ids[i:i + per_line]
            c.drawString(20 * mm, y, "  ".join(f"#{tid:02d}" for tid in chunk))
            y -= 5 * mm
            if y < 25 * mm:
                break

    c.setFillColor(TEXT_GRAY)
    c.setFont("Helvetica", 7)
    c.drawRightString(w - 20 * mm, 12 * mm, f"spruzhyk · order {req.order_id}")
    c.save()
    return buf.getvalue()


def _assemble_template_pdf(req: BlockRequest) -> bytes:
    """Stitch the chosen catalog templates after a cover page."""
    writer = PdfWriter()

    cover = PdfReader(io.BytesIO(_render_cover_page(req)))
    for page in cover.pages:
        writer.add_page(page)

    missing: list[int] = []
    for tid in req.template_ids:
        path = TEMPLATES_DIR / f"{tid}.pdf"
        if not path.is_file():
            missing.append(tid)
            continue
        reader = PdfReader(str(path))
        for page in reader.pages:
            writer.add_page(page)

    if missing:
        log.warning("missing template ids: %s", missing)

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/api/templates")
def list_templates():
    items = []
    for path in sorted(TEMPLATES_DIR.glob("*.pdf"), key=lambda p: int(p.stem) if p.stem.isdigit() else 0):
        if not path.stem.isdigit():
            continue
        items.append({"id": int(path.stem), "filename": path.name})
    return {"templates": items}


@app.post("/api/block.pdf")
def block_pdf(req: BlockRequest):
    _safe(req.order_id)
    try:
        if req.template_ids:
            for tid in req.template_ids:
                if tid < 1 or tid > 9999:
                    raise HTTPException(400, f"invalid template id: {tid}")
            pdf = _assemble_template_pdf(req)
        else:
            pdf = _render_procedural_pdf(req)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.exception("block render failed")
        raise HTTPException(500, f"block render failed: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="block-{req.order_id}.pdf"'},
    )
