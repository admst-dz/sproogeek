"""Notebook block PDF builder.

Generates the inner-block PDF for a planner/notebook order: configurable count
of pages with the requested ruling style (blank, lined, grid, dotted, planner).
The output is a print-ready PDF in the requested page size.
"""
from __future__ import annotations

import io
import logging
import re
from typing import List, Literal, Optional

from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel, Field
from reportlab.lib.colors import HexColor, black
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("block_builder")

app = FastAPI(title="Spruzhyk Block Builder", version="1.0.0")

_SAFE = re.compile(r"^[A-Za-z0-9._-]+$")


def _safe(value: str) -> str:
    if not value or len(value) > 255 or value in {".", ".."} or not _SAFE.fullmatch(value):
        raise HTTPException(status_code=400, detail="invalid path component")
    return value


RulingStyle = Literal["blank", "lined", "grid", "dotted", "planner"]


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
    # Header strip
    c.setFillColor(HexColor("#F1F5F9"))
    c.rect(m, h - m - 18 * mm, w - 2 * m, 18 * mm, fill=1, stroke=0)
    c.setFillColor(TEXT_GRAY)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(m + 4 * mm, h - m - 7 * mm, "DATE")
    c.drawString(m + 60 * mm, h - m - 7 * mm, "PRIORITIES")
    # Body lines below the strip
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


def _render_block_pdf(req: BlockRequest) -> bytes:
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


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/api/block.pdf")
def block_pdf(req: BlockRequest):
    _safe(req.order_id)
    try:
        pdf = _render_block_pdf(req)
    except Exception as exc:  # noqa: BLE001
        log.exception("block render failed")
        raise HTTPException(500, f"block render failed: {exc}") from exc
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="block-{req.order_id}.pdf"'},
    )
