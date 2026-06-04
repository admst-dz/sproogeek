from __future__ import annotations

import logging
import os
import threading
from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError


logger = logging.getLogger(__name__)

DEFAULT_STRENGTH = 0.62
DEFAULT_MAX_EDGE = 2400
MAX_PIXELS = 18_000_000

# U2Net-family model used by rembg. "isnet-general-use" gives the sharpest,
# cutout-quality mattes; "u2net" is the lighter default. Override via env.
REMBG_MODEL = os.getenv("REMBG_MODEL", "isnet-general-use")

Image.MAX_IMAGE_PIXELS = MAX_PIXELS

_session = None
_session_lock = threading.Lock()
_session_failed = False


class BackgroundRemovalError(ValueError):
    """Raised when an uploaded image cannot be decoded or processed."""


@dataclass(frozen=True)
class BackgroundRemovalResult:
    content: bytes
    width: int
    height: int
    removed_ratio: float
    engine: str = "edge-matte"


def _get_session():
    """Lazily build and cache the rembg session (loads the ONNX model once)."""
    global _session, _session_failed
    if _session is not None or _session_failed:
        return _session
    with _session_lock:
        if _session is None and not _session_failed:
            try:
                from rembg import new_session

                _session = new_session(REMBG_MODEL)
            except Exception:  # pragma: no cover - import/model load failure
                logger.exception("rembg session unavailable, using heuristic fallback")
                _session_failed = True
    return _session


def warm_up() -> bool:
    """Eagerly load (and prime) the rembg model so the first real request is fast.

    Loading the ONNX model takes a few seconds; doing it lazily means the first
    background removal / sticker auto-fit pays that cost. Calling this at startup
    (in a background thread) shifts it off the hot path. Returns True if the
    model session is ready. Safe to call repeatedly — the session is cached.
    """
    session = _get_session()
    if session is None:
        return False
    try:
        # A 1×1 inference forces onnxruntime to allocate and JIT its kernels, so
        # the first user request hits a fully primed model.
        from rembg import remove

        remove(Image.new("RGBA", (1, 1), (0, 0, 0, 0)), session=session, post_process_mask=True)
    except Exception:  # pragma: no cover - priming is best-effort
        logger.debug("rembg warm-up inference skipped", exc_info=True)
    return True


def remove_logo_background(
    content: bytes,
    *,
    max_edge: int = DEFAULT_MAX_EDGE,
    strength: float = DEFAULT_STRENGTH,
    trim: bool = True,
) -> BackgroundRemovalResult:
    image = _decode_image(content, max_edge=max_edge)

    session = _get_session()
    if session is not None:
        try:
            return _remove_with_model(image, session, trim=trim)
        except BackgroundRemovalError:
            raise
        except Exception:  # pragma: no cover - inference failure
            logger.exception("model background removal failed, using heuristic")

    return _remove_with_heuristic(image, strength)


def _remove_with_model(image: Image.Image, session, *, trim: bool = True) -> BackgroundRemovalResult:
    from rembg import remove

    cutout = remove(image, session=session, post_process_mask=True)
    if cutout.mode != "RGBA":
        cutout = cutout.convert("RGBA")

    alpha = np.asarray(cutout)[..., 3].astype(np.float32) / 255.0
    if float(alpha.mean()) < 0.002:
        # Model removed almost everything (e.g. very low contrast): keep original.
        return _encode_png(image, removed_ratio=0.0, engine=REMBG_MODEL)

    removed_ratio = float(1.0 - alpha.mean())
    # The interactive editor needs a mask aligned with the source, so trimming
    # transparent margins is optional (trim=False keeps the original frame).
    result = _trim_transparent(cutout) if trim else cutout
    return _encode_png(result, removed_ratio=removed_ratio, engine=REMBG_MODEL)


def _trim_transparent(image: Image.Image) -> Image.Image:
    """Crop fully transparent margins so the logo footprint is tight."""
    bbox = image.getchannel("A").getbbox()
    if bbox and bbox != (0, 0, image.width, image.height):
        return image.crop(bbox)
    return image


