"""Computer-vision auto-fit for sticker artwork.

When a user drops an image into a sticker slot we want the *subject* of the
image — not its bounding canvas, which is often mostly empty or background — to
fill the slot nicely. We reuse the rembg salient-object matte (already loaded
for background removal) to find the subject's bounding box, then derive a
``suggested_scale`` so the subject maps to ~90% of the slot. The user can still
freely re-scale and reposition afterwards; this only sets a sensible default.

If the matte is unavailable (model missing / low contrast), we fall back to a
trimmed-alpha / full-frame bounding box so a reasonable default still comes out.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.services.background_removal import _get_session  # reuse cached rembg session

logger = logging.getLogger(__name__)

MAX_EDGE = 1024  # matte detection resolution; the slot is small, so this is plenty
# Leave a little breathing room inside the slot rather than touching the edges.
TARGET_FILL = 0.9
SCALE_MIN = 0.22
SCALE_MAX = 3.0


class StickerFitError(ValueError):
    """Raised when the uploaded image cannot be decoded."""


@dataclass(frozen=True)
class StickerFit:
    width: int
    height: int
    # Subject bounding box, normalized to [0,1] in (x, y, w, h).
    object_bbox: tuple[float, float, float, float]
    # Subject longest side / image longest side, in [0,1].
    object_fraction: float
    suggested_scale: float
    engine: str


def _decode(content: bytes) -> Image.Image:
    try:
        with Image.open(BytesIO(content)) as opened:
            image = ImageOps.exif_transpose(opened).convert("RGBA")
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as exc:
        raise StickerFitError("Could not decode image") from exc
    w, h = image.size
    scale = min(1.0, MAX_EDGE / max(w, h)) if max(w, h) else 1.0
    if scale < 1.0:
        image = image.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.Resampling.LANCZOS)
    return image


def _alpha_bbox(alpha: np.ndarray, threshold: int = 16) -> tuple[int, int, int, int] | None:
    mask = alpha >= threshold
    if not mask.any():
        return None
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def _matte_bbox(image: Image.Image) -> tuple[tuple[int, int, int, int] | None, str]:
    session = _get_session()
    if session is not None:
        try:
            from rembg import remove

            cutout = remove(image, session=session, post_process_mask=True)
            alpha = np.asarray(cutout.convert("RGBA"))[..., 3]
            if float(alpha.mean()) >= 0.5:  # mean on 0..255 scale; >~0.2% coverage
                box = _alpha_bbox(alpha)
                if box is not None:
                    return box, "rembg"
        except Exception:  # pragma: no cover - inference failure
            logger.exception("rembg matte failed during sticker fit, using alpha/full-frame bbox")

    # Fallback: existing transparency, else the whole frame.
    if image.mode == "RGBA":
        box = _alpha_bbox(np.asarray(image)[..., 3])
        if box is not None and box != (0, 0, image.width, image.height):
            return box, "alpha"
    return (0, 0, image.width, image.height), "full-frame"


def analyze(content: bytes) -> StickerFit:
    image = _decode(content)
    w, h = image.size
    box, engine = _matte_bbox(image)
    x0, y0, x1, y1 = box
    bw, bh = max(1, x1 - x0), max(1, y1 - y0)

    longest_image = max(w, h)
    longest_object = max(bw, bh)
    object_fraction = float(longest_object) / float(longest_image) if longest_image else 1.0
    object_fraction = min(1.0, max(0.05, object_fraction))

    suggested_scale = float(np.clip(TARGET_FILL / object_fraction, SCALE_MIN, SCALE_MAX))

    return StickerFit(
        width=w,
        height=h,
        object_bbox=(x0 / w, y0 / h, bw / w, bh / h),
        object_fraction=object_fraction,
        suggested_scale=round(suggested_scale, 3),
        engine=engine,
    )
