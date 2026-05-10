"""Build a printable unwrap PDF for a given product configuration.

The PDF is a technical layout in millimeters: each page shows one face of the
unwrapped product (e.g. cylindrical body, cap top, cover) with a rectangle
indicating where each user logo is to be applied. Print shop staff use this to
register the artwork on the printer/transfer station.
"""
from __future__ import annotations

import base64
import io
import math
from dataclasses import dataclass
from typing import List

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A3, A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

from app.schemas import (
    LogoPlacement,
    NotebookDimensions,
    PowerbankDimensions,
    ThermosDimensions,
    UnwrapRequest,
)


PAGE = landscape(A3)
MARGIN_MM = 20.0
ZONE_STROKE = HexColor("#0EA5E9")
ZONE_FILL = HexColor("#0EA5E9")
SAFE_STROKE = HexColor("#94A3B8")
TEXT = HexColor("#0F172A")


@dataclass
class Face:
    title: str
    width_mm: float
    height_mm: float
    targets: tuple[str, ...]
    note: str = ""


def _decal_image(logo: LogoPlacement) -> ImageReader | None:
    if logo.decal_data_url and logo.decal_data_url.startswith("data:"):
        try:
            head, payload = logo.decal_data_url.split(",", 1)
            raw = base64.b64decode(payload)
            return ImageReader(io.BytesIO(raw))
        except Exception:
            return None
    return None


def _draw_face(c: canvas.Canvas, face: Face, logos: List[LogoPlacement], order_id: str) -> None:
    pw, ph = PAGE
    c.setFillColor(white)
    c.rect(0, 0, pw, ph, fill=1, stroke=0)

    avail_w = pw - 2 * MARGIN_MM * mm
    avail_h = ph - 2 * MARGIN_MM * mm - 30 * mm  # leave room for header
    scale = min(avail_w / (face.width_mm * mm), avail_h / (face.height_mm * mm))

    drawn_w = face.width_mm * mm * scale
    drawn_h = face.height_mm * mm * scale
    ox = (pw - drawn_w) / 2
    oy = MARGIN_MM * mm

    # Header
    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN_MM * mm, ph - MARGIN_MM * mm, f"{face.title}")
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN_MM * mm, ph - MARGIN_MM * mm - 14,
                 f"order {order_id}  ·  {face.width_mm:.1f} × {face.height_mm:.1f} mm  ·  scale 1:{1/scale:.2f}")
    if face.note:
        c.drawString(MARGIN_MM * mm, ph - MARGIN_MM * mm - 28, face.note)

    # Cut contour
    c.setStrokeColor(TEXT)
    c.setLineWidth(0.6)
    c.rect(ox, oy, drawn_w, drawn_h, fill=0, stroke=1)

    # Cross-hairs at center
    c.setStrokeColor(SAFE_STROKE)
    c.setDash(2, 3)
    c.line(ox + drawn_w / 2, oy, ox + drawn_w / 2, oy + drawn_h)
    c.line(ox, oy + drawn_h / 2, ox + drawn_w, oy + drawn_h / 2)
    c.setDash()

    # Logos that belong to this face
    for logo in logos:
        if logo.target not in face.targets:
            continue
        # position is [0..1] across the face (origin: bottom-left)
        u, v = logo.position
        # configurator stores position as [-1..1] for some products, normalize
        if u < 0 or v < 0 or u > 1 or v > 1:
            u = (u + 1.0) / 2.0
            v = (v + 1.0) / 2.0
        u = max(0.0, min(1.0, u))
        v = max(0.0, min(1.0, v))

        # logo.scale is fraction of face width (configurator convention: ~0.12..1.5)
        scale_frac = max(0.05, min(1.0, logo.scale / 1.5 if logo.scale > 1.0 else logo.scale))
        zone_w = face.width_mm * scale_frac * mm * scale
        zone_h = zone_w  # square placement marker; final art may be non-square

        cx = ox + u * drawn_w
        cy = oy + v * drawn_h

        c.saveState()
        c.translate(cx, cy)
        if logo.rotation:
            c.rotate(math.degrees(logo.rotation))

        img = _decal_image(logo)
        if img is not None:
            try:
                iw, ih = img.getSize()
                aspect = ih / iw if iw else 1.0
                zone_h = zone_w * aspect
            except Exception:
                pass
            c.drawImage(img, -zone_w / 2, -zone_h / 2, zone_w, zone_h,
                        preserveAspectRatio=True, mask='auto')

        # placement frame
        c.setStrokeColor(ZONE_STROKE)
        c.setLineWidth(0.8)
        c.setFillColor(ZONE_FILL)
        c.setFillAlpha(0.08)
        c.rect(-zone_w / 2, -zone_h / 2, zone_w, zone_h, fill=1, stroke=1)
        c.setFillAlpha(1.0)

        # label
        c.setFillColor(ZONE_STROKE)
        c.setFont("Helvetica-Bold", 7)
        label = (logo.filename or logo.id or "decal")[:24]
        c.drawString(-zone_w / 2 + 1.5, -zone_h / 2 - 8,
                     f"{label}  {logo.scale:.2f}× ⟳{math.degrees(logo.rotation):.0f}°")
        c.restoreState()

    c.showPage()


