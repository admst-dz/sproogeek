"""Build a printable unwrap PDF for a given product configuration.

The PDF is a technical layout in millimeters: each page shows one face of the
unwrapped product (e.g. cylindrical body, cap top, cover) with the printable
contour and user artwork placement. Print shop staff use this to register the
artwork on the printer/transfer station.
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
    outline: str = "rect"
    coordinate_space: str = "signed_unit"
    scale_basis_mm: float | None = None
    panel_width_mm: float | None = None
    spine_width_mm: float = 0.0


def _decal_image(logo: LogoPlacement) -> ImageReader | None:
    if logo.decal_data_url and logo.decal_data_url.startswith("data:"):
        try:
            head, payload = logo.decal_data_url.split(",", 1)
            raw = base64.b64decode(payload)
            return ImageReader(io.BytesIO(raw))
        except Exception:
            return None
    return None


def _clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def _signed_to_uv(value: float, half_range: float) -> float:
    return _clamp(0.5 + value / (2.0 * max(half_range, 0.0001)))


def _logo_xy_mm(face: Face, logo: LogoPlacement) -> tuple[float, float]:
    x, y = logo.position

    if face.coordinate_space == "thermos_body":
        return (
            _signed_to_uv(x, 0.35) * face.width_mm,
            _signed_to_uv(y, 2.5) * face.height_mm,
        )

    if face.coordinate_space == "thermos_cap_top":
        return (
            _signed_to_uv(x, 0.35) * face.width_mm,
            _signed_to_uv(y, 0.35) * face.height_mm,
        )

    if face.coordinate_space == "thermos_cap_side":
        return (
            _signed_to_uv(x, 0.35) * face.width_mm,
            _signed_to_uv(y, 1.0) * face.height_mm,
        )

    if face.coordinate_space == "powerbank":
        is_outer = (logo.target or logo.side or "").lower() in {"outer", "back", "inner"}
        u = _signed_to_uv(-x if is_outer else x, 1.0)
        return (u * face.width_mm, _signed_to_uv(y, 1.0) * face.height_mm)

    if face.coordinate_space == "notebook_cover" and face.panel_width_mm:
        side = (logo.side or logo.target or "front").lower()
        panel_u = _signed_to_uv(x, 1.0)
        y_mm = _signed_to_uv(y, 1.0) * face.height_mm
        if side == "back":
            return (panel_u * face.panel_width_mm, y_mm)
        if side == "front":
            return (face.panel_width_mm + face.spine_width_mm + panel_u * face.panel_width_mm, y_mm)
        return (_signed_to_uv(x, 1.0) * face.width_mm, y_mm)

    return (_signed_to_uv(x, 1.0) * face.width_mm, _signed_to_uv(y, 1.0) * face.height_mm)


def _image_aspect(img: ImageReader | None) -> float:
    if img is None:
        return 1.0
    try:
        iw, ih = img.getSize()
    except Exception:
        return 1.0
    if not iw or not ih:
        return 1.0
    return ih / iw


def _decal_size_mm(face: Face, logo: LogoPlacement, img: ImageReader | None) -> tuple[float, float]:
    basis = face.scale_basis_mm or min(face.width_mm, face.height_mm)
    width_mm = max(4.0, logo.scale * basis)
    height_mm = width_mm * _image_aspect(img)

    max_w = face.width_mm * 0.98
    max_h = face.height_mm * 0.98
    fit = min(1.0, max_w / max(width_mm, 0.0001), max_h / max(height_mm, 0.0001))
    return (width_mm * fit, height_mm * fit)


def _path_for_face(c: canvas.Canvas, face: Face, ox: float, oy: float, drawn_w: float, drawn_h: float):
    path = c.beginPath()
    if face.outline == "circle":
        path.circle(ox + drawn_w / 2, oy + drawn_h / 2, min(drawn_w, drawn_h) / 2)
    else:
        path.rect(ox, oy, drawn_w, drawn_h)
    return path


def _draw_face_guides(c: canvas.Canvas, face: Face, ox: float, oy: float, drawn_w: float, drawn_h: float) -> None:
    c.setStrokeColor(TEXT)
    c.setLineWidth(0.6)
    if face.outline == "circle":
        r = min(drawn_w, drawn_h) / 2
        cx = ox + drawn_w / 2
        cy = oy + drawn_h / 2
        c.circle(cx, cy, r, fill=0, stroke=1)

        c.setStrokeColor(SAFE_STROKE)
        c.setDash(2, 3)
        c.line(cx, cy - r, cx, cy + r)
        c.line(cx - r, cy, cx + r, cy)
        c.setDash()
        return

    c.rect(ox, oy, drawn_w, drawn_h, fill=0, stroke=1)

    c.setStrokeColor(SAFE_STROKE)
    c.setDash(2, 3)
    c.line(ox + drawn_w / 2, oy, ox + drawn_w / 2, oy + drawn_h)
    c.line(ox, oy + drawn_h / 2, ox + drawn_w, oy + drawn_h / 2)
    c.setDash()


def _draw_face(c: canvas.Canvas, face: Face, logos: List[LogoPlacement], order_id: str) -> None:
    pw, ph = PAGE
    c.setFillColor(white)
    c.rect(0, 0, pw, ph, fill=1, stroke=0)

    avail_w = pw - 2 * MARGIN_MM * mm
    avail_h = ph - 2 * MARGIN_MM * mm - 30 * mm  # leave room for header
    page_scale = min(1.0, avail_w / (face.width_mm * mm), avail_h / (face.height_mm * mm))

    drawn_w = face.width_mm * mm * page_scale
    drawn_h = face.height_mm * mm * page_scale
    ox = (pw - drawn_w) / 2
    oy = MARGIN_MM * mm

    # Header
    c.setFillColor(TEXT)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(MARGIN_MM * mm, ph - MARGIN_MM * mm, f"{face.title}")
    c.setFont("Helvetica", 9)
    c.drawString(MARGIN_MM * mm, ph - MARGIN_MM * mm - 14,
                 f"order {order_id}  ·  {face.width_mm:.1f} × {face.height_mm:.1f} mm  ·  scale 1:{1/page_scale:.2f}")
    if face.note:
        c.drawString(MARGIN_MM * mm, ph - MARGIN_MM * mm - 28, face.note)

    # Draw artwork clipped to the physical printable contour. The contour and
    # guide marks are redrawn after artwork so opaque decals cannot hide them.
    c.saveState()
    c.clipPath(_path_for_face(c, face, ox, oy, drawn_w, drawn_h), stroke=0)

    face_logos = [logo for logo in logos if logo.target in face.targets]

    for logo in face_logos:
        if logo.mode != "wrap":
            continue
        img = _decal_image(logo)
        if img is not None:
            c.drawImage(img, ox, oy, drawn_w, drawn_h, preserveAspectRatio=False, mask='auto')

    for logo in face_logos:
        if logo.mode == "wrap":
            continue
        img = _decal_image(logo)
        x_mm, y_mm = _logo_xy_mm(face, logo)
        zone_w_mm, zone_h_mm = _decal_size_mm(face, logo, img)
        zone_w = zone_w_mm * mm * page_scale
        zone_h = zone_h_mm * mm * page_scale

        cx = ox + x_mm * mm * page_scale
        cy = oy + y_mm * mm * page_scale

        c.saveState()
        c.translate(cx, cy)
        if logo.rotation:
            c.rotate(math.degrees(logo.rotation))

        if img is not None:
            c.drawImage(img, -zone_w / 2, -zone_h / 2, zone_w, zone_h,
                        preserveAspectRatio=False, mask='auto')

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

    c.restoreState()

    for logo in face_logos:
        if logo.mode != "wrap":
            continue
        c.setStrokeColor(ZONE_STROKE)
        c.setLineWidth(0.8)
        c.rect(ox, oy, drawn_w, drawn_h, fill=0, stroke=1)
        c.setFillColor(ZONE_STROKE)
        c.setFont("Helvetica-Bold", 7)
        label = (logo.filename or logo.id or "wrap")[:24]
        c.drawString(ox + 4, max(2 * mm, oy - 10), f"{label}  full wrap")

    _draw_face_guides(c, face, ox, oy, drawn_w, drawn_h)

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
            coordinate_space="thermos_body",
            scale_basis_mm=d.body_diameter_mm,
        ),
        Face(
            title=f"Thermos · CAP TOP",
            width_mm=d.cap_diameter_mm,
            height_mm=d.cap_diameter_mm,
            targets=("capTop", "cap_top"),
            note="Flat disc, top of cap",
            outline="circle",
            coordinate_space="thermos_cap_top",
            scale_basis_mm=d.cap_diameter_mm,
        ),
        Face(
            title=f"Thermos · CAP SIDE (unwrap)",
            width_mm=cap_circ,
            height_mm=d.cap_side_height_mm,
            targets=("capSide", "cap_side"),
            note=f"Wrap around cap ⌀{d.cap_diameter_mm:.1f} mm",
            coordinate_space="thermos_cap_side",
            scale_basis_mm=d.cap_diameter_mm,
        ),
    ]


def _powerbank_faces(d: PowerbankDimensions) -> list[Face]:
    return [
        Face(
            title=f"Powerbank · OUTER SIDE",
            width_mm=d.width_mm,
            height_mm=d.height_mm,
            targets=("outer", "back", "inner"),
            coordinate_space="powerbank",
            scale_basis_mm=min(d.width_mm, d.height_mm) * 0.7,
        ),
        Face(
            title=f"Powerbank · CHARGING SIDE",
            width_mm=d.width_mm,
            height_mm=d.height_mm,
            targets=("charging", "front"),
            note="Side with charging details",
            coordinate_space="powerbank",
            scale_basis_mm=min(d.width_mm, d.height_mm) * 0.7,
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
            coordinate_space="notebook_cover",
            scale_basis_mm=d.width_mm * 0.5,
            panel_width_mm=d.width_mm,
            spine_width_mm=d.spine_thickness_mm,
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
