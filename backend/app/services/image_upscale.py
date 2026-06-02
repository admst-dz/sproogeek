"""Super-resolution for low-quality sticker artwork.

The 3D sticker pack is printed on A6 at 300 DPI. Artwork that a user uploads at
web resolution is often far below the pixel density needed for a crisp print —
e.g. a 256x256 logo placed in a 40x45 mm slot needs ~470 px to look sharp at
300 DPI. Such images are upscaled with a Real-ESRGAN x4 ONNX model run on
onnxruntime (the same runtime rembg already uses).

The model is loaded lazily and cached; it is downloaded once into a cache dir
from ``REALESRGAN_MODEL_URL`` when ``REALESRGAN_MODEL_PATH`` is not set. The
inference is tiled so memory stays bounded for large sheets. If the model is
unavailable or inference fails, a high-quality Lanczos + unsharp-mask fallback
keeps the feature working (degraded, but never broken).
"""

from __future__ import annotations

import logging
import os
import threading
import urllib.request
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageFilter

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# A source is considered "good enough" when its longest edge already meets this
# fraction of the print target — re-running SR for a marginal gain is wasteful.
UPSCALE_TRIGGER_RATIO = 0.92
# Never enlarge by more than this on the longest edge in a single pass; beyond it
# the artwork is so tiny that even SR cannot invent plausible detail and we cap
# to avoid absurd intermediate buffers.
MAX_UPSCALE_FACTOR = 8.0
# Tile overlap (px) blended away to hide seams between SR tiles.
TILE_PAD = 16

_session = None
_session_lock = threading.Lock()
_session_failed = False
_io_names: tuple[str, str] | None = None


@dataclass(frozen=True)
class UpscaleResult:
    image: Image.Image
    engine: str
    scaled: bool


def _cache_dir() -> str:
    base = os.getenv("REALESRGAN_CACHE_DIR") or os.path.join(
        os.path.expanduser("~"), ".cache", "spruzhyk", "realesrgan"
    )
    os.makedirs(base, exist_ok=True)
    return base


def _ensure_model_file() -> str | None:
    """Return a local path to the ONNX model, downloading it if needed."""
    settings = get_settings()
    if settings.realesrgan_model_path and os.path.exists(settings.realesrgan_model_path):
        return settings.realesrgan_model_path
    url = settings.realesrgan_model_url
    if not url:
        return None
    target = os.path.join(_cache_dir(), os.path.basename(url.split("?")[0]) or "realesrgan.onnx")
    if os.path.exists(target) and os.path.getsize(target) > 0:
        return target
    try:
        logger.info("downloading Real-ESRGAN model from %s", url)
        tmp = f"{target}.part"
        urllib.request.urlretrieve(url, tmp)  # noqa: S310 - operator-configured URL
        os.replace(tmp, target)
        return target
    except Exception:  # pragma: no cover - network/IO failure
        logger.exception("failed to download Real-ESRGAN model, using fallback")
        return None


def _get_session():
    """Lazily build and cache the onnxruntime session for the SR model."""
    global _session, _session_failed, _io_names
    settings = get_settings()
    if not settings.image_upscale_enabled:
        return None
    if _session is not None or _session_failed:
        return _session
    with _session_lock:
        if _session is None and not _session_failed:
            model_path = _ensure_model_file()
            if not model_path:
                _session_failed = True
                return None
            try:
                import onnxruntime as ort

                providers = ort.get_available_providers()
                _session = ort.InferenceSession(model_path, providers=providers)
                _io_names = (_session.get_inputs()[0].name, _session.get_outputs()[0].name)
            except Exception:  # pragma: no cover - model/runtime failure
                logger.exception("Real-ESRGAN session unavailable, using Lanczos fallback")
                _session_failed = True
    return _session


def _run_tile(session, tile: np.ndarray) -> np.ndarray:
    """Run the SR model on a single HxWx3 float32 [0,1] tile -> upscaled tile."""
    inp = np.transpose(tile, (2, 0, 1))[np.newaxis, ...].astype(np.float32)
    in_name, out_name = _io_names  # type: ignore[misc]
    out = session.run([out_name], {in_name: inp})[0]
    out = np.squeeze(out, axis=0)
    out = np.transpose(out, (1, 2, 0))
    return np.clip(out, 0.0, 1.0)


