"""Build the print-ready PDF for the DTF print canvas.

The PDF has two pages that share the same geometry:

* page 1 — the full-colour artwork sheet (raster);
* page 2 — the white underbase, produced as a *vector* silhouette traced from
  the artwork's alpha channel (akin to a CorelDRAW trace). The silhouette is
  slightly choked inwards so the white ink stays under the colour.

Both input rasters are RGB TIFFs rendered by the browser at the same pixel
dimensions; ``width_mm``/``height_mm`` describe the physical sheet so the pages
are sized in real-world units.
"""

from __future__ import annotations

import io
import logging
import os
from collections import defaultdict

import numpy as np
from PIL import Image, ImageCms

from app.core.config import get_settings

logger = logging.getLogger(__name__)

MM_PER_INCH = 25.4
PT_PER_MM = 72.0 / MM_PER_INCH
# Cap the traced mask resolution; the contour walk is O(boundary cells) but a
# huge roll would still produce too many nodes. The sheet is downsampled to fit.
TRACE_MAX_EDGE_PX = 4200
DEFAULT_CHOKE_MM = 0.3
# The mask TIFF is black artwork on a white sheet. Treat low but visible alpha
# coverage as underbase, then choke it back; this keeps thin details alive.
MASK_COVERAGE_THRESHOLD = 12
MASK_DOWNSAMPLE_THRESHOLD = 72
TRACE_SIMPLIFY_EPSILON = 0.35
TRACE_MIN_AREA_PX = 1.5

# Marching-squares segment table. Case index = TL*8 + TR*4 + BR*2 + BL, where
# the four corners of a cell are sampled clockwise from the top-left. Each entry
# lists the cell edges ("T"op/"R"ight/"B"ottom/"L"eft) a contour segment joins.
_SEGMENTS = {
    1: [("L", "B")],
    2: [("B", "R")],
    3: [("L", "R")],
    4: [("T", "R")],
    5: [("L", "T"), ("B", "R")],
    6: [("T", "B")],
    7: [("L", "T")],
    8: [("T", "L")],
    9: [("T", "B")],
    10: [("T", "R"), ("B", "L")],
    11: [("T", "R")],
    12: [("L", "R")],
    13: [("B", "R")],
    14: [("B", "L")],
}


def _tiff_to_array(content: bytes) -> tuple[np.ndarray, Image.Image]:
    """Decode a raster to an ``L`` numpy array plus the original RGB image."""
    previous_limit = Image.MAX_IMAGE_PIXELS
    try:
        Image.MAX_IMAGE_PIXELS = None
        with Image.open(io.BytesIO(content)) as img:
            rgb = img.convert("RGB")
            gray = np.asarray(rgb.convert("L"))
        return gray, rgb
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit


def _to_cmyk_image(rgb: Image.Image) -> Image.Image | None:
    """Convert an RGB artwork image to CMYK for print.

    Uses the configured CMYK ICC profile when available, otherwise PIL's naive
    conversion. Returns ``None`` for sheets too large to transcode safely, so
    the caller can fall back to embedding RGB."""
    settings = get_settings()
    width, height = rgb.size
    if width * height > settings.print_canvas_cmyk_max_pixels:
        logger.warning("print canvas too large for CMYK conversion: %sx%s", width, height)
        return None
    try:
        profile_path = settings.cmyk_icc_profile
        if profile_path and os.path.exists(profile_path):
            return ImageCms.profileToProfile(
                rgb,
                ImageCms.createProfile("sRGB"),
                ImageCms.getOpenProfile(profile_path),
                outputMode="CMYK",
            )
        return rgb.convert("CMYK")
    except Exception:  # noqa: BLE001 - never let colour conversion break export
        logger.exception("CMYK conversion failed, falling back to RGB embed")
        return None


def _binary_mask(gray: np.ndarray) -> np.ndarray:
    """Inside-the-artwork mask.

    The browser paints a black silhouette on white, so darkness is equivalent
    to alpha coverage. A low threshold preserves hairlines and antialiased
    edges; the later choke step reins the base back in for print."""
    coverage = 255 - gray.astype(np.int16)
    return coverage >= MASK_COVERAGE_THRESHOLD


def _downsample(mask: np.ndarray) -> tuple[np.ndarray, float]:
    """Shrink the mask so its longest edge is <= TRACE_MAX_EDGE_PX.

    Returns the resized boolean mask and the scale factor that maps a resized
    pixel back to an original pixel (>= 1.0)."""
    rows, cols = mask.shape
    longest = max(rows, cols)
    if longest <= TRACE_MAX_EDGE_PX:
        return mask, 1.0
    scale = longest / TRACE_MAX_EDGE_PX
    new_w = max(1, round(cols / scale))
    new_h = max(1, round(rows / scale))
    resampling = getattr(Image, "Resampling", Image).LANCZOS
    resized = Image.fromarray((mask * 255).astype(np.uint8)).resize(
        (new_w, new_h), resampling
    )
    return np.asarray(resized) >= MASK_DOWNSAMPLE_THRESHOLD, scale


