import { useState, useEffect, useCallback } from 'react';
import { useConfigurator } from "../../store";
import { t } from '../../i18n';
import { LiveOrderToasts } from '../shared/LiveOrderToasts';
import { ApprovalPanel } from '../shared/ApprovalPanel';
import {
    fetchAdminOrders, updateOrderStatus,
    fetchDealerProducts, saveProduct, updateProduct, deleteProduct,
    fetchOrderTypes, fetchOrderType, saveOrderType,
    fetchDealerSelectedOrders, fetchManufacturerQueue, manufacturerApi, orderApi,
} from '../../api';
import { getUserSecondaryLabel } from '../../utils/user';
import { Canvas } from '@react-three/fiber';
import { PresentationControls, Stage, Environment } from '@react-three/drei';
import { Notebook } from '../shared/Notebook';
import { Thermos } from '../thermos/Thermos';
import { downloadBlob } from '../../utils/download';
import { OrderQrTile } from '../shared/OrderQrTile';

const ORDER_STAGES = [
    { key: 'new',         textKey: 'statusNew',        color: 'bg-white/10 text-gray-400 border-white/10',            icon: '🕐' },
    { key: 'awaiting_signature', textKey: 'statusAwaitingSignature', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30', icon: '✎' },
    { key: 'awaiting_quotes', textKey: 'statusAwaitingQuotes', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30', icon: '₽' },
    { key: 'quotes_ready', textKey: 'statusQuotesReady', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: '₽' },
    { key: 'processing',  textKey: 'statusProcessing',  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',       icon: '⚙️' },
    { key: 'production',  textKey: 'statusProduction',  color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30', icon: '🏭' },
    { key: 'in_delivery', textKey: 'statusDelivery',    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '🚚' },
    { key: 'done',        textKey: 'statusDone',        color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✅' },
];

const STAGE_INDEX = Object.fromEntries(ORDER_STAGES.map((s, i) => [s.key, i]));

const StatusBadge = ({ status, language = 'ru' }) => {
    const s = ORDER_STAGES.find(x => x.key === status) || { textKey: null, color: 'bg-white/10 text-gray-400 border-white/10' };
    return (
        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.color}`}>
            {s.textKey ? t(language, s.textKey) : status}
        </span>
    );
};

const OrderProgressBar = ({ status, stageHistory = [], language = 'ru' }) => {
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
                                {t(language, stage.textKey)}
                            </span>
                            {entry && (
                                <div className="flex flex-col items-center gap-0.5 max-w-[72px]">
                                    <span className="text-[8px] text-gray-500 text-center">
                                        {new Date(entry.updated_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
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

const ColorInput = ({ value, onChange, onAdd, language }) => (
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
            placeholder={t(language, 'namePlaceholder')}
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

const ProductModal = ({ product, dealerId, onClose, onSaved, language = 'ru' }) => {
    const isEdit = !!product?.id;

    const [form, setForm] = useState({
        name: t(language, 'notebook'),
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
                        {isEdit ? t(language, 'editProduct') : t(language, 'addProduct')}
                    </h3>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 text-gray-400 hover:text-white transition-all">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="overflow-y-auto flex-1 px-6 py-6 space-y-7">

                    {/* Product type */}
                    <Section title={t(language, 'productSection')}>
                        <div className="bg-white/5 border border-white/10 rounded-[14px] px-4 py-3 text-white font-bold text-sm">
                            {t(language, 'notebook')}
                        </div>
                    </Section>

                    {/* Binding */}
                    <Section title={t(language, 'bindingSection')}>
                        <div className="flex flex-col gap-3">
                            <CheckToggle label={t(language, 'bindingHardShort')} checked={form.binding.includes('hard')} onChange={() => toggleBinding('hard')} />
                            <CheckToggle label={t(language, 'bindingSpiralShort')} checked={form.binding.includes('spiral')} onChange={() => toggleBinding('spiral')} />
                        </div>
                    </Section>

                    {/* Spiral colors */}
                    {hasSpiralBinding && (
                        <Section title={t(language, 'spiralColorSection')}>
                            <div className="flex flex-wrap gap-2 mb-1">
                                {form.spiralColors.map((c, i) => (
                                    <ColorChip key={i} color={c} onRemove={() => removeColor('spiralColors', i)} />
                                ))}
                            </div>
                            <ColorInput value={spiralColor} onChange={setSpiralColor} onAdd={() => addColor('spiralColors', spiralColor, setSpiralColor)} language={language} />
                        </Section>
                    )}

                    {/* Elastic */}
                    <Section title={t(language, 'elasticSection')}>
                        <CheckToggle label={t(language, 'hasElasticLabel')} checked={form.hasElastic} onChange={() => setForm(f => ({ ...f, hasElastic: !f.hasElastic }))} />
                    </Section>

                    {/* Elastic colors */}
                    {form.hasElastic && (
                        <Section title={t(language, 'elasticColorSection')}>
                            <div className="flex flex-wrap gap-2 mb-1">
                                {form.elasticColors.map((c, i) => (
                                    <ColorChip key={i} color={c} onRemove={() => removeColor('elasticColors', i)} />
                                ))}
                            </div>
                            <ColorInput value={elasticColor} onChange={setElasticColor} onAdd={() => addColor('elasticColors', elasticColor, setElasticColor)} language={language} />
                        </Section>
                    )}

                    {/* Format */}
                    <Section title={t(language, 'formatSection')}>
                        <div className="flex gap-6">
                            <CheckToggle label="A5" checked={form.formats.includes('A5')} onChange={() => toggleFormat('A5')} />
                            <CheckToggle label="A6" checked={form.formats.includes('A6')} onChange={() => toggleFormat('A6')} />
                        </div>
                    </Section>

                    {/* Cover colors */}
                    <Section title={t(language, 'coverColorSection')}>
                        <div className="flex flex-wrap gap-2 mb-1">
                            {form.coverColors.map((c, i) => (
                                <ColorChip key={i} color={c} onRemove={() => removeColor('coverColors', i)} />
                            ))}
                        </div>
                        <ColorInput value={coverColor} onChange={setCoverColor} onAdd={() => addColor('coverColors', coverColor, setCoverColor)} language={language} />
                    </Section>

                    {/* Pricing */}
                    <Section title={t(language, 'priceSection')}>
                        <div className="mb-5">
                            <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-1.5">{t(language, 'retailPriceDesc')}</p>
                            <input
                                type="number"
                                value={form.retailPrice}
                                onChange={(e) => setForm(f => ({ ...f, retailPrice: e.target.value }))}
                                placeholder="1500"
                                className="w-40 bg-black/20 border border-white/10 rounded-[12px] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                            />
                        </div>

                        <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">{t(language, 'wholesaleTiersLabel')}</p>
                        {form.wholesaleTiers.length > 0 && (
                            <div className="mb-3 space-y-2">
                                {form.wholesaleTiers.map((tier, i) => (
                                    <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-[12px] px-4 py-2.5">
                                        <span className="text-xs text-gray-400">{t(language, 'fromLabel')} <span className="text-white font-bold">{tier.minQty}</span> {t(language, 'pcsUnit')}</span>
                                        <span className="text-gray-600">→</span>
                                        <span className="text-xs text-white font-bold">{tier.pricePerUnit} BYN/{t(language, 'pcsUnit')}</span>
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
                                placeholder={t(language, 'fromQtyPlaceholder')}
                                className="w-28 bg-black/20 border border-white/10 rounded-[12px] px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                            />
                            <input
                                type="number"
                                value={tierInput.pricePerUnit}
                                onChange={(e) => setTierInput(t => ({ ...t, pricePerUnit: e.target.value }))}
                                placeholder={t(language, 'pricePerPcsPlaceholder')}
                                className="w-28 bg-black/20 border border-white/10 rounded-[12px] px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30"
                            />
                            <button
                                onClick={addTier}
                                className="px-4 py-2 bg-white/10 border border-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-[12px] transition-all whitespace-nowrap"
                            >
                                {t(language, 'addTierBtn')}
                            </button>
                        </div>
                    </Section>

                </div>

                {/* Footer */}
                <div className="flex gap-3 px-6 py-4 border-t border-white/5 shrink-0">
                    <button onClick={onClose} className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-xs font-bold uppercase tracking-widest rounded-[14px] transition-all">
                        {t(language, 'cancelBtn')}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex-1 py-3 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-[14px] hover:bg-gray-100 transition-all ${saving ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}`}
                    >
                        {saving ? t(language, 'savingLabel') : (isEdit ? t(language, 'saveLabel') : t(language, 'addLabel'))}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── DealerDashboard ──────────────────────────────────────────────────────────

const getBindingLabel = (binding, language) => ({ hard: t(language, 'bindingHardShort'), spiral: t(language, 'bindingSpiralShort') })[binding] || binding;

const normalizeDashboardOrder = (order) => ({
    id: String(order.id),
    product: order.product || order.product_name || '',
    price: order.price ?? order.total_price ?? 0,
    status: order.status || 'new',
    stageHistory: order.stageHistory || order.stage_history || [],
    date: order.date || (order.created_at ? new Date(order.created_at).toLocaleDateString('ru-RU') : ''),
    userEmail: order.userEmail || order.user_email || '',
    createdAt: order.createdAt || (order.created_at ? { seconds: new Date(order.created_at).getTime() / 1000 } : null),
    approvalStatus: order.approvalStatus || order.approval_status || 'pending',
    approvalPdfKey: order.approvalPdfKey || order.approval_pdf_key || null,
    signedApprovalFileKey: order.signedApprovalFileKey || order.signed_approval_file_key || null,
    dealerConfirmedAt: order.dealerConfirmedAt || order.dealer_confirmed_at || null,
    manufacturerQuotes: order.manufacturerQuotes || order.manufacturer_quotes || [],
    selectedManufacturerId: order.selectedManufacturerId || order.selected_manufacturer_id || null,
    selectedQuoteId: order.selectedQuoteId || order.selected_quote_id || null,
    quantity: order.quantity || 1,
    configuration: order.configuration || null,
});

const getOrderConfig = (order) => order.configuration?.productConfig || order.configuration || {};
const getOrderContact = (order) => order.configuration?.contact || {};
const getProductType = (order) => {
    const cfg = getOrderConfig(order);
    const product = `${order.product || ''}`.toLowerCase();
    if (cfg.activeProduct) return cfg.activeProduct;
    if (cfg.type) return cfg.type;
    if (product.includes('термос') || product.includes('thermos')) return 'thermos';
    if (product.includes('powerbank') || product.includes('повербанк')) return 'powerbank';
    return 'notebook';
};

const ColorValue = ({ color }) => color ? (
    <span className="inline-flex items-center gap-2 justify-end">
        <span className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: color }} />
        <span className="uppercase font-black">{color}</span>
    </span>
) : '—';

const DetailRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-3 rounded-[10px] bg-white/[0.03] border border-white/8 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 min-w-0">{label}</span>
        <span className="text-xs font-bold text-white text-right min-w-0 break-words">{value || '—'}</span>
    </div>
);

const DealerOrder3DPreview = ({ order }) => {
    const cfg = getOrderConfig(order);
    const type = getProductType(order);

    if (!['notebook', 'calendar', 'thermos'].includes(type)) {
        return (
            <div className="h-52 rounded-[16px] bg-white/[0.03] border border-white/8 flex items-center justify-center">
                <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">3D</span>
            </div>
        );
    }

    return (
        <div className="relative h-52 rounded-[16px] bg-[#0A0E1A] border border-white/8 overflow-hidden">
            <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 0, 4.5], fov: 45 }} gl={{ antialias: true }}>
                <Environment preset="city" />
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 10, 5]} intensity={1.5} />
                <PresentationControls speed={1.5} global polar={[-0.1, Math.PI / 4]}>
                    <Stage environment={null} intensity={0} contactShadow={false}>
                        {(type === 'notebook' || type === 'calendar') && <Notebook config={cfg} />}
                        {type === 'thermos' && <Thermos config={cfg} />}
                    </Stage>
                </PresentationControls>
            </Canvas>
        </div>
    );
};

