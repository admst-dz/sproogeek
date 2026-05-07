import { useEffect, useRef } from 'react';
import { getCookie } from '../utils/cookies';

const AUTH_COOKIE = 'spruzhuk_auth';

function authToken() {
    return localStorage.getItem('token') || getCookie(AUTH_COOKIE) || '';
}

function eventsBaseUrl() {
    const apiBase = import.meta.env.VITE_API_URL || '/api/v1';
    return `${apiBase.replace(/\/$/, '')}/events/orders`;
}

/**
 * Subscribes to the SSE order stream and invokes onEvent({type, data}) on every push.
 * Auto-reconnects with exponential back-off (max 30 s) on transport errors.
 *
 * Pass `enabled = false` to opt out (e.g. unauthenticated screens).
 */
export function useOrderEvents(onEvent, { enabled = true } = {}) {
    const handlerRef = useRef(onEvent);
    handlerRef.current = onEvent;

    useEffect(() => {
        if (!enabled) return undefined;
        const token = authToken();
        if (!token) return undefined;

        let source = null;
        let retry = 1000;
        let cancelled = false;

        const connect = () => {
            if (cancelled) return;
            const url = `${eventsBaseUrl()}?token=${encodeURIComponent(token)}`;
            source = new EventSource(url);

            source.onopen = () => { retry = 1000; };

            source.onmessage = (msg) => {
                if (!msg?.data) return;
                try {
                    const parsed = JSON.parse(msg.data);
                    handlerRef.current?.(parsed);
                } catch { /* ignore malformed frames */ }
            };

            source.onerror = () => {
                source?.close();
                if (cancelled) return;
                setTimeout(connect, retry);
                retry = Math.min(retry * 2, 30000);
            };
        };

        connect();
        return () => {
            cancelled = true;
            source?.close();
        };
    }, [enabled]);
}
