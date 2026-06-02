import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import { mediaApi, printCanvasApi } from '../../api';
import { useConfigurator } from '../../store';

const SHEET_WIDTH_OPTIONS_MM = [580, 280];
const DEFAULT_SHEET_WIDTH_MM = 580;
const EMPTY_SHEET_HEIGHT_MM = 360;
const DEFAULT_LOGO_WIDTH_MM = 72;
const MIN_LOGO_WIDTH_MM = 10;
const MAX_LOGO_WIDTH_MM = 560;
const DEFAULT_IMAGE_DPI = 72;
const LOGO_FILE_ACCEPT = 'image/*,.tif,.tiff,application/pdf,.pdf';
const MAX_IMAGE_EDGE = 1400;
const LOGO_GAP_OPTIONS_MM = [3, 5];
const DEFAULT_LOGO_GAP_MM = 3;
const SHEET_PADDING_MM = 8;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const RECT_EPSILON = 0.001;
const TIFF_EXPORT_DPI = 150;
const MM_PER_INCH = 25.4;
// Kept well under browser per-canvas area/dimension caps (Safari ~16.7M px).
const TIFF_STRIP_ROWS = 2048;
// Manual-placement editing constants.
const NUDGE_MM = 1;
const NUDGE_LARGE_MM = 10;
const DUPLICATE_OFFSET_MM = 6;
const MAX_COPIES = 999;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const readAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const readAsArrayBuffer = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
});

const loadImage = (src) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const writeAscii = (view, offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
    }
};

const writeTiffEntry = (view, offset, tag, type, count, value) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    if (type === 3 && count === 1) {
        view.setUint16(offset + 8, value, true);
        view.setUint16(offset + 10, 0, true);
    } else {
        view.setUint32(offset + 8, value, true);
    }
};

const readAscii = (bytes, offset, length) => {
    let value = '';
    for (let index = 0; index < length; index += 1) {
        value += String.fromCharCode(bytes[offset + index] || 0);
    }
    return value;
};

const ppmToDpi = (value) => (Number.isFinite(value) && value > 0 ? value * 0.0254 : null);

const resolveDpi = (dpiX, dpiY) => ({
    dpiX: Number.isFinite(dpiX) && dpiX > 0 ? dpiX : DEFAULT_IMAGE_DPI,
    dpiY: Number.isFinite(dpiY) && dpiY > 0 ? dpiY : DEFAULT_IMAGE_DPI,
});

const parsePngDpi = (buffer) => {
    const bytes = new Uint8Array(buffer);
    if (
        bytes.length < 33
        || bytes[0] !== 0x89
        || readAscii(bytes, 1, 3) !== 'PNG'
        || bytes[4] !== 0x0d
        || bytes[5] !== 0x0a
        || bytes[6] !== 0x1a
        || bytes[7] !== 0x0a
    ) {
        return null;
    }

    const view = new DataView(buffer);
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const length = view.getUint32(offset, false);
        const type = readAscii(bytes, offset + 4, 4);
        const dataOffset = offset + 8;
        if (dataOffset + length + 4 > bytes.length) break;
        if (type === 'pHYs' && length >= 9 && bytes[dataOffset + 8] === 1) {
            return resolveDpi(
                ppmToDpi(view.getUint32(dataOffset, false)),
                ppmToDpi(view.getUint32(dataOffset + 4, false))
            );
        }
        offset = dataOffset + length + 4;
    }
    return null;
};

const parseJpegDpi = (buffer) => {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

    const view = new DataView(buffer);
    let offset = 2;
    while (offset + 4 <= bytes.length) {
        while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
        if (offset >= bytes.length) break;
        const marker = bytes[offset];
        offset += 1;
        if (marker === 0xda || marker === 0xd9) break;
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
        if (offset + 2 > bytes.length) break;

        const length = view.getUint16(offset, false);
        if (length < 2 || offset + length > bytes.length) break;
        const dataOffset = offset + 2;
        if (marker === 0xe0 && length >= 16 && readAscii(bytes, dataOffset, 5) === 'JFIF\0') {
            const units = bytes[dataOffset + 7];
            const xDensity = view.getUint16(dataOffset + 8, false);
            const yDensity = view.getUint16(dataOffset + 10, false);
            if (units === 1) return resolveDpi(xDensity, yDensity);
            if (units === 2) return resolveDpi(xDensity * 2.54, yDensity * 2.54);
        }
        offset += length;
    }
    return null;
};

const readImageDpi = async (file) => {
    try {
        const buffer = await readAsArrayBuffer(file);
        return parsePngDpi(buffer) || parseJpegDpi(buffer) || resolveDpi();
    } catch {
        return resolveDpi();
    }
};

const pxToMm = (pixels, dpi) => (pixels / Math.max(1, dpi)) * MM_PER_INCH;

const isTiffFile = (file) => {
    const type = (file?.type || '').split(';')[0].toLowerCase();
    const name = (file?.name || '').toLowerCase();
    return type === 'image/tiff' || type === 'image/tif' || name.endsWith('.tif') || name.endsWith('.tiff');
};

const isPdfFile = (file) => {
    const type = (file?.type || '').split(';')[0].toLowerCase();
    const name = (file?.name || '').toLowerCase();
    return type === 'application/pdf' || name.endsWith('.pdf');
};

// TIFF and PDF are rasterised to PNG on the backend (`/files/prepare-logo`,
// which takes the first PDF page) before they become browser-drawable logos.
const prepareBrowserLogoFile = async (file) => {
    if (!isTiffFile(file) && !isPdfFile(file)) return file;
    const { data } = await mediaApi.prepareLogo(file);
    const baseName = (file?.name || 'logo').replace(/\.[^.]+$/, '') || 'logo';
    return new File([data], `${baseName}.png`, { type: data.type || 'image/png' });
};

// PackBits run-length encodes a single scanline (TIFF compression 32773).
// Encoding is flushed per row, as required by the TIFF spec.
const packBitsRow = (src) => {
    const out = [];
    const n = src.length;
    let i = 0;
    while (i < n) {
        let runLength = 1;
        while (i + runLength < n && src[i + runLength] === src[i] && runLength < 128) runLength += 1;
        if (runLength >= 2) {
            out.push(257 - runLength, src[i]);
            i += runLength;
        } else {
            const litStart = i;
            let litLen = 0;
            while (i < n && litLen < 128) {
                if (i + 2 < n && src[i] === src[i + 1] && src[i + 1] === src[i + 2]) break;
                i += 1;
                litLen += 1;
            }
            out.push(litLen - 1);
            for (let j = litStart; j < litStart + litLen; j += 1) out.push(src[j]);
        }
    }
    return Uint8Array.from(out);
};