def _model_upscale(image: Image.Image, session) -> Image.Image:
    settings = get_settings()
    tile = max(64, int(settings.image_upscale_tile))
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    h, w = rgb.shape[:2]
    scale = max(1, int(settings.realesrgan_scale))

    out = np.zeros((h * scale, w * scale, 3), dtype=np.float32)
    for y in range(0, h, tile):
        for x in range(0, w, tile):
            y0 = max(0, y - TILE_PAD)
            x0 = max(0, x - TILE_PAD)
            y1 = min(h, y + tile + TILE_PAD)
            x1 = min(w, x + tile + TILE_PAD)
            patch = rgb[y0:y1, x0:x1, :]
            up = _run_tile(session, patch)
            # Crop away the padded border (in upscaled coordinates).
            top = (y - y0) * scale
            left = (x - x0) * scale
            ph = min(tile, h - y) * scale
            pw = min(tile, w - x) * scale
            out[y * scale:y * scale + ph, x * scale:x * scale + pw, :] = (
                up[top:top + ph, left:left + pw, :]
            )
    return Image.fromarray(np.round(out * 255).astype(np.uint8), mode="RGB")


def _lanczos_upscale(image: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """High-quality fallback: Lanczos resize then a gentle unsharp mask."""
    resized = image.convert("RGBA").resize((target_w, target_h), Image.Resampling.LANCZOS)
    rgb = resized.convert("RGB").filter(
        ImageFilter.UnsharpMask(radius=1.4, percent=120, threshold=2)
    )
    out = rgb.convert("RGBA")
    out.putalpha(resized.getchannel("A"))
    return out


def _carry_alpha(source: Image.Image, upscaled_rgb: Image.Image, target_w: int, target_h: int) -> Image.Image:
    """Re-attach the source alpha (Lanczos-scaled) onto a model-upscaled RGB."""
    rgb = upscaled_rgb.convert("RGB").resize((target_w, target_h), Image.Resampling.LANCZOS)
    out = rgb.convert("RGBA")
    if source.mode == "RGBA":
        alpha = source.getchannel("A").resize((target_w, target_h), Image.Resampling.LANCZOS)
        out.putalpha(alpha)
    return out


def upscale_to_min(image: Image.Image, target_w: int, target_h: int) -> UpscaleResult:
    """Ensure ``image`` is at least ``target_w`` x ``target_h`` for crisp print.

    Returns the original image untouched when it already meets the target. Uses
    the Real-ESRGAN ONNX model when available, otherwise a Lanczos+unsharp
    fallback. Alpha is always preserved.
    """
    settings = get_settings()
    target_w = max(1, int(target_w))
    target_h = max(1, int(target_h))
    src_w, src_h = image.size
    if src_w <= 0 or src_h <= 0:
        return UpscaleResult(image=image, engine="none", scaled=False)

    longest_ratio = min(src_w / target_w, src_h / target_h)
    if longest_ratio >= UPSCALE_TRIGGER_RATIO:
        return UpscaleResult(image=image, engine="none", scaled=False)

    if src_w * src_h > settings.image_upscale_max_pixels:
        # Too big to SR safely (and big means it is usually sharp enough already).
        return UpscaleResult(image=_lanczos_upscale(image, target_w, target_h), engine="lanczos", scaled=True)

    session = _get_session()
    if session is not None:
        try:
            # Cap the SR factor: enlarge with the model, then Lanczos-fit to target.
            factor = min(MAX_UPSCALE_FACTOR, max(target_w / src_w, target_h / src_h))
            enlarged = image
            engine = "lanczos"
            # Real-ESRGAN gives a fixed x4 step; run it once when it helps.
            if factor > 1.05:
                enlarged_rgb = _model_upscale(image, session)
                enlarged = _carry_alpha(image, enlarged_rgb, target_w, target_h)
                engine = "real-esrgan"
            else:
                enlarged = _lanczos_upscale(image, target_w, target_h)
            return UpscaleResult(image=enlarged, engine=engine, scaled=True)
        except Exception:  # pragma: no cover - inference failure
            logger.exception("Real-ESRGAN inference failed, using Lanczos fallback")

    return UpscaleResult(image=_lanczos_upscale(image, target_w, target_h), engine="lanczos", scaled=True)
