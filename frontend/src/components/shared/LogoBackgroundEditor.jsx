import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';
import { mediaApi } from '../../api';

const MAX_EDGE = 2000;
const UNDO_LIMIT = 25;

const loadImageFromUrl = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
});

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
});

// Crop fully transparent margins so the applied logo is tight.
const trimTransparent = (canvas) => {
    const { width, height } = canvas;
    const ctx = canvas.getContext('2d');
    const { data } = ctx.getImageData(0, 0, width, height);
    let minX = width; let minY = height; let maxX = -1; let maxY = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] > 4) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX || maxY < minY) return canvas;
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w === width && h === height) return canvas;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d').drawImage(canvas, minX, minY, w, h, 0, 0, w, h);
    return out;
};

export const LogoBackgroundEditor = ({ logo, language, onApply, onClose }) => {
    const displayRef = useRef(null);
    const originalRef = useRef(null);
    const maskRef = useRef(null);
    const brushStampRef = useRef(null);
    const drawingRef = useRef(null);
    const undoRef = useRef([]);
    const toolRef = useRef('erase');

    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(true);
    const [tool, setTool] = useState('erase');
    const [brush, setBrush] = useState(64);
    const [canUndo, setCanUndo] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { toolRef.current = tool; }, [tool]);

    const render = useCallback(() => {
        const display = displayRef.current;
        const original = originalRef.current;
        const mask = maskRef.current;
        if (!display || !original || !mask) return;
        const ctx = display.getContext('2d');
        ctx.clearRect(0, 0, display.width, display.height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(original, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
    }, []);

    useEffect(() => {
        const diameter = Math.max(6, Math.round(brush));
        const stamp = document.createElement('canvas');
        stamp.width = diameter;
        stamp.height = diameter;
        const ctx = stamp.getContext('2d');
        const radius = diameter / 2;
        const gradient = ctx.createRadialGradient(radius, radius, radius * 0.1, radius, radius, radius);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.65, 'rgba(255,255,255,0.92)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, diameter, diameter);
        brushStampRef.current = stamp;
    }, [brush]);

    const setMaskFromImage = useCallback((image, width, height) => {
        const mask = maskRef.current;
        const ctx = mask.getContext('2d');
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(image, 0, 0, width, height);
    }, []);

    const runAuto = useCallback(async () => {
        const original = originalRef.current;
        if (!original) return;
        setBusy(true);
        setError('');
        try {
            const sourceBlob = await canvasToBlob(original);
            const file = new File([sourceBlob], logo?.filename || 'logo.png', { type: 'image/png' });
            // trim=false keeps the cutout aligned with the source frame.
            const { data } = await mediaApi.removeLogoBackground(file, { trim: false });
            const url = URL.createObjectURL(data);
            try {
                const autoImage = await loadImageFromUrl(url);
                setMaskFromImage(autoImage, original.width, original.height);
                render();
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch {
            setError(t(language, 'logoBackgroundFailed'));
        } finally {
            setBusy(false);
        }
    }, [language, logo, render, setMaskFromImage]);

    useEffect(() => {
        let cancelled = false;
        let objectUrl = null;
        (async () => {
            try {
                setBusy(true);
                setError('');
                const response = await fetch(logo.texture);
                const blob = await response.blob();
                objectUrl = URL.createObjectURL(blob);
                const image = await loadImageFromUrl(objectUrl);
                if (cancelled) return;

                const sourceWidth = image.naturalWidth || image.width;
                const sourceHeight = image.naturalHeight || image.height;
                const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
                const width = Math.max(1, Math.round(sourceWidth * scale));
                const height = Math.max(1, Math.round(sourceHeight * scale));

                const original = document.createElement('canvas');
                original.width = width;
                original.height = height;
                original.getContext('2d').drawImage(image, 0, 0, width, height);
                originalRef.current = original;

                const mask = document.createElement('canvas');
                mask.width = width;
                mask.height = height;
                mask.getContext('2d').drawImage(original, 0, 0);
                maskRef.current = mask;

                const display = displayRef.current;
                display.width = width;
                display.height = height;

                setReady(true);
                render();
                await runAuto();
            } catch {
                if (!cancelled) setError(t(language, 'logoBackgroundOpenFailed'));
            } finally {
                if (!cancelled) setBusy(false);
            }
        })();
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [logo]);

    const pushUndo = useCallback(() => {
        const mask = maskRef.current;
        if (!mask) return;
        const snapshot = mask.getContext('2d').getImageData(0, 0, mask.width, mask.height);
        const stack = undoRef.current;
        stack.push(snapshot);
        if (stack.length > UNDO_LIMIT) stack.shift();
        setCanUndo(true);
    }, []);

    const undo = useCallback(() => {
        const stack = undoRef.current;
        const snapshot = stack.pop();
        if (!snapshot) return;
        maskRef.current.getContext('2d').putImageData(snapshot, 0, 0);
        setCanUndo(stack.length > 0);
        render();
    }, [render]);

    const reset = useCallback(() => {
        if (!originalRef.current) return;
        pushUndo();
        const mask = maskRef.current;
        const ctx = mask.getContext('2d');
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, mask.width, mask.height);
        ctx.drawImage(originalRef.current, 0, 0);
        render();
    }, [pushUndo, render]);

    const toCanvasCoords = useCallback((event) => {
        const display = displayRef.current;
        const rect = display.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) * (display.width / rect.width),
            y: (event.clientY - rect.top) * (display.height / rect.height),
        };
    }, []);

    const stampLine = useCallback((x0, y0, x1, y1) => {
        const stamp = brushStampRef.current;
        const mask = maskRef.current;
        if (!stamp || !mask) return;
        const ctx = mask.getContext('2d');
        const size = stamp.width;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const distance = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(distance / Math.max(1, size / 4)));
        ctx.globalCompositeOperation = toolRef.current === 'erase' ? 'destination-out' : 'source-over';
        for (let i = 0; i <= steps; i += 1) {
            const ratio = i / steps;
            ctx.drawImage(stamp, x0 + dx * ratio - size / 2, y0 + dy * ratio - size / 2);
        }
        ctx.globalCompositeOperation = 'source-over';
    }, []);

    const onPointerDown = useCallback((event) => {
        if (!ready || busy) return;
        event.preventDefault();
        pushUndo();
        const point = toCanvasCoords(event);
        drawingRef.current = point;
        displayRef.current.setPointerCapture?.(event.pointerId);
        stampLine(point.x, point.y, point.x, point.y);
        render();
    }, [busy, pushUndo, ready, render, stampLine, toCanvasCoords]);

    const onPointerMove = useCallback((event) => {
        const last = drawingRef.current;
        if (!last) return;
        event.preventDefault();
        const point = toCanvasCoords(event);
        stampLine(last.x, last.y, point.x, point.y);
        drawingRef.current = point;
        render();
    }, [render, stampLine, toCanvasCoords]);

    const onPointerUp = useCallback(() => {
        drawingRef.current = null;
    }, []);

    const apply = useCallback(async () => {
        const original = originalRef.current;
        const mask = maskRef.current;
        if (!original || !mask) return;
        setBusy(true);
        setError('');
        try {
            const out = document.createElement('canvas');
            out.width = original.width;
            out.height = original.height;
            const ctx = out.getContext('2d');
            ctx.drawImage(original, 0, 0);
            ctx.globalCompositeOperation = 'destination-in';
            ctx.drawImage(mask, 0, 0);
            ctx.globalCompositeOperation = 'source-over';

            const trimmed = trimTransparent(out);
            const blob = await canvasToBlob(trimmed);
            const base = (logo?.filename || 'logo').replace(/\.[^.]+$/, '') || 'logo';
            const file = new File([blob], `${base}-no-bg.png`, { type: 'image/png' });
            await onApply?.(file);
            onClose?.();
        } catch {
            setError(t(language, 'logoBackgroundFailed'));
            setBusy(false);
        }
    }, [language, logo, onApply, onClose]);

    const toolButton = (value, labelKey) => (
        <button
            type="button"
            onClick={() => setTool(value)}
            className="h-9 flex-1 rounded-[9px] border px-3 text-[11px] font-black uppercase tracking-wider transition"
            style={{
                borderColor: tool === value ? '#fff9ec' : 'rgba(255,255,255,0.16)',
                backgroundColor: tool === value ? '#fff9ec' : 'rgba(255,255,255,0.06)',
                color: tool === value ? '#211a1d' : '#fff',
            }}
        >
            {t(language, labelKey)}
        </button>
    );

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
            <div className="flex max-h-[92vh] w-full max-w-[760px] flex-col overflow-hidden rounded-[16px] border border-white/14 bg-[#2b2428] text-white shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/42">{t(language, 'logoBackgroundEyebrow')}</p>
                        <h2 className="mt-0.5 text-[18px] font-black leading-tight">{t(language, 'logoBackgroundTitle')}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[20px] leading-none text-white/45 transition hover:bg-white/10 hover:text-white" aria-label={t(language, 'logoBackgroundCancel')}>×</button>
                </div>

                <div className="relative flex-1 overflow-auto p-5">
                    <div
                        className="mx-auto flex max-w-full items-center justify-center rounded-[12px] border border-white/10"
                        style={{
                            backgroundColor: '#1c171a',
                            backgroundImage: 'linear-gradient(45deg,#3a3034 25%,transparent 25%),linear-gradient(-45deg,#3a3034 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#3a3034 75%),linear-gradient(-45deg,transparent 75%,#3a3034 75%)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
                        }}
                    >
                        <canvas
                            ref={displayRef}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                            className="max-h-[52vh] max-w-full cursor-crosshair touch-none"
                            style={{ imageRendering: 'auto' }}
                        />
                    </div>
                    {busy && (
                        <div className="absolute inset-0 grid place-items-center bg-black/35">
                            <span className="text-[12px] font-black uppercase tracking-wider text-white/80">{t(language, 'logoBackgroundPreparing')}</span>
                        </div>
                    )}
                    {error && (
                        <p className="mt-3 rounded-[9px] border border-red-300/25 bg-red-500/12 px-3 py-2 text-center text-[12px] font-bold text-red-100">{error}</p>
                    )}
                </div>

                <div className="space-y-3 border-t border-white/10 px-5 py-4">
                    <div className="flex gap-2">
                        {toolButton('erase', 'logoBackgroundErase')}
                        {toolButton('restore', 'logoBackgroundRestore')}
                    </div>
                    <label className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-[10px] font-black uppercase tracking-wider text-white/45">{t(language, 'logoBackgroundBrush')}</span>
                        <input type="range" min={16} max={220} step={4} value={brush} onChange={(e) => setBrush(Number(e.target.value))} className="flex-1 accent-[#fff9ec]" />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={runAuto} disabled={busy} className="h-9 rounded-[9px] border border-white/16 bg-white/8 px-3 text-[11px] font-black uppercase tracking-wider transition hover:bg-white/14 disabled:opacity-40">{t(language, 'logoBackgroundAuto')}</button>
                        <button type="button" onClick={undo} disabled={!canUndo || busy} className="h-9 rounded-[9px] border border-white/16 bg-white/8 px-3 text-[11px] font-black uppercase tracking-wider transition hover:bg-white/14 disabled:opacity-40">↺</button>
                        <button type="button" onClick={reset} disabled={busy} className="h-9 rounded-[9px] border border-white/16 bg-white/8 px-3 text-[11px] font-black uppercase tracking-wider transition hover:bg-white/14 disabled:opacity-40">{t(language, 'logoBackgroundReset')}</button>
                        <div className="ml-auto flex gap-2">
                            <button type="button" onClick={onClose} className="h-9 rounded-[9px] border border-white/16 bg-white/8 px-4 text-[11px] font-black uppercase tracking-wider transition hover:bg-white/14">{t(language, 'logoBackgroundCancel')}</button>
                            <button type="button" onClick={apply} disabled={busy || !ready} className="h-9 rounded-[9px] border border-[#fff9ec]/35 bg-[#fff9ec] px-4 text-[11px] font-black uppercase tracking-wider text-[#211a1d] transition hover:bg-white disabled:opacity-40">{t(language, 'logoBackgroundApply')}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
