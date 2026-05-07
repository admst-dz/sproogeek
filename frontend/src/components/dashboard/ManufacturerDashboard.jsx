import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConfigurator } from '../../store';
import { adminApi, fetchManufacturerQueue, fetchManufacturerStats, manufacturerApi } from '../../api';
import { getUserSecondaryLabel } from '../../utils/user';
import { LiveOrderToasts } from '../shared/LiveOrderToasts';

const PRODUCTION_STAGES = [
    { key: 'new',         text: 'Новый',          color: 'bg-white/10 text-gray-400 border-white/10',                      icon: '🕐' },
    { key: 'processing',  text: 'В обработке',    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',                icon: '⚙️' },
    { key: 'production',  text: 'В производстве', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',          icon: '🏭' },
    { key: 'in_delivery', text: 'Доставляется',   color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',          icon: '🚚' },
    { key: 'done',        text: 'Готово',         color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',       icon: '✅' },
];
const STAGE_INDEX = Object.fromEntries(PRODUCTION_STAGES.map((s, i) => [s.key, i]));

const StatusBadge = ({ status }) => {
    const s = PRODUCTION_STAGES.find(x => x.key === status) || { text: status, color: 'bg-white/10 text-gray-400 border-white/10' };
    return (
        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.color}`}>{s.text}</span>
    );
};

const StatCard = ({ label, value, accent }) => (
    <div className={`flex-1 min-w-[140px] rounded-[18px] border bg-white/[0.03] backdrop-blur-xl p-5 ${accent || 'border-white/10'}`}>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</p>
        <p className="text-3xl font-black text-white mt-2 leading-none">{value}</p>
    </div>
);

const ProgressTrack = ({ status, stageHistory = [] }) => {
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
                                {isDone ? '✓' : <span className="text-[10px]">{stage.icon}</span>}
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight
                                ${isDone ? 'text-emerald-400' : isCurrent ? 'text-indigo-300' : 'text-gray-600'}`}>
                                {stage.text}
                            </span>
                            {entry && (
                                <span className="text-[8px] text-gray-500 text-center mt-0.5">
                                    {new Date(entry.updated_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
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
    const { currentUser, logout } = useConfigurator();
    const [activeTab, setActiveTab] = useState('queue');
    const [statusFilter, setStatusFilter] = useState('');
    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState({ total: 0, by_status: {} });
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(new Set());
    const [updating, setUpdating] = useState(null);
    const [techcardBusy, setTechcardBusy] = useState(null);
    const [commentDraft, setCommentDraft] = useState({});

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
            next.has(id) ? next.delete(id) : next.add(id);
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

    const downloadTechcard = async (orderId) => {
        setTechcardBusy(orderId);
        try {
            const { data: meta } = await adminApi.generateTechcard(orderId);
            const filename = (meta?.s3_key || '').split('/').pop() || `techcard-${orderId}.pdf`;
            const { data: blob } = await adminApi.downloadTechcard(orderId, filename);
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
        } finally {
            setTechcardBusy(null);
        }
    };

    const summary = useMemo(() => ({
        total: stats.total || 0,
        new: stats.by_status?.new || 0,
        processing: stats.by_status?.processing || 0,
        production: stats.by_status?.production || 0,
        in_delivery: stats.by_status?.in_delivery || 0,
        done: stats.by_status?.done || 0,
    }), [stats]);

    return (
        <div className="flex h-screen font-sans text-white bg-[#0B0F19] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1A2642] via-[#0B0F19] to-[#080B13] overflow-hidden">

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
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Производство</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{getUserSecondaryLabel(currentUser)}</p>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {[
                        { id: 'queue', icon: '🏭', label: 'Очередь' },
                        { id: 'history', icon: '📜', label: 'Архив' },
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
                        Выйти
                    </button>
                </div>
            </aside>

            {/* MOBILE HEADER */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-30 px-4 py-3 bg-[#0B0F19]/95 backdrop-blur-xl border-b border-white/5 flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Производство</span>
                <span className="text-xs text-gray-500 truncate ml-auto">{getUserSecondaryLabel(currentUser)}</span>
            </div>

            {/* MAIN */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 pt-16 md:pt-8">

                {/* STATS */}
                <div className="flex flex-wrap gap-3 mb-6">
                    <StatCard label="Всего заказов" value={summary.total} />
                    <StatCard label="Новые" value={summary.new} accent="border-white/10" />
                    <StatCard label="В обработке" value={summary.processing} accent="border-blue-500/20" />
                    <StatCard label="В производстве" value={summary.production} accent="border-indigo-500/30" />
                    <StatCard label="В доставке" value={summary.in_delivery} accent="border-yellow-500/20" />
                    <StatCard label="Готово" value={summary.done} accent="border-emerald-500/20" />
                </div>

                {/* HEADER + FILTERS */}
                <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                    <div>
                        <h2 className="text-xl font-bold uppercase tracking-widest text-white">
                            {activeTab === 'history' ? 'Архив заказов' : 'Очередь производства'}
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            {activeTab === 'history' ? 'Готовые заказы за последние периоды' : 'Активные заказы — от приёма до отгрузки'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
                        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]"></div>
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live</span>
                    </div>
                </div>

                {/* STATUS PILL FILTER */}
                <div className="flex flex-wrap gap-2 mb-5">
                    <button
                        onClick={() => setStatusFilter('')}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${statusFilter === '' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                    >Все активные</button>
                    {PRODUCTION_STAGES.map(stage => (
                        <button
                            key={stage.key}
                            onClick={() => setStatusFilter(stage.key)}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border transition-all ${statusFilter === stage.key ? 'bg-white text-black border-white' : `${stage.color} hover:opacity-90`}`}
                        >
                            {stage.icon} {stage.text}
                        </button>
                    ))}
                </div>

                {/* ORDERS LIST */}
                <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[24px] overflow-hidden">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center gap-3">
                            <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Загрузка...</p>
                        </div>
                    ) : orders.length === 0 ? (
                        <div className="py-20 flex flex-col items-center gap-4">
                            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📭</div>
                            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Нет заказов</p>
                        </div>
                    ) : (
                        orders.map((order, i) => {
                            const orderId = String(order.id);
                            const isExpanded = expanded.has(orderId);
                            const isUpdating = updating === orderId;
                            const isTcBusy = techcardBusy === orderId;
                            const currentStageIdx = STAGE_INDEX[order.status] ?? 0;
                            return (
                                <div key={orderId} className={i !== orders.length - 1 ? 'border-b border-white/5' : ''}>
                                    {/* Summary row */}
                                    <div
                                        className="px-4 md:px-6 py-4 md:py-5 flex items-center gap-3 md:gap-4 hover:bg-white/[0.03] transition-colors cursor-pointer"
                                        onClick={() => toggleExpand(orderId)}
                                    >
                                        <div className="flex flex-col min-w-[88px]">
                                            <span className="font-bold text-sm text-white">#{orderId.substring(0, 6).toUpperCase()}</span>
                                            <span className="text-[10px] text-gray-500 mt-0.5">
                                                {order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : ''}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <span className="font-bold text-sm text-white truncate block">{order.product_name || 'Заказ'}</span>
                                            <span className="text-xs text-gray-500 truncate block">{order.user_email || '—'} · {order.quantity || 1} шт.</span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <StatusBadge status={order.status} />
                                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-4 md:px-6 pb-6 border-t border-white/5 bg-white/[0.02]">
                                            <ProgressTrack status={order.status} stageHistory={order.stage_history} />

                                            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                                                <div className="md:col-span-2 space-y-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Обновить этап</p>
                                                    <div className="flex flex-wrap gap-2">
                                                        {PRODUCTION_STAGES.map((stage, idx) => {
                                                            const isCurrent = stage.key === order.status;
                                                            const isPast = idx < currentStageIdx;
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
                                                                    {stage.icon} {stage.text}{isCurrent && ' ✓'}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    <textarea
                                                        value={commentDraft[orderId] || ''}
                                                        onChange={(e) => setCommentDraft(prev => ({ ...prev, [orderId]: e.target.value }))}
                                                        placeholder="Комментарий к этапу (опционально)..."
                                                        rows={2}
                                                        className="w-full mt-1 bg-white/5 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
                                                    />
                                                </div>

                                                <div className="space-y-3">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Документы</p>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); downloadTechcard(orderId); }}
                                                        disabled={isTcBusy}
                                                        className="w-full py-2.5 px-4 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition disabled:opacity-50 text-left"
                                                    >
                                                        {isTcBusy ? 'Генерация…' : '⬇ Техкарта PDF'}
                                                    </button>
                                                    {order.configuration?.server_render_url && (
                                                        <a
                                                            href={order.configuration.server_render_url}
                                                            target="_blank" rel="noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="w-full block py-2.5 px-4 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition text-left"
                                                        >
                                                            🖼 Превью рендера
                                                        </a>
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
            </main>

            {/* MOBILE BOTTOM NAV */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0B0F19]/95 backdrop-blur-xl border-t border-white/5 flex items-center px-2 pb-safe">
                {[
                    { id: 'queue', label: 'Очередь', icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="6"/><rect x="2" y="14" width="20" height="6"/></svg>) },
                    { id: 'history', label: 'Архив', icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 12 8 7 13 12"/><polyline points="11 12 16 7 21 12"/></svg>) },
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
