export const LOGO_ACCEPT = 'image/*,application/pdf';
export const LOGO_MAX_BYTES = 25_000_000;
export const LOGO_SOURCE_MAX_BYTES = 25_000_000;

// PDF is uploaded untouched — the backend rasterizes the first page to PNG.
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const CONVERTIBLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']);
const ACCEPTED_EXTENSIONS = /\.(png|jpe?g|webp|pdf)$/i;
const CONVERTIBLE_EXTENSIONS = /\.(png|jpe?g|webp|heic|heif)$/i;

export class LogoUploadPreparationError extends Error {
    constructor(reason) {
        super(reason);
        this.name = 'LogoUploadPreparationError';
        this.reason = reason;
    }
}

const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

const canvasToBlob = (canvas, type, quality) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Image conversion failed'));
    }, type, quality);
});

export const isSupportedLogoFile = (file) => {
    if (!file) return false;
    return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.test(file.name || '');
};

export const isConvertibleLogoFile = (file) => {
    if (!file) return false;
    return (file.type || '').startsWith('image/')
        || CONVERTIBLE_TYPES.has(file.type)
        || CONVERTIBLE_EXTENSIONS.test(file.name || '')
        || isSupportedLogoFile(file); // PDF passes through untouched to the backend
};

export const isLogoFileTooLarge = (file) => Boolean(file && file.size > LOGO_MAX_BYTES);
export const isLogoSourceTooLarge = (file) => Boolean(file && file.size > LOGO_SOURCE_MAX_BYTES);

export async function prepareLogoUploadFile(file) {
    if (!file) return file;
    if (isSupportedLogoFile(file) && !isLogoFileTooLarge(file)) return file;

    let source;
    try {
        source = await readAsDataURL(file);
    } catch {
        throw new LogoUploadPreparationError('read-failed');
    }

    let image;
    try {
        image = await loadImage(source);
    } catch {
        throw new LogoUploadPreparationError('decode-failed');
    }

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) {
        throw new LogoUploadPreparationError('decode-failed');
    }

    const nameBase = (file.name || 'logo').replace(/\.[^.]+$/, '') || 'logo';

    for (const maxSize of [4096, 3200, 2560, 2048, 1600, 1200]) {
        const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
        if (!ctx) {
            throw new LogoUploadPreparationError('conversion-failed');
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, 0, 0, width, height);

        for (const [type, extension, qualities] of [
            ['image/webp', 'webp', [0.95, 0.9, 0.84, 0.78]],
            ['image/jpeg', 'jpg', [0.94, 0.88, 0.82, 0.74, 0.64]],
        ]) {
            for (const quality of qualities) {
                const blob = await canvasToBlob(canvas, type, quality);
                if (blob.type === type && blob.size <= LOGO_MAX_BYTES) {
                    return new File([blob], `${nameBase}.${extension}`, { type });
                }
            }
        }
    }

    throw new LogoUploadPreparationError('too-large-after-compression');
}
