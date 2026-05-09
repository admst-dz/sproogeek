import { useEffect, useState } from 'react';
import { useOrderEvents } from '../../hooks/useOrderEvents';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';

const TYPE_COLOR = {
    'order.created': 'border-emerald-400/40 bg-emerald-500/10',
    'order.status_changed': 'border-indigo-400/40 bg-indigo-500/10',
    'order.updated': 'border-blue-400/40 bg-blue-500/10',
};

/**
 * Floating toast stack that pops a card for every order event the
 * current user is allowed to see. Toasts auto-dismiss after 6 s.
 *
 * Drop this component anywhere inside an authenticated screen — it has
 * its own SSE subscription via useOrderEvents().
 */
export function LiveOrderToasts({ enabled = true, onEvent }) {
    const { language } = useConfigurator();
    const [items, setItems] = useState([]);

    useOrderEvents((event) => {
        if (!event?.data) return;
        onEvent?.(event);
        const id = `${event.type}-${event.data.order_id}-${Date.now()}`;
        setItems(prev => [...prev, { id, ...event }].slice(-5));
    }, { enabled });

    useEffect(() => {
        if (items.length === 0) return undefined;
        const timer = setTimeout(() => {
            setItems(prev => prev.slice(1));
        }, 6000);
        return () => clearTimeout(timer);
    }, [items]);

    if (items.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-[360px] pointer-events-none">
            {items.map(({ id, type, data }) => (
                <div
                    key={id}
                    className={`pointer-events-auto px-4 py-3 rounded-[14px] border backdrop-blur-xl text-white shadow-xl animate-fade-in ${TYPE_COLOR[type] || 'border-white/15 bg-white/5'}`}
                >
                    <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                                {type === 'order.created' ? t(language, 'toastNewOrder') : type === 'order.status_changed' ? t(language, 'toastStatusChanged') : type === 'order.updated' ? t(language, 'toastOrderUpdated') : type}
                            </p>
                            <p className="text-sm font-bold truncate mt-0.5">
                                {data.product_name || t(language, 'toastOrderFallback')} — #{(data.order_id || '').substring(0, 6).toUpperCase()}
                            </p>
                            <p className="text-[11px] opacity-70 mt-0.5 truncate">
                                {data.user_email || ''}
                                {data.status && ` · ${({ new: t(language, 'statusNew'), awaiting_signature: t(language, 'statusAwaitingSignature'), awaiting_quotes: t(language, 'statusAwaitingQuotes'), quotes_ready: t(language, 'statusQuotesReady'), processing: t(language, 'statusProcessing'), production: t(language, 'statusProduction'), in_delivery: t(language, 'statusDelivery'), done: t(language, 'statusDone') })[data.status] || data.status}`}
                            </p>
                            {data.comment && (
                                <p className="text-[11px] opacity-60 mt-1 italic line-clamp-2">{data.comment}</p>
                            )}
                        </div>
                        <button
                            onClick={() => setItems(prev => prev.filter(i => i.id !== id))}
                            className="text-white/40 hover:text-white text-lg leading-none transition-colors shrink-0"
                            aria-label={t(language, 'closeLabel')}
                        >
                            ×
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
