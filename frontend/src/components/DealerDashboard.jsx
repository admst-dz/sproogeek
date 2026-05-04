import { useState, useEffect } from 'react';
import { useConfigurator } from "../store";
import { fetchAllOrders, updateOrderStatus, updateOrderPrice, fetchDealerProducts, saveProduct, updateProduct, deleteProduct } from '../api';
import { getUserSecondaryLabel } from '../utils/user';
import { Canvas } from '@react-three/fiber';
import { PresentationControls, Stage, Environment } from '@react-three/drei';
import { Notebook } from './Notebook';
import { Sketchbook } from './Sketchbook';
import { Thermos } from './thermos/Thermos';

const ORDER_STAGES = [
    { key: 'new',         text: 'Новый',          color: 'bg-white/10 text-gray-400 border-white/10',            icon: '🕐' },
    { key: 'production',  text: 'В производстве', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: '🏭' },
    { key: 'processing',  text: 'В обработке',    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',       icon: '⚙️' },
    { key: 'in_delivery', text: 'Доставляется',   color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '🚚' },
    { key: 'done',        text: 'Готово',         color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✅' },
];

const STAGE_INDEX = Object.fromEntries(ORDER_STAGES.map((s, i) => [s.key, i]));

const StatusBadge = ({ status }) => {
    const s = ORDER_STAGES.find(x => x.key === status) || { text: status, color: 'bg-white/10 text-gray-400 border-white/10' };
    return (
        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.color}`}>
            {s.text}
        </span>
    );
};

const OrderProgressBar = ({ status, stageHistory = [] }) => {
    const currentIdx = STAGE_INDEX[status] ?? 0;
    const historyMap = {};
    stageHistory.forEach(h => { historyMap[h.status] = h; });

    return (
        <div className="pt-3 pb-1">
            <div className="relative flex items-start">
                <div className="absolute top-4 left-0 right-0 h-px bg-white/10 mx-8" style={{ zIndex: 0 }} />
                {ORDER_STAGES.map((stage, idx) => {
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
                                {isDone ? (
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M2 6l2.5 2.5L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                ) : (
                                    <span className="text-[10px]">{stage.icon}</span>
                                )}
                            </div>
                            <span className={`text-[8px] font-bold uppercase tracking-wider text-center leading-tight
                                ${isDone ? 'text-emerald-400' : isCurrent ? 'text-indigo-300' : 'text-gray-600'}`}>
                                {stage.text}
                            </span>
                            {entry && (
                                <div className="flex flex-col items-center gap-0.5 max-w-[72px]">
                                    <span className="text-[8px] text-gray-500 text-center">
                                        {new Date(entry.updated_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                                    </span>
                                    {entry.comment && (
                                        <span className="text-[8px] text-gray-400 text-center italic leading-tight line-clamp-2">
                                            {entry.comment}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Product Modal sub-components ────────────────────────────────────────────

const CheckToggle = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-3 cursor-pointer group select-none">
        <div
            onClick={onChange}
            className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all shrink-0 ${
                checked ? 'bg-white border-white' : 'bg-white/5 border-white/20 group-hover:border-white/40'
            }`}
        >
            {checked && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="#0B0F19" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            )}
        </div>
        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{label}</span>
    </label>
);

const ColorChip = ({ color, onRemove }) => (
    <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
        <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: color.hex }} />
        <span className="text-xs text-gray-300">{color.name}</span>
        {onRemove && (
            <button onClick={onRemove} className="text-gray-600 hover:text-red-400 transition-colors text-sm leading-none ml-0.5">×</button>
        )}
    </div>
);

