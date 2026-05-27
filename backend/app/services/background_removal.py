from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO

import numpy as np
from PIL import Image, ImageFilter, ImageOps, UnidentifiedImageError


DEFAULT_STRENGTH = 0.62
DEFAULT_MAX_EDGE = 2400
MAX_PIXELS = 18_000_000

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class BackgroundRemovalError(ValueError):
    """Raised when an uploaded image cannot be decoded or processed."""


@dataclass(frozen=True)
class BackgroundRemovalResult:
    content: bytes
    width: int
    height: int
    removed_ratio: float
    engine: str = "edge-matte"


def remove_logo_background(
    content: bytes,
    *,
    max_edge: int = DEFAULT_MAX_EDGE,
    strength: float = DEFAULT_STRENGTH,
) -> BackgroundRemovalResult:
    image = _decode_image(content, max_edge=max_edge)
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


def _encode_png(image: Image.Image, *, removed_ratio: float) -> BackgroundRemovalResult:
    out = BytesIO()
    image.save(out, format="PNG", optimize=True)
    width, height = image.size
    return BackgroundRemovalResult(
        content=out.getvalue(),
        width=width,
        height=height,
        removed_ratio=removed_ratio,
    )
