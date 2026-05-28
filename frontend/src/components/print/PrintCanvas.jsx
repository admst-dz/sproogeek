import { useCallback, useMemo, useRef, useState } from 'react';
import { t } from '../../i18n';
import { useConfigurator } from '../../store';

const SHEET_WIDTH_OPTIONS_MM = [580, 280];
const DEFAULT_SHEET_WIDTH_MM = 580;
const SHEET_LENGTH_OPTIONS_M = [25, 50, 100];
const DEFAULT_SHEET_LENGTH_M = 25;
const EMPTY_SHEET_HEIGHT_MM = 360;
const DEFAULT_LOGO_WIDTH_MM = 72;
const MAX_IMAGE_EDGE = 1400;
const LOGO_GAP_OPTIONS_MM = [3, 5];
const DEFAULT_LOGO_GAP_MM = 3;
const SHEET_PADDING_MM = 8;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;
const RECT_EPSILON = 0.001;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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

const makeLogoId = () => (
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const prepareLogoFile = async (file) => {
    const source = await readAsDataURL(file);
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
    return {
        id: makeLogoId(),
        name: file.name || 'logo.png',
        src: canvas.toDataURL('image/png'),
        widthPx: width,
        heightPx: height,
        quantity: 1,
        shape: hasTransparentCorners && aspect > 0.82 && aspect < 1.18 ? 'round' : 'auto',
    };
};

const expandInstances = (logos) => logos.flatMap((logo, logoIndex) => {
    const width = DEFAULT_LOGO_WIDTH_MM;
    const height = Math.max(6, width * (logo.heightPx / Math.max(1, logo.widthPx)));
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

const packRows = (instances, { sheetWidth, maxLengthM, logoGapMm }) => {
    const gap = LOGO_GAP_OPTIONS_MM.includes(Number(logoGapMm)) ? Number(logoGapMm) : DEFAULT_LOGO_GAP_MM;
    const sheetPadding = SHEET_PADDING_MM;
    const widthLimit = SHEET_WIDTH_OPTIONS_MM.includes(Number(sheetWidth)) ? Number(sheetWidth) : DEFAULT_SHEET_WIDTH_MM;
    const maxLengthMm = (SHEET_LENGTH_OPTIONS_M.includes(Number(maxLengthM)) ? Number(maxLengthM) : DEFAULT_SHEET_LENGTH_M) * 1000;
    const innerWidthLimit = Math.max(1, widthLimit - sheetPadding * 2);
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
            orientationOptions.forEach((rotated) => {
                const footprint = getItemFootprint(item, rotated);
                const drawWidth = Math.min(footprint.drawWidth, innerWidthLimit);
                const drawHeight = footprint.drawHeight;

                freeRects.forEach((rect) => {
                    if (drawWidth > rect.width + RECT_EPSILON || drawHeight > rect.height + RECT_EPSILON) return;

                    const maxRight = widthLimit - sheetPadding;
                    const maxBottom = maxLengthMm - sheetPadding;
                    const placeWidth = Math.min(drawWidth + gap, maxRight - rect.x);
                    const placeHeight = Math.min(drawHeight + gap, maxBottom - rect.y);
                    if (placeWidth > rect.width + RECT_EPSILON || placeHeight > rect.height + RECT_EPSILON) return;

                    const usedBottom = rect.y + drawHeight;
                    const shortSideWaste = Math.min(rect.width - placeWidth, rect.height - placeHeight);
                    const longSideWaste = Math.max(rect.width - placeWidth, rect.height - placeHeight);
                    const areaWaste = (rect.width * rect.height) - (placeWidth * placeHeight);
                    const rotationBias = rotated && item.width / Math.max(1, item.height) > 2.2
                        ? -Math.max(0, item.width - item.height) * 0.08
                        : rotated ? 0.04 : 0;
                    const next = {
                        x: rect.x,
                        y: rect.y,
                        score: usedBottom + rotationBias,
                        shortSideWaste,
                        longSideWaste,
                        areaWaste,
                        placeWidth,
                        placeHeight,
                        drawWidth: footprint.drawWidth,
                        drawHeight: footprint.drawHeight,
                        rotated,
                    };
                    const isBetter = !best
                        || next.score < best.score - RECT_EPSILON
                        || (Math.abs(next.score - best.score) < RECT_EPSILON && next.shortSideWaste < best.shortSideWaste - RECT_EPSILON)
                        || (Math.abs(next.score - best.score) < RECT_EPSILON && Math.abs(next.shortSideWaste - best.shortSideWaste) < RECT_EPSILON && next.longSideWaste < best.longSideWaste - RECT_EPSILON)
                        || (Math.abs(next.score - best.score) < RECT_EPSILON && Math.abs(next.shortSideWaste - best.shortSideWaste) < RECT_EPSILON && Math.abs(next.longSideWaste - best.longSideWaste) < RECT_EPSILON && next.areaWaste < best.areaWaste - RECT_EPSILON)
                        || (Math.abs(next.score - best.score) < RECT_EPSILON && Math.abs(next.shortSideWaste - best.shortSideWaste) < RECT_EPSILON && Math.abs(next.longSideWaste - best.longSideWaste) < RECT_EPSILON && Math.abs(next.areaWaste - best.areaWaste) < RECT_EPSILON && next.x < best.x);
                    if (isBetter) {
                        best = next;
                    }
                });
            });

            const fallbackFootprint = getItemFootprint(item, false);
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

        const usedHeight = placements.length
            ? Math.max(...placements.map((item) => item.y + item.drawHeight)) + sheetPadding
            : EMPTY_SHEET_HEIGHT_MM;
        const usedWidth = placements.length
            ? Math.min(widthLimit, Math.max(...placements.map((item) => item.x + item.drawWidth)) + sheetPadding)
            : widthLimit;
        return {
            placements,
            width: widthLimit,
            height: Math.max(260, Math.ceil(usedHeight)),
            usedWidth,
            usedHeight: Math.ceil(usedHeight),
            maxLengthMm,
            lengthExceeded: usedHeight > maxLengthMm,
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

const mmLabel = (value) => `${Math.round(value)} мм`;

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
    const [sheetLengthM, setSheetLengthM] = useState(DEFAULT_SHEET_LENGTH_M);
    const [zoom, setZoom] = useState(1);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [isDraggingPreview, setIsDraggingPreview] = useState(false);

    const addFiles = useCallback(async (fileList) => {
        const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/'));
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
        () => packRows(instances, { sheetWidth: sheetWidthMm, maxLengthM: sheetLengthM, logoGapMm }),
        [instances, logoGapMm, sheetLengthM, sheetWidthMm]
    );
    const previewFitScale = Math.min(1, 1080 / layout.width);
    const previewScale = previewFitScale * zoom;
    const density = layout.placements.length
        ? Math.round((layout.placements.reduce((sum, item) => sum + item.width * item.height, 0) / (layout.width * layout.height)) * 100)
        : 0;

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
                                <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => addFiles(event.target.files)} />
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
                                    <div className="grid min-w-0 grid-cols-3 gap-1" aria-label={t(language, 'printCanvasSheetLength')}>
                                        {SHEET_LENGTH_OPTIONS_M.map((length) => (
                                            <button
                                                key={length}
                                                type="button"
                                                onClick={() => setSheetLengthM(length)}
                                                className="h-8 rounded-[8px] border px-2 text-[12px] font-black transition"
                                                style={{
                                                    borderColor: sheetLengthM === length ? '#fff9ec' : 'rgba(255,255,255,0.14)',
                                                    backgroundColor: sheetLengthM === length ? '#fff9ec' : '#211a1d',
                                                    color: sheetLengthM === length ? '#211a1d' : '#fff',
                                                }}
                                            >
                                                {length} м
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <p className={`mt-1 text-[10px] font-bold ${layout.lengthExceeded ? 'text-red-200' : 'text-white/38'}`}>
                                    {mmLabel(layout.usedWidth)} x {mmLabel(layout.usedHeight)} / {sheetLengthM} м
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
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasZoom')}</span>
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
                                className="relative mx-auto rounded-[8px] border border-[#fff9ec]/55 bg-[#fff9ec]/8 shadow-[0_0_0_1px_rgba(255,249,236,0.16),0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-[2px] pointer-events-none"
                                style={{
                                    width: layout.width * previewScale,
                                    height: layout.height * previewScale,
                                    minWidth: 320,
                                    minHeight: 260,
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
                                        className="absolute grid place-items-center overflow-hidden border border-[#fff9ec]/20 bg-white/8"
                                        title={`${item.name} #${item.copyIndex + 1}`}
                                        style={{
                                            left: item.x * previewScale,
                                            top: item.y * previewScale,
                                            width: item.drawWidth * previewScale,
                                            height: item.drawHeight * previewScale,
                                            borderRadius: item.shape === 'round' ? '999px' : 4,
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