def _remove_with_heuristic(image: Image.Image, strength: float) -> BackgroundRemovalResult:
    rgba = np.array(image, dtype=np.uint8)
    height, width = rgba.shape[:2]
    if not width or not height:
        raise BackgroundRemovalError("Invalid image dimensions")

    palette, palette_weights = _build_background_palette(rgba)
    min_distance, nearest_palette = _distance_to_palette(rgba[..., :3], palette)
    threshold = _background_threshold(rgba, palette, palette_weights, strength)
    candidate = (rgba[..., 3] < 18) | (min_distance <= threshold)
    background = _connected_border_mask(candidate)

    if background.mean() < 0.002:
        return _encode_png(image, removed_ratio=0.0)

    remove_alpha = _soft_remove_alpha(background, min_distance, threshold)
    output = _compose_output(rgba, remove_alpha, palette, nearest_palette, min_distance, threshold)
    output_image = Image.fromarray(output, mode="RGBA")
    return _encode_png(output_image, removed_ratio=float(remove_alpha.mean()))


def _decode_image(content: bytes, *, max_edge: int) -> Image.Image:
    try:
        with Image.open(BytesIO(content)) as opened:
            width, height = opened.size
            if width * height > MAX_PIXELS:
                raise BackgroundRemovalError("Image is too large")
            image = ImageOps.exif_transpose(opened).convert("RGBA")
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError) as exc:
        raise BackgroundRemovalError("Could not decode image") from exc

    width, height = image.size
    edge = max(320, int(max_edge or DEFAULT_MAX_EDGE))
    scale = min(1.0, edge / max(width, height))
    if scale < 1.0:
        size = (max(1, round(width * scale)), max(1, round(height * scale)))
        image = image.resize(size, Image.Resampling.LANCZOS)
    return image