def _thermos_faces(d: ThermosDimensions) -> list[Face]:
    body_circ = math.pi * d.body_diameter_mm
    cap_circ = math.pi * d.cap_diameter_mm
    return [
        Face(
            title=f"Thermos · BODY (cylinder unwrap)",
            width_mm=body_circ,
            height_mm=d.body_height_mm,
            targets=("body",),
            note=f"Wrap around cylinder ⌀{d.body_diameter_mm:.1f} mm",
        ),
        Face(
            title=f"Thermos · CAP TOP",
            width_mm=d.cap_diameter_mm,
            height_mm=d.cap_diameter_mm,
            targets=("capTop", "cap_top"),
            note="Flat disc, top of cap",
        ),
        Face(
            title=f"Thermos · CAP SIDE (unwrap)",
            width_mm=cap_circ,
            height_mm=d.cap_side_height_mm,
            targets=("capSide", "cap_side"),
            note=f"Wrap around cap ⌀{d.cap_diameter_mm:.1f} mm",
        ),
    ]


def _powerbank_faces(d: PowerbankDimensions) -> list[Face]:
    return [
        Face(
            title=f"Powerbank · FRONT",
            width_mm=d.width_mm,
            height_mm=d.height_mm,
            targets=("front", "outer"),
        ),
        Face(
            title=f"Powerbank · BACK",
            width_mm=d.width_mm,
            height_mm=d.height_mm,
            targets=("back", "inner"),
        ),
    ]


def _notebook_faces(d: NotebookDimensions) -> list[Face]:
    cover_w = d.width_mm * 2 + d.spine_thickness_mm  # full wrap: back + spine + front
    return [
        Face(
            title=f"Notebook · COVER (wrap: back · spine · front)",
            width_mm=cover_w,
            height_mm=d.height_mm,
            targets=("front", "back", "cover"),
            note=f"Spine width {d.spine_thickness_mm:.1f} mm. Front lies on the right half.",
        ),
    ]


def _faces(req: UnwrapRequest) -> list[Face]:
    if req.product_kind == "thermos":
        return _thermos_faces(req.thermos or ThermosDimensions())
    if req.product_kind == "powerbank":
        return _powerbank_faces(req.powerbank or PowerbankDimensions())
    return _notebook_faces(req.notebook or NotebookDimensions())


def render_unwrap_pdf(req: UnwrapRequest) -> tuple[bytes, int]:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=PAGE)
    c.setTitle(f"unwrap-{req.order_id}")
    faces = _faces(req)
    for face in faces:
        _draw_face(c, face, req.logos, req.order_id)
    c.save()
    return buf.getvalue(), len(faces)