// Builds a PackBits-compressed, multi-strip RGB TIFF without ever holding the
// full raster in memory. renderStrip(ctx, topPx, rows) paints absolute-coord
// content into a strip-sized canvas (origin already translated to the strip top).
const buildStripedTiff = ({ width, height, dpi, rowsPerStrip, renderStrip }) => {
    const stripCount = Math.ceil(height / rowsPerStrip);
    const strips = [];
    const stripByteCounts = [];
    const rgbRow = new Uint8Array(width * 3);

    for (let strip = 0; strip < stripCount; strip += 1) {
        const topPx = strip * rowsPerStrip;
        const rows = Math.min(rowsPerStrip, height - topPx);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = rows;
        const ctx = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
        if (!ctx) throw new Error('canvas-unavailable');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, rows);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        renderStrip(ctx, topPx, rows);

        const data = ctx.getImageData(0, 0, width, rows).data;
        const stripChunks = [];
        let stripSize = 0;
        for (let row = 0; row < rows; row += 1) {
            const base = row * width * 4;
            for (let x = 0, dst = 0; x < width; x += 1, dst += 3) {
                const src = base + x * 4;
                rgbRow[dst] = data[src];
                rgbRow[dst + 1] = data[src + 1];
                rgbRow[dst + 2] = data[src + 2];
            }
            const encoded = packBitsRow(rgbRow);
            stripChunks.push(encoded);
            stripSize += encoded.length;
        }
        const stripData = new Uint8Array(stripSize);
        let cursor = 0;
        for (const chunk of stripChunks) {
            stripData.set(chunk, cursor);
            cursor += chunk.length;
        }
        strips.push(stripData);
        stripByteCounts.push(stripSize);
    }

    const software = 'Sproogeek Print Canvas';
    const entryCount = 13;
    const ifdOffset = 8;
    const ifdSize = 2 + entryCount * 12 + 4;
    let cursor = ifdOffset + ifdSize;
    const bitsOffset = cursor; cursor += 6;
    const xResolutionOffset = cursor; cursor += 8;
    const yResolutionOffset = cursor; cursor += 8;
    const softwareOffset = cursor; cursor += software.length + 1;
    if (cursor % 2 === 1) cursor += 1;
    const stripOffsetsArrayOffset = cursor; cursor += stripCount * 4;
    const stripByteCountsArrayOffset = cursor; cursor += stripCount * 4;
    const stripDataStart = cursor;

    const stripOffsets = [];
    let dataCursor = stripDataStart;
    for (let strip = 0; strip < stripCount; strip += 1) {
        stripOffsets.push(dataCursor);
        dataCursor += stripByteCounts[strip];
    }
    const totalSize = dataCursor;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);

    writeAscii(view, 0, 'II');
    view.setUint16(2, 42, true);
    view.setUint32(4, ifdOffset, true);
    view.setUint16(ifdOffset, entryCount, true);

    let entryOffset = ifdOffset + 2;
    writeTiffEntry(view, entryOffset, 256, 4, 1, width); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 257, 4, 1, height); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 258, 3, 3, bitsOffset); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 259, 3, 1, 32773); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 262, 3, 1, 2); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 273, 4, stripCount, stripCount === 1 ? stripOffsets[0] : stripOffsetsArrayOffset); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 277, 3, 1, 3); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 278, 4, 1, rowsPerStrip); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 279, 4, stripCount, stripCount === 1 ? stripByteCounts[0] : stripByteCountsArrayOffset); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 282, 5, 1, xResolutionOffset); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 283, 5, 1, yResolutionOffset); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 296, 3, 1, 2); entryOffset += 12;
    writeTiffEntry(view, entryOffset, 305, 2, software.length + 1, softwareOffset); entryOffset += 12;
    view.setUint32(entryOffset, 0, true);

    view.setUint16(bitsOffset, 8, true);
    view.setUint16(bitsOffset + 2, 8, true);
    view.setUint16(bitsOffset + 4, 8, true);
    view.setUint32(xResolutionOffset, dpi, true);
    view.setUint32(xResolutionOffset + 4, 1, true);
    view.setUint32(yResolutionOffset, dpi, true);
    view.setUint32(yResolutionOffset + 4, 1, true);
    writeAscii(view, softwareOffset, software);
    view.setUint8(softwareOffset + software.length, 0);

    if (stripCount > 1) {
        for (let strip = 0; strip < stripCount; strip += 1) {
            view.setUint32(stripOffsetsArrayOffset + strip * 4, stripOffsets[strip], true);
            view.setUint32(stripByteCountsArrayOffset + strip * 4, stripByteCounts[strip], true);
        }
    }
    for (let strip = 0; strip < stripCount; strip += 1) {
        bytes.set(strips[strip], stripOffsets[strip]);
    }

    return new Blob([buffer], { type: 'image/tiff' });
};

const makeLogoId = () => (
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

// Crop fully transparent margins so a logo's footprint is just its artwork,
// which keeps the print sheet tight. Returns null when there is nothing to trim.
const trimTransparent = (sourceCanvas) => {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const ctx = sourceCanvas.getContext('2d');
    let data;
    try {
        data = ctx.getImageData(0, 0, w, h).data;
    } catch {
        return null;
    }
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    const alphaThreshold = 8;
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            if (data[(y * w + x) * 4 + 3] > alphaThreshold) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX || maxY < minY) return null; // fully transparent — keep as-is
    if (minX === 0 && minY === 0 && maxX === w - 1 && maxY === h - 1) return null; // already tight
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const cropped = document.createElement('canvas');
    cropped.width = cw;
    cropped.height = ch;
    const cctx = cropped.getContext('2d', { alpha: true, colorSpace: 'srgb' });
    if (!cctx) return null;
    cctx.drawImage(sourceCanvas, minX, minY, cw, ch, 0, 0, cw, ch);
    return { canvas: cropped, width: cw, height: ch };
};

const prepareLogoFile = async (file) => {
    const browserFile = await prepareBrowserLogoFile(file);
    const [source, dpi] = await Promise.all([
        readAsDataURL(browserFile),
        readImageDpi(browserFile),
    ]);
    const image = await loadImage(source);
    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error('Invalid image');

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true, colorSpace: 'srgb' });
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);

    const trimmed = trimTransparent(canvas);
    const content = trimmed ? trimmed.canvas : canvas;
    const contentW = trimmed ? trimmed.width : width;
    const contentH = trimmed ? trimmed.height : height;

    let hasTransparentCorners = false;
    try {
        const data = content.getContext('2d').getImageData(0, 0, contentW, contentH).data;
        const corners = [
            3,
            (contentW - 1) * 4 + 3,
            ((contentH - 1) * contentW) * 4 + 3,
            ((contentH - 1) * contentW + contentW - 1) * 4 + 3,
        ];
        hasTransparentCorners = corners.some((index) => data[index] < 32);
    } catch {
        hasTransparentCorners = false;
    }

    const aspect = contentW / contentH;
    // Map the trimmed pixels back to the source resolution for an accurate
    // physical size (DPI is defined against the original image).
    const sourceContentW = Math.max(1, Math.round(contentW / scale));
    const sourceContentH = Math.max(1, Math.round(contentH / scale));
    const widthMm = clamp(pxToMm(sourceContentW, dpi.dpiX), MIN_LOGO_WIDTH_MM, MAX_LOGO_WIDTH_MM);
    return {
        id: makeLogoId(),
        name: file.name || browserFile.name || 'logo.png',
        src: content.toDataURL('image/png'),
        widthPx: sourceContentW,
        heightPx: sourceContentH,
        widthMm,
        shape: hasTransparentCorners && aspect > 0.82 && aspect < 1.18 ? 'round' : 'auto',
    };
};