def _build_background_palette(rgba: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    height, width = rgba.shape[:2]
    band = max(1, min(28, round(min(width, height) * 0.035)))
    samples = np.concatenate(
        [
            rgba[:band, :, :].reshape(-1, 4),
            rgba[-band:, :, :].reshape(-1, 4),
            rgba[:, :band, :].reshape(-1, 4),
            rgba[:, -band:, :].reshape(-1, 4),
        ],
        axis=0,
    )
    samples = samples[samples[:, 3] > 20]
    if samples.size == 0:
        return np.array([[255.0, 255.0, 255.0]], dtype=np.float32), np.array([1.0], dtype=np.float32)

    if len(samples) > 16000:
        samples = samples[:: max(1, len(samples) // 16000)]

    rgb = samples[:, :3].astype(np.float32)
    bins = np.floor(rgb / 24).astype(np.int16)
    keys = bins[:, 0] * 121 + bins[:, 1] * 11 + bins[:, 2]
    _, inverse, counts = np.unique(keys, return_inverse=True, return_counts=True)
    order = np.argsort(counts)[::-1]

    palette: list[np.ndarray] = []
    weights: list[float] = []
    for bin_index in order[:18]:
        mask = inverse == bin_index
        if not np.any(mask):
            continue
        color = rgb[mask].mean(axis=0)
        weight = float(counts[bin_index])

        merged = False
        for index, existing in enumerate(palette):
            if float(np.linalg.norm(color - existing)) <= 30:
                total = weights[index] + weight
                palette[index] = (existing * weights[index] + color * weight) / total
                weights[index] = total
                merged = True
                break
        if not merged:
            palette.append(color)
            weights.append(weight)
        if len(palette) >= 8:
            break

    if not palette:
        palette = [rgb.mean(axis=0)]
        weights = [float(len(rgb))]

    weights_array = np.array(weights, dtype=np.float32)
    weights_array = weights_array / max(float(weights_array.sum()), 1.0)
    return np.vstack(palette).astype(np.float32), weights_array


def _distance_to_palette(rgb_uint8: np.ndarray, palette: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rgb = rgb_uint8.astype(np.float32)
    min_sq = np.full(rgb.shape[:2], np.inf, dtype=np.float32)
    nearest = np.zeros(rgb.shape[:2], dtype=np.uint8)
    channel_weights = np.array([0.82, 1.0, 0.72], dtype=np.float32)

    for index, color in enumerate(palette):
        diff = (rgb - color) * channel_weights
        sq = np.sum(diff * diff, axis=2, dtype=np.float32)
        better = sq < min_sq
        min_sq[better] = sq[better]
        nearest[better] = index

    return np.sqrt(min_sq).astype(np.float32), nearest


def _background_threshold(
    rgba: np.ndarray,
    palette: np.ndarray,
    palette_weights: np.ndarray,
    strength: float,
) -> float:
    normalized_strength = min(1.0, max(0.0, float(strength)))
    height, width = rgba.shape[:2]
    band = max(1, min(20, round(min(width, height) * 0.025)))
    edge_rgb = np.concatenate(
        [
            rgba[:band, :, :3].reshape(-1, 3),
            rgba[-band:, :, :3].reshape(-1, 3),
            rgba[:, :band, :3].reshape(-1, 3),
            rgba[:, -band:, :3].reshape(-1, 3),
        ],
        axis=0,
    ).astype(np.float32)
    if len(edge_rgb) > 12000:
        edge_rgb = edge_rgb[:: max(1, len(edge_rgb) // 12000)]

    dominant_color = np.average(palette, axis=0, weights=palette_weights)
    edge_noise = float(np.percentile(np.linalg.norm(edge_rgb - dominant_color, axis=1), 72))
    return float(np.clip(28 + normalized_strength * 82 + edge_noise * 0.16, 42, 118))


def _connected_border_mask(candidate: np.ndarray) -> np.ndarray:
    height, width = candidate.shape
    total = height * width
    flat_candidate = candidate.reshape(-1)
    visited = np.zeros(total, dtype=np.uint8)
    background = np.zeros(total, dtype=np.uint8)
    queue = np.empty(total, dtype=np.uint32)
    head = 0
    tail = 0

    def push(index: int) -> None:
        nonlocal tail
        if visited[index]:
            return
        visited[index] = 1
        if not flat_candidate[index]:
            return
        background[index] = 1
        queue[tail] = index
        tail += 1

    for x in range(width):
        push(x)
        push((height - 1) * width + x)
    for y in range(height):
        base = y * width
        push(base)
        push(base + width - 1)

    while head < tail:
        index = int(queue[head])
        head += 1
        x = index % width
        if x > 0:
            push(index - 1)
        if x < width - 1:
            push(index + 1)
        if index >= width:
            push(index - width)
        if index < total - width:
            push(index + width)

    return background.reshape(height, width).astype(bool)


def _soft_remove_alpha(background: np.ndarray, min_distance: np.ndarray, threshold: float) -> np.ndarray:
    mask = Image.fromarray((background.astype(np.uint8) * 255), mode="L")
    height, width = background.shape
    feather = max(0.75, min(2.6, min(width, height) / 850))
    blurred = mask.filter(ImageFilter.GaussianBlur(feather))
    remove_alpha = np.asarray(blurred, dtype=np.float32) / 255.0
    remove_alpha[background] = 1.0

    expanded = np.asarray(mask.filter(ImageFilter.MaxFilter(5)), dtype=np.uint8) > 0
    band = expanded & ~background
    matte_confidence = 1.0 - np.clip(
        (min_distance - threshold * 0.74) / max(threshold * 0.62, 1.0),
        0.0,
        1.0,
    )
    remove_alpha[band] = np.maximum(remove_alpha[band], matte_confidence[band] * 0.82)
    return np.clip(remove_alpha, 0.0, 1.0)


def _compose_output(
    rgba: np.ndarray,
    remove_alpha: np.ndarray,
    palette: np.ndarray,
    nearest_palette: np.ndarray,
    min_distance: np.ndarray,
    threshold: float,
) -> np.ndarray:
    output = rgba.astype(np.float32)
    original_alpha = output[..., 3] / 255.0
    keep_alpha = np.clip(1.0 - remove_alpha, 0.0, 1.0)
    combined_alpha = np.clip(original_alpha * keep_alpha, 0.0, 1.0)

    edge = (
        (combined_alpha > 0.04)
        & (combined_alpha < 0.98)
        & (min_distance < threshold * 1.75)
    )
    if np.any(edge):
        background_rgb = palette[nearest_palette[edge]].astype(np.float32)
        alpha = np.maximum(combined_alpha[edge][..., None], 0.08)
        corrected = (output[..., :3][edge] - (1.0 - alpha) * background_rgb) / alpha
        output[..., :3][edge] = np.clip(corrected, 0, 255)

    output[..., 3] = np.round(combined_alpha * 255)
    output[output[..., 3] < 3, 3] = 0
    return np.clip(output, 0, 255).astype(np.uint8)


def _encode_png(
    image: Image.Image,
    *,
    removed_ratio: float,
    engine: str = "edge-matte",
) -> BackgroundRemovalResult:
    out = BytesIO()
    image.save(out, format="PNG", optimize=True)
    width, height = image.size
    return BackgroundRemovalResult(
        content=out.getvalue(),
        width=width,
        height=height,
        removed_ratio=removed_ratio,
        engine=engine,
    )