const DealerOrderDetails = ({ order, language, full = false }) => {
    const cfg = getOrderConfig(order);
    const contact = getOrderContact(order);
    const type = getProductType(order);
    const selectedQuote = (order.manufacturerQuotes || []).find(q => q.id === order.selectedQuoteId);
    const thermosColor = cfg.thermosBodyColor || cfg.thermosCapColor;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <DealerOrder3DPreview order={order} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 content-start">
                <DetailRow label={t(language, 'productLabel')} value={order.product} />
                <DetailRow label={t(language, 'quantityLabel')} value={`${order.quantity || 1} ${t(language, 'pcsUnit')}`} />
                {type === 'thermos' ? (
                    <>
                        <DetailRow label={t(language, 'bodyLabel')} value={<ColorValue color={thermosColor} />} />
                        <DetailRow label={t(language, 'capLabel')} value={<ColorValue color={thermosColor} />} />
                    </>
                ) : (
                    <>
                        <DetailRow label={t(language, 'formatLabel')} value={cfg.format} />
                        <DetailRow label={t(language, 'bindingLabel')} value={cfg.bindingType ? getBindingLabel(cfg.bindingType, language) : null} />
                        <DetailRow label={t(language, 'coverLabel')} value={<ColorValue color={cfg.coverColor} />} />
                        {cfg.hasElastic && <DetailRow label={t(language, 'elasticLabel')} value={<ColorValue color={cfg.elasticColor} />} />}
                        {cfg.bindingType === 'spiral' && <DetailRow label={t(language, 'spiralLabel')} value={<ColorValue color={cfg.spiralColor} />} />}
                        <DetailRow label={t(language, 'patternLabel')} value={cfg.paperPattern} />
                    </>
                )}
                {full && (
                    <>
                        <DetailRow label={t(language, 'clientCol')} value={contact.name || contact.contactPerson || order.userEmail} />
                        <DetailRow label={t(language, 'emailLabel')} value={order.userEmail || contact.email} />
                        <DetailRow label={t(language, 'orderPhone')} value={contact.phone} />
                        <DetailRow label={t(language, 'orderAddress')} value={contact.address} />
                        {selectedQuote && <DetailRow label={t(language, 'quotePricePlaceholder')} value={`${selectedQuote.price} ${selectedQuote.currency || 'BYN'}`} />}
                        {selectedQuote && <DetailRow label={t(language, 'quoteDaysPlaceholder')} value={`${selectedQuote.production_days} ${t(language, 'quoteDaysShort')}`} />}
                        {contact.comment && <DetailRow label={t(language, 'orderComment')} value={contact.comment} />}
                    </>
                )}
            </div>
        </div>
    );
};

