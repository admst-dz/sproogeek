const clamp01 = (value) => Math.min(1, Math.max(0, Number(value) || 0));

const toHexByte = (value) => Math.round(clamp01(value) * 255).toString(16).padStart(2, '0');

export const hexToCmyk = (hex) => {
    const normalized = String(hex || '').replace('#', '').trim();
    const value = normalized.length === 3
        ? normalized.split('').map((char) => `${char}${char}`).join('')
        : normalized;

    if (!/^[0-9a-fA-F]{6}$/.test(value)) {
        return { c: 0, m: 0, y: 0, k: 0 };
    }

    const r = parseInt(value.slice(0, 2), 16) / 255;
    const g = parseInt(value.slice(2, 4), 16) / 255;
    const b = parseInt(value.slice(4, 6), 16) / 255;
    const k = 1 - Math.max(r, g, b);

    if (k >= 1) {
        return { c: 0, m: 0, y: 0, k: 100 };
    }

    return {
        c: Math.round(((1 - r - k) / (1 - k)) * 100),
        m: Math.round(((1 - g - k) / (1 - k)) * 100),
        y: Math.round(((1 - b - k) / (1 - k)) * 100),
        k: Math.round(k * 100),
    };
};

export const cmykToPreviewHex = (cmyk) => {
    const c = clamp01((cmyk?.c ?? 0) / 100);
    const m = clamp01((cmyk?.m ?? 0) / 100);
    const y = clamp01((cmyk?.y ?? 0) / 100);
    const k = clamp01((cmyk?.k ?? 0) / 100);

    const r = (1 - c) * (1 - k);
    const g = (1 - m) * (1 - k);
    const b = (1 - y) * (1 - k);

    return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
};

export const hexToCmykPreviewHex = (hex) => cmykToPreviewHex(hexToCmyk(hex));

const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

export const imageDataUrlToCmykPreviewDataUrl = async (src) => {
    if (typeof document === 'undefined' || !src) return src;

    const image = await loadImage(src);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return src;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {
        alpha: true,
        colorSpace: 'srgb',
    });
    if (!ctx) return src;

    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const { data } = imageData;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        const k = 1 - Math.max(r, g, b);

        if (k >= 1) {
            data[i] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
            continue;
        }

        const c = (1 - r - k) / (1 - k);
        const m = (1 - g - k) / (1 - k);
        const y = (1 - b - k) / (1 - k);
        data[i] = Math.round(255 * (1 - c) * (1 - k));
        data[i + 1] = Math.round(255 * (1 - m) * (1 - k));
        data[i + 2] = Math.round(255 * (1 - y) * (1 - k));
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
};
