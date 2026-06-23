import { useCallback, useEffect, useRef, useState } from 'react';
import { canvasToDataURL } from '../../utils/images';
import { getRenderConfigSnapshot, registerRenderCaptureProvider, useConfigurator } from '../../store';
import { SceneHints } from '../shared/SceneHints';

const SESSION_ENDPOINT = '/cloud-render/session';
const START_TIMEOUT_MS = 25_000;
const CONFIG_DEBOUNCE_MS = 100;

function postJson(url, body, options = {}) {
    return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'same-origin',
        ...options,
    });
}

export function CloudModelViewport({ containerRef, loadingLabel, onFallback }) {
    const sessionIdRef = useRef(null);
    const streamImageRef = useRef(null);
    const snapshotCanvasRef = useRef(null);
    const configTimerRef = useRef(null);
    const moveFrameRef = useRef(null);
    const lastMoveRef = useRef(null);
    const draggingRef = useRef(false);
    const activePointerRef = useRef(null);
    const [status, setStatus] = useState('connecting');
    const [streamUrl, setStreamUrl] = useState('');

    const fallback = useCallback(() => {
        setStatus('failed');
        onFallback?.();
    }, [onFallback]);

    useEffect(() => {
        let disposed = false;
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), START_TIMEOUT_MS);
        const rect = containerRef.current?.getBoundingClientRect();
        const width = Math.max(320, Math.round(rect?.width || window.innerWidth));
        const height = Math.max(280, Math.round(rect?.height || window.innerHeight));

        postJson(SESSION_ENDPOINT, {
            width,
            height,
            config: getRenderConfigSnapshot(useConfigurator.getState()),
        }, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Cloud renderer: ${response.status}`);
                return response.json();
            })
            .then((session) => {
                if (disposed) {
                    fetch(`${SESSION_ENDPOINT}/${session.id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
                    return;
                }
                sessionIdRef.current = session.id;
                setStreamUrl(`${SESSION_ENDPOINT}/${session.id}/stream`);
            })
            .catch(() => {
                if (!disposed) fallback();
            })
            .finally(() => window.clearTimeout(timeout));

        return () => {
            disposed = true;
            controller.abort();
            window.clearTimeout(timeout);
            window.clearTimeout(configTimerRef.current);
            if (moveFrameRef.current) window.cancelAnimationFrame(moveFrameRef.current);
            const id = sessionIdRef.current;
            sessionIdRef.current = null;
            if (id) fetch(`${SESSION_ENDPOINT}/${id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
        };
    }, [containerRef, fallback]);

    useEffect(() => useConfigurator.subscribe((state) => {
        const id = sessionIdRef.current;
        if (!id) return;
        window.clearTimeout(configTimerRef.current);
        configTimerRef.current = window.setTimeout(() => {
            postJson(`${SESSION_ENDPOINT}/${id}/config`, {
                config: getRenderConfigSnapshot(state),
            }).catch(() => {});
        }, CONFIG_DEBOUNCE_MS);
    }), []);

    useEffect(() => {
        registerRenderCaptureProvider((options) => {
            const image = streamImageRef.current;
            if (!image?.naturalWidth || !image?.naturalHeight) return null;
            const canvas = snapshotCanvasRef.current || document.createElement('canvas');
            snapshotCanvasRef.current = canvas;
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' });
            if (!context) return null;
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            return canvasToDataURL(canvas, options);
        });
        return () => registerRenderCaptureProvider(null);
    }, []);

    const normalizedPoint = useCallback((event) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0.5, y: 0.5 };
        return {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        };
    }, [containerRef]);

    const sendInput = useCallback((payload) => {
        const id = sessionIdRef.current;
        if (!id) return;
        postJson(`${SESSION_ENDPOINT}/${id}/input`, payload).catch(() => {});
    }, []);

    const handlePointerDown = useCallback((event) => {
        if (activePointerRef.current !== null) return;
        activePointerRef.current = event.pointerId;
        draggingRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        sendInput({ type: 'pointerdown', ...normalizedPoint(event) });
    }, [normalizedPoint, sendInput]);

    const handlePointerMove = useCallback((event) => {
        if (!draggingRef.current || activePointerRef.current !== event.pointerId) return;
        lastMoveRef.current = { type: 'pointermove', ...normalizedPoint(event) };
        if (moveFrameRef.current) return;
        moveFrameRef.current = window.requestAnimationFrame(() => {
            moveFrameRef.current = null;
            if (lastMoveRef.current) sendInput(lastMoveRef.current);
        });
    }, [normalizedPoint, sendInput]);

    const handlePointerEnd = useCallback((event) => {
        if (!draggingRef.current || activePointerRef.current !== event.pointerId) return;
        draggingRef.current = false;
        activePointerRef.current = null;
        sendInput({ type: event.type, ...normalizedPoint(event) });
    }, [normalizedPoint, sendInput]);

    const handleWheel = useCallback((event) => {
        event.preventDefault();
        sendInput({
            type: 'wheel',
            deltaY: event.deltaY,
            ...normalizedPoint(event),
        });
    }, [normalizedPoint, sendInput]);

    return (
        <>
            <div
                className="absolute inset-0 touch-none select-none overflow-hidden"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onWheel={handleWheel}
            >
                {streamUrl && (
                    <img
                        ref={streamImageRef}
                        src={streamUrl}
                        alt="3D cloud stream"
                        draggable="false"
                        className="h-full w-full object-cover"
                        onLoad={() => setStatus('streaming')}
                        onError={fallback}
                    />
                )}
            </div>

            {status !== 'streaming' && (
                <div className="cloud-render-loading absolute inset-0 z-[18] flex items-center justify-center" aria-live="polite">
                    <div className="rounded-full border border-white/15 bg-[#101923]/80 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white/75 shadow-2xl backdrop-blur-xl">
                        {loadingLabel}
                    </div>
                </div>
            )}

            {status === 'streaming' && (
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-emerald-300/20 bg-[#07120e]/65 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-200/80 backdrop-blur-md">
                    Cloud 3D
                </div>
            )}
            <SceneHints containerRef={containerRef} />
        </>
    );
}
