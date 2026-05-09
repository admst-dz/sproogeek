import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';
import { adminApi, fetchManufacturerQueue, fetchManufacturerStats, manufacturerApi } from '../../api';
import { downloadBlob } from '../../utils/download';
import { getUserSecondaryLabel } from '../../utils/user';
import { LiveOrderToasts } from '../shared/LiveOrderToasts';

const PRODUCTION_STAGES = [
    { key: 'awaiting_quotes', textKey: 'statusAwaitingQuotes', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: '₽' },
    { key: 'quotes_ready', textKey: 'statusQuotesReady', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: '₽' },
    { key: 'processing',  textKey: 'statusProcessing',  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',                icon: '⚙️' },
    { key: 'production',  textKey: 'statusProduction',  color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',          icon: '🏭' },
    { key: 'in_delivery', textKey: 'statusDelivery',    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',          icon: '🚚' },
    { key: 'done',        textKey: 'statusDone',        color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',       icon: '✅' },
];
const STAGE_INDEX = Object.fromEntries(PRODUCTION_STAGES.map((s, i) => [s.key, i]));

const StatusBadge = ({ status, language }) => {
    const s = PRODUCTION_STAGES.find(x => x.key === status) || { textKey: null, color: 'bg-white/10 text-gray-400 border-white/10' };
    return (
        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.color}`}>{s.textKey ? t(language, s.textKey) : status}</span>
    );
};

const StatCard = ({ label, value, accent }) => (
    <div className={`flex-1 min-w-[140px] rounded-[18px] border bg-white/[0.03] backdrop-blur-xl p-5 ${accent || 'border-white/10'}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
        <p className="text-3xl font-black text-white mt-2 leading-none">{value}</p>
    </div>
);

const ProgressTrack = ({ status, stageHistory = [], language = 'ru' }) => {
    const currentIdx = STAGE_INDEX[status] ?? 0;
    const historyMap = {};
    stageHistory.forEach(h => { historyMap[h.status] = h; });
    return (
        <div className="pt-3 pb-1">
            <div className="relative flex items-start">
                <div className="absolute top-4 left-0 right-0 h-px bg-white/10 mx-8" style={{ zIndex: 0 }} />
                {PRODUCTION_STAGES.map((stage, idx) => {
                    const isDone = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const entry = historyMap[stage.key];
                    return (
                        <div key={stage.key} className="flex-1 flex flex-col items-center gap-1.5 relative z-10">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all text-sm
                                ${isDone ? 'bg-emerald-500/30 border-emerald-500 text-emerald-400'
                                    : isCurrent ? 'bg-indigo-500/30 border-indigo-400 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                                    : 'bg-white/5 border-white/15 text-gray-600'}`}
                            >
                                {isDone ? '✓' : <span className="text-[8px]">{stage.icon}</span>}
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight
                                ${isDone ? 'text-emerald-400' : isCurrent ? 'text-indigo-300' : 'text-gray-600'}`}>
                                {t(language, stage.textKey)}
                            </span>
                            {entry && (
                                <span className="text-[8px] text-gray-500 text-center mt-0.5">
                                    {new Date(entry.updated_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const ManufacturerDashboard = ({ onBack }) => {
    const { currentUser, logout, language } = useConfigurator();
    const [activeTab, setActiveTab] = useState('queue');
    const [statusFilter, setStatusFilter] = useState('');
    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState({ total: 0, by_status: {} });
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(new Set());
    const [updating, setUpdating] = useState(null);
    const [techcardBusy, setTechcardBusy] = useState(null);
    const [commentDraft, setCommentDraft] = useState({});
    const [quoteDraft, setQuoteDraft] = useState({});

    const reload = useCallback(async () => {
        setLoading(true);
        try {
            const [queue, st] = await Promise.all([
                fetchManufacturerQueue(statusFilter || null),
                fetchManufacturerStats(),
            ]);
            queue.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            setOrders(queue);
            setStats(st);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { reload(); }, [reload]);

    const onLiveEvent = useCallback((event) => {
        if (!event?.type?.startsWith('order.')) return;
        // Quick-refresh on any order push — keeps the queue truly live
        reload();
    }, [reload]);

    const toggleExpand = (id) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
                loadImposition(id);
            }
            return next;
        });
    };

    const setStage = async (orderId, newStatus) => {
        const comment = commentDraft[orderId] || '';
        setUpdating(orderId);
        try {
            await manufacturerApi.updateStatus(orderId, newStatus, comment || null);
            setCommentDraft(prev => { const next = { ...prev }; delete next[orderId]; return next; });
            await reload();
        } finally {
            setUpdating(null);
        }
    };

    const updateQuoteDraft = (orderId, field, value) => {
        setQuoteDraft(prev => ({
            ...prev,
            [orderId]: { ...(prev[orderId] || {}), [field]: value },
        }));
    };

    const submitQuote = async (orderId) => {
        const draft = quoteDraft[orderId] || {};
        setUpdating(orderId);
        try {
            await manufacturerApi.submitQuote(orderId, {
                price: Number(draft.price || 0),
                production_days: Number(draft.production_days || 0),
                comment: draft.comment || null,
            });
            setQuoteDraft(prev => { const next = { ...prev }; delete next[orderId]; return next; });
            await reload();
        } finally {
            setUpdating(null);
        }
    };

    const downloadTechcard = async (orderId) => {
        setTechcardBusy(orderId);
        try {
            const { data: meta } = await adminApi.generateTechcard(orderId);
            const filename = (meta?.s3_key || '').split('/').pop() || `techcard-${orderId}.pdf`;
            const { data: blob } = await adminApi.downloadTechcard(orderId, filename);
            downloadBlob(blob, filename);
        } finally {
            setTechcardBusy(null);
        }
    };

    const [impositionMap, setImpositionMap] = useState({});
    const loadImposition = async (orderId) => {
        if (impositionMap[orderId]) return;
        try {
            const { data } = await manufacturerApi.imposition(orderId);
            setImpositionMap(prev => ({ ...prev, [orderId]: data }));
        } catch { /* ignore */ }
    };

    const [materials, setMaterials] = useState([]);
    useEffect(() => {
        if (activeTab !== 'materials') return;
        manufacturerApi.materials().then(({ data }) => setMaterials(data || []));
    }, [activeTab]);

    const summary = useMemo(() => ({
        total: stats.total || 0,
        new: stats.by_status?.new || 0,
        processing: stats.by_status?.processing || 0,
        awaitingQuotes: (stats.by_status?.awaiting_quotes || 0) + (stats.by_status?.quotes_ready || 0),
        production: stats.by_status?.production || 0,
        in_delivery: stats.by_status?.in_delivery || 0,
        done: stats.by_status?.done || 0,
    }), [stats]);

    return (
        <div className="app-bg flex h-[100dvh] font-sans text-gray-900 dark:text-white overflow-hidden">

            <LiveOrderToasts onEvent={onLiveEvent} />

            {/* SIDEBAR */}
            <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/5 bg-white/[0.02] backdrop-blur-xl z-20">
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-white/10 border border-white/10 rounded-[10px] flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        </div>
                        <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t(language, 'manufDashTitle')}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{getUserSecondaryLabel(currentUser)}</p>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {[
                        { id: 'queue', icon: '🏭', label: t(language, 'tabQueue') },
                        { id: 'materials', icon: '📦', label: t(language, 'tabStock') },
                        { id: 'history', icon: '📜', label: t(language, 'tabArchive') },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-[14px] transition-all text-left font-bold ${
                                activeTab === tab.id
                                    ? 'bg-white/10 text-white border border-white/10'
                                    : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                            }`}
                        >
                            <span className="text-base">{tab.icon}</span>
                            <span className="uppercase tracking-wider text-xs">{tab.label}</span>
                        </button>
                    ))}
                </nav>

                <div className="p-3 border-t border-white/5">
                    <button
                        onClick={() => { logout(); onBack(); }}
                        className="w-full py-3 px-4 rounded-[14px] text-xs font-bold text-gray-500 hover:bg-white/5 hover:text-red-400 transition-all uppercase tracking-widest text-left"
                    >
                        {t(language, 'logout')}
                    </button>
                </div>
            </aside>

            {/* MOBILE HEADER */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-30 px-4 py-3 bg-[#0B0F19]/95 backdrop-blur-xl border-b border-white/5 flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t(language, 'manufDashTitle')}</span>
                <span className="text-xs text-gray-500 truncate ml-auto">{getUserSecondaryLabel(currentUser)}</span>
            </div>

            {/* MAIN */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 pt-16 md:pt-8">

                {/* STATS */}
                <div className="flex flex-wrap gap-3 mb-6">
                    <StatCard label={t(language, 'totalOrders')} value={summary.total} />
                    <StatCard label={t(language, 'statusAwaitingQuotes')} value={summary.awaitingQuotes} accent="border-cyan-500/20" />
                    <StatCard label={t(language, 'statusProcessing')} value={summary.processing} accent="border-blue-500/20" />
                    <StatCard label={t(language, 'statusProduction')} value={summary.production} accent="border-indigo-500/30" />
                    <StatCard label={t(language, 'statusDelivery')} value={summary.in_delivery} accent="border-yellow-500/20" />
                    <StatCard label={t(language, 'statusDone')} value={summary.done} accent="border-emerald-500/20" />
                </div>

                {/* HEADER + FILTERS */}
                <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                    <div>
                        <h2 className="text-xl font-bold uppercase tracking-widest text-white">
                            {activeTab === 'history' ? t(language, 'ordersArchiveTitle') : activeTab === 'materials' ? t(language, 'warehouseTitle') : t(language, 'productionQueueTitle')}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {activeTab === 'history' ? t(language, 'archiveDesc')
                                : activeTab === 'materials' ? t(language, 'warehouseDesc')
                                : t(language, 'productionQueueDesc')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]"></div>
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live</span>
                    </div>
                </div>

                {activeTab === 'materials' && (
                    <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[20px] md:rounded-[24px] overflow-hidden">
                        {materials.length === 0 ? (
                            <div className="py-20 flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📦</div>
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t(language, 'materialsEmpty')}</p>
                                <p className="text-gray-600 text-[11px] max-w-md text-center">{t(language, 'materialsEmptyHint')}</p>
                            </div>
                        ) : (
                            <div className="touch-scroll-x">
                            <table className="w-full min-w-[680px] text-sm">
                                <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-gray-500">
                                    <tr>
                                        <th className="text-left px-5 py-3 font-bold">SKU</th>
                                        <th className="text-left px-5 py-3 font-bold">{t(language, 'matNameCol')}</th>
                                        <th className="text-right px-5 py-3 font-bold">{t(language, 'matStockCol')}</th>
                                        <th className="text-right px-5 py-3 font-bold">{t(language, 'matMinCol')}</th>
                                        <th className="text-left px-5 py-3 font-bold">{t(language, 'matUnitCol')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {materials.map((m, i) => {
                                        const low = m.stock_qty < (m.reorder_threshold || 0);
                                        return (
                                            <tr key={m.id} className={i !== materials.length - 1 ? 'border-b border-white/5' : ''}>
                                                <td className="px-5 py-3 font-mono text-xs text-white/70">{m.id}</td>
                                                <td className="px-5 py-3 text-white">{m.name}</td>
                                                <td className={`px-5 py-3 text-right font-bold ${low ? 'text-red-400' : 'text-white'}`}>{m.stock_qty}</td>
                                                <td className="px-5 py-3 text-right text-gray-400">{m.reorder_threshold || 0}</td>
                                                <td className="px-5 py-3 text-gray-500 text-xs uppercase">{m.unit}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                        )}
                    </div>
                )}

                {activeTab !== 'materials' && (
                <>
                {/* STATUS PILL FILTER */}
                <div className="flex flex-wrap gap-2 mb-5">
                    <button
                        onClick={() => setStatusFilter('')}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${statusFilter === '' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                    >{t(language, 'filterAllActive')}</button>
                    {PRODUCTION_STAGES.map(stage => (
                        <button
                            key={stage.key}
                            onClick={() => setStatusFilter(stage.key)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${statusFilter === stage.key ? 'bg-white text-black border-white' : `${stage.color} hover:opacity-90`}`}
                        >
                            {stage.icon} {t(language, stage.textKey)}
                        </button>
                    ))}
                </div>

                {/* ORDERS LIST */}
                <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[20px] md:rounded-[24px] overflow-hidden">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center gap-3">
                            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{t(language, 'loading')}</p>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="py-20 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📭</div>
                            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t(language, 'noOrders')}</p>
                        </div>
                    ) : (
                        orders.map((order, i) => {
                            const orderId = String(order.id);
                            const isExpanded = expanded.has(orderId);
                            const isUpdating = updating === orderId;
                            const isTcBusy = techcardBusy === orderId;
                            const currentStageIdx = STAGE_INDEX[order.status] ?? 0;
                            const isQuoteStage = order.status === 'awaiting_quotes' || order.status === 'quotes_ready';
                            const myQuote = (order.manufacturer_quotes || []).find(q => q.manufacturer_id === currentUser?.id);
                            return (
                                <div key={orderId} className={i !== orders.length - 1 ? 'border-b border-white/5' : ''}>
                                    {/* Summary row */}
                                    <div
                                        className="px-4 md:px-6 py-4 md:py-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 md:gap-4 hover:bg-white/[0.03] transition-colors cursor-pointer"
                                        onClick={() => toggleExpand(orderId)}
                                    >
                                        <div className="flex items-center justify-between sm:block sm:min-w-[88px]">
                                            <span className="font-bold text-sm text-white">#{orderId.substring(0, 6).toUpperCase()}</span>
                                            <span className="text-[10px] text-gray-500 mt-0.5">
                                                {order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="font-bold text-sm text-white truncate block">{order.product_name || t(language, 'toastOrderFallback')}</span>
                                            <span className="text-xs text-gray-500 truncate block">{order.user_email || '—'} · {order.quantity || 1} {t(language, 'pcsUnit')}</span>
                                        </div>
                                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                            <StatusBadge status={order.status} language={language} />
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-4 md:px-6 pb-6 border-t border-white/5 bg-white/[0.02]">
                                            <div className="touch-scroll-x pb-2">
                                                <div className="min-w-[520px]">
                                                    <ProgressTrack status={order.status} stageHistory={order.stage_history} language={language} />
                                                </div>
                                            </div>

                                            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="md:col-span-2 space-y-3">
                                                    {isQuoteStage ? (
                                                        <div className="rounded-[12px] border border-cyan-500/20 bg-cyan-500/10 p-4">
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">{t(language, 'quoteSubmitTitle')}</p>
                                                            {myQuote && (
                                                                <p className="text-[11px] text-gray-400 mt-1">
                                                                    {t(language, 'quoteAlreadySent')}: <span className="text-white font-bold">{myQuote.price} {myQuote.currency || 'BYN'}</span> · {myQuote.production_days} {t(language, 'quoteDaysShort')}
                                                                </p>
                                                            )}
                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={quoteDraft[orderId]?.price || ''}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => updateQuoteDraft(orderId, 'price', e.target.value)}
                                                                    placeholder={t(language, 'quotePricePlaceholder')}
                                                                    className="bg-black/20 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    step="1"
                                                                    value={quoteDraft[orderId]?.production_days || ''}
                                                                    onClick={e => e.stopPropagation()}
                                                                    onChange={e => updateQuoteDraft(orderId, 'production_days', e.target.value)}
                                                                    placeholder={t(language, 'quoteDaysPlaceholder')}
                                                                    className="bg-black/20 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                                                                />
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); submitQuote(orderId); }}
                                                                    disabled={isUpdating || !quoteDraft[orderId]?.price || !quoteDraft[orderId]?.production_days}
                                                                    className="rounded-[10px] bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold transition disabled:opacity-50"
                                                                >
                                                                    {isUpdating ? '…' : t(language, 'quoteSubmitBtn')}
                                                                </button>
                                                            </div>
                                                            <textarea
                                                                value={quoteDraft[orderId]?.comment || ''}
                                                                onClick={e => e.stopPropagation()}
                                                                onChange={e => updateQuoteDraft(orderId, 'comment', e.target.value)}
                                                                placeholder={t(language, 'quoteCommentPlaceholder')}
                                                                rows={2}
                                                                className="w-full mt-2 bg-black/20 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <>
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'updateStage')}</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {PRODUCTION_STAGES.filter(stage => !['awaiting_quotes', 'quotes_ready'].includes(stage.key)).map((stage, idx) => {
                                                                    const productionIdx = Math.max(0, idx);
                                                                    const isCurrent = stage.key === order.status;
                                                                    const isPast = productionIdx < Math.max(0, currentStageIdx - 2);
                                                                    return (
                                                                        <button
                                                                            key={stage.key}
                                                                            disabled={isCurrent || isUpdating}
                                                                            onClick={(e) => { e.stopPropagation(); setStage(orderId, stage.key); }}
                                                                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all
                                                                                ${isCurrent
                                                                                    ? `${stage.color} cursor-default opacity-100 ring-1 ring-white/20`
                                                                                    : isPast
                                                                                        ? 'bg-white/5 text-gray-600 border-white/5 hover:bg-white/10 hover:text-gray-400'
                                                                                        : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                                                                                } ${isUpdating ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                        >
                                                                            {stage.icon} {t(language, stage.textKey)}{isCurrent && ' ✓'}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                            <textarea
                                                                value={commentDraft[orderId] || ''}
                                                                onChange={(e) => setCommentDraft(prev => ({ ...prev, [orderId]: e.target.value }))}
                                                                placeholder={t(language, 'stageCommentPlaceholder')}
                                                                rows={2}
                                                                className="w-full mt-1 bg-white/5 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
                                                            />
                                                        </>
                                                    )}
                                                </div>

                                                <div className="space-y-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'docsTracking')}</p>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); downloadTechcard(orderId); }}
                                                        disabled={isTcBusy}
                                                        className="w-full py-2.5 px-4 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition disabled:opacity-50 text-left"
                                                    >
                                                        {isTcBusy ? t(language, 'approvalGenerating') : t(language, 'techcardPdf')}
                                                    </button>
                                                    {order.configuration?.server_render_url && (
                                                        <a
                                                            href={order.configuration.server_render_url}
                                                            target="_blank" rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="w-full block py-2.5 px-4 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition text-left"
                                                        >
                                                            {t(language, 'renderPreview')}
                                                        </a>
                                                    )}
                                                    {/* QR for sheet tracking */}
                                                    <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-[10px] p-3" onClick={e => e.stopPropagation()}>
                                                        <img src={manufacturerApi.qrUrl(orderId)} alt="QR" className="w-20 h-20 rounded-[6px] bg-white p-1" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'orderQRLabel')}</p>
                                                            <p className="text-[10px] text-gray-400 mt-1 truncate">spruzhyk://order/{orderId.substring(0,8)}…</p>
                                                            <p className="text-[10px] text-gray-500 mt-0.5">{t(language, 'qrScanHint')}</p>
                                                        </div>
                                                    </div>
                                                    {/* Imposition plan */}
                                                    {impositionMap[orderId]?.ok && (
                                                        <div className="bg-white/5 border border-white/10 rounded-[10px] p-3 text-[11px] text-gray-300" onClick={e => e.stopPropagation()}>
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">{t(language, 'impositionSRA3')}</p>
                                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                                                                <span className="text-gray-500">{t(language, 'impositionItems')}</span><span className="text-white font-bold">{impositionMap[orderId].layout.items_per_sheet}</span>
                                                                <span className="text-gray-500">{t(language, 'impositionGrid')}</span><span>{impositionMap[orderId].layout.cols}×{impositionMap[orderId].layout.rows} {impositionMap[orderId].layout.orientation === 'landscape' ? '↔' : '↕'}</span>
                                                                <span className="text-gray-500">{t(language, 'impositionSheets')}</span><span className="text-white font-bold">{impositionMap[orderId].totals.sheets_required}</span>
                                                                <span className="text-gray-500">{t(language, 'impositionWaste')}</span><span>{impositionMap[orderId].totals.waste_per_sheet}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {impositionMap[orderId] && !impositionMap[orderId].ok && (
                                                        <p className="text-[11px] text-red-400 italic">{impositionMap[orderId].reason}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
                </>
                )}
            </main>

            {/* MOBILE BOTTOM NAV */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0B0F19]/95 backdrop-blur-xl border-t border-white/5 flex items-center px-2 pb-safe">
                {[
                    { id: 'queue', label: t(language, 'tabQueue'), icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="6"/><rect x="2" y="14" width="20" height="6"/></svg>) },
                    { id: 'materials', label: t(language, 'tabStock'), icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>) },
                    { id: 'history', label: t(language, 'tabArchive'), icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 12 8 7 13 12"/><polyline points="11 12 16 7 21 12"/></svg>) },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${activeTab === tab.id ? 'text-white' : 'text-gray-600'}`}
                    >
                        {tab.icon}
                        <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
                    </button>
                ))}
            </nav>
        </div>
    );
};
