const MAX_TEXTURE_SIZE = 4096;
// Sticker slots print at ~35 mm (≈413 px @ 300 DPI), so a 4096 px texture is
// wildly oversized — it bloats the data URL, the GPU upload and the auto-fit
// request, which is what makes uploads feel slow. 2048 px keeps headroom for
// zoom/crop and 300 DPI print while being ~4× lighter to process.
export const STICKER_TEXTURE_SIZE = 2048;
// Tiny copy sent to the CV auto-fit endpoint: it only needs to locate the
// subject's bounding box, so a small image keeps the upload + inference fast.
export const STICKER_FIT_SIZE = 640;
const TEXTURE_EXPORT_QUALITY = 0.95;
const DEFAULT_RENDER_MAX_DIMENSION = 1600;
const DEFAULT_RENDER_MIME_TYPE = 'image/jpeg';
const DEFAULT_RENDER_QUALITY = 0.84;
const DEFAULT_RENDER_BACKGROUND = '#EBE5CD';

const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

export async function normalizeImageFile(file, maxSize = MAX_TEXTURE_SIZE) {
    const source = await readAsDataURL(file);
    const image = await loadImage(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    if (Math.max(width, height) <= maxSize) {
        return source;
    }

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d', {
        alpha: true,
        colorSpace: 'srgb',
    });
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const sourceType = (file?.type || '').split(';')[0].toLowerCase();
    if (sourceType === 'image/jpeg') {
        return canvas.toDataURL('image/jpeg', TEXTURE_EXPORT_QUALITY);
    }
    if (sourceType === 'image/webp') {
        return canvas.toDataURL('image/webp', TEXTURE_EXPORT_QUALITY);
    }
    return canvas.toDataURL('image/png');
}

// Build a small JPEG Blob from an existing data URL, for the CV auto-fit upload.
// Reuses the already-downscaled texture (cheap decode) instead of re-reading the
// original multi-megabyte file.
export async function makeFitBlob(dataUrl, maxSize = STICKER_FIT_SIZE) {
    try {
        const image = await loadImage(dataUrl);
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) return null;
        const scale = Math.min(1, maxSize / Math.max(width, height));
        const targetWidth = Math.max(1, Math.round(width * scale));
        const targetHeight = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d', { alpha: true });
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
        return blob;
    } catch {
        return null;
    }
}

export function canvasToDataURL(canvas, {
    maxDimension = DEFAULT_RENDER_MAX_DIMENSION,
    mimeType = DEFAULT_RENDER_MIME_TYPE,
    quality = DEFAULT_RENDER_QUALITY,
    background = DEFAULT_RENDER_BACKGROUND,
} = {}) {
    if (!canvas?.width || !canvas?.height) return null;

    const sourceWidth = canvas.width;
    const sourceHeight = canvas.height;
    const scale = Number.isFinite(maxDimension) && maxDimension > 0
        ? Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight))
        : 1;
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
    const shouldRasterize = scale < 1 || Boolean(background) || mimeType !== 'image/png';

    if (!shouldRasterize) return canvas.toDataURL(mimeType, quality);

    const out = document.createElement('canvas');
    out.width = targetWidth;
    out.height = targetHeight;
    const ctx = out.getContext('2d', {
        alpha: mimeType !== 'image/jpeg',
        colorSpace: 'srgb',
    });
    if (!ctx) return canvas.toDataURL('image/png');

    if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, targetWidth, targetHeight);
    } else {
        ctx.clearRect(0, 0, targetWidth, targetHeight);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    return out.toDataURL(mimeType, quality);
}
