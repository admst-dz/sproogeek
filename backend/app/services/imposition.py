"""Imposition / spread-sheet layout planner (SRA3 stub).

Real implementation will lay out actual print PDFs into a SRA3 sheet
(320×450 mm) accounting for bleed, gutter, and step-and-repeat. The
stub here computes the layout *plan* (rows/cols/sheets) and embeds
a tracking QR + Code128 barcode placeholder so production can scan
sheets in/out of the press.
"""
from __future__ import annotations

import base64
import io
from dataclasses import dataclass, asdict

import qrcode

from app.models.order import Order


SRA3_W_MM = 320.0
SRA3_H_MM = 450.0
BLEED_MM = 3.0
GUTTER_MM = 5.0


@dataclass
class ItemDimensions:
    label: str
    w_mm: float
    h_mm: float


_FORMAT_SIZES = {
    "A5": ItemDimensions("A5 (148×210)", 148.0, 210.0),
    "A6": ItemDimensions("A6 (105×148)", 105.0, 148.0),
    "A4": ItemDimensions("A4 (210×297)", 210.0, 297.0),
}


def _grid(item_w: float, item_h: float, sheet_w: float, sheet_h: float) -> tuple[int, int]:
    """Best-fit step-and-repeat grid for one rotation."""
    cols = max(0, int((sheet_w + GUTTER_MM) // (item_w + GUTTER_MM)))
    rows = max(0, int((sheet_h + GUTTER_MM) // (item_h + GUTTER_MM)))
    return cols, rows


def plan_for_order(order: Order) -> dict:
    cfg = order.configuration or {}
    pc = cfg.get("productConfig") or cfg
    fmt = (pc.get("format") or "A5").upper()
    item = _FORMAT_SIZES.get(fmt) or _FORMAT_SIZES["A5"]
    qty = max(1, int(order.quantity or 1))

    # Try both orientations on SRA3, pick whichever fits more pieces per sheet
    portrait = _grid(item.w_mm + 2 * BLEED_MM, item.h_mm + 2 * BLEED_MM, SRA3_W_MM, SRA3_H_MM)
    landscape = _grid(item.h_mm + 2 * BLEED_MM, item.w_mm + 2 * BLEED_MM, SRA3_W_MM, SRA3_H_MM)
    cols_p, rows_p = portrait
    cols_l, rows_l = landscape
    per_sheet_p = cols_p * rows_p
    per_sheet_l = cols_l * rows_l
    if per_sheet_l > per_sheet_p:
        per_sheet, cols, rows, orient = per_sheet_l, cols_l, rows_l, "landscape"
    else:
        per_sheet, cols, rows, orient = per_sheet_p, cols_p, rows_p, "portrait"

    if per_sheet == 0:
        return {
            "ok": False,
            "reason": f"Item {fmt} doesn't fit on SRA3 even rotated",
        }

    sheets = -(-qty // per_sheet)  # ceil
    return {
        "ok": True,
        "order_id": str(order.id),
        "format": fmt,
        "item": asdict(item),
        "sheet": {"name": "SRA3", "w_mm": SRA3_W_MM, "h_mm": SRA3_H_MM},
        "layout": {
            "orientation": orient,
            "cols": cols,
            "rows": rows,
            "items_per_sheet": per_sheet,
            "bleed_mm": BLEED_MM,
            "gutter_mm": GUTTER_MM,
        },
        "totals": {
            "ordered_qty": qty,
            "sheets_required": sheets,
            "waste_per_sheet": (per_sheet * sheets) - qty,
        },
    }


def qr_png_bytes(value: str, *, box_size: int = 8, border: int = 2) -> bytes:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=box_size,
        border=border,
    )
    qr.add_data(value)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def qr_png_base64(value: str) -> str:
    return base64.b64encode(qr_png_bytes(value)).decode("ascii")
