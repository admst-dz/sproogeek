import { useCallback, useMemo, useRef, useState } from 'react';
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
const LOGO_FILE_ACCEPT = 'image/*,.tif,.tiff';
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

const prepareBrowserLogoFile = async (file) => {
    if (!isTiffFile(file)) return file;
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

    let hasTransparentCorners = false;
    try {
        const data = ctx.getImageData(0, 0, width, height).data;
        const corners = [
            3,
            (width - 1) * 4 + 3,
            ((height - 1) * width) * 4 + 3,
            ((height - 1) * width + width - 1) * 4 + 3,
        ];
        hasTransparentCorners = corners.some((index) => data[index] < 32);
    } catch {
        hasTransparentCorners = false;
    }

    const aspect = width / height;
    const widthMm = clamp(pxToMm(sourceWidth, dpi.dpiX), MIN_LOGO_WIDTH_MM, MAX_LOGO_WIDTH_MM);
    return {
        id: makeLogoId(),
        name: file.name || browserFile.name || 'logo.png',
        src: canvas.toDataURL('image/png'),
        widthPx: sourceWidth,
        heightPx: sourceHeight,
        quantity: 1,
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

const expandInstances = (logos) => logos.flatMap((logo, logoIndex) => {
    const width = logoWidthMm(logo);
    const height = logoHeightMm(logo, width);
    return Array.from({ length: Math.max(0, Number(logo.quantity) || 0) }, (_, copyIndex) => ({
        id: `${logo.id}-${copyIndex}`,
        logoId: logo.id,
        logoIndex,
        copyIndex,
        name: logo.name,
        src: logo.src,
        width,
        height,
        shape: logo.shape,
    }));
});

const getItemFootprint = (item, rotated = false) => {
    const drawWidth = rotated ? item.height : item.width;
    const drawHeight = rotated ? item.width : item.height;
    return {
        drawWidth,
        drawHeight,
        width: drawWidth,
        height: drawHeight,
    };
};

const constrainFootprint = (footprint, maxWidth, maxHeight = Infinity) => {
    const scale = Math.min(
        1,
        maxWidth / Math.max(1, footprint.drawWidth),
        maxHeight / Math.max(1, footprint.drawHeight)
    );
    const drawWidth = footprint.drawWidth * scale;
    const drawHeight = footprint.drawHeight * scale;
    return {
        drawWidth,
        drawHeight,
        width: drawWidth,
        height: drawHeight,
    };
};

const rectsIntersect = (a, b) => (
    a.x < b.x + b.width - RECT_EPSILON
    && a.x + a.width > b.x + RECT_EPSILON
    && a.y < b.y + b.height - RECT_EPSILON
    && a.y + a.height > b.y + RECT_EPSILON
);

const isRectContained = (a, b) => (
    a.x >= b.x - RECT_EPSILON
    && a.y >= b.y - RECT_EPSILON
    && a.x + a.width <= b.x + b.width + RECT_EPSILON
    && a.y + a.height <= b.y + b.height + RECT_EPSILON
);

const splitFreeRect = (freeRect, usedRect) => {
    if (!rectsIntersect(freeRect, usedRect)) return [freeRect];

    const next = [];
    const freeRight = freeRect.x + freeRect.width;
    const freeBottom = freeRect.y + freeRect.height;
    const usedRight = usedRect.x + usedRect.width;
    const usedBottom = usedRect.y + usedRect.height;

    if (usedRect.y > freeRect.y + RECT_EPSILON) {
        next.push({
            x: freeRect.x,
            y: freeRect.y,
            width: freeRect.width,
            height: usedRect.y - freeRect.y,
        });
    }

    if (usedBottom < freeBottom - RECT_EPSILON) {
        next.push({
            x: freeRect.x,
            y: usedBottom,
            width: freeRect.width,
            height: freeBottom - usedBottom,
        });
    }

    if (usedRect.x > freeRect.x + RECT_EPSILON) {
        next.push({
            x: freeRect.x,
            y: freeRect.y,
            width: usedRect.x - freeRect.x,
            height: freeRect.height,
        });
    }

    if (usedRight < freeRight - RECT_EPSILON) {
        next.push({
            x: usedRight,
            y: freeRect.y,
            width: freeRight - usedRight,
            height: freeRect.height,
        });
    }

    return next.filter((rect) => rect.width > RECT_EPSILON && rect.height > RECT_EPSILON);
};

const pruneFreeRects = (rects) => {
    const pruned = [];
    rects.forEach((rect, index) => {
        const contained = rects.some((other, otherIndex) => (
            index !== otherIndex && isRectContained(rect, other)
        ));
        if (!contained) pruned.push(rect);
    });
    return pruned;
};

const applyPlacementToFreeRects = (freeRects, usedRect) => {
    const splitRects = freeRects.flatMap((rect) => splitFreeRect(rect, usedRect));
    return pruneFreeRects(splitRects);
};

const uniqueNumbers = (values) => values.reduce((result, value) => {
    if (!Number.isFinite(value)) return result;
    if (!result.some((item) => Math.abs(item - value) < RECT_EPSILON)) {
        result.push(value);
    }
    return result;
}, []);

const comparePlacementRanks = (a, b) => {
    for (let index = 0; index < a.length; index += 1) {
        const delta = a[index] - b[index];
        if (Math.abs(delta) > RECT_EPSILON) return delta;
    }
    return 0;
};

const overlapsOnX = (a, b, gap) => (
    a.x < b.x + b.drawWidth + gap - RECT_EPSILON
    && a.x + a.drawWidth + gap > b.x + RECT_EPSILON
);

const overlapsOnY = (a, b, gap) => (
    a.y < b.y + b.drawHeight + gap - RECT_EPSILON
    && a.y + a.drawHeight + gap > b.y + RECT_EPSILON
);

const compactPlacements = (placements, { gap, sheetPadding, widthLimit, maxLengthMm }) => {
    const compacted = placements.map((item) => ({ ...item }));
    const ordered = [...compacted].sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const maxRight = widthLimit - sheetPadding;
    const maxBottom = maxLengthMm - sheetPadding;

    for (let pass = 0; pass < 3; pass += 1) {
        let moved = false;
        ordered.forEach((item) => {
            const others = compacted.filter((other) => other.id !== item.id);
            const maxX = Math.max(sheetPadding, maxRight - item.drawWidth);
            const maxY = Math.max(sheetPadding, maxBottom - item.drawHeight);

            let nextY = sheetPadding;
            others.forEach((other) => {
                if (
                    overlapsOnX(item, other, gap)
                    && other.y + other.drawHeight + gap <= item.y + RECT_EPSILON
                ) {
                    nextY = Math.max(nextY, other.y + other.drawHeight + gap);
                }
            });
            nextY = clamp(nextY, sheetPadding, Math.min(item.y, maxY));
            if (nextY < item.y - RECT_EPSILON) {
                item.y = nextY;
                moved = true;
            }

            let nextX = sheetPadding;
            others.forEach((other) => {
                if (
                    overlapsOnY(item, other, gap)
                    && other.x + other.drawWidth + gap <= item.x + RECT_EPSILON
                ) {
                    nextX = Math.max(nextX, other.x + other.drawWidth + gap);
                }
            });
            nextX = clamp(nextX, sheetPadding, Math.min(item.x, maxX));
            if (nextX < item.x - RECT_EPSILON) {
                item.x = nextX;
                moved = true;
            }
        });
        if (!moved) break;
    }

    return compacted;
};

const packRows = (instances, { sheetWidth, logoGapMm }) => {
    const gap = LOGO_GAP_OPTIONS_MM.includes(Number(logoGapMm)) ? Number(logoGapMm) : DEFAULT_LOGO_GAP_MM;
    const sheetPadding = SHEET_PADDING_MM;
    const widthLimit = SHEET_WIDTH_OPTIONS_MM.includes(Number(sheetWidth)) ? Number(sheetWidth) : DEFAULT_SHEET_WIDTH_MM;
    const maxItemHeight = instances.length
        ? Math.max(...instances.map((item) => Math.max(item.width, item.height)))
        : EMPTY_SHEET_HEIGHT_MM;
    const maxLengthMm = Math.max(
        EMPTY_SHEET_HEIGHT_MM,
        SHEET_PADDING_MM * 2 + instances.length * (maxItemHeight + gap)
    );
    const innerWidthLimit = Math.max(1, widthLimit - sheetPadding * 2);
    const innerHeightLimit = Math.max(1, maxLengthMm - sheetPadding * 2);
    const byArea = (a, b) => {
        const areaDelta = (b.width * b.height) - (a.width * a.height);
        if (Math.abs(areaDelta) > 0.1) return areaDelta;
        return Math.max(b.width, b.height) - Math.max(a.width, a.height);
    };
    const byHeight = (a, b) => (b.height - a.height) || byArea(a, b);
    const byWidth = (a, b) => (b.width - a.width) || byArea(a, b);
    const byAspect = (a, b) => (b.width / Math.max(1, b.height)) - (a.width / Math.max(1, a.height)) || byArea(a, b);
    const packingOrders = [
        [...instances].sort(byArea),
        [...instances].sort(byHeight),
        [...instances].sort(byWidth),
        [...instances].sort(byAspect),
        [...instances],
    ];

    const packOrder = (sorted) => {
        const placements = [];
        let freeRects = [{
            x: sheetPadding,
            y: sheetPadding,
            width: innerWidthLimit,
            height: Math.max(1, maxLengthMm - sheetPadding * 2),
        }];

        sorted.forEach((item) => {
            const orientationOptions = [false, true].filter((rotated, index) => (
                index === 0 || (item.shape !== 'round' && Math.abs(item.width - item.height) > 0.1)
            ));

            let best = null;
            const currentRight = placements.length
                ? Math.max(...placements.map((placed) => placed.x + placed.drawWidth))
                : sheetPadding;
            const currentBottom = placements.length
                ? Math.max(...placements.map((placed) => placed.y + placed.drawHeight))
                : sheetPadding;
            orientationOptions.forEach((rotated) => {
                const footprint = constrainFootprint(
                    getItemFootprint(item, rotated),
                    innerWidthLimit,
                    innerHeightLimit
                );
                const drawWidth = footprint.drawWidth;
                const drawHeight = footprint.drawHeight;

                freeRects.forEach((rect) => {
                    if (drawWidth > rect.width + RECT_EPSILON || drawHeight > rect.height + RECT_EPSILON) return;

                    const maxRight = widthLimit - sheetPadding;
                    const maxBottom = maxLengthMm - sheetPadding;
                    const basePlaceWidth = drawWidth + gap <= rect.width + RECT_EPSILON ? drawWidth + gap : drawWidth;
                    const basePlaceHeight = drawHeight + gap <= rect.height + RECT_EPSILON ? drawHeight + gap : drawHeight;
                    if (basePlaceWidth > rect.width + RECT_EPSILON || basePlaceHeight > rect.height + RECT_EPSILON) return;

                    const xPositions = uniqueNumbers([
                        rect.x,
                        rect.x + rect.width - basePlaceWidth,
                    ]);
                    const yPositions = uniqueNumbers([rect.y]);

                    yPositions.forEach((y) => {
                        xPositions.forEach((x) => {
                            if (x < sheetPadding - RECT_EPSILON || y < sheetPadding - RECT_EPSILON) return;
                            if (x + drawWidth > maxRight + RECT_EPSILON || y + drawHeight > maxBottom + RECT_EPSILON) return;

                            const placeWidth = Math.min(basePlaceWidth, maxRight - x);
                            const placeHeight = Math.min(basePlaceHeight, maxBottom - y);
                            if (placeWidth < drawWidth - RECT_EPSILON || placeHeight < drawHeight - RECT_EPSILON) return;
                            if (x + placeWidth > rect.x + rect.width + RECT_EPSILON) return;
                            if (y + placeHeight > rect.y + rect.height + RECT_EPSILON) return;

                            const prospectiveRight = Math.max(currentRight, x + drawWidth);
                            const prospectiveBottom = Math.max(currentBottom, y + drawHeight);
                            const heightGrowth = Math.max(0, prospectiveBottom - currentBottom);
                            const widthGrowth = Math.max(0, prospectiveRight - currentRight);
                            const shortSideWaste = Math.min(rect.width - placeWidth, rect.height - placeHeight);
                            const longSideWaste = Math.max(rect.width - placeWidth, rect.height - placeHeight);
                            const areaWaste = (rect.width * rect.height) - (placeWidth * placeHeight);
                            const rotationCost = rotated ? 0.04 : 0;
                            const next = {
                                x,
                                y,
                                rank: [
                                    prospectiveBottom,
                                    heightGrowth,
                                    shortSideWaste,
                                    longSideWaste,
                                    areaWaste,
                                    widthGrowth,
                                    prospectiveRight,
                                    rotationCost,
                                    y,
                                    x,
                                ],
                                placeWidth,
                                placeHeight,
                                drawWidth: footprint.drawWidth,
                                drawHeight: footprint.drawHeight,
                                rotated,
                            };
                            if (!best || comparePlacementRanks(next.rank, best.rank) < 0) {
                                best = next;
                            }
                        });
                    });
                });
            });

            const fallbackFootprint = constrainFootprint(
                getItemFootprint(item, false),
                innerWidthLimit,
                innerHeightLimit
            );
            const placement = best || {
                x: sheetPadding,
                y: placements.length
                    ? Math.max(...placements.map((placed) => placed.y + placed.drawHeight + gap))
                    : sheetPadding,
                placeWidth: Math.min(fallbackFootprint.width + gap, innerWidthLimit),
                placeHeight: fallbackFootprint.height + gap,
                drawWidth: fallbackFootprint.drawWidth,
                drawHeight: fallbackFootprint.drawHeight,
                rotated: false,
            };
            const drawX = clamp(placement.x, sheetPadding, widthLimit - sheetPadding - placement.drawWidth);
            const drawY = Math.max(sheetPadding, placement.y);
            placements.push({
                ...item,
                x: drawX,
                y: drawY,
                drawWidth: placement.drawWidth,
                drawHeight: placement.drawHeight,
                rotated: placement.rotated,
            });
            freeRects = applyPlacementToFreeRects(freeRects, {
                x: placement.x,
                y: placement.y,
                width: placement.placeWidth,
                height: placement.placeHeight,
            });
        });

        const compactedPlacements = compactPlacements(placements, {
            gap,
            sheetPadding,
            widthLimit,
            maxLengthMm,
        });
        const usedHeight = compactedPlacements.length
            ? Math.max(...compactedPlacements.map((item) => item.y + item.drawHeight)) + sheetPadding
            : EMPTY_SHEET_HEIGHT_MM;
        const usedWidth = compactedPlacements.length
            ? Math.min(widthLimit, Math.max(...compactedPlacements.map((item) => item.x + item.drawWidth)) + sheetPadding)
            : widthLimit;
        return {
            placements: compactedPlacements,
            width: widthLimit,
            height: Math.max(260, Math.ceil(usedHeight)),
            usedWidth,
            usedHeight,
            maxLengthMm,
        };
    };

    return packingOrders
        .map(packOrder)
        .reduce((best, next) => {
            if (!best) return next;
            if (next.usedHeight < best.usedHeight) return next;
            if (next.usedHeight === best.usedHeight && next.usedWidth > best.usedWidth) return next;
            return best;
        }, null);
};

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
    const [logos, setLogos] = useState([]);
    const [logoGapMm, setLogoGapMm] = useState(DEFAULT_LOGO_GAP_MM);
    const [sheetWidthMm, setSheetWidthMm] = useState(DEFAULT_SHEET_WIDTH_MM);
    const [zoom, setZoom] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [isDraggingPreview, setIsDraggingPreview] = useState(false);
    const [exportBusy, setExportBusy] = useState(false);
    const [exportMsg, setExportMsg] = useState('');

    const addFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/') || isTiffFile(file));
        if (!files.length) return;
        setBusy(true);
        setError('');
        try {
            const next = [];
            for (const file of files) next.push(await prepareLogoFile(file));
            setLogos((current) => [...current, ...next]);
        } catch {
            setError(t(language, 'printCanvasUploadError'));
        } finally {
            setBusy(false);
        }
    }, [language]);

    const updateLogo = useCallback((id, patch) => {
        setLogos((current) => current.map((logo) => (
            logo.id === id ? { ...logo, ...patch } : logo
        )));
    }, []);

    const removeLogo = useCallback((id) => {
        setLogos((current) => current.filter((logo) => logo.id !== id));
    }, []);

    const startPreviewDrag = useCallback((event) => {
        if (event.button !== undefined && event.button !== 0) return;
        const target = previewScrollRef.current;
        if (!target) return;
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

    const instances = useMemo(() => expandInstances(logos), [logos]);
    const layout = useMemo(
        () => packRows(instances, { sheetWidth: sheetWidthMm, logoGapMm }),
        [instances, logoGapMm, sheetWidthMm]
    );
    const previewFitScale = Math.min(1, 1080 / layout.width);
    const previewScale = previewFitScale * zoom;
    const density = layout.placements.length
        ? Math.round((layout.placements.reduce((sum, item) => sum + item.drawWidth * item.drawHeight, 0) / (layout.width * layout.height)) * 100)
        : 0;

    const buildTiffExport = useCallback(async () => {
        if (!layout.placements.length) {
            throw new Error('empty-layout');
        }

        const pxPerMm = TIFF_EXPORT_DPI / MM_PER_INCH;
        const widthPx = Math.max(1, Math.ceil(layout.width * pxPerMm));
        const heightPx = Math.max(1, Math.ceil(layout.usedHeight * pxPerMm));

        const imageCache = new Map();
        const drawItems = layout.placements.map((item) => ({
            ...item,
            px: {
                x: Math.round(item.x * pxPerMm),
                y: Math.round(item.y * pxPerMm),
                width: Math.round(item.drawWidth * pxPerMm),
                height: Math.round(item.drawHeight * pxPerMm),
            },
        }));
        for (const item of drawItems) {
            if (!imageCache.has(item.logoId)) {
                imageCache.set(item.logoId, await loadImage(item.src));
            }
        }

        const renderStrip = (ctx, topPx, rows) => {
            const bottomPx = topPx + rows;
            ctx.save();
            ctx.translate(0, -topPx);
            for (const item of drawItems) {
                const { x, y, width, height } = item.px;
                if (y >= bottomPx || y + height <= topPx) continue;
                if (item.rotated) {
                    ctx.save();
                    ctx.translate(x + width / 2, y + height / 2);
                    ctx.rotate(Math.PI / 2);
                    ctx.drawImage(imageCache.get(item.logoId), -height / 2, -width / 2, height, width);
                    ctx.restore();
                } else {
                    ctx.drawImage(imageCache.get(item.logoId), x, y, width, height);
                }
            }
            ctx.restore();
        };

        const blob = buildStripedTiff({
            width: widthPx,
            height: heightPx,
            dpi: TIFF_EXPORT_DPI,
            rowsPerStrip: TIFF_STRIP_ROWS,
            renderStrip,
        });
        const metadata = {
            sheet_width_mm: layout.width,
            used_width_mm: layout.usedWidth,
            used_height_mm: layout.usedHeight,
            max_length_m: Math.ceil(layout.usedHeight / 1000),
            logo_gap_mm: logoGapMm,
            items_count: layout.placements.length,
            density,
            export_dpi: TIFF_EXPORT_DPI,
            pixel_width: widthPx,
            pixel_height: heightPx,
            logos: logos.map((logo) => {
                const widthMm = logoWidthMm(logo);
                return {
                    id: logo.id,
                    name: logo.name,
                    quantity: logo.quantity,
                    width_px: logo.widthPx,
                    height_px: logo.heightPx,
                    width_mm: widthMm,
                    height_mm: logoHeightMm(logo, widthMm),
                };
            }),
            placements: layout.placements.map((item) => ({
                logo_id: item.logoId,
                name: item.name,
                copy_index: item.copyIndex,
                x_mm: item.x,
                y_mm: item.y,
                width_mm: item.drawWidth,
                height_mm: item.drawHeight,
                rotated: Boolean(item.rotated),
            })),
        };

        return { blob, metadata };
    }, [density, layout, logoGapMm, logos]);

    const exportTiff = useCallback(async () => {
        setExportBusy(true);
        setExportMsg('');
        setError('');
        try {
            const { blob, metadata } = await buildTiffExport();
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `print-canvas-${stamp}.tiff`;
            const file = new File([blob], filename, { type: 'image/tiff' });
            const { data: item } = await printCanvasApi.createExport(file, metadata);
            // Backend stores the print-ready CMYK TIFF — download that, not the local RGB raster.
            try {
                const { data: cmykBlob } = await printCanvasApi.downloadExport(item.id);
                downloadBlob(cmykBlob, filename);
            } catch {
                downloadBlob(blob, filename);
            }
            setExportMsg(t(language, 'printCanvasExportSaved'));
        } catch (err) {
            console.error(err);
            setExportMsg('');
            setError(t(language, err?.message === 'empty-layout' ? 'printCanvasExportEmpty' : 'printCanvasExportError'));
        } finally {
            setExportBusy(false);
        }
    }, [buildTiffExport, language]);

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

                            <div className="mt-4 flex shrink-0 items-center justify-between gap-3">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/42">{t(language, 'printCanvasLogos')}</span>
                                <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white/55">{instances.length}</span>
                            </div>

                            <div className="mt-3 min-h-[160px] flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
                                {!logos.length && (
                                    <div className="rounded-[12px] border border-white/12 bg-white/7 px-4 py-5 text-center text-[12px] font-bold leading-relaxed text-white/48">
                                        {t(language, 'printCanvasEmpty')}
                                    </div>
                                )}
                                {logos.map((logo) => (
                                    <div key={logo.id} className="min-w-0 rounded-[12px] border border-white/12 bg-white/7 p-3">
                                        <div className="grid min-w-0 grid-cols-[56px_minmax(0,1fr)_auto_28px] items-center gap-2">
                                            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-[9px] border border-white/14 bg-white">
                                                <img src={logo.src} alt={logo.name} className="max-h-full max-w-full object-contain" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="max-h-9 overflow-hidden break-all text-[12px] font-black leading-tight sm:text-[13px]">{logo.name}</p>
                                                <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/38">
                                                    {Math.round(logo.widthPx)} x {Math.round(logo.heightPx)} px
                                                </p>
                                            </div>
                                            <div className="flex min-w-0 items-center gap-1">
                                                <QuantityButton disabled={logo.quantity <= 1} onClick={() => updateLogo(logo.id, { quantity: Math.max(1, logo.quantity - 1) })}>−</QuantityButton>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    max="999"
                                                    value={logo.quantity}
                                                    aria-label={t(language, 'printCanvasQuantity')}
                                                    onChange={(event) => updateLogo(logo.id, { quantity: clamp(Number(event.target.value) || 1, 1, 999) })}
                                                    className="h-8 w-12 rounded-[8px] border border-white/14 bg-[#211a1d] text-center text-[12px] font-black text-white outline-none [color-scheme:dark] focus:border-[#fff9ec]/70"
                                                />
                                                <QuantityButton onClick={() => updateLogo(logo.id, { quantity: Math.min(999, logo.quantity + 1) })}>+</QuantityButton>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeLogo(logo.id)}
                                                className="h-7 w-7 rounded-full text-[18px] leading-none text-white/38 transition hover:bg-white/10 hover:text-white"
                                                aria-label={t(language, 'cartDeleteBtn')}
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/8 pt-2">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-white/42">
                                                {t(language, 'printCanvasLogoSize')}
                                            </span>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-white/38">
                                                {logoSizeLabel(logo)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </aside>

                    <section className="min-w-0 rounded-[14px] border border-white/14 bg-[#2b2428]/78 shadow-[0_24px_70px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                        <div className="border-b border-white/12 px-4 py-4">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">{t(language, 'printCanvasPreview')}</p>
                                <h2 className="mt-1 text-[20px] font-black leading-tight">{t(language, 'printCanvasTitle')}</h2>
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
                                    {mmLabel(layout.usedWidth)} x {mmLabel(layout.usedHeight)}
                                </p>
                            </div>
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasLogoGap')}</p>
                                <div className="mt-2 grid grid-cols-2 gap-1" aria-label={t(language, 'printCanvasLogoGap')}>
                                    {LOGO_GAP_OPTIONS_MM.map((gap) => (
                                        <button
                                            key={gap}
                                            type="button"
                                            onClick={() => setLogoGapMm(gap)}
                                            className="h-8 rounded-[8px] border px-2 text-[12px] font-black transition"
                                            style={{
                                                borderColor: logoGapMm === gap ? '#fff9ec' : 'rgba(255,255,255,0.14)',
                                                backgroundColor: logoGapMm === gap ? '#fff9ec' : '#211a1d',
                                                color: logoGapMm === gap ? '#211a1d' : '#fff',
                                            }}
                                        >
                                            {gap} мм
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasItems')}</p>
                                <p className="mt-1 text-[14px] font-black">{instances.length}</p>
                            </div>
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasDensity')}</p>
                                <p className="mt-1 text-[14px] font-black">{density}%</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                            <div className="flex min-w-0 flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasZoom')}</span>
                                {exportMsg && <span className="text-[11px] font-bold text-emerald-300">{exportMsg}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={exportTiff}
                                    disabled={exportBusy || !layout.placements.length}
                                    className="h-8 rounded-[8px] border border-[#fff9ec]/35 bg-[#fff9ec] px-3 text-[11px] font-black uppercase tracking-wider text-[#211a1d] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {exportBusy ? t(language, 'printCanvasExporting') : t(language, 'printCanvasExportTiff')}
                                </button>
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
                                className="relative mx-auto rounded-[8px] border border-[#fff9ec]/55 bg-[#fff9ec]/8 shadow-[0_0_0_1px_rgba(255,249,236,0.16),0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-[2px] pointer-events-none"
                                style={{
                                    width: layout.width * previewScale,
                                    height: layout.height * previewScale,
                                    backgroundImage: 'linear-gradient(rgba(255,249,236,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(255,249,236,0.10) 1px, transparent 1px)',
                                    backgroundSize: `${20 * previewScale}px ${20 * previewScale}px`,
                                }}
                            >
                                {!layout.placements.length && (
                                    <div className="absolute inset-0 grid place-items-center px-8 text-center text-[14px] font-black uppercase tracking-wider text-white/40">
                                        {t(language, 'printCanvasEmptyCanvas')}
                                    </div>
                                )}
                                {layout.placements.map((item) => (
                                    <div
                                        key={item.id}
                                        className={`absolute grid place-items-center bg-white/8 ${
                                            item.rotated ? 'overflow-visible' : 'overflow-hidden'
                                        }`}
                                        title={`${item.name} #${item.copyIndex + 1}`}
                                        style={{
                                            left: item.x * previewScale,
                                            top: item.y * previewScale,
                                            width: item.drawWidth * previewScale,
                                            height: item.drawHeight * previewScale,
                                            borderRadius: item.shape === 'round' ? '999px' : 4,
                                            boxShadow: 'inset 0 0 0 1px rgba(255,249,236,0.2)',
                                        }}
                                    >
                                        <img
                                            src={item.src}
                                            alt=""
                                            className="h-full w-full object-contain"
                                            style={item.rotated ? {
                                                width: item.drawHeight * previewScale,
                                                height: item.drawWidth * previewScale,
                                                maxWidth: 'none',
                                                maxHeight: 'none',
                                                transform: 'rotate(90deg)',
                                            } : undefined}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </section>
            </div>
        </main>
    );
};
