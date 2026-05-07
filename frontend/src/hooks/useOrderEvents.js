import { useEffect, useRef } from 'react';
import apiClient from '../api';

function eventsBaseUrl() {
    const apiBase = import.meta.env.VITE_API_URL || '/api/v1';
    return `${apiBase.replace(/\/$/, '')}/events/orders`;
}

async function fetchEventToken() {
    const { data } = await apiClient.post('/events/token');
    return data?.token || '';
}

/**
 * Subscribes to the SSE order stream and invokes onEvent({type, data}) on every push.
 * Auto-reconnects with exponential back-off (max 30 s) on transport errors.
 *
 * Uses a short-lived HMAC-signed event token (never the raw JWT) so the
 * URL leaking through proxy/browser logs cannot grant API access.
 *
 * Pass `enabled = false` to opt out (e.g. unauthenticated screens).
 */
export function useOrderEvents(onEvent, { enabled = true } = {}) {
    const handlerRef = useRef(onEvent);
    handlerRef.current = onEvent;

    useEffect(() => {
        if (!enabled) return undefined;

        let source = null;
        let retry = 1000;
        let cancelled = false;
        let refreshTimer = null;

        const connect = async () => {
            if (cancelled) return;
            let token = '';
            try {
                token = await fetchEventToken();
            } catch {
                if (cancelled) return;
                setTimeout(connect, retry);
                retry = Math.min(retry * 2, 30000);
                return;
            }
            if (!token || cancelled) return;

            const url = `${eventsBaseUrl()}?token=${encodeURIComponent(token)}`;
            source = new EventSource(url);

            source.onopen = () => {
                retry = 1000;
                // Refresh token before its 1 h expiry — drop & reconnect
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(() => { source?.close(); connect(); }, 50 * 60 * 1000);
            };

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
            clearTimeout(refreshTimer);
            source?.close();
        };
    }, [enabled]);
}