const logoWidthMm = (logo) => clamp(
    Number(logo.widthMm) || DEFAULT_LOGO_WIDTH_MM,
    MIN_LOGO_WIDTH_MM,
    MAX_LOGO_WIDTH_MM
);
const logoHeightMm = (logo, widthMm) => Math.max(6, widthMm * (logo.heightPx / Math.max(1, logo.widthPx)));
const formatMmValue = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0,00';
    return number.toFixed(2).replace('.', ',');
};
const logoSizeLabel = (logo) => {
    const width = logoWidthMm(logo);
    return `${formatMmValue(width)} × ${formatMmValue(logoHeightMm(logo, width))} мм`;
};

// ── Manual placement model helpers ──────────────────────────────────────────

const sheetWidthValue = (sheetWidth) =>
    (SHEET_WIDTH_OPTIONS_MM.includes(Number(sheetWidth)) ? Number(sheetWidth) : DEFAULT_SHEET_WIDTH_MM);

const gapValue = (logoGapMm) =>
    (LOGO_GAP_OPTIONS_MM.includes(Number(logoGapMm)) ? Number(logoGapMm) : DEFAULT_LOGO_GAP_MM);

// Base (unrotated) footprint of a logo in mm.
const baseFootprint = (logo) => {
    const w = logoWidthMm(logo);
    return { w, h: logoHeightMm(logo, w) };
};

// Effective footprint of a placement, accounting for rotation.
const placementFootprint = (placement, logo) => {
    const { w, h } = baseFootprint(logo);
    return placement.rotated ? { w: h, h: w } : { w, h };
};

// Resolve placements into drawable rects (mm), dropping any whose logo is gone.
const resolveRects = (placements, logoMap) => placements.reduce((acc, placement) => {
    const logo = logoMap.get(placement.logoId);
    if (!logo) return acc;
    const { w, h } = placementFootprint(placement, logo);
    acc.push({ ...placement, w, h, logo, src: logo.src, name: logo.name, shape: logo.shape });
    return acc;
}, []);

const rectsOverlap = (a, b, gap = 0) => (
    a.x < b.x + b.w + gap - RECT_EPSILON
    && a.x + a.w + gap > b.x + RECT_EPSILON
    && a.y < b.y + b.h + gap - RECT_EPSILON
    && a.y + a.h + gap > b.y + RECT_EPSILON
);

// Dynamic roll length: grows to fit the lowest element, never below the minimum.
const sheetHeightFor = (rects) => {
    if (!rects.length) return EMPTY_SHEET_HEIGHT_MM;
    const bottom = Math.max(...rects.map((r) => r.y + r.h)) + SHEET_PADDING_MM;
    return Math.max(EMPTY_SHEET_HEIGHT_MM, Math.ceil(bottom));
};

const sortedUnique = (values) => {
    const out = [];
    values.forEach((value) => {
        if (!Number.isFinite(value)) return;
        if (!out.some((item) => Math.abs(item - value) < RECT_EPSILON)) out.push(value);
    });
    return out.sort((a, b) => a - b);
};

// First-fit free spot for a single new/duplicated rect, scanning candidate edges
// left-to-right, top-to-bottom. Falls back to a fresh row below everything.
const findFreeSpot = (rects, w, h, sheetWidth, gap) => {
    const pad = SHEET_PADDING_MM;
    const maxX = Math.max(pad, sheetWidth - pad - w);
    const xs = sortedUnique([pad, ...rects.map((r) => r.x), ...rects.map((r) => r.x + r.w + gap)])
        .filter((x) => x >= pad - RECT_EPSILON && x <= maxX + RECT_EPSILON);
    const ys = sortedUnique([pad, ...rects.map((r) => r.y + r.h + gap)]);
    for (const y of ys) {
        for (const x of xs) {
            if (x + w > sheetWidth - pad + RECT_EPSILON) continue;
            const cand = { x, y, w, h };
            if (rects.every((r) => !rectsOverlap(cand, r, gap))) return { x, y };
        }
    }
    const bottom = rects.length ? Math.max(...rects.map((r) => r.y + r.h)) + gap : pad;
    return { x: pad, y: bottom };
};

// Compact shelf packer powering the "Auto-arrange" button: predictable
// left-to-right rows wrapping at the sheet width; rotates an item only when
// that is the only way it fits the width.
const shelfArrange = (items, sheetWidth, gap) => {
    const pad = SHEET_PADDING_MM;
    const inner = Math.max(1, sheetWidth - pad * 2);
    const ordered = [...items].sort((a, b) => (b.h - a.h) || (b.w - a.w));
    const result = new Map();
    let cursorX = pad;
    let cursorY = pad;
    let rowH = 0;
    ordered.forEach((item) => {
        let { w, h } = item;
        let rotated = false;
        if (w > inner && h <= inner && item.canRotate) {
            [w, h] = [h, w];
            rotated = true;
        }
        if (cursorX > pad && cursorX + w > sheetWidth - pad + RECT_EPSILON) {
            cursorX = pad;
            cursorY += rowH + gap;
            rowH = 0;
        }
        result.set(item.id, { x: cursorX, y: cursorY, rotated });
        cursorX += w + gap;
        rowH = Math.max(rowH, h);
    });
    return result;
};

const computeDensity = (rects, sheetWidth, sheetHeight) => (
    rects.length
        ? Math.round((rects.reduce((sum, r) => sum + r.w * r.h, 0) / (sheetWidth * sheetHeight)) * 100)
        : 0
);

const mmLabel = (value) => `${formatMmValue(value)} мм`;

const QuantityButton = ({ children, onClick, disabled }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="grid h-8 w-8 place-items-center rounded-[8px] border border-white/14 bg-white/8 text-[16px] font-black text-white transition hover:bg-white/14 disabled:opacity-35"
    >
        {children}
    </button>
);

