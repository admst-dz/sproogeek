import { useCallback, useMemo, useState } from 'react';
import { t } from '../../i18n';
import { useConfigurator } from '../../store';

const DEFAULT_SHEET_WIDTH_MM = 900;
const DEFAULT_SHEET_HEIGHT_MM = 360;
const MIN_SHEET_WIDTH_MM = 180;
const MAX_SHEET_WIDTH_MM = 1600;
const MIN_SHEET_HEIGHT_MM = 180;
const MAX_SHEET_HEIGHT_MM = 3000;
const DEFAULT_LOGO_WIDTH_MM = 72;
const MIN_LOGO_WIDTH_MM = 12;
const MAX_LOGO_WIDTH_MM = 260;
const MAX_IMAGE_EDGE = 1400;
const MINIMIZE_GAP_MM = 1.5;
const COMFORT_GAP_MM = 14;
const MINIMIZE_SHEET_PADDING_MM = 8;
const COMFORT_SHEET_PADDING_MM = 16;

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
        widthMm: DEFAULT_LOGO_WIDTH_MM,
        shape: hasTransparentCorners && aspect > 0.82 && aspect < 1.18 ? 'round' : 'auto',
    };
};

const expandInstances = (logos) => logos.flatMap((logo, logoIndex) => {
    const width = clamp(Number(logo.widthMm) || DEFAULT_LOGO_WIDTH_MM, MIN_LOGO_WIDTH_MM, MAX_LOGO_WIDTH_MM);
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

const packRows = (instances, { mode, sheetWidth, sheetHeight }) => {
    const gap = mode === 'comfort' ? COMFORT_GAP_MM : MINIMIZE_GAP_MM;
    const rowGap = mode === 'comfort' ? COMFORT_GAP_MM : MINIMIZE_GAP_MM;
    const sheetPadding = mode === 'comfort' ? COMFORT_SHEET_PADDING_MM : MINIMIZE_SHEET_PADDING_MM;
    const widthLimit = clamp(Number(sheetWidth) || DEFAULT_SHEET_WIDTH_MM, MIN_SHEET_WIDTH_MM, MAX_SHEET_WIDTH_MM);
    const minHeight = clamp(Number(sheetHeight) || DEFAULT_SHEET_HEIGHT_MM, MIN_SHEET_HEIGHT_MM, MAX_SHEET_HEIGHT_MM);
    const innerWidthLimit = Math.max(1, widthLimit - sheetPadding * 2);
    const sorted = mode === 'comfort'
        ? instances
        : [...instances].sort((a, b) => Math.max(b.width, b.height) - Math.max(a.width, a.height));
    const getFootprint = (item) => {
        const compactRound = mode === 'minimize' && item.shape === 'round';
        return {
            width: compactRound ? item.width * 0.9 : item.width,
            height: compactRound ? item.height * 0.84 : item.height,
            compactRound,
        };
    };

    const rows = [];
    let currentRow = { items: [], width: 0, height: 0, hasRound: false };

    sorted.forEach((item) => {
        const footprint = getFootprint(item);
        const nextWidth = currentRow.items.length
            ? currentRow.width + gap + footprint.width
            : footprint.width;

        if (currentRow.items.length && nextWidth > innerWidthLimit) {
            rows.push(currentRow);
            currentRow = { items: [], width: 0, height: 0, hasRound: false };
        }

        currentRow.items.push({ item, footprint });
        currentRow.width = currentRow.items.length > 1
            ? currentRow.width + gap + footprint.width
            : footprint.width;
        currentRow.height = Math.max(currentRow.height, footprint.height);
        currentRow.hasRound ||= footprint.compactRound;
    });

    if (currentRow.items.length) rows.push(currentRow);

    const placements = [];
    let y = 0;

    rows.forEach((row, rowIndex) => {
        const stagger = mode === 'minimize' && row.hasRound && rowIndex % 2 === 1
            ? Math.min(28, Math.max(0, innerWidthLimit - row.width) / 2)
            : 0;
        let x = sheetPadding + stagger;

        row.items.forEach(({ item, footprint }) => {
            const drawX = clamp(x - (item.width - footprint.width) / 2, sheetPadding, widthLimit - sheetPadding - item.width);
            const drawY = Math.max(sheetPadding, sheetPadding + y - (item.height - footprint.height) / 2);
            placements.push({ ...item, x: drawX, y: drawY });
            x += footprint.width + gap;
        });

        y += row.height + rowGap;
    });

    const usedHeight = placements.length
        ? Math.max(...placements.map((item) => item.y + item.height)) + sheetPadding
        : minHeight;
    const usedWidth = placements.length
        ? Math.min(widthLimit, Math.max(...placements.map((item) => item.x + item.width)) + sheetPadding)
        : widthLimit;
    return {
        placements,
        width: widthLimit,
        height: Math.max(260, minHeight, Math.ceil(usedHeight)),
        usedWidth,
        usedHeight: Math.ceil(usedHeight),
    };
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
    const [logos, setLogos] = useState([]);
    const [mode, setMode] = useState('minimize');
    const [sheetWidthMm, setSheetWidthMm] = useState(DEFAULT_SHEET_WIDTH_MM);
    const [sheetHeightMm, setSheetHeightMm] = useState(DEFAULT_SHEET_HEIGHT_MM);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

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

    const instances = useMemo(() => expandInstances(logos), [logos]);
    const layout = useMemo(() => packRows(instances, { mode, sheetWidth: sheetWidthMm, sheetHeight: sheetHeightMm }), [instances, mode, sheetHeightMm, sheetWidthMm]);
    const previewScale = Math.min(1, 1080 / layout.width);
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
                        <div className="flex flex-col gap-3 border-b border-white/12 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">{t(language, 'printCanvasPreview')}</p>
                                <h2 className="mt-1 text-[20px] font-black leading-tight">{t(language, mode === 'minimize' ? 'printCanvasMinimize' : 'printCanvasComfort')}</h2>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    aria-pressed={mode === 'minimize'}
                                    onClick={() => setMode('minimize')}
                                    className="rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wider transition hover:text-white"
                                    style={{
                                        borderColor: mode === 'minimize' ? '#fff9ec' : 'rgba(255,255,255,0.16)',
                                        backgroundColor: mode === 'minimize' ? '#fff9ec' : 'rgba(255,255,255,0.08)',
                                        color: mode === 'minimize' ? '#211a1d' : 'rgba(255,255,255,0.68)',
                                    }}
                                >
                                    {t(language, 'printCanvasMinimize')}
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={mode === 'comfort'}
                                    onClick={() => setMode('comfort')}
                                    className="rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wider transition hover:text-white"
                                    style={{
                                        borderColor: mode === 'comfort' ? '#fff9ec' : 'rgba(255,255,255,0.16)',
                                        backgroundColor: mode === 'comfort' ? '#fff9ec' : 'rgba(255,255,255,0.08)',
                                        color: mode === 'comfort' ? '#211a1d' : 'rgba(255,255,255,0.68)',
                                    }}
                                >
                                    {t(language, 'printCanvasComfort')}
                                </button>
                            </div>
                        </div>

                        <div className="grid gap-3 border-b border-white/10 px-4 py-3 md:grid-cols-[minmax(0,1.35fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
                            <div className="rounded-[10px] border border-white/10 bg-white/7 px-3 py-2">
                                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-white/36">{t(language, 'printCanvasSize')}</p>
                                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                                    <input
                                        type="number"
                                        min={MIN_SHEET_WIDTH_MM}
                                        max={MAX_SHEET_WIDTH_MM}
                                        value={sheetWidthMm}
                                        aria-label={t(language, 'printCanvasSheetWidth')}
                                        onChange={(event) => setSheetWidthMm(clamp(Number(event.target.value) || DEFAULT_SHEET_WIDTH_MM, MIN_SHEET_WIDTH_MM, MAX_SHEET_WIDTH_MM))}
                                        className="h-8 min-w-0 rounded-[8px] border border-white/14 bg-[#211a1d] px-2 text-center text-[12px] font-black text-white outline-none [color-scheme:dark] focus:border-[#fff9ec]/70"
                                    />
                                    <span className="text-[12px] font-black text-white/42">×</span>
                                    <input
                                        type="number"
                                        min={MIN_SHEET_HEIGHT_MM}
                                        max={MAX_SHEET_HEIGHT_MM}
                                        value={sheetHeightMm}
                                        aria-label={t(language, 'printCanvasSheetHeight')}
                                        onChange={(event) => setSheetHeightMm(clamp(Number(event.target.value) || DEFAULT_SHEET_HEIGHT_MM, MIN_SHEET_HEIGHT_MM, MAX_SHEET_HEIGHT_MM))}
                                        className="h-8 min-w-0 rounded-[8px] border border-white/14 bg-[#211a1d] px-2 text-center text-[12px] font-black text-white outline-none [color-scheme:dark] focus:border-[#fff9ec]/70"
                                    />
                                </div>
                                <p className="mt-1 text-[10px] font-bold text-white/38">{mmLabel(layout.usedWidth)} x {mmLabel(layout.usedHeight)}</p>
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

                        <div className="min-h-[520px] overflow-auto p-4 custom-scrollbar">
                            <div
                                className="relative mx-auto rounded-[8px] border border-[#fff9ec]/55 bg-[#fff9ec]/8 shadow-[0_0_0_1px_rgba(255,249,236,0.16),0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-[2px]"
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
                                            width: item.width * previewScale,
                                            height: item.height * previewScale,
                                            borderRadius: item.shape === 'round' ? '999px' : 4,
                                        }}
                                    >
                                        <img src={item.src} alt="" className="h-full w-full object-contain" />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-white/10 px-4 py-3 text-[11px] font-bold leading-relaxed text-white/44">
                            {t(language, 'printCanvasNoCheckout')}
                        </div>
                    </section>
                </section>
            </div>
        </main>
    );
};