const ProductionPacket = ({
    order,
    language,
    imposition,
    techcardBusy,
    onDownloadTechcard,
    onPrint,
    onChanged,
}) => {
    const orderId = order.id;

    return (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
            <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'docsTracking')}</p>
                <ApprovalPanel
                    order={order}
                    role="dealer"
                    onChanged={onChanged}
                />
            </div>
            <div className="space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'docsTracking')}</p>
                <button
                    type="button"
                    onClick={() => onDownloadTechcard(orderId)}
                    disabled={techcardBusy}
                    className="w-full py-2.5 px-4 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition disabled:opacity-50 text-left"
                >
                    {techcardBusy ? t(language, 'approvalGenerating') : t(language, 'techcardPdf')}
                </button>
                <button
                    type="button"
                    onClick={() => onPrint(orderId)}
                    className="w-full py-2.5 px-4 rounded-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25 text-emerald-200 text-xs font-bold transition text-left"
                >
                    {t(language, 'printProductionPacket')}
                </button>
                {order.configuration?.server_render_url && (
                    <a
                        href={order.configuration.server_render_url}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full block py-2.5 px-4 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition text-left"
                    >
                        {t(language, 'renderPreview')}
                    </a>
                )}
                {order.signedApprovalFileKey && (
                    <a
                        href={order.signedApprovalFileKey}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full block py-2.5 px-4 rounded-[10px] bg-white/10 hover:bg-white/15 text-xs font-bold transition text-left"
                    >
                        {t(language, 'approvalSignedUploaded')}
                    </a>
                )}
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-[10px] p-3">
                    <OrderQrTile orderId={orderId} />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'orderQRLabel')}</p>
                        <p className="text-[10px] text-gray-400 mt-1 truncate">spruzhyk://order/{orderId.substring(0, 8)}...</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">{t(language, 'qrScanHint')}</p>
                    </div>
                </div>
                {imposition?.ok && (
                    <div className="bg-white/5 border border-white/10 rounded-[10px] p-3 text-[11px] text-gray-300">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">{t(language, 'impositionSRA3')}</p>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                            <span className="text-gray-500">{t(language, 'impositionItems')}</span><span className="text-white font-bold">{imposition.layout.items_per_sheet}</span>
                            <span className="text-gray-500">{t(language, 'impositionGrid')}</span><span>{imposition.layout.cols}x{imposition.layout.rows} {imposition.layout.orientation === 'landscape' ? 'landscape' : 'portrait'}</span>
                            <span className="text-gray-500">{t(language, 'impositionSheets')}</span><span className="text-white font-bold">{imposition.totals.sheets_required}</span>
                            <span className="text-gray-500">{t(language, 'impositionWaste')}</span><span>{imposition.totals.waste_per_sheet}</span>
                        </div>
                    </div>
                )}
                {imposition && !imposition.ok && (
                    <p className="text-[11px] text-red-400 italic">{imposition.reason}</p>
                )}
            </div>
        </div>
    );
};