const ColorInput = ({ value, onChange, onAdd }) => (
    <div className="flex gap-2 mt-2 pointer-events-auto">
        <input
            type="color"
            value={value.hex || '#ffffff'}
            onChange={(e) => onChange({ ...value, hex: e.target.value })}
            className="w-10 h-10 rounded-[10px] border border-white/10 bg-transparent cursor-pointer p-0.5 shrink-0"
        />
        <input
            type="text"
            placeholder="#ff0000"
            value={value.hex}
            onChange={(e) => onChange({ ...value, hex: e.target.value })}
            className="w-28 bg-black/20 border border-white/10 rounded-[12px] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
        />
        <input
            type="text"
            placeholder="Название"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            className="flex-1 bg-black/20 border border-white/10 rounded-[12px] px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
        />
        <button
            onClick={onAdd}
            disabled={!value.hex}
            className="px-4 py-2 bg-white/10 border border-white/10 hover:bg-white/20 text-white text-sm font-bold rounded-[12px] transition-all disabled:opacity-30"
        >
            +
        </button>
    </div>
);

const Section = ({ title, children }) => (
    <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">{title}</p>
        {children}
    </div>
);

// ─── ProductModal ─────────────────────────────────────────────────────────────

const ProductModal = ({ product, dealerId, onClose, onSaved }) => {
    const isEdit = !!product?.id;

    const [form, setForm] = useState({
        name: 'Ежедневник',
        binding: product?.binding || [],
        spiralColors: product?.spiralColors || [],
        hasElastic: product?.hasElastic ?? false,
        elasticColors: product?.elasticColors || [],
        formats: product?.formats || [],
        coverColors: product?.coverColors || [],
        retailPrice: product?.retailPrice || '',
        wholesaleTiers: product?.wholesaleTiers || [],
    });

    const [spiralColor, setSpiralColor] = useState({ name: '', hex: '' });
    const [elasticColor, setElasticColor] = useState({ name: '', hex: '' });
    const [coverColor, setCoverColor] = useState({ name: '', hex: '' });
    const [tierInput, setTierInput] = useState({ minQty: '', pricePerUnit: '' });
    const [saving, setSaving] = useState(false);

    const toggleBinding = (val) =>
        setForm(f => ({ ...f, binding: f.binding.includes(val) ? f.binding.filter(b => b !== val) : [...f.binding, val] }));

    const toggleFormat = (val) =>
        setForm(f => ({ ...f, formats: f.formats.includes(val) ? f.formats.filter(x => x !== val) : [...f.formats, val] }));

    const addColor = (key, input, setInput) => {
        if (!input.hex) return;
        setForm(f => ({ ...f, [key]: [...f[key], { name: input.name || input.hex, hex: input.hex }] }));
        setInput({ name: '', hex: '' });
    };

    const removeColor = (key, idx) =>
        setForm(f => ({ ...f, [key]: f[key].filter((_, i) => i !== idx) }));

    const addTier = () => {
        if (!tierInput.minQty || !tierInput.pricePerUnit) return;
        setForm(f => ({
            ...f,
            wholesaleTiers: [...f.wholesaleTiers, { minQty: Number(tierInput.minQty), pricePerUnit: Number(tierInput.pricePerUnit) }]
                .sort((a, b) => a.minQty - b.minQty),
        }));
        setTierInput({ minQty: '', pricePerUnit: '' });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const data = {
                ...form,
                dealerId,
                retailPrice: Number(form.retailPrice) || 0,
            };
            if (isEdit) {
                await updateProduct(product.id, data);
            } else {
                await saveProduct(data);
            }
            onSaved();
        } catch (err) {
            console.error(err);
            setSaving(false);
        }
    };

    const hasSpiralBinding = form.binding.includes('spiral');

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-6">
            <div className="w-full max-w-2xl max-h-[92vh] bg-[#0F1525] border border-white/10 rounded-t-[32px] md:rounded-[32px] overflow-hidden flex flex-col shadow-[0_20px_80px_rgba(0,0,0,0.8)]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
                    <h3 className="font-bold text-white uppercase tracking-widest text-sm">
                        {isEdit ? 'Редактировать продукт' : 'Добавить продукт'}
                    </h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-6 py-6 space-y-7">

                    {/* Product type */}
                    <Section title="Продукт">
                        <div className="bg-white/5 border border-white/10 rounded-[14px] px-4 py-3 text-white font-bold text-sm">
                            Ежедневник
                        </div>
                    </Section>

                    {/* Binding */}
                    <Section title="Переплёт">
                        <div className="flex flex-col gap-3">
                            <CheckToggle label="Твёрдый" checked={form.binding.includes('hard')} onChange={() => toggleBinding('hard')} />
                            <CheckToggle label="На пружине" checked={form.binding.includes('spiral')} onChange={() => toggleBinding('spiral')} />
                        </div>
                    </Section>

                    {/* Spiral colors */}
                    {hasSpiralBinding && (
                        <Section title="Цвет пружины">
                            <div className="flex flex-wrap gap-2 mb-1">
                                {form.spiralColors.map((c, i) => (
                                    <ColorChip key={i} color={c} onRemove={() => removeColor('spiralColors', i)} />
                                ))}
                            </div>
                            <ColorInput value={spiralColor} onChange={setSpiralColor} onAdd={() => addColor('spiralColors', spiralColor, setSpiralColor)} />
                        </Section>
                    )}

                    {/* Elastic */}
                    <Section title="Резинка">
                        <CheckToggle label="Есть резинка" checked={form.hasElastic} onChange={() => setForm(f => ({ ...f, hasElastic: !f.hasElastic }))} />
                    </Section>

                    {/* Elastic colors */}
                    {form.hasElastic && (
                        <Section title="Цвет резинки">
                            <div className="flex flex-wrap gap-2 mb-1">
                                {form.elasticColors.map((c, i) => (
                                    <ColorChip key={i} color={c} onRemove={() => removeColor('elasticColors', i)} />
                                ))}
                            </div>
                            <ColorInput value={elasticColor} onChange={setElasticColor} onAdd={() => addColor('elasticColors', elasticColor, setElasticColor)} />
                        </Section>
                    )}

                    {/* Format */}
                    <Section title="Формат">
                        <div className="flex gap-6">
                            <CheckToggle label="A5" checked={form.formats.includes('A5')} onChange={() => toggleFormat('A5')} />
                            <CheckToggle label="A6" checked={form.formats.includes('A6')} onChange={() => toggleFormat('A6')} />
                        </div>
                    </Section>

                    {/* Cover colors */}
                    <Section title="Цвет обложки">
                        <div className="flex flex-wrap gap-2 mb-1">
                            {form.coverColors.map((c, i) => (
                                <ColorChip key={i} color={c} onRemove={() => removeColor('coverColors', i)} />
                            ))}
                        </div>
                        <ColorInput value={coverColor} onChange={setCoverColor} onAdd={() => addColor('coverColors', coverColor, setCoverColor)} />
                    </Section>

                    {/* Pricing */}
                    <Section title="Цена">
                        <div className="mb-5">
                            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">Розница (BYN / шт)</p>
                            <input
                                type="number"
                                value={form.retailPrice}
                                onChange={(e) => setForm(f => ({ ...f, retailPrice: e.target.value }))}
                                placeholder="1500"
                                className="w-40 bg-black/20 border border-white/10 rounded-[12px] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                            />
                        </div>

                        <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Оптовые уровни</p>
                        {form.wholesaleTiers.length > 0 && (
                            <div className="mb-3 space-y-2">
                                {form.wholesaleTiers.map((tier, i) => (
                                    <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-[12px] px-4 py-2.5">
                                        <span className="text-xs text-gray-400">от <span className="text-white font-bold">{tier.minQty}</span> шт.</span>
                                        <span className="text-gray-600">→</span>
                                        <span className="text-xs text-white font-bold">{tier.pricePerUnit} BYN/шт</span>
                                        <button
                                            onClick={() => setForm(f => ({ ...f, wholesaleTiers: f.wholesaleTiers.filter((_, j) => j !== i) }))}
                                            className="ml-auto text-gray-600 hover:text-red-400 transition-colors text-sm"
                                        >×</button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <input
                                type="number"
                                value={tierInput.minQty}
                                onChange={(e) => setTierInput(t => ({ ...t, minQty: e.target.value }))}
                                placeholder="От (шт)"
                                className="w-28 bg-black/20 border border-white/10 rounded-[12px] px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                            />
                            <input
                                type="number"
                                value={tierInput.pricePerUnit}
                                onChange={(e) => setTierInput(t => ({ ...t, pricePerUnit: e.target.value }))}
                                placeholder="BYN / шт"
                                className="w-28 bg-black/20 border border-white/10 rounded-[12px] px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                            />
                            <button
                                onClick={addTier}
                                className="px-4 py-2 bg-white/10 border border-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-[12px] transition-all whitespace-nowrap"
                            >
                                + Уровень
                            </button>
                        </div>
                    </Section>

                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-white/5 shrink-0">
                    <button onClick={onClose} className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase tracking-widest rounded-[14px] transition-all">
                        Отмена
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex-1 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-[14px] hover:bg-gray-100 transition-all ${saving ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}`}
                    >
                        {saving ? 'Сохранение...' : (isEdit ? 'Сохранить' : 'Добавить')}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── DealerDashboard ──────────────────────────────────────────────────────────

const BINDING_LABELS = { hard: 'Твёрдый', spiral: 'На пружине' };

export const DealerDashboard = ({ onBack }) => {
    const { currentUser, logout } = useConfigurator();
    const [activeTab, setActiveTab] = useState('products');
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [expandedOrders, setExpandedOrders] = useState(new Set());
    const [statusUpdating, setStatusUpdating] = useState(null);
    const [commentDraft, setCommentDraft] = useState({});
    const [priceDraft, setPriceDraft] = useState({});
    const [priceUpdating, setPriceUpdating] = useState(null);

    useEffect(() => {
        if (activeTab === 'orders') {
            setLoading(true);
            fetchAllOrders()
                .then(data => {
                    data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
                    setOrders(data);
                })
                .catch(err => console.error('Failed to load orders:', err))
                .finally(() => setLoading(false));
        }
        if (activeTab === 'products' && currentUser) {
            setLoading(true);
            fetchDealerProducts(currentUser.id)
                .then(data => setProducts(data))
                .catch(err => console.error('Failed to load products:', err))
                .finally(() => setLoading(false));
        }
    }, [activeTab, currentUser]);

    const handleUpdatePrice = async (orderId) => {
        const price = parseFloat(priceDraft[orderId]);
        if (!price || price <= 0) return;
        setPriceUpdating(orderId);
        try {
            await updateOrderPrice(orderId, price);
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, price } : o));
            setPriceDraft(prev => { const next = { ...prev }; delete next[orderId]; return next; });
        } finally {
            setPriceUpdating(null);
        }
    };

    const handleUpdateStatus = async (orderId, newStatus) => {
        const comment = commentDraft[orderId] || '';
        setStatusUpdating(orderId);
        try {
            await updateOrderStatus(orderId, newStatus, comment || null);
            const newEntry = { status: newStatus, comment, updated_at: new Date().toISOString() };
            setOrders(prev => prev.map(o =>
                o.id === orderId
                    ? { ...o, status: newStatus, stageHistory: [...(o.stageHistory || []), newEntry] }
                    : o
            ));
            setCommentDraft(prev => { const next = { ...prev }; delete next[orderId]; return next; });
        } finally {
            setStatusUpdating(null);
        }
    };

    const toggleOrderExpand = (orderId) => {
        setExpandedOrders(prev => {
            const next = new Set(prev);
            next.has(orderId) ? next.delete(orderId) : next.add(orderId);
            return next;
        });
    };

    const handleDeleteProduct = async (productId) => {
        await deleteProduct(productId);
        setProducts(prev => prev.filter(p => p.id !== productId));
    };

    const handleProductSaved = () => {
        setShowModal(false);
        setEditingProduct(null);
        if (currentUser) {
            fetchDealerProducts(currentUser.id).then(setProducts);
        }
    };

    const openAdd = () => { setEditingProduct(null); setShowModal(true); };
    const openEdit = (p) => { setEditingProduct(p); setShowModal(true); };

    return (
        <div className="flex h-screen font-sans text-white bg-[#0B0F19] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1A2642] via-[#0B0F19] to-[#080B13] overflow-hidden">

            {showModal && (
                <ProductModal
                    product={editingProduct}
                    dealerId={currentUser?.id}
                    onClose={() => { setShowModal(false); setEditingProduct(null); }}
                    onSaved={handleProductSaved}
                />
            )}

            {/* SIDEBAR — только на desktop */}
            <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/5 bg-white/[0.02] backdrop-blur-xl z-20">
                <div className="p-6 border-b border-white/5">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 bg-white/10 border border-white/10 rounded-[10px] flex items-center justify-center">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        </div>
                        <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Дилер</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{getUserSecondaryLabel(currentUser)}</p>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {[
                        { id: 'products', icon: '🗂️', label: 'Мои продукты' },
                        { id: 'orders',   icon: '📦', label: 'Заказы' },
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">Дилер</span>
                <span className="text-xs text-gray-500 truncate ml-auto">{getUserSecondaryLabel(currentUser)}</span>
            </div>

            {/* MAIN */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 pt-16 md:pt-8">

                {/* ── PRODUCTS TAB ── */}
                {activeTab === 'products' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold uppercase tracking-widest text-white">Мои продукты</h2>
                                <p className="text-xs text-gray-500 mt-1">Каталог и настройки позиций</p>
                            </div>
                            <button
                                onClick={openAdd}
                                className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-gray-100 active:scale-95 transition-all"
                            >
                                + Добавить продукт
                            </button>
                        </div>

                        {loading ? (
                            <div className="py-20 flex flex-col items-center gap-3">
                                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Загрузка...</p>
                            </div>
                        ) : products.length === 0 ? (
                            <div className="py-20 flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📦</div>
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Нет продуктов</p>
                                <button onClick={openAdd} className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-gray-100 active:scale-95 transition-all">
                                    + Добавить первый
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {products.map(prod => (
                                    <div key={prod.id} className="group relative flex flex-col rounded-[24px] bg-white/[0.03] border border-white/10 backdrop-blur-xl overflow-hidden hover:bg-white/[0.06] hover:border-white/20 transition-all duration-500 p-5">

                                        <div className="aspect-video bg-white/5 rounded-[16px] mb-4 border border-white/5 flex items-center justify-center">
                                            <span className="text-3xl opacity-30">📓</span>
                                        </div>

                                        <h3 className="font-bold text-base text-white mb-2">{prod.name}</h3>

                                        {/* Tags */}
                                        <div className="flex flex-wrap gap-1.5 mb-3">
                                            {prod.formats?.map(f => (
                                                <span key={f} className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-white/5 text-gray-400 border border-white/5">{f}</span>
                                            ))}
                                            {prod.binding?.map(b => (
                                                <span key={b} className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">{BINDING_LABELS[b] || b}</span>
                                            ))}
                                            {prod.hasElastic && (
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Резинка</span>
                                            )}
                                        </div>

                                        {/* Cover color swatches */}
                                        {prod.coverColors?.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {prod.coverColors.slice(0, 10).map((c, i) => (
                                                    <div key={i} title={c.name} className="w-4 h-4 rounded-full border border-white/20" style={{ backgroundColor: c.hex }} />
                                                ))}
                                                {prod.coverColors.length > 10 && (
                                                    <span className="text-[10px] text-gray-500 self-center">+{prod.coverColors.length - 10}</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Price + actions */}
                                        <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                                <span className="font-bold text-white text-sm">{prod.retailPrice} BYN</span>
                                                {prod.wholesaleTiers?.length > 0 && (
                                                    <span className="text-[10px] text-gray-500 ml-1.5">/ опт {prod.wholesaleTiers[0].pricePerUnit} BYN</span>
                                                )}
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => openEdit(prod)}
                                                    className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all"
                                                >
                                                    Изменить
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProduct(prod.id)}
                                                    className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all"
                                                >
                                                    Удалить
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── ORDERS TAB ── */}
                {activeTab === 'orders' && (
                    <div>
                        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                            <div>
                                <h2 className="text-xl font-bold uppercase tracking-widest text-white">Управление заказами</h2>
                                <p className="text-xs text-gray-500 mt-1">Все входящие заявки от клиентов</p>
                            </div>
                            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-full">
                                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_6px_rgba(52,211,153,0.8)]"></div>
                                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Live</span>
                            </div>
                        </div>

                        <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[24px] overflow-hidden">
                            {loading ? (
                                <div className="py-20 flex flex-col items-center gap-3">
                                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Загрузка из БД...</p>
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="py-20 flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📭</div>
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Нет заказов</p>
                                </div>
                            ) : (
                                orders.map((order, i) => {
                                    const isExpanded = expandedOrders.has(order.id);
                                    const isUpdating = statusUpdating === order.id;
                                    const currentStageIdx = STAGE_INDEX[order.status] ?? 0;
                                    return (
                                        <div key={order.id} className={i !== orders.length - 1 ? 'border-b border-white/5' : ''}>
                                            {/* Summary row */}
                                            <div
                                                className="px-4 md:px-6 py-4 md:py-5 flex items-center gap-3 md:gap-4 hover:bg-white/[0.03] transition-colors cursor-pointer"
                                                onClick={() => toggleOrderExpand(order.id)}
                                            >
                                                <div className="flex flex-col min-w-[72px]">
                                                    <span className="font-bold text-sm text-white">#{order.id.substring(0, 6).toUpperCase()}</span>
                                                    <span className="text-[10px] text-gray-500 mt-0.5">{order.date}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <span className="font-bold text-sm text-white truncate block">{order.userEmail}</span>
                                                    <span className="text-xs text-gray-500 truncate block">{order.product} · {order.price} BYN</span>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <StatusBadge status={order.status} />
                                                    <svg
                                                        width="14" height="14" viewBox="0 0 14 14" fill="none"
                                                        className={`text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                    >
                                                        <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                </div>
                                            </div>

                                            {/* Expanded detail */}
                                            {isExpanded && (
                                                <div className="border-t border-white/5 bg-white/[0.02]" onClick={e => e.stopPropagation()}>
                                                    <div className="px-4 md:px-6 py-6 flex flex-col lg:flex-row gap-6">

                                                        {/* LEFT: 3D preview */}
                                                        <div className="w-full lg:w-72 shrink-0 flex flex-col gap-3">
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">3D Макет</p>
                                                            <Order3DPreview configuration={order.configuration} productName={order.product} />
                                                        </div>

                                                        {/* RIGHT: details */}
                                                        <div className="flex-1 flex flex-col gap-5">

                                                            {/* Contact info */}
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Контактные данные</p>
                                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                                    <OrderDetailRow label="Тип" value={order.configuration?.clientType === 'jur' ? 'Юр. лицо' : 'Физ. лицо'} />
                                                                    <OrderDetailRow label={order.configuration?.clientType === 'jur' ? 'Компания' : 'ФИО'} value={order.configuration?.contact?.name || '—'} />
                                                                    <OrderDetailRow label="Телефон" value={order.configuration?.contact?.phone || '—'} />
                                                                    {order.configuration?.contact?.email && <OrderDetailRow label="Email" value={order.configuration.contact.email} />}
                                                                    {order.configuration?.contact?.inn && <OrderDetailRow label="УНП / ИНН" value={order.configuration.contact.inn} />}
                                                                    {order.configuration?.contact?.contactPerson && <OrderDetailRow label="Контакт. лицо" value={order.configuration.contact.contactPerson} />}
                                                                    {order.configuration?.contact?.address && <OrderDetailRow label="Адрес" value={order.configuration.contact.address} />}
                                                                    {order.configuration?.contact?.comment && <div className="col-span-2 md:col-span-3"><OrderDetailRow label="Комментарий" value={order.configuration.contact.comment} /></div>}
                                                                </div>
                                                            </div>

                                                            {/* Order params */}
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">Параметры заказа</p>
                                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                                                    {order.quantity && <OrderDetailRow label="Тираж" value={`${order.quantity} шт.`} accent />}
                                                                    {order.configuration?.isSample && <OrderDetailRow label="Образец" value="Тиражный образец" />}
                                                                    {order.configuration?.productConfig?.format && <OrderDetailRow label="Формат" value={order.configuration.productConfig.format} />}
                                                                    {order.configuration?.productConfig?.bindingType && <OrderDetailRow label="Переплёт" value={order.configuration.productConfig.bindingType === 'hard' ? 'Твёрдый' : 'На пружине'} />}
                                                                    {order.configuration?.productConfig?.paperPattern && <OrderDetailRow label="Разлиновка" value={{ blank: 'Пустой', lined: 'Линейка', grid: 'Клетка', dotted: 'Точка' }[order.configuration.productConfig.paperPattern] || order.configuration.productConfig.paperPattern} />}
                                                                    {order.configuration?.productConfig?.coverColor && <OrderDetailRow label="Обложка" value={<ColorSwatch color={order.configuration.productConfig.coverColor} />} />}
                                                                    {order.configuration?.productConfig?.hasElastic && order.configuration?.productConfig?.elasticColor && <OrderDetailRow label="Резинка" value={<ColorSwatch color={order.configuration.productConfig.elasticColor} />} />}
                                                                    {order.configuration?.productConfig?.bindingType === 'spiral' && order.configuration?.productConfig?.spiralColor && <OrderDetailRow label="Пружина" value={<ColorSwatch color={order.configuration.productConfig.spiralColor} />} />}
                                                                </div>
                                                            </div>

                                                            {/* Progress bar */}
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Этапы выполнения</p>
                                                                <OrderProgressBar status={order.status} stageHistory={order.stageHistory} />
                                                            </div>

                                                            {/* Dealer price */}
                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Цена для клиента (BYN)</p>
                                                                <div className="flex items-center gap-2">
                                                                    {order.price > 0 && (
                                                                        <span className="text-sm font-bold text-white bg-white/5 border border-white/10 rounded-[12px] px-4 py-2.5 shrink-0">
                                                                            Текущая: {order.price} BYN
                                                                        </span>
                                                                    )}
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="0.01"
                                                                        value={priceDraft[order.id] ?? ''}
                                                                        onChange={e => setPriceDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                                        placeholder="Новая цена"
                                                                        className="w-36 bg-black/20 border border-white/10 rounded-[12px] px-4 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                                                                    />
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleUpdatePrice(order.id); }}
                                                                        disabled={!priceDraft[order.id] || priceUpdating === order.id}
                                                                        className="px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider rounded-[12px] transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap"
                                                                    >
                                                                        {priceUpdating === order.id ? '...' : 'Установить'}
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            {/* Status controls */}
                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Обновить этап</p>
                                                                <div className="flex flex-wrap gap-2">
                                                                    {ORDER_STAGES.map((stage, idx) => {
                                                                        const isCurrent = stage.key === order.status;
                                                                        const isPast = idx < currentStageIdx;
                                                                        return (
                                                                            <button
                                                                                key={stage.key}
                                                                                disabled={isCurrent || isUpdating}
                                                                                onClick={(e) => { e.stopPropagation(); handleUpdateStatus(order.id, stage.key); }}
                                                                                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all
                                                                                    ${isCurrent
                                                                                        ? `${stage.color} cursor-default opacity-100 ring-1 ring-white/20`
                                                                                        : isPast
                                                                                            ? 'bg-white/5 text-gray-600 border-white/5 hover:bg-white/10 hover:text-gray-400'
                                                                                            : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                                                                                    } ${isUpdating ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                                            >
                                                                                {stage.icon} {stage.text}
                                                                                {isCurrent && ' ✓'}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="flex gap-2 items-start">
                                                                    <textarea
                                                                        rows={2}
                                                                        placeholder="Комментарий к этапу (необязательно)..."
                                                                        value={commentDraft[order.id] || ''}
                                                                        onChange={e => setCommentDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                                        className="flex-1 bg-black/20 border border-white/10 rounded-[12px] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 resize-none"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* BOTTOM NAV — только на mobile */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0B0F19]/95 backdrop-blur-xl border-t border-white/5 flex items-center px-2 pb-safe">
                {[
                    { id: 'products', label: 'Продукты', icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="7" height="7"/><rect x="15" y="3" width="7" height="7"/><rect x="2" y="14" width="7" height="7"/><rect x="15" y="14" width="7" height="7"/></svg>
                    )},
                    { id: 'orders', label: 'Заказы', icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/></svg>
                    )},
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors ${
                            activeTab === tab.id ? 'text-white' : 'text-gray-600'
                        }`}
                    >
                        {tab.icon}
                        <span className="text-[10px] font-bold uppercase tracking-widest">{tab.label}</span>
                    </button>
                ))}
                <button
                    onClick={() => { logout(); onBack(); }}
                    className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-gray-600 hover:text-red-400 transition-colors"
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Выйти</span>
                </button>
            </nav>
        </div>
    );
};

// ─── Order detail helpers ──────────────────────────────────────────────────────

const Order3DPreview = ({ configuration, productName }) => {
    const pc = configuration?.productConfig;
    const name = (productName || pc?.productName || '').toLowerCase();
    const productType = pc?.type || pc?.activeProduct ||
        (name.includes('термос') ? 'thermos' : name.includes('скетчбук') ? 'sketchbook' : 'notebook');

    const config3D = {
        format: pc?.format || pc?.config?.format || 'A5',
        bindingType: pc?.bindingType || pc?.config?.bindingType || 'hard',
        coverColor: pc?.coverColor || pc?.config?.coverColor || '#D2B48C',
        hasElastic: pc?.hasElastic ?? pc?.config?.hasElastic ?? false,
        elasticColor: pc?.elasticColor || pc?.config?.elasticColor || '#1a1a1a',
        spiralColor: pc?.spiralColor || pc?.config?.spiralColor || '#1a1a1a',
        paperPattern: pc?.paperPattern || pc?.config?.paperPattern || 'blank',
        logos: [],
        isNotebookOpen: false,
        thermosBodyColor: pc?.thermosBodyColor || '#C0C0C0',
        thermosCapColor: pc?.thermosCapColor || '#C0C0C0',
        thermosCapVisible: true,
        thermosLogos: pc?.thermosLogos || [],
    };

    return (
        <div className="bg-white/[0.03] border border-white/10 rounded-[16px] overflow-hidden">
            <div style={{ height: 220, pointerEvents: 'none' }}>
                <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 4.5], fov: 45 }} gl={{ antialias: true }}>
                    <Environment preset="city" />
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[10, 10, 5]} intensity={1.5} />
                    <directionalLight position={[-10, 5, 2]} intensity={0.5} />
                    <PresentationControls speed={1.5} global polar={[-0.1, Math.PI / 4]}>
                        <Stage environment={null} intensity={0} contactShadow={false}>
                            {productType === 'sketchbook' ? <Sketchbook config={config3D} /> : productType === 'thermos' ? <Thermos config={config3D} /> : <Notebook config={config3D} />}
                        </Stage>
                    </PresentationControls>
                </Canvas>
            </div>
        </div>
    );
};

const OrderDetailRow = ({ label, value, accent }) => (
    <div className="flex flex-col gap-0.5 bg-white/[0.03] border border-white/5 rounded-[10px] px-3 py-2.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{label}</span>
        <span className={`text-xs font-bold truncate ${accent ? 'text-white' : 'text-gray-300'}`}>{value}</span>
    </div>
);

const ColorSwatch = ({ color }) => (
    <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs font-bold text-gray-300">{color}</span>
    </div>
);