export const PrintCanvas = ({ onBack }) => {
    const language = useConfigurator((state) => state.language);
    const previewScrollRef = useRef(null);
    const dragStateRef = useRef(null);
    const itemDragRef = useRef(null);
    const clipboardRef = useRef([]);
    const previewScaleRef = useRef(1);
    const stateRef = useRef({});
    const [logos, setLogos] = useState([]);
    const [placements, setPlacements] = useState([]);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [logoGapMm, setLogoGapMm] = useState(DEFAULT_LOGO_GAP_MM);
    const [sheetWidthMm, setSheetWidthMm] = useState(DEFAULT_SHEET_WIDTH_MM);
    const [zoom, setZoom] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [isDraggingPreview, setIsDraggingPreview] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const [exportMsg, setExportMsg] = useState('');

    const logoMap = useMemo(() => new Map(logos.map((logo) => [logo.id, logo])), [logos]);
    const sheetWidth = sheetWidthValue(sheetWidthMm);
    const gap = gapValue(logoGapMm);
    const rects = useMemo(() => resolveRects(placements, logoMap), [placements, logoMap]);
    const sheetHeight = sheetHeightFor(rects);
    const previewFitScale = Math.min(1, 1080 / sheetWidth);
    const previewScale = previewFitScale * zoom;
    previewScaleRef.current = previewScale;
    const density = computeDensity(rects, sheetWidth, sheetHeight);
    const contentRight = rects.length ? Math.max(...rects.map((r) => r.x + r.w)) : 0;
    const usedWidth = rects.length ? Math.min(sheetWidth, contentRight + SHEET_PADDING_MM) : sheetWidth;
    const usedHeight = sheetHeight;
    const tooWide = rects.some((r) => r.w > sheetWidth - SHEET_PADDING_MM * 2 + RECT_EPSILON);
    const countByLogo = useMemo(() => {
        const counts = new Map();
        placements.forEach((p) => counts.set(p.logoId, (counts.get(p.logoId) || 0) + 1));
        return counts;
    }, [placements]);

    // Latest values for event handlers / keyboard shortcuts (avoids stale closures).
    stateRef.current = { logos, placements, selectedIds, logoMap, sheetWidth, gap };

    const addFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/') || isTiffFile(file) || isPdfFile(file));
        if (!files.length) return;
        setBusy(true);
        setError('');
        try {
            const prepared = [];
            for (const file of files) prepared.push(await prepareLogoFile(file));
            const { placements: curPlacements, logoMap: curLogoMap, sheetWidth: sw, gap: g } = stateRef.current;
            const rectsAccu = resolveRects(curPlacements, curLogoMap).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
            const additions = prepared.map((logo) => {
                const { w, h } = baseFootprint(logo);
                const spot = findFreeSpot(rectsAccu, w, h, sw, g);
                rectsAccu.push({ x: spot.x, y: spot.y, w, h });
                return { id: makeLogoId(), logoId: logo.id, x: spot.x, y: spot.y, rotated: false };
            });
            setLogos((current) => [...current, ...prepared]);
            setPlacements((current) => [...current, ...additions]);
        } catch {
            setError(t(language, 'printCanvasUploadError'));
        } finally {
            setBusy(false);
        }
    }, [language]);

    const updateLogoWidth = useCallback((id, mm) => {
        const value = clamp(Number(mm) || 0, MIN_LOGO_WIDTH_MM, MAX_LOGO_WIDTH_MM);
        setLogos((current) => current.map((logo) => (
            logo.id === id ? { ...logo, widthMm: value } : logo
        )));
    }, []);

    const removeLogo = useCallback((id) => {
        setLogos((current) => current.filter((logo) => logo.id !== id));
        setPlacements((current) => current.filter((p) => p.logoId !== id));
        setSelectedIds((prev) => {
            const next = new Set(prev);
            stateRef.current.placements.forEach((p) => { if (p.logoId === id) next.delete(p.id); });
            return next;
        });
    }, []);

    // Reconcile the number of placements for a logo with the requested count.
    const setLogoCount = useCallback((logoId, count) => {
        const { placements: cur, logoMap: map, sheetWidth: sw, gap: g } = stateRef.current;
        const logo = map.get(logoId);
        if (!logo) return;
        const own = cur.filter((p) => p.logoId === logoId);
        const target = clamp(Math.round(count) || 1, 1, MAX_COPIES);
        if (target === own.length) return;
        if (target > own.length) {
            const { w, h } = baseFootprint(logo);
            const rectsAccu = resolveRects(cur, map).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
            const additions = [];
            for (let i = own.length; i < target; i += 1) {
                const spot = findFreeSpot(rectsAccu, w, h, sw, g);
                rectsAccu.push({ x: spot.x, y: spot.y, w, h });
                additions.push({ id: makeLogoId(), logoId, x: spot.x, y: spot.y, rotated: false });
            }
            setPlacements((current) => [...current, ...additions]);
        } else {
            const removeIds = new Set(own.slice(target).map((p) => p.id));
            setPlacements((current) => current.filter((p) => !removeIds.has(p.id)));
            setSelectedIds((prev) => {
                const next = new Set(prev);
                removeIds.forEach((id) => next.delete(id));
                return next;
            });
        }
    }, []);

    const duplicateLogo = useCallback((logoId) => {
        setLogoCount(logoId, (stateRef.current.placements.filter((p) => p.logoId === logoId).length) + 1);
    }, [setLogoCount]);

    const duplicateSelected = useCallback(() => {
        const { placements: cur, selectedIds: sel, logoMap: map, sheetWidth: sw } = stateRef.current;
        if (!sel.size) return;
        const copies = [];
        cur.forEach((p) => {
            if (!sel.has(p.id)) return;
            const logo = map.get(p.logoId);
            if (!logo) return;
            const { w } = placementFootprint(p, logo);
            copies.push({
                id: makeLogoId(),
                logoId: p.logoId,
                rotated: p.rotated,
                x: clamp(p.x + DUPLICATE_OFFSET_MM, SHEET_PADDING_MM, Math.max(SHEET_PADDING_MM, sw - SHEET_PADDING_MM - w)),
                y: Math.max(SHEET_PADDING_MM, p.y + DUPLICATE_OFFSET_MM),
            });
        });
        if (!copies.length) return;
        setPlacements((current) => [...current, ...copies]);
        setSelectedIds(new Set(copies.map((p) => p.id)));
    }, []);

    const copySelected = useCallback(() => {
        const { placements: cur, selectedIds: sel } = stateRef.current;
        clipboardRef.current = cur
            .filter((p) => sel.has(p.id))
            .map((p) => ({ logoId: p.logoId, rotated: p.rotated, x: p.x, y: p.y }));
    }, []);

    const pasteClipboard = useCallback(() => {
        const { logoMap: map, sheetWidth: sw } = stateRef.current;
        const buffer = clipboardRef.current;
        if (!buffer.length) return;
        const copies = buffer.reduce((acc, spec) => {
            const logo = map.get(spec.logoId);
            if (!logo) return acc;
            const { w } = spec.rotated ? { w: logoHeightMm(logo, logoWidthMm(logo)) } : { w: logoWidthMm(logo) };
            acc.push({
                id: makeLogoId(),
                logoId: spec.logoId,
                rotated: spec.rotated,
                x: clamp(spec.x + DUPLICATE_OFFSET_MM, SHEET_PADDING_MM, Math.max(SHEET_PADDING_MM, sw - SHEET_PADDING_MM - w)),
                y: Math.max(SHEET_PADDING_MM, spec.y + DUPLICATE_OFFSET_MM),
            });
            return acc;
        }, []);
        if (!copies.length) return;
        setPlacements((current) => [...current, ...copies]);
        setSelectedIds(new Set(copies.map((p) => p.id)));
    }, []);

    const deleteSelected = useCallback(() => {
        const { selectedIds: sel } = stateRef.current;
        if (!sel.size) return;
        setPlacements((current) => current.filter((p) => !sel.has(p.id)));
        setSelectedIds(new Set());
    }, []);

    const nudgeSelected = useCallback((dx, dy) => {
        const { selectedIds: sel, logoMap: map, sheetWidth: sw } = stateRef.current;
        if (!sel.size) return;
        setPlacements((current) => current.map((p) => {
            if (!sel.has(p.id)) return p;
            const logo = map.get(p.logoId);
            if (!logo) return p;
            const { w } = placementFootprint(p, logo);
            const maxX = Math.max(SHEET_PADDING_MM, sw - SHEET_PADDING_MM - w);
            return {
                ...p,
                x: clamp(p.x + dx, SHEET_PADDING_MM, maxX),
                y: Math.max(SHEET_PADDING_MM, p.y + dy),
            };
        }));
    }, []);

    const selectAll = useCallback(() => {
        setSelectedIds(new Set(stateRef.current.placements.map((p) => p.id)));
    }, []);

    const autoArrange = useCallback(() => {
        const { placements: cur, logoMap: map, sheetWidth: sw, gap: g } = stateRef.current;
        if (!cur.length) return;
        const items = cur.map((p) => {
            const logo = map.get(p.logoId);
            const { w, h } = baseFootprint(logo);
            const canRotate = logo.shape !== 'round' && Math.abs(w - h) > 0.1;
            return { id: p.id, w, h, canRotate };
        });
        const arranged = shelfArrange(items, sw, g);
        setPlacements((current) => current.map((p) => {
            const slot = arranged.get(p.id);
            return slot ? { ...p, x: slot.x, y: slot.y, rotated: slot.rotated } : p;
        }));
    }, []);

    // Keyboard shortcuts (skipped while typing in inputs).
    useEffect(() => {
        const onKey = (event) => {
            const active = document.activeElement;
            const tag = active?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return;
            const meta = event.ctrlKey || event.metaKey;
            const key = event.key;
            const hasSelection = stateRef.current.selectedIds.size > 0;
            if (meta && (key === 'd' || key === 'D')) { event.preventDefault(); duplicateSelected(); }
            else if (meta && (key === 'c' || key === 'C')) { event.preventDefault(); copySelected(); }
            else if (meta && (key === 'v' || key === 'V')) { event.preventDefault(); pasteClipboard(); }
            else if (meta && (key === 'a' || key === 'A')) { event.preventDefault(); selectAll(); }
            else if (key === 'Delete' || key === 'Backspace') { if (hasSelection) { event.preventDefault(); deleteSelected(); } }
            else if (key === 'Escape') { if (hasSelection) setSelectedIds(new Set()); }
            else if (key.startsWith('Arrow')) {
                if (!hasSelection) return;
                event.preventDefault();
                const step = event.shiftKey ? NUDGE_LARGE_MM : NUDGE_MM;
                const dx = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0;
                const dy = key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0;
                nudgeSelected(dx, dy);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [duplicateSelected, copySelected, pasteClipboard, selectAll, deleteSelected, nudgeSelected]);

    // ── Background panning (empty canvas) ───────────────────────────────────
    const startPreviewDrag = useCallback((event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const target = previewScrollRef.current;
        if (!target) return;
        setSelectedIds(new Set());
        dragStateRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            scrollLeft: target.scrollLeft,
            scrollTop: target.scrollTop,
        };
        target.setPointerCapture?.(event.pointerId);
        setIsDraggingPreview(true);
        event.preventDefault();
    }, []);

    const movePreviewDrag = useCallback((event) => {
        const target = previewScrollRef.current;
        const drag = dragStateRef.current;
        if (!target || !drag || drag.pointerId !== event.pointerId) return;
        target.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
        target.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
        event.preventDefault();
    }, []);

    const stopPreviewDrag = useCallback((event) => {
        const target = previewScrollRef.current;
        const drag = dragStateRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        target?.releasePointerCapture?.(event.pointerId);
        dragStateRef.current = null;
        setIsDraggingPreview(false);
    }, []);

    // ── Element dragging ────────────────────────────────────────────────────
    const startItemDrag = useCallback((event, placementId) => {
        if (event.button !== undefined && event.button !== 0) return;
        event.stopPropagation();
        const additive = event.shiftKey;
        const curSel = stateRef.current.selectedIds;
        let group;
        if (additive) {
            const next = new Set(curSel);
            if (next.has(placementId)) next.delete(placementId); else next.add(placementId);
            setSelectedIds(next);
            group = [...next];
        } else if (curSel.has(placementId)) {
            group = [...curSel];
        } else {
            group = [placementId];
            setSelectedIds(new Set([placementId]));
        }
        const origin = new Map();
        stateRef.current.placements.forEach((p) => {
            if (group.includes(p.id)) origin.set(p.id, { x: p.x, y: p.y });
        });
        itemDragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            origin,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, []);

    const moveItemDrag = useCallback((event) => {
        const drag = itemDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const scale = previewScaleRef.current || 1;
        const dxMm = (event.clientX - drag.startX) / scale;
        const dyMm = (event.clientY - drag.startY) / scale;
        const { logoMap: map, sheetWidth: sw } = stateRef.current;
        setPlacements((current) => current.map((p) => {
            const o = drag.origin.get(p.id);
            if (!o) return p;
            const logo = map.get(p.logoId);
            if (!logo) return p;
            const { w } = placementFootprint(p, logo);
            const maxX = Math.max(SHEET_PADDING_MM, sw - SHEET_PADDING_MM - w);
            return {
                ...p,
                x: clamp(o.x + dxMm, SHEET_PADDING_MM, maxX),
                y: Math.max(SHEET_PADDING_MM, o.y + dyMm),
            };
        }));
        event.preventDefault();
    }, []);

    const stopItemDrag = useCallback((event) => {
        const drag = itemDragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        itemDragRef.current = null;
    }, []);

    // ── Export ───────────────────────────────────────────────────────────────
    const buildExportPlan = useCallback(() => {
        const { placements: cur, logoMap: map, sheetWidth: sw, gap: g } = stateRef.current;
        if (!cur.length) throw new Error('empty-layout');
        const items = resolveRects(cur, map);
        if (items.some((r) => r.w > sw - SHEET_PADDING_MM * 2 + RECT_EPSILON)) throw new Error('items-not-fit');
        const height = sheetHeightFor(items);
        const pxPerMm = TIFF_EXPORT_DPI / MM_PER_INCH;
        const widthPx = Math.max(1, Math.ceil(sw * pxPerMm));
        const heightPx = Math.max(1, Math.ceil(height * pxPerMm));
        const drawItems = items.map((item) => ({
            ...item,
            px: {
                x: Math.round(item.x * pxPerMm),
                y: Math.round(item.y * pxPerMm),
                width: Math.round(item.w * pxPerMm),
                height: Math.round(item.h * pxPerMm),
            },
        }));
        const usedW = Math.min(sw, Math.max(...items.map((r) => r.x + r.w)) + SHEET_PADDING_MM);
        const metadata = {
            sheet_width_mm: sw,
            used_width_mm: usedW,
            used_height_mm: height,
            max_length_m: Math.ceil(height / 1000),
            logo_gap_mm: g,
            items_count: items.length,
            density: computeDensity(items, sw, height),
            export_dpi: TIFF_EXPORT_DPI,
            pixel_width: widthPx,
            pixel_height: heightPx,
            logos: stateRef.current.logos.map((logo) => {
                const widthMm = logoWidthMm(logo);
                return {
                    id: logo.id,
                    name: logo.name,
                    quantity: cur.filter((p) => p.logoId === logo.id).length,
                    width_px: logo.widthPx,
                    height_px: logo.heightPx,
                    width_mm: widthMm,
                    height_mm: logoHeightMm(logo, widthMm),
                };
            }),
            placements: items.map((item) => ({
                logo_id: item.logoId,
                name: item.name,
                x_mm: item.x,
                y_mm: item.y,
                width_mm: item.w,
                height_mm: item.h,
                rotated: Boolean(item.rotated),
            })),
        };
        return { drawItems, widthPx, heightPx, metadata };
    }, []);

    // Render placed logos into a strip. `mode` 'color' draws the artwork;
    // 'mask' draws an opaque black silhouette of the artwork's alpha channel.
    const makeStripRenderer = (drawItems, imageCache, mode) => (ctx, topPx, rows) => {
        const bottomPx = topPx + rows;
        ctx.save();
        ctx.translate(0, -topPx);
        for (const item of drawItems) {
            const { x, y, width, height } = item.px;
            if (y >= bottomPx || y + height <= topPx) continue;
            const image = imageCache.get(item.logoId);
            const draw = (dx, dy, dw, dh) => {
                if (mode === 'mask') {
                    const off = document.createElement('canvas');
                    off.width = Math.max(1, Math.round(dw));
                    off.height = Math.max(1, Math.round(dh));
                    const octx = off.getContext('2d');
                    octx.imageSmoothingEnabled = true;
                    octx.imageSmoothingQuality = 'high';
                    octx.drawImage(image, 0, 0, off.width, off.height);
                    octx.globalCompositeOperation = 'source-in';
                    octx.fillStyle = '#000000';
                    octx.fillRect(0, 0, off.width, off.height);
                    ctx.drawImage(off, dx, dy, dw, dh);
                } else {
                    ctx.drawImage(image, dx, dy, dw, dh);
                }
            };
            if (item.rotated) {
                ctx.save();
                ctx.translate(x + width / 2, y + height / 2);
                ctx.rotate(Math.PI / 2);
                draw(-height / 2, -width / 2, height, width);
                ctx.restore();
            } else {
                draw(x, y, width, height);
            }
        }
        ctx.restore();
    };

    const exportCanvas = useCallback(async (format) => {
        setExportBusy(true);
        setExportMsg('');
        setError('');
        try {
            const { drawItems, widthPx, heightPx, metadata } = buildExportPlan();
            const imageCache = new Map();
            for (const item of drawItems) {
                if (!imageCache.has(item.logoId)) imageCache.set(item.logoId, await loadImage(item.src));
            }
            const colorBlob = buildStripedTiff({
                width: widthPx,
                height: heightPx,
                dpi: TIFF_EXPORT_DPI,
                rowsPerStrip: TIFF_STRIP_ROWS,
                renderStrip: makeStripRenderer(drawItems, imageCache, 'color'),
            });
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');

            if (format === 'pdf') {
                const maskBlob = buildStripedTiff({
                    width: widthPx,
                    height: heightPx,
                    dpi: TIFF_EXPORT_DPI,
                    rowsPerStrip: TIFF_STRIP_ROWS,
                    renderStrip: makeStripRenderer(drawItems, imageCache, 'mask'),
                });
                const filename = `print-canvas-${stamp}.pdf`;
                const colorFile = new File([colorBlob], 'color.tiff', { type: 'image/tiff' });
                const maskFile = new File([maskBlob], 'mask.tiff', { type: 'image/tiff' });
                const { data: item } = await printCanvasApi.createPdfExport(colorFile, maskFile, metadata);
                const { data: pdfBlob } = await printCanvasApi.downloadExport(item.id);
                downloadBlob(pdfBlob, filename);
                setExportMsg(t(language, 'printCanvasExportSaved'));
                return;
            }

            const filename = `print-canvas-${stamp}.tiff`;
            const file = new File([colorBlob], filename, { type: 'image/tiff' });
            const { data: item } = await printCanvasApi.createExport(file, metadata);
            // Backend stores the print-ready CMYK TIFF — download that, not the local RGB raster.
            try {
                const { data: cmykBlob } = await printCanvasApi.downloadExport(item.id);
                downloadBlob(cmykBlob, filename);
            } catch {
                downloadBlob(colorBlob, filename);
            }
            setExportMsg(t(language, 'printCanvasExportSaved'));
        } catch (err) {
            console.error(err);
            setExportMsg('');
            setError(t(language, err?.message === 'empty-layout'
                ? 'printCanvasExportEmpty'
                : err?.message === 'items-not-fit'
                    ? 'printCanvasItemsNotFit'
                    : 'printCanvasExportError'));
        } finally {
            setExportBusy(false);
        }
    }, [buildExportPlan, language]);

    const exportDisabled = exportBusy || !rects.length || tooWide;

    return (
        <main className="app-bg h-full w-full overflow-y-auto overflow-x-hidden font-zen text-white">
            <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
                <header className="flex flex-wrap items-center gap-3 py-2">
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/7 px-4 py-2 text-[12px] font-black uppercase tracking-wider text-white/78 transition hover:bg-white/12 hover:text-white"
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M19 12H5m6-6-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {t(language, 'backToMenu')}
                    </button>
                </header>

                <section className="grid min-h-0 flex-1 gap-4 py-4 xl:grid-cols-[430px_minmax(0,1fr)]">
                    <aside className="flex min-h-0 flex-col overflow-hidden rounded-[14px] border border-white/14 bg-[#33282d]/82 shadow-[0_24px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl xl:h-[calc(100vh-7rem)]">
                        <div className="shrink-0 border-b border-white/12 px-4 py-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">{t(language, 'printCanvasEyebrow')}</p>
                            <h1 className="mt-1 text-[24px] font-black leading-tight">{t(language, 'printCanvasTitle')}</h1>
                            <p className="mt-2 text-[12px] font-bold leading-relaxed text-white/52">{t(language, 'printCanvasSubtitle')}</p>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
                            <label
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    addFiles(event.dataTransfer.files);
                                }}
                                className="flex min-h-[118px] cursor-pointer flex-col items-center justify-center rounded-[12px] border border-dashed border-white/22 bg-black/12 px-4 py-5 text-center transition hover:bg-white/8"
                            >
                                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fff9ec] text-[#211a1d]">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <path d="M12 3v12m-5-7 5-5 5 5M5 21h14" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                                <span className="mt-3 text-[12px] font-black uppercase tracking-wider">{busy ? t(language, 'loading') : t(language, 'printCanvasUploadCta')}</span>
                                <span className="mt-1 text-[11px] font-bold text-white/42">{t(language, 'printCanvasUploadHint')}</span>
                                <input type="file" accept={LOGO_FILE_ACCEPT} multiple className="hidden" onChange={(event) => addFiles(event.target.files)} />
                            </label>

                            {error && (
                                <div className="mt-3 rounded-[9px] border border-red-300/25 bg-red-500/12 px-3 py-2 text-[12px] font-bold text-red-100">
                                    {error}
                                </div>
                            )}
                            {tooWide && (
                                <div className="mt-3 rounded-[9px] border border-amber-300/25 bg-amber-500/12 px-3 py-2 text-[12px] font-bold text-amber-100">
                                    {t(language, 'printCanvasItemsNotFit')}
                                </div>
                            )}

                            <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/42">{t(language, 'printCanvasLogos')}</span>
                                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white/55">{placements.length}</span>
                            </div>

                            <div className="mt-3 min-h-[160px] flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
                                {!logos.length && (
                                    <div className="rounded-[12px] border border-white/12 bg-white/7 px-4 py-5 text-center text-[12px] font-bold leading-relaxed text-white/48">
                                        {t(language, 'printCanvasEmpty')}
                                    </div>
                                )}
                                {logos.map((logo) => {
                                    const quantity = countByLogo.get(logo.id) || 0;
                                    return (
                                        <div key={logo.id} className="min-w-0 rounded-[12px] border border-white/12 bg-white/7 p-3">
                                            <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-2">
                                                <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-[9px] border border-white/14 bg-white">
                                                    <img src={logo.src} alt={logo.name} className="max-h-full max-w-full object-contain" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="max-h-9 overflow-hidden break-all text-[12px] font-black leading-tight sm:text-[13px]">{logo.name}</p>
                                                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/38">
                                                        {Math.round(logo.widthPx)} x {Math.round(logo.heightPx)} px
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => duplicateLogo(logo.id)}
                                                        className="grid h-7 w-7 place-items-center rounded-[7px] border border-white/14 bg-white/8 text-white/70 transition hover:bg-white/14 hover:text-white"
                                                        aria-label={t(language, 'printCanvasDuplicate')}
                                                        title={t(language, 'printCanvasDuplicate')}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                                            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                                                            <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => removeLogo(logo.id)}
                                                        className="grid h-7 w-7 place-items-center rounded-full text-[18px] leading-none text-white/38 transition hover:bg-white/10 hover:text-white"
                                                        aria-label={t(language, 'cartDeleteBtn')}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="mt-2 space-y-2 border-t border-white/8 pt-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-white/42">
                                                        {t(language, 'printCanvasLogoWidth')}
                                                    </span>
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="number"
                                                            min={MIN_LOGO_WIDTH_MM}
                                                            max={MAX_LOGO_WIDTH_MM}
                                                            step="1"
                                                            value={Math.round(logoWidthMm(logo) * 10) / 10}
                                                            aria-label={t(language, 'printCanvasLogoWidth')}
                                                            onChange={(event) => updateLogoWidth(logo.id, event.target.value)}
                                                            className="h-7 w-16 rounded-[7px] border border-white/14 bg-[#211a1d] text-center text-[11px] font-black text-white outline-none [color-scheme:dark] focus:border-[#fff9ec]/70"
                                                        />
                                                        <span className="text-[10px] font-bold text-white/45">мм</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white/38">
                                                        {logoSizeLabel(logo)}
                                                    </span>
                                                    <div className="flex min-w-0 items-center gap-1">
                                                        <QuantityButton disabled={quantity <= 1} onClick={() => setLogoCount(logo.id, quantity - 1)}>−</QuantityButton>
                                                        <input
                                                            type="number"
                                                            min="1"
                                                            max={MAX_COPIES}
                                                            value={quantity}
                                                            aria-label={t(language, 'printCanvasQuantity')}
                                                            onChange={(event) => setLogoCount(logo.id, clamp(Number(event.target.value) || 1, 1, MAX_COPIES))}
                                                            className="h-8 w-12 rounded-[8px] border border-white/14 bg-[#211a1d] text-center text-[12px] font-black text-white outline-none [color-scheme:dark] focus:border-[#fff9ec]/70"
                                                        />
                                                        <QuantityButton onClick={() => setLogoCount(logo.id, quantity + 1)}>+</QuantityButton>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </aside>

                    <section className="min-w-0 rounded-[14px] border border-white/14 bg-[#2b2428]/78 shadow-[0_24px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                        <div className="border-b border-white/12 px-4 py-4">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">{t(language, 'printCanvasPreview')}</p>
                                <h2 className="mt-1 text-[20px] font-black leading-tight">{t(language, 'printCanvasTitle')}</h2>
                                <p className="mt-1 text-[10px] font-bold text-white/38">{t(language, 'printCanvasShortcutsHint')}</p>
                            </div>
                        </div>

                        <div className="grid gap-3 border-b border-white/10 px-4 py-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasSize')}</p>
                                <div className="mt-2 grid gap-2">
                                    <div className="grid min-w-0 grid-cols-2 gap-1" aria-label={t(language, 'printCanvasSheetWidth')}>
                                        {SHEET_WIDTH_OPTIONS_MM.map((width) => (
                                            <button
                                                key={width}
                                                type="button"
                                                onClick={() => setSheetWidthMm(width)}
                                                className="h-8 rounded-[8px] border px-2 text-[12px] font-black transition"
                                                style={{
                                                    borderColor: sheetWidthMm === width ? '#fff9ec' : 'rgba(255,255,255,0.14)',
                                                    backgroundColor: sheetWidthMm === width ? '#fff9ec' : '#211a1d',
                                                    color: sheetWidthMm === width ? '#211a1d' : '#fff',
                                                }}
                                            >
                                                {width}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <p className="mt-2 text-[10px] font-bold text-white/38">
                                    {mmLabel(usedWidth)} x {mmLabel(usedHeight)}
                                </p>
                            </div>
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasLogoGap')}</p>
                                <div className="mt-2 grid grid-cols-2 gap-1" aria-label={t(language, 'printCanvasLogoGap')}>
                                    {LOGO_GAP_OPTIONS_MM.map((gapOption) => (
                                        <button
                                            key={gapOption}
                                            type="button"
                                            onClick={() => setLogoGapMm(gapOption)}
                                            className="h-8 rounded-[8px] border px-2 text-[12px] font-black transition"
                                            style={{
                                                borderColor: logoGapMm === gapOption ? '#fff9ec' : 'rgba(255,255,255,0.14)',
                                                backgroundColor: logoGapMm === gapOption ? '#fff9ec' : '#211a1d',
                                                color: logoGapMm === gapOption ? '#211a1d' : '#fff',
                                            }}
                                        >
                                            {gapOption} мм
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasItems')}</p>
                                <p className="mt-1 text-[14px] font-black">{placements.length}</p>
                            </div>
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasDensity')}</p>
                                <p className="mt-1 text-[14px] font-black">{density}%</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={autoArrange}
                                    disabled={!placements.length}
                                    className="h-8 rounded-[8px] border border-white/14 bg-white/8 px-3 text-[11px] font-black uppercase tracking-wider text-white/80 transition hover:bg-white/14 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {t(language, 'printCanvasAutoArrange')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => exportCanvas('pdf')}
                                    disabled={exportDisabled}
                                    className="h-8 rounded-[8px] border border-[#fff9ec]/35 bg-[#fff9ec] px-3 text-[11px] font-black uppercase tracking-wider text-[#211a1d] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {exportBusy ? t(language, 'printCanvasExporting') : t(language, 'printCanvasExportPdf')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => exportCanvas('tiff')}
                                    disabled={exportDisabled}
                                    className="h-8 rounded-[8px] border border-white/14 bg-white/8 px-3 text-[11px] font-black uppercase tracking-wider text-white/80 transition hover:bg-white/14 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {t(language, 'printCanvasExportTiff')}
                                </button>
                                {exportMsg && <span className="text-[11px] font-bold text-emerald-300">{exportMsg}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setZoom((value) => clamp(Number((value - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}
                                    className="grid h-8 w-8 place-items-center rounded-[8px] border border-white/14 bg-white/8 text-[16px] font-black text-white transition hover:bg-white/14"
                                    aria-label={t(language, 'printCanvasZoomOut')}
                                >
                                    −
                                </button>
                                <input
                                    type="range"
                                    min={MIN_ZOOM}
                                    max={MAX_ZOOM}
                                    step={ZOOM_STEP}
                                    value={zoom}
                                    onChange={(event) => setZoom(clamp(Number(event.target.value), MIN_ZOOM, MAX_ZOOM))}
                                    className="w-36 accent-[#fff9ec]"
                                    aria-label={t(language, 'printCanvasZoom')}
                                />
                                <button
                                    type="button"
                                    onClick={() => setZoom((value) => clamp(Number((value + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM))}
                                    className="grid h-8 w-8 place-items-center rounded-[8px] border border-white/14 bg-white/8 text-[16px] font-black text-white transition hover:bg-white/14"
                                    aria-label={t(language, 'printCanvasZoomIn')}
                                >
                                    +
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setZoom(1)}
                                    className="h-8 rounded-[8px] border border-white/14 bg-white/8 px-3 text-[11px] font-black text-white/72 transition hover:bg-white/14 hover:text-white"
                                >
                                    {Math.round(zoom * 100)}%
                                </button>
                            </div>
                        </div>

                        <div
                            ref={previewScrollRef}
                            onPointerDown={startPreviewDrag}
                            onPointerMove={movePreviewDrag}
                            onPointerUp={stopPreviewDrag}
                            onPointerCancel={stopPreviewDrag}
                            className={`min-h-[520px] overflow-auto p-4 custom-scrollbar select-none ${
                                isDraggingPreview ? 'cursor-grabbing' : 'cursor-grab'
                            }`}
                        >
                            <div
                                className="relative mx-auto rounded-[8px] border border-[#fff9ec]/55 bg-[#fff9ec]/8 shadow-[0_0_0_1px_rgba(255,249,236,0.16),0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-[2px]"
                                style={{
                                    width: sheetWidth * previewScale,
                                    height: sheetHeight * previewScale,
                                    backgroundImage: 'linear-gradient(rgba(255,249,236,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,249,236,0.10) 1px, transparent 1px)',
                                    backgroundSize: `${20 * previewScale}px ${20 * previewScale}px`,
                                }}
                            >
                                {!rects.length && (
                                    <div className="pointer-events-none absolute inset-0 grid place-items-center px-8 text-center text-[14px] font-black uppercase tracking-wider text-white/40">
                                        {t(language, 'printCanvasEmptyCanvas')}
                                    </div>
                                )}
                                {rects.map((item) => {
                                    const selected = selectedIds.has(item.id);
                                    return (
                                        <div
                                            key={item.id}
                                            onPointerDown={(event) => startItemDrag(event, item.id)}
                                            onPointerMove={moveItemDrag}
                                            onPointerUp={stopItemDrag}
                                            onPointerCancel={stopItemDrag}
                                            className="absolute grid cursor-move touch-none place-items-center overflow-hidden bg-white/8"
                                            title={item.name}
                                            style={{
                                                left: item.x * previewScale,
                                                top: item.y * previewScale,
                                                width: item.w * previewScale,
                                                height: item.h * previewScale,
                                                borderRadius: item.shape === 'round' ? '999px' : 4,
                                                boxShadow: selected
                                                    ? '0 0 0 2px #fff9ec, 0 0 0 4px rgba(255,249,236,0.35)'
                                                    : 'inset 0 0 0 1px rgba(255,249,236,0.2)',
                                                zIndex: selected ? 2 : 1,
                                            }}
                                        >
                                            <img
                                                src={item.src}
                                                alt=""
                                                draggable={false}
                                                className={item.rotated ? 'pointer-events-none absolute object-contain' : 'pointer-events-none h-full w-full object-contain'}
                                                style={item.rotated ? {
                                                    left: '50%',
                                                    top: '50%',
                                                    width: item.h * previewScale,
                                                    height: item.w * previewScale,
                                                    maxWidth: 'none',
                                                    maxHeight: 'none',
                                                    transform: 'translate(-50%, -50%) rotate(90deg)',
                                                } : undefined}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                </section>
            </div>
        </main>
    );
};