def _erode(mask: np.ndarray, iterations: int) -> np.ndarray:
    """Choke the mask inwards by ``iterations`` pixels (8-neighbour erosion)."""
    if iterations <= 0:
        return mask
    out = mask
    for _ in range(iterations):
        padded = np.pad(out, 1, mode="constant", constant_values=False)
        out = (
            padded[1:-1, 1:-1]
            & padded[:-2, :-2]
            & padded[:-2, 1:-1]
            & padded[:-2, 2:]
            & padded[1:-1, :-2]
            & padded[1:-1, 2:]
            & padded[2:, :-2]
            & padded[2:, 1:-1]
            & padded[2:, 2:]
        )
    return out


def _edge_point(edge: str, r: int, c: int) -> tuple[float, float]:
    if edge == "T":
        return (c + 0.5, float(r))
    if edge == "R":
        return (c + 1.0, r + 0.5)
    if edge == "B":
        return (c + 0.5, r + 1.0)
    return (float(c), r + 0.5)  # "L"


def _trace_contours(mask: np.ndarray) -> list[list[tuple[float, float]]]:
    """Marching squares → closed contour loops (in mask pixel coordinates)."""
    v = mask.astype(np.uint8)
    tl, tr = v[:-1, :-1], v[:-1, 1:]
    br, bl = v[1:, 1:], v[1:, :-1]
    case = tl * 8 + tr * 4 + br * 2 + bl
    ys, xs = np.nonzero((case > 0) & (case < 15))

    segments: list[tuple[tuple[float, float], tuple[float, float]]] = []
    for r, c in zip(ys.tolist(), xs.tolist()):
        for e1, e2 in _SEGMENTS[int(case[r, c])]:
            segments.append((_edge_point(e1, r, c), _edge_point(e2, r, c)))
    if not segments:
        return []

    def key(point: tuple[float, float]) -> tuple[int, int]:
        return (round(point[0] * 2), round(point[1] * 2))

    coords: dict[tuple[int, int], tuple[float, float]] = {}
    adj: dict[tuple[int, int], list[tuple[tuple[int, int], int]]] = defaultdict(list)
    for idx, (a, b) in enumerate(segments):
        ka, kb = key(a), key(b)
        coords[ka], coords[kb] = a, b
        adj[ka].append((kb, idx))
        adj[kb].append((ka, idx))

    used: set[int] = set()
    loops: list[list[tuple[float, float]]] = []
    for start_key in list(adj.keys()):
        for next_key, edge_idx in adj[start_key]:
            if edge_idx in used:
                continue
            loop = [coords[start_key]]
            cur, edge, nxt = start_key, edge_idx, next_key
            while edge not in used:
                used.add(edge)
                loop.append(coords[nxt])
                cur = nxt
                step = next(((nn, ei) for nn, ei in adj[cur] if ei not in used), None)
                if step is None:
                    break
                nxt, edge = step
            if len(loop) >= 3:
                loops.append(loop)
    return loops


def _simplify(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    """Douglas–Peucker simplification of an open polyline."""
    if len(points) < 3:
        return points
    start, end = points[0], points[-1]
    dx, dy = end[0] - start[0], end[1] - start[1]
    norm = (dx * dx + dy * dy) ** 0.5 or 1.0
    index, max_dist = 0, 0.0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        dist = abs(dy * (px - start[0]) - dx * (py - start[1])) / norm
        if dist > max_dist:
            index, max_dist = i, dist
    if max_dist > epsilon:
        left = _simplify(points[: index + 1], epsilon)
        right = _simplify(points[index:], epsilon)
        return left[:-1] + right
    return [start, end]


def _simplify_closed(points: list[tuple[float, float]], epsilon: float) -> list[tuple[float, float]]:
    """Douglas–Peucker for a closed loop.

    Running plain DP on a closed ring collapses it (its start/end baseline has
    ~zero length), so the ring is split at the vertex farthest from the first
    point into two open chains, each simplified independently."""
    pts = points[:-1] if len(points) > 1 and points[0] == points[-1] else points[:]
    if len(pts) < 4:
        return pts
    ox, oy = pts[0]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - ox) ** 2 + (pts[i][1] - oy) ** 2)
    first = _simplify(pts[: far + 1], epsilon)
    second = _simplify(pts[far:] + [pts[0]], epsilon)
    return first[:-1] + second[:-1]