export const DealerDashboard = ({ onBack }) => {
    const { currentUser, logout, language } = useConfigurator();
    const [activeTab, setActiveTab] = useState('products');
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [expandedOrders, setExpandedOrders] = useState(new Set());
    const [statusUpdating, setStatusUpdating] = useState(null);
    const [commentDraft, setCommentDraft] = useState({});
    const [quoteDraft, setQuoteDraft] = useState({});
    const [techcardBusy, setTechcardBusy] = useState(null);
    const [impositionMap, setImpositionMap] = useState({});

    const [clientOrders, setClientOrders] = useState([]);

    const [orderTypes, setOrderTypes] = useState([]);
    const [selectedOrderType, setSelectedOrderType] = useState(null);
    const [orderTypeDraft, setOrderTypeDraft] = useState('');
    const [orderTypeError, setOrderTypeError] = useState('');
    const [orderTypeSaving, setOrderTypeSaving] = useState(false);

    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'owner';

    const loadOrders = useCallback(() => {
        if (isAdmin) {
            return fetchAdminOrders();
        }
        return fetchManufacturerQueue().then(data =>
            data
                .map(normalizeDashboardOrder)
                .filter(order => !order.selectedManufacturerId)
        );
    }, [isAdmin]);

    const handleLiveEvent = useCallback((event) => {
        const data = event?.data;
        if (!data) return;
        if (event.type?.startsWith('order.') && activeTab === 'orders') {
            // refetch silently to avoid flicker; cheap
            const request = loadOrders();
            request.then(d => {
                d.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
                setOrders(d);
            }).catch(() => {});
        } else if ((event.type === 'order.status_changed' || event.type === 'order.updated') && data.order_id) {
            setOrders(prev => prev.map(o => String(o.id) === String(data.order_id)
                ? { ...o, status: data.status || o.status }
                : o));
        }
    }, [activeTab, loadOrders]);

    useEffect(() => {
        if (isAdmin && activeTab === 'products') setActiveTab('orders');
    }, [isAdmin, activeTab]);

    useEffect(() => {
        if (activeTab === 'orders') {
            setLoading(true);
            const request = loadOrders();
            request.then(data => {
                data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
                setOrders(data);
                setLoading(false);
            }).catch(() => setLoading(false));
        }
        if (activeTab === 'orderTypes' && isAdmin) {
            setLoading(true);
            fetchOrderTypes().then(data => {
                setOrderTypes(data);
                setLoading(false);
                if (!selectedOrderType && data.length > 0) setSelectedOrderType(data[0].id);
            }).catch(() => setLoading(false));
        }
        if (activeTab === 'products' && currentUser && !isAdmin) {
            setLoading(true);
            fetchDealerProducts(currentUser.id).then(data => {
                setProducts(data);
                setLoading(false);
            }).catch(() => setLoading(false));
        }
        if (activeTab === 'clients') {
            setLoading(true);
            fetchDealerSelectedOrders().then(orderData => {
                orderData.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
                setClientOrders(orderData);
                Promise.allSettled(orderData.map(order =>
                    manufacturerApi.imposition(order.id).then(({ data }) => [order.id, data])
                )).then(results => {
                    const next = {};
                    results.forEach(result => {
                        if (result.status === 'fulfilled') {
                            const [orderId, data] = result.value;
                            next[orderId] = data;
                        }
                    });
                    setImpositionMap(prev => ({ ...prev, ...next }));
                });
                setLoading(false);
            }).catch(() => setLoading(false));
        }
    }, [activeTab, currentUser, isAdmin, loadOrders, selectedOrderType]);

    useEffect(() => {
        if (activeTab === 'orderTypes' && selectedOrderType) {
            setOrderTypeError('');
            fetchOrderType(selectedOrderType).then(data => {
                setOrderTypeDraft(JSON.stringify(data, null, 2));
            }).catch(() => {
                setOrderTypeDraft('');
                setOrderTypeError(t(language, 'orderTypeError'));
            });
        }
    }, [activeTab, language, selectedOrderType]);

    const handleUpdateStatus = async (orderId, newStatus) => {
        const comment = commentDraft[orderId] || '';
        setStatusUpdating(orderId);
        try {
            if (isAdmin) {
                await updateOrderStatus(orderId, newStatus, comment || null);
            } else {
                await manufacturerApi.updateStatus(orderId, newStatus, comment || null);
            }
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

    const updateQuoteDraft = (orderId, field, value) => {
        setQuoteDraft(prev => ({
            ...prev,
            [orderId]: { ...(prev[orderId] || {}), [field]: value },
        }));
    };

    const submitQuote = async (orderId) => {
        const draft = quoteDraft[orderId] || {};
        setStatusUpdating(orderId);
        try {
            await manufacturerApi.submitQuote(orderId, {
                price: Number(draft.price || 0),
                production_days: Number(draft.production_days || 0),
                comment: draft.comment || null,
            });
            setQuoteDraft(prev => { const next = { ...prev }; delete next[orderId]; return next; });
            const refreshed = await loadOrders();
            refreshed.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
            setOrders(refreshed);
        } finally {
            setStatusUpdating(null);
        }
    };

    const downloadTechcard = async (orderId) => {
        setTechcardBusy(orderId);
        try {
            const { data: meta } = await manufacturerApi.generateTechcard(orderId);
            const filename = (meta?.s3_key || '').split('/').pop() || `techcard-${orderId}.pdf`;
            const { data: blob } = await manufacturerApi.downloadTechcard(orderId, filename);
            downloadBlob(blob, filename);
        } finally {
            setTechcardBusy(null);
        }
    };

    const printProductionPacket = async (orderId) => {
        setTechcardBusy(orderId);
        try {
            const { data: blob } = await orderApi.productionPackage(orderId);
            downloadBlob(blob, `production-package-${orderId}.zip`);
        } finally {
            setTechcardBusy(null);
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

    const handleSaveOrderType = async () => {
        if (!selectedOrderType) return;
        setOrderTypeError('');
        setOrderTypeSaving(true);
        try {
            const parsed = JSON.parse(orderTypeDraft);
            const saved = await saveOrderType(selectedOrderType, parsed);
            setOrderTypeDraft(JSON.stringify(saved, null, 2));
        } catch (err) {
            setOrderTypeError(err instanceof SyntaxError ? t(language, 'orderTypeSyntaxError') : t(language, 'orderTypeSaveError'));
        } finally {
            setOrderTypeSaving(false);
        }
    };

    const openAdd = () => { setEditingProduct(null); setShowModal(true); };
    const openEdit = (p) => { setEditingProduct(p); setShowModal(true); };

    return (
        <div className="app-bg flex h-screen font-sans text-gray-900 dark:text-white overflow-hidden">

            <LiveOrderToasts onEvent={handleLiveEvent} />

            {showModal && (
                <ProductModal
                    product={editingProduct}
                    dealerId={currentUser?.id}
                    onClose={() => { setShowModal(false); setEditingProduct(null); }}
                    onSaved={handleProductSaved}
                    language={language}
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
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t(language, 'dealerDashTitle')}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{getUserSecondaryLabel(currentUser)}</p>
                </div>

                <nav className="flex-1 p-3 space-y-1">
                    {[
                        ...(isAdmin ? [] : [{ id: 'products', icon: '🗂️', label: t(language, 'tabProducts') }]),
                        { id: 'orders',   icon: '📦', label: t(language, 'tabOrders') },
                        { id: 'clients',  icon: '👥', label: t(language, 'tabClients') },
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                </div>
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest ml-1">{t(language, 'dealerDashTitle')}</span>
                <span className="text-xs text-gray-500 truncate ml-auto">{getUserSecondaryLabel(currentUser)}</span>
            </div>

            {/* MAIN */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 md:pb-8 pt-16 md:pt-8">

                {isAdmin && (
                    <div className="mb-6 flex flex-wrap gap-2">
                        <button
                            onClick={() => setActiveTab('orders')}
                            className={`px-4 py-2 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'orders' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                        >
                            {t(language, 'tabOrders')}
                        </button>
                        <button
                            onClick={() => setActiveTab('orderTypes')}
                            className={`px-4 py-2 rounded-full border text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'orderTypes' ? 'bg-white text-black border-white' : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'}`}
                        >
                            {t(language, 'orderTypesTabLabel')}
                        </button>
                    </div>
                )}

                {/* ── PRODUCTS TAB ── */}
                {activeTab === 'products' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-bold uppercase tracking-widest text-white">{t(language, 'myProductsTitle')}</h2>
                                <p className="text-xs text-gray-500 mt-1">{t(language, 'productsCatalogDesc')}</p>
                            </div>
                            <button
                                onClick={openAdd}
                                className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-gray-100 active:scale-95 transition-all"
                            >
                                + {t(language, 'addProduct')}
                            </button>
                        </div>

                        {loading ? (
                            <div className="py-20 flex flex-col items-center gap-3">
                                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{t(language, 'loading')}</p>
                            </div>
                        ) : products.length === 0 ? (
                            <div className="py-20 flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📦</div>
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t(language, 'noProducts')}</p>
                                <button onClick={openAdd} className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-gray-100 active:scale-95 transition-all">
                                    {t(language, 'addFirstProduct')}
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
                                                <span key={b} className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">{getBindingLabel(b, language)}</span>
                                            ))}
                                            {prod.hasElastic && (
                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{t(language, 'elasticTag')}</span>
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
                                                    <span className="text-[10px] text-gray-500 ml-1.5">{t(language, 'wholesalePrefix')} {prod.wholesaleTiers[0].pricePerUnit} BYN</span>
                                                )}
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={() => openEdit(prod)}
                                                    className="px-3 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all"
                                                >
                                                    {t(language, 'editBtn')}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProduct(prod.id)}
                                                    className="px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-wider rounded-full transition-all"
                                                >
                                                    {t(language, 'deleteBtn')}
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
                {activeTab === 'orderTypes' && isAdmin && (
                    <div>
                        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                            <div>
                                <h2 className="text-xl font-bold uppercase tracking-widest text-white">{t(language, 'orderTypesTitle')}</h2>
                                <p className="text-xs text-gray-500 mt-1">{t(language, 'orderTypesDesc')}</p>
                            </div>
                            <button
                                onClick={handleSaveOrderType}
                                disabled={!selectedOrderType || orderTypeSaving}
                                className="px-5 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-full hover:bg-gray-100 active:scale-95 transition-all disabled:opacity-40"
                            >
                                {orderTypeSaving ? t(language, 'savingLabel') : t(language, 'saveJsonBtn')}
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4">
                            <div className="bg-white/[0.03] border border-white/10 rounded-[18px] overflow-hidden">
                                {loading ? (
                                    <div className="p-5 text-xs text-gray-500 font-bold uppercase tracking-widest">{t(language, 'loading')}</div>
                                ) : orderTypes.length === 0 ? (
                                    <div className="p-5 text-xs text-gray-500 font-bold uppercase tracking-widest">{t(language, 'orderTypesFilesNotFound')}</div>
                                ) : (
                                    orderTypes.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setSelectedOrderType(item.id)}
                                            className={`w-full px-4 py-3 text-left border-b border-white/5 last:border-b-0 transition-colors ${selectedOrderType === item.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
                                        >
                                            <span className="block text-xs font-bold uppercase tracking-widest">{item.id}</span>
                                            <span className="block text-[10px] text-gray-500 mt-1">{item.filename}</span>
                                        </button>
                                    ))
                                )}
                            </div>

                            <div className="bg-white/[0.03] border border-white/10 rounded-[18px] overflow-hidden">
                                <textarea
                                    value={orderTypeDraft}
                                    onChange={(e) => setOrderTypeDraft(e.target.value)}
                                    spellCheck={false}
                                    className="w-full min-h-[520px] bg-black/30 text-gray-100 font-mono text-xs leading-relaxed p-5 outline-none resize-y"
                                />
                                {orderTypeError && (
                                    <div className="px-5 py-3 border-t border-red-500/20 bg-red-500/10 text-red-300 text-xs font-bold uppercase tracking-widest">
                                        {orderTypeError}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'orders' && (
                    <div>
                        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                            <div>
                                <h2 className="text-xl font-bold uppercase tracking-widest text-white">{t(language, 'ordersManagementTitle')}</h2>
                                <p className="text-xs text-gray-500 mt-1">{t(language, 'ordersManagementDesc')}</p>
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
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{t(language, 'loadingFromDb')}</p>
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="py-20 flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📭</div>
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t(language, 'noOrders')}</p>
                                </div>
                            ) : (
                                orders.map((order, i) => {
                                    const isExpanded = expandedOrders.has(order.id);
                                    const isUpdating = statusUpdating === order.id;
                                    const currentStageIdx = STAGE_INDEX[order.status] ?? 0;
                                    const isQuoteStage = !isAdmin && (order.status === 'awaiting_quotes' || order.status === 'quotes_ready');
                                    const myQuote = (order.manufacturerQuotes || []).find(q => q.manufacturer_id === currentUser?.id);
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
                                                    <StatusBadge status={order.status} language={language} />
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
                                                <div className="px-4 md:px-6 pb-6 border-t border-white/5 bg-white/[0.02]">
                                                    {/* Progress bar */}
                                                    <OrderProgressBar status={order.status} stageHistory={order.stageHistory} language={language} />

                                                    {/* Approval review */}
                                                    <div className="mt-4">
                                                        <ApprovalPanel
                                                            order={order}
                                                            role={isAdmin ? 'admin' : 'dealer'}
                                                            onChanged={(updated) => setOrders(prev => prev.map(o => String(o.id) === String(order.id)
                                                                ? { ...o, status: updated.status || o.status, approvalStatus: updated.approval_status || o.approvalStatus, dealerConfirmedAt: updated.dealer_confirmed_at || o.dealerConfirmedAt, stageHistory: updated.stage_history || o.stageHistory }
                                                                : o))}
                                                        />
                                                    </div>

                                                    <div className="mt-5">
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">{t(language, 'orderParams')}</p>
                                                        <DealerOrderDetails order={order} language={language} />
                                                    </div>

                                                    {isQuoteStage && (
                                                        <div className="mt-5 rounded-[12px] border border-cyan-500/20 bg-cyan-500/10 p-4" onClick={e => e.stopPropagation()}>
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
                                                                    value={quoteDraft[order.id]?.price || ''}
                                                                    onChange={e => updateQuoteDraft(order.id, 'price', e.target.value)}
                                                                    placeholder={t(language, 'quotePricePlaceholder')}
                                                                    className="bg-black/20 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    min="1"
                                                                    step="1"
                                                                    value={quoteDraft[order.id]?.production_days || ''}
                                                                    onChange={e => updateQuoteDraft(order.id, 'production_days', e.target.value)}
                                                                    placeholder={t(language, 'quoteDaysPlaceholder')}
                                                                    className="bg-black/20 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30"
                                                                />
                                                                <button
                                                                    onClick={() => submitQuote(order.id)}
                                                                    disabled={isUpdating || !quoteDraft[order.id]?.price || !quoteDraft[order.id]?.production_days}
                                                                    className="rounded-[10px] bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold transition disabled:opacity-50"
                                                                >
                                                                    {isUpdating ? '…' : t(language, 'quoteSubmitBtn')}
                                                                </button>
                                                            </div>
                                                            <textarea
                                                                value={quoteDraft[order.id]?.comment || ''}
                                                                onChange={e => updateQuoteDraft(order.id, 'comment', e.target.value)}
                                                                placeholder={t(language, 'quoteCommentPlaceholder')}
                                                                rows={2}
                                                                className="w-full mt-2 bg-black/20 border border-white/10 rounded-[10px] px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-white/30 resize-none"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Status controls */}
                                                    {(!isQuoteStage || isAdmin) && (
                                                    <div className="mt-5 space-y-3">
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{t(language, 'updateStage')}</p>

                                                        {/* Stage buttons */}
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
                                                                        {stage.icon} {t(language, stage.textKey)}
                                                                        {isCurrent && ' ✓'}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Comment input */}
                                                        <div className="flex gap-2 items-start" onClick={e => e.stopPropagation()}>
                                                            <textarea
                                                                rows={2}
                                                                placeholder={t(language, 'stageCommentOptional')}
                                                                value={commentDraft[order.id] || ''}
                                                                onChange={e => setCommentDraft(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                                className="flex-1 bg-black/20 border border-white/10 rounded-[12px] px-4 py-3 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-white/30 resize-none"
                                                            />
                                                        </div>
                                                    </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'clients' && (
                    <div>
                        <div className="flex flex-wrap justify-between items-center mb-6 gap-3">
                            <div>
                                <h2 className="text-xl font-bold uppercase tracking-widest text-white">{t(language, 'myClientsTitle')}</h2>
                                <p className="text-xs text-gray-500 mt-1">{t(language, 'myClientsDesc')}</p>
                            </div>
                        </div>
                        <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[24px] overflow-hidden">
                            {loading ? (
                                <div className="py-20 flex flex-col items-center gap-3">
                                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{t(language, 'loading')}</p>
                                </div>
                            ) : clientOrders.length === 0 ? (
                                <div className="py-20 flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">👥</div>
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t(language, 'noClients')}</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {clientOrders.map(order => {
                                        const contact = getOrderContact(order);
                                        const selectedQuote = (order.manufacturerQuotes || []).find(q => q.id === order.selectedQuoteId);
                                        return (
                                            <div key={order.id} id={`dealer-production-order-${order.id}`} className="p-4 md:p-6">
                                                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                                                    <div className="min-w-0">
                                                        <p className="font-bold text-white text-sm truncate">
                                                            {contact.name || contact.contactPerson || order.userEmail || '—'}
                                                        </p>
                                                        <p className="text-xs text-gray-500 mt-1 truncate">
                                                            #{order.id.substring(0, 6).toUpperCase()} · {order.product} · {order.date}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-wrap sm:justify-end gap-2">
                                                        <StatusBadge status={order.status} language={language} />
                                                        {selectedQuote && (
                                                            <span className="px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                                                                {selectedQuote.price} {selectedQuote.currency || 'BYN'} · {selectedQuote.production_days} {t(language, 'quoteDaysShort')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <DealerOrderDetails order={order} language={language} full />
                                                <ProductionPacket
                                                    order={order}
                                                    language={language}
                                                    imposition={impositionMap[order.id]}
                                                    techcardBusy={techcardBusy === order.id}
                                                    onDownloadTechcard={downloadTechcard}
                                                    onPrint={printProductionPacket}
                                                    onChanged={(updated) => setClientOrders(prev => prev.map(o => String(o.id) === String(order.id)
                                                        ? { ...o, status: updated.status || o.status, approvalStatus: updated.approval_status || o.approvalStatus, dealerConfirmedAt: updated.dealer_confirmed_at || o.dealerConfirmedAt, stageHistory: updated.stage_history || o.stageHistory }
                                                        : o))}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* BOTTOM NAV — только на mobile */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#0B0F19]/95 backdrop-blur-xl border-t border-white/5 flex items-center px-2 pb-safe">
                {[
                    { id: 'products', label: t(language, 'tabProducts'), icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="7" height="7"/><rect x="15" y="3" width="7" height="7"/><rect x="2" y="14" width="7" height="7"/><rect x="15" y="14" width="7" height="7"/></svg>
                    )},
                    { id: 'orders', label: t(language, 'tabOrders'), icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/></svg>
                    )},
                    { id: 'clients', label: t(language, 'tabClients'), icon: (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
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
                    <span className="text-[10px] font-bold uppercase tracking-widest">{t(language, 'logout')}</span>
                </button>
            </nav>
        </div>
    );
};
