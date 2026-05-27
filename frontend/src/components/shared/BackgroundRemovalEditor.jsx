import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import {
    addBackgroundSeedToMask,
    createAutoBackgroundMask,
    DEFAULT_BACKGROUND_STRENGTH,
    drawMaskedPreview,
    exportBackgroundRemovedFile,
    loadLogoImageData,
    paintBackgroundMask,
} from '../../utils/backgroundRemoval';

const CHECKERBOARD_STYLE = {
    backgroundColor: '#f7f2e8',
    backgroundImage: [
        'linear-gradient(45deg, rgba(60,48,52,0.15) 25%, transparent 25%)',
        'linear-gradient(-45deg, rgba(60,48,52,0.15) 25%, transparent 25%)',
        'linear-gradient(45deg, transparent 75%, rgba(60,48,52,0.15) 75%)',
        'linear-gradient(-45deg, transparent 75%, rgba(60,48,52,0.15) 75%)',
    ].join(','),
    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
    backgroundSize: '20px 20px',
};

const MODES = [
    { id: 'pick', labelKey: 'logoBackgroundPick' },
    { id: 'erase', labelKey: 'logoBackgroundErase' },
    { id: 'restore', labelKey: 'logoBackgroundRestore' },
];

export const BackgroundRemovalEditor = ({
    open,
    file,
    fileIndex = 0,
    fileCount = 1,
    language,
    onApply,
    onSkip,
    onCancel,
}) => {
    const canvasRef = useRef(null);
    const imageDataRef = useRef(null);
    const maskRef = useRef(null);
    const drawingRef = useRef(false);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState('');
    const [mode, setMode] = useState('pick');
    const [strength, setStrength] = useState(DEFAULT_BACKGROUND_STRENGTH);
    const [brushSize, setBrushSize] = useState(34);
    const [version, setVersion] = useState(0);

    const progressLabel = useMemo(() => (
        fileCount > 1 ? `${fileIndex + 1}/${fileCount}` : ''
    ), [fileCount, fileIndex]);

    const redraw = useCallback(() => {
        drawMaskedPreview(canvasRef.current, imageDataRef.current, maskRef.current);
    }, []);

    useEffect(() => {
        if (!open || !file) return undefined;
        let cancelled = false;
        imageDataRef.current = null;
        maskRef.current = null;
        const resetTimer = window.setTimeout(() => {
            if (cancelled) return;
            setStatus('loading');
            setError('');
            setMode('pick');
            setStrength(DEFAULT_BACKGROUND_STRENGTH);
            setBrushSize(34);
        }, 0);

        loadLogoImageData(file)
            .then((imageData) => {
                if (cancelled) return;
                imageDataRef.current = imageData;
                maskRef.current = createAutoBackgroundMask(imageData, DEFAULT_BACKGROUND_STRENGTH);
                setStatus('ready');
                setVersion((value) => value + 1);
            })
            .catch(() => {
                if (cancelled) return;
                setStatus('error');
                setError(t(language, 'logoBackgroundFailed'));
            });

        return () => {
            cancelled = true;
            window.clearTimeout(resetTimer);
        };
    }, [file, language, open]);

    useEffect(() => {
        if (!open || status !== 'ready') return;
        redraw();
    }, [open, redraw, status, version]);

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onCancel?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onCancel, open]);

    const pointFromEvent = useCallback((event) => {
        const canvas = canvasRef.current;
        const imageData = imageDataRef.current;
        if (!canvas || !imageData) return null;
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - rect.left) / rect.width) * imageData.width,
            y: ((event.clientY - rect.top) / rect.height) * imageData.height,
        };
    }, []);

    const updateMask = useCallback((nextMask) => {
        maskRef.current = nextMask;
        setVersion((value) => value + 1);
    }, []);

    const runAuto = useCallback(() => {
        const imageData = imageDataRef.current;
        if (!imageData) return;
        setStatus('working');
        window.setTimeout(() => {
            try {
                updateMask(createAutoBackgroundMask(imageData, strength));
                setStatus('ready');
            } catch {
                setStatus('ready');
                setError(t(language, 'logoBackgroundFailed'));
            }
        }, 20);
    }, [language, strength, updateMask]);

    const applySeed = useCallback((event) => {
        const imageData = imageDataRef.current;
        const mask = maskRef.current;
        const point = pointFromEvent(event);
        if (!imageData || !mask || !point) return;
        setStatus('working');
        window.setTimeout(() => {
            try {
                updateMask(addBackgroundSeedToMask(imageData, mask, point.x, point.y, strength));
                setStatus('ready');
            } catch {
                setStatus('ready');
                setError(t(language, 'logoBackgroundFailed'));
            }
        }, 20);
    }, [language, pointFromEvent, strength, updateMask]);

    const paintAt = useCallback((event) => {
        const imageData = imageDataRef.current;
        const mask = maskRef.current;
        const point = pointFromEvent(event);
        if (!imageData || !mask || !point) return;
        updateMask(paintBackgroundMask(
            mask,
            imageData.width,
            imageData.height,
            point.x,
            point.y,
            brushSize,
            mode === 'erase'
        ));
    }, [brushSize, mode, pointFromEvent, updateMask]);

    const handlePointerDown = useCallback((event) => {
        if (status !== 'ready') return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        if (mode === 'pick') {
            applySeed(event);
            return;
        }
        drawingRef.current = true;
        paintAt(event);
    }, [applySeed, mode, paintAt, status]);

    const handlePointerMove = useCallback((event) => {
        if (!drawingRef.current || mode === 'pick' || status !== 'ready') return;
        event.preventDefault();
        paintAt(event);
    }, [mode, paintAt, status]);

    const stopDrawing = useCallback((event) => {
        drawingRef.current = false;
        try {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
            /* pointer already released */
        }
    }, []);

    const apply = useCallback(async () => {
        const imageData = imageDataRef.current;
        const mask = maskRef.current;
        if (!imageData || !mask || !file) return;
        setStatus('exporting');
        setError('');
        try {
            const output = await exportBackgroundRemovedFile(file, imageData, mask);
            onApply?.(output);
        } catch {
            setStatus('ready');
            setError(t(language, 'logoBackgroundFailed'));
        }
    }, [file, language, onApply]);

    if (!open || !file || typeof document === 'undefined') return null;

    const busy = status === 'loading' || status === 'working' || status === 'exporting';

    return createPortal(
        <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-black/70 px-3 py-4 font-zen text-white backdrop-blur-sm sm:items-center">
            <button
                type="button"
                className="absolute inset-0 cursor-default"
                onClick={onCancel}
                aria-label={t(language, 'logoBackgroundCancel')}
            />
            <section className="relative flex max-h-[calc(100vh-2rem)] w-full max-w-[920px] flex-col overflow-hidden rounded-[16px] border border-white/18 bg-[#342a2e] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
                <div className="flex items-start justify-between gap-4 border-b border-white/12 px-4 py-3 sm:px-5 sm:py-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">{t(language, 'logoBackgroundEyebrow')}</p>
                            {progressLabel && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black text-white/55">{progressLabel}</span>}
                        </div>
                        <h2 className="mt-1 truncate text-[21px] font-black leading-tight">{t(language, 'logoBackgroundTitle')}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/16 bg-white/8 text-white/65 transition hover:bg-white/14 hover:text-white"
                        aria-label={t(language, 'logoBackgroundCancel')}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <div className="min-h-0">
                        <div className="relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-[12px] border border-white/14 p-3 sm:min-h-[420px]" style={CHECKERBOARD_STYLE}>
                            {busy && (
                                <div className="absolute inset-0 z-10 grid place-items-center bg-[#211a1d]/42 text-center text-[12px] font-black uppercase tracking-widest text-white/78 backdrop-blur-[2px]">
                                    {status === 'exporting' ? t(language, 'logoBackgroundExporting') : t(language, 'logoBackgroundPreparing')}
                                </div>
                            )}
                            <canvas
                                ref={canvasRef}
                                className={`max-h-[58vh] max-w-full touch-none select-none object-contain ${mode === 'pick' ? 'cursor-crosshair' : 'cursor-none'}`}
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={stopDrawing}
                                onPointerCancel={stopDrawing}
                                onPointerLeave={(event) => { if (drawingRef.current) stopDrawing(event); }}
                            />
                        </div>
                        <p className="mt-2 truncate text-[11px] font-bold text-white/45">{file.name}</p>
                    </div>

                    <div className="flex min-w-0 flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={runAuto}
                                className="inline-flex items-center justify-center gap-2 rounded-[9px] border border-white/18 bg-white/10 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white transition hover:bg-white/16 disabled:opacity-50"
                            >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M5 3l1.3 3.7L10 8l-3.7 1.3L5 13 3.7 9.3 0 8l3.7-1.3L5 3Zm11 2l1.1 3.1L20 9l-2.9.9L16 13l-1.1-3.1L12 9l2.9-.9L16 5Zm-3 8l1.7 4.8L19 19l-4.3 1.2L13 25l-1.7-4.8L7 19l4.3-1.2L13 13Z" fill="currentColor" transform="scale(.92)" />
                                </svg>
                                {t(language, 'logoBackgroundAuto')}
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                    const imageData = imageDataRef.current;
                                    if (!imageData) return;
                                    updateMask(new Uint8ClampedArray(imageData.width * imageData.height));
                                }}
                                className="rounded-[9px] border border-white/18 bg-white/8 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-white/70 transition hover:bg-white/14 hover:text-white disabled:opacity-50"
                            >
                                {t(language, 'logoBackgroundReset')}
                            </button>
                        </div>

                        <div className="space-y-2 rounded-[10px] border border-white/12 bg-black/12 p-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-[10px] font-black uppercase tracking-wider text-white/45">{t(language, 'logoBackgroundStrength')}</span>
                                <span className="text-[11px] font-black text-white/70">{Math.round(strength * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={strength}
                                onChange={(event) => setStrength(Number(event.target.value))}
                                className="h-1 w-full appearance-none rounded-full bg-white/25 accent-[#fff9ec]"
                            />
                        </div>

                        <div className="space-y-2">
                            <div className="grid grid-cols-3 gap-1.5">
                                {MODES.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setMode(item.id)}
                                        className={`rounded-full border px-2 py-2 text-[10px] font-black uppercase tracking-wider transition disabled:opacity-50 ${
                                            mode === item.id
                                                ? 'border-[#fff9ec] bg-[#fff9ec] text-[#191919]'
                                                : 'border-white/18 bg-white/8 text-white/68 hover:text-white'
                                        }`}
                                    >
                                        {t(language, item.labelKey)}
                                    </button>
                                ))}
                            </div>
                            {mode !== 'pick' && (
                                <div className="space-y-2 rounded-[10px] border border-white/12 bg-black/12 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-white/45">{t(language, 'logoBackgroundBrush')}</span>
                                        <span className="text-[11px] font-black text-white/70">{brushSize}px</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="8"
                                        max="90"
                                        step="1"
                                        value={brushSize}
                                        onChange={(event) => setBrushSize(Number(event.target.value))}
                                        className="h-1 w-full appearance-none rounded-full bg-white/25 accent-[#fff9ec]"
                                    />
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="rounded-[9px] border border-red-300/25 bg-red-500/12 px-3 py-2 text-[12px] font-bold text-red-100">
                                {error}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid gap-2 border-t border-white/12 px-4 py-3 sm:grid-cols-[auto_1fr_auto] sm:px-5">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSkip?.(file)}
                        className="rounded-full border border-white/20 bg-white/8 px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-white/70 transition hover:bg-white/14 hover:text-white disabled:opacity-50"
                    >
                        {t(language, 'logoBackgroundSkip')}
                    </button>
                    <span className="hidden sm:block" />
                    <button
                        type="button"
                        disabled={busy || status === 'error'}
                        onClick={apply}
                        className="rounded-full bg-[#fff9ec] px-6 py-2.5 text-[12px] font-black uppercase tracking-widest text-[#211a1d] transition hover:bg-white active:scale-[0.98] disabled:opacity-50"
                    >
                        {t(language, 'logoBackgroundApply')}
                    </button>
                </div>
            </section>
        </div>,
        document.body
    );
};