def _signed_area(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0
    area = 0.0
    prev_x, prev_y = points[-1]
    for x, y in points:
        area += prev_x * y - x * prev_y
        prev_x, prev_y = x, y
    return area * 0.5


def _placement_number(item: dict, key: str, default: float = 0.0) -> float:
    try:
        return float(item.get(key, default))
    except (TypeError, ValueError):
        return default


def _place_source_pdfs(page, fitz, source_pdfs: list[bytes], metadata: dict | None) -> None:
    placements = metadata.get("placements") if isinstance(metadata, dict) else None
    if not isinstance(placements, list) or not source_pdfs:
        return

    source_docs: dict[int, object] = {}
    try:
        for item in placements:
            if not isinstance(item, dict):
                continue
            index = item.get("source_pdf_index")
            if not isinstance(index, int) or index < 0 or index >= len(source_pdfs):
                continue
            x = _placement_number(item, "x_mm") * PT_PER_MM
            y = _placement_number(item, "y_mm") * PT_PER_MM
            w = _placement_number(item, "width_mm") * PT_PER_MM
            h = _placement_number(item, "height_mm") * PT_PER_MM
            if w <= 0 or h <= 0:
                continue
            if index not in source_docs:
                source_docs[index] = fitz.open(stream=source_pdfs[index], filetype="pdf")
            page.show_pdf_page(
                fitz.Rect(x, y, x + w, y + h),
                source_docs[index],
                0,
                keep_proportion=False,
                overlay=True,
                rotate=90 if item.get("rotated") else 0,
            )
    except Exception:  # noqa: BLE001 - vector preservation must not break export
        logger.exception("failed to place source PDF elements on print canvas")
    finally:
        for doc in source_docs.values():
            doc.close()


def build_print_pdf(
    color_tiff: bytes,
    mask_tiff: bytes,
    width_mm: float,
    height_mm: float,
    choke_mm: float = DEFAULT_CHOKE_MM,
    source_pdfs: list[bytes] | None = None,
    metadata: dict | None = None,
) -> bytes:
    """Return a two-page print PDF (artwork + traced underbase) as bytes."""
    import fitz  # PyMuPDF (imported lazily, mirrors files.py)

    width_mm = max(1.0, float(width_mm))
    height_mm = max(1.0, float(height_mm))
    page_w = width_mm * PT_PER_MM
    page_h = height_mm * PT_PER_MM

    _, color_rgb = _tiff_to_array(color_tiff)
    gray, _ = _tiff_to_array(mask_tiff)

    # --- trace the underbase silhouette ---
    full_mask = _binary_mask(gray)
    mask, _ = _downsample(full_mask)
    px_per_mm = mask.shape[1] / width_mm if width_mm else 1.0
    choke_px = int(round(max(0.0, choke_mm) * px_per_mm))
    mask = _erode(mask, min(choke_px, 6))
    loops = [
        loop for loop in _trace_contours(mask)
        if abs(_signed_area(loop)) >= TRACE_MIN_AREA_PX
    ]
    loops.sort(key=lambda loop: abs(_signed_area(loop)), reverse=True)

    rows, cols = mask.shape
    sx = page_w / cols if cols else 1.0
    sy = page_h / rows if rows else 1.0

    doc = fitz.open()

    # Page 1 — full-colour artwork, embedded as CMYK for print.
    color_page = doc.new_page(width=page_w, height=page_h)
    color_rect = fitz.Rect(0, 0, page_w, page_h)
    cmyk_image = _to_cmyk_image(color_rgb)
    if cmyk_image is not None:
        cmyk_pix = fitz.Pixmap(fitz.csCMYK, cmyk_image.width, cmyk_image.height, cmyk_image.tobytes(), False)
        color_page.insert_image(color_rect, pixmap=cmyk_pix)
    else:
        color_buf = io.BytesIO()
        color_rgb.save(color_buf, format="PNG")
        color_page.insert_image(color_rect, stream=color_buf.getvalue())
    _place_source_pdfs(color_page, fitz, source_pdfs or [], metadata)

    # Page 2 — vector underbase trace.
    base_page = doc.new_page(width=page_w, height=page_h)
    if loops:
        shape = base_page.new_shape()
        for loop in loops:
            simplified = _simplify_closed(loop, epsilon=TRACE_SIMPLIFY_EPSILON)
            if len(simplified) < 3:
                continue
            pts = [fitz.Point(x * sx, y * sy) for x, y in simplified]
            shape.draw_polyline(pts + [pts[0]])
        # CMYK black (K=100%) keeps the whole document in the CMYK colour space.
        shape.finish(color=(0, 0, 0, 1), fill=(0, 0, 0, 1), width=0, even_odd=True, closePath=False)
        shape.commit()
    else:
        logger.warning("print canvas underbase trace produced no contours")

    out = io.BytesIO()
    doc.save(out, deflate=True, garbage=3)
    doc.close()
    return out.getvalue()
