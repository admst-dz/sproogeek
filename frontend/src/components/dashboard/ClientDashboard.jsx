import { useState, useEffect, useCallback } from 'react';
import { t } from '../../i18n';
import { Canvas } from '@react-three/fiber';
import { PresentationControls, Stage, Environment } from '@react-three/drei';
import { useConfigurator } from "../../store";
import { fetchUserOrders, createOrderInDB } from '../../api';
import { LiveOrderToasts } from '../shared/LiveOrderToasts';
import { ApprovalPanel } from '../shared/ApprovalPanel';
import { Notebook } from '../shared/Notebook';
import { Thermos } from '../thermos/Thermos';
import { ConfiguratorProductMenu } from '../home/Home';
import { getUserDisplayName, getUserSecondaryLabel } from '../../utils/user';
import { SceneLoadingOverlay } from '../shared/VibeLoader';

const TabBtn = ({ active, children, onClick }) => (
    <button
        onClick={onClick}
        className={`py-4 text-xs font-bold uppercase tracking-widest border-b-2 transition-all ${
            active
                ? 'border-white text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
        }`}
    >
        {children}
    </button>
);

const ORDER_STAGE_KEYS = [
    { key: 'new',         labelKey: 'stageNew',        icon: '🕐' },
    { key: 'awaiting_signature', labelKey: 'stageAwaitingSignature', icon: '✍️' },
    { key: 'awaiting_quotes', labelKey: 'stageAwaitingQuotes', icon: '₽' },
    { key: 'quotes_ready', labelKey: 'stageQuotesReady', icon: '₽' },
    { key: 'processing',  labelKey: 'stageProcessing',  icon: '⚙️' },
    { key: 'production',  labelKey: 'stageProduction',  icon: '🏭' },
    { key: 'in_delivery', labelKey: 'stageDelivery',    icon: '🚚' },
    { key: 'done',        labelKey: 'stageDone',        icon: '✅' },
];

const STAGE_INDEX = Object.fromEntries(ORDER_STAGE_KEYS.map((s, i) => [s.key, i]));

const OrderProgressBar = ({ status, stageHistory = [], language }) => {
    const currentIdx = STAGE_INDEX[status] ?? 0;
    const ORDER_STAGES = ORDER_STAGE_KEYS.map(s => ({ ...s, label: t(language, s.labelKey) }));
    const historyMap = {};
    stageHistory.forEach(h => { historyMap[h.status] = h; });

    return (
        <div className="pt-4 pb-2">
            {/* Steps */}
            <div className="relative flex items-start">
                {/* Connecting line */}
                <div className="absolute top-4 left-0 right-0 h-px bg-white/10 mx-8" style={{ zIndex: 0 }} />
                {ORDER_STAGES.map((stage, idx) => {
                    const isDone = idx < currentIdx;
                    const isCurrent = idx === currentIdx;
                    const entry = historyMap[stage.key];
                    return (
                        <div key={stage.key} className="flex-1 flex flex-col items-center gap-2 relative z-10">
                            {/* Circle */}
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
                            {/* Label */}
                            <span className={`text-[9px] font-bold uppercase tracking-wider text-center leading-tight
                                ${isDone ? 'text-emerald-400' : isCurrent ? 'text-indigo-300' : 'text-gray-600'}`}>
                                {stage.label}
                            </span>
                            {/* Timestamp + comment */}
                            {entry && (
                                <div className="flex flex-col items-center gap-0.5 max-w-[80px]">
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

const OrderStatus = ({ status, language }) => {
    const s = {
        awaiting_signature: { textKey: 'statusAwaitingSignature', color: 'bg-amber-500/20 text-amber-300 border border-amber-500/30' },
        awaiting_quotes: { textKey: 'statusAwaitingQuotes', color: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' },
        quotes_ready: { textKey: 'statusQuotesReady', color: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' },
        processing: { textKey: 'statusProcessing', color: 'bg-blue-500/20 text-blue-400 border border-blue-500/30' },
        production: { textKey: 'statusProduction', color: 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' },
        in_delivery: { textKey: 'statusDelivery', color: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
        done: { textKey: 'statusDone', color: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
        new: { textKey: 'statusNew', color: 'bg-white/10 text-gray-400 border border-white/10' },
    }[status] || { textKey: null, color: 'bg-white/10 text-gray-400 border border-white/10' };
    const text = s.textKey ? t(language, s.textKey) : status;

    return (
        <span className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${s.color}`}>
            {text}
        </span>
    );
};

export const ClientDashboard = ({ onBack, onEdit, showSuccessToast, onSuccessToastShown, initialTab, onTabChange }) => {
    const {
        currentUser, logout, cartItem, clearCart,
        activeProduct, coverColor, elasticColor, hasElastic,
        paperPattern, bindingType, spiralColor, format,
        thermosBodyColor, language,
    } = useConfigurator();
    const savedThermosColor = cartItem?.thermosBodyColor || cartItem?.thermosCapColor || thermosBodyColor;
    const cartProductConfig = cartItem?.activeProduct === 'thermos'
        ? {
            ...cartItem,
            thermosBodyColor: savedThermosColor,
            thermosCapColor: savedThermosColor,
            design: `${t(language, 'thermosBodyPart')}: ${savedThermosColor}, ${t(language, 'thermosCapPart')}: ${savedThermosColor}`,
        }
        : cartItem;
    const cartProductType = cartProductConfig?.activeProduct || activeProduct;
    const cartThermosColor = cartProductConfig?.thermosBodyColor || cartProductConfig?.thermosCapColor || thermosBodyColor;
    const [activeTab, setActiveTab] = useState(initialTab ?? (cartItem ? 'cart' : 'orders'));

    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        onTabChange?.(activeTab);
    }, [activeTab, onTabChange]);

    const changeTab = useCallback((tab) => {
        setActiveTab(tab);
    }, []);

    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [expandedOrders, setExpandedOrders] = useState(new Set());
    const [orderSuccess, setOrderSuccess] = useState(false);
    const [clientType, setClientType] = useState('phys');
    const [quantity, setQuantity] = useState(cartItem?.quantity || 1);
    const [isSample, setIsSample] = useState(cartItem?.isSample || false);
    const [formData, setFormData] = useState({ name: '', phone: '', address: '', inn: '', contactPerson: '', comment: '' });
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (currentUser?.display_name) {
            setFormData(prev => ({ ...prev, name: currentUser.display_name }));
        }
    }, [currentUser]);

    useEffect(() => {
        if (cartItem) {
            if (cartItem.quantity) setQuantity(cartItem.quantity);
            if (cartItem.isSample !== undefined) setIsSample(cartItem.isSample);
        }
    }, [cartItem]);

    useEffect(() => {
        if (showSuccessToast) {
            changeTab('orders');
            setOrderSuccess(true);
            onSuccessToastShown?.();
        }
    }, [changeTab, onSuccessToastShown, showSuccessToast]);

    useEffect(() => {
        if (orderSuccess) {
            const t = setTimeout(() => setOrderSuccess(false), 4000);
            return () => clearTimeout(t);
        }
    }, [orderSuccess]);

    useEffect(() => {
        if (activeTab === 'orders' && currentUser) {
            setOrdersLoading(true);
            fetchUserOrders(currentUser.id).then(data => {
                data.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
                setOrders(data);
                setOrdersLoading(false);
            });
        }
    }, [activeTab, currentUser]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleApprove = async () => {
        if (!formData.name || !formData.phone) {
            setFormError(t(language, 'fillNamePhone'));
            return;
        }
        setFormError('');
        setSubmitting(true);
        try {
            const id = await createOrderInDB({
                user_id: currentUser?.id || null,
                user_email: currentUser?.email || '',
                product_name: cartItem.productName,
                configuration: {
                    productConfig: cartProductConfig,
                    clientType,
                    contact: { ...formData },
                    isSample,
                },
                quantity,
                total_price: null,
                currency: 'BYN',
                is_guest: false,
            });

            const newOrder = {
                id,
                product: cartItem.productName,
                design: cartProductConfig.design || '',
                price: 0,
                status: 'new',
                stageHistory: [{
                    status: 'new',
                    comment: t(language, 'orderAcceptedComment'),
                    updated_at: new Date().toISOString(),
                }],
                date: new Date().toLocaleDateString('ru-RU'),
                quantity,
                configuration: {
                    productConfig: cartProductConfig,
                    clientType,
                    contact: { ...formData },
                    isSample,
                },
            };
            setOrders(prev => [newOrder, ...prev]);
            setOrderSuccess(true);
            clearCart();
            changeTab('orders');
        } catch (error) {
            console.error(error);
            setFormError(t(language, 'networkError'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="app-bg h-[100dvh] font-sans text-gray-900 dark:text-white overflow-hidden flex flex-col">

            <LiveOrderToasts onEvent={(ev) => {
                const data = ev?.data;
                if (!data?.order_id) return;
                setOrders(prev => prev.map(o => String(o.id) === String(data.order_id)
                    ? { ...o, status: data.status || o.status,
                        stageHistory: [...(o.stageHistory || []), { status: data.status, comment: data.comment || '', updated_at: new Date().toISOString() }] }
                    : o));
            }} />

            {/* HEADER */}
            <header className="sticky top-0 z-30 px-4 sm:px-6 py-3 sm:py-4 border-b border-white/5 bg-[#0B0F19]/90 backdrop-blur-xl">
                <div className="max-w-6xl mx-auto flex justify-between items-center gap-3">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => window.location.reload()}
                            className="flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-full backdrop-blur-md hover:bg-white/10 active:scale-95 transition-all"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                            <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                        </button>
                        <div className="hidden md:flex flex-col">
                            <span className="text-sm font-bold text-white">{getUserDisplayName(currentUser)}</span>
                            <span className="text-[10px] text-gray-500 uppercase tracking-widest">{getUserSecondaryLabel(currentUser)}</span>
                        </div>
                    </div>

                    <button
                        onClick={() => { logout(); onBack(); }}
                        className="flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors px-3 sm:px-4 py-2 rounded-full text-[10px] sm:text-xs font-bold text-gray-300 uppercase tracking-widest shrink-0"
                    >
                        {t(language, 'logout')}
                    </button>
                </div>

                {/* TABS */}
                <div className="max-w-6xl mx-auto flex gap-5 sm:gap-8 mt-1 touch-scroll-x">
                    <TabBtn active={activeTab === 'catalog'} onClick={() => changeTab('catalog')}>{t(language, 'tabCatalog')}</TabBtn>
                    <TabBtn active={activeTab === 'cart'} onClick={() => changeTab('cart')}>
                        {t(language, 'tabCart')} {cartItem && <span className="ml-1 w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block shadow-[0_0_6px_rgba(52,211,153,0.8)]"></span>}
                    </TabBtn>
                    <TabBtn active={activeTab === 'orders'} onClick={() => changeTab('orders')}>{t(language, 'tabOrders')}</TabBtn>
                </div>
            </header>

            {/* MAIN */}
            <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar max-w-6xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-8 pb-24">

                {/* CATALOG TAB */}
                {activeTab === 'catalog' && (
                    <div className="flex flex-col items-center">
                        <ConfiguratorProductMenu onStart={onEdit} />
                    </div>
                )}

                {/* CART TAB */}
                {activeTab === 'cart' && (
                    <div>
                        {!cartItem ? (
                            <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[20px] md:rounded-[24px] p-8 sm:p-12 md:p-16 flex flex-col items-center gap-4 text-center">
                                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">🛒</div>
                                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t(language, 'cartEmpty')}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col lg:flex-row gap-8">

                                {/* ЛЕВАЯ — модель + параметры */}
                                <div className="w-full lg:w-2/5 flex flex-col gap-4">
                                    <div className="bg-white/[0.03] border border-white/10 rounded-[24px] overflow-hidden">
                                        {/* 3D Canvas */}
                                        <div className="relative bg-[#0A0E1A]" style={{ height: 280 }}>
                                            <Canvas shadows dpr={[1, 2]} camera={{ position: [0, 0, 4.5], fov: 45 }} gl={{ antialias: true }}>
                                                <Environment preset="city" />
                                                <ambientLight intensity={0.6} />
                                                <directionalLight position={[10, 10, 5]} intensity={1.5} />
                                                <directionalLight position={[-10, 5, 2]} intensity={0.5} />
                                                <PresentationControls speed={1.5} global polar={[-0.1, Math.PI / 4]}>
                                                    <Stage environment={null} intensity={0} contactShadow={false}>
                                                        {activeProduct === 'notebook' && <Notebook />}
                                                        {activeProduct === 'thermos' && <Thermos />}
                                                    </Stage>
                                                </PresentationControls>
                                            </Canvas>
                                            <SceneLoadingOverlay compact label="3D" />
                                            <div className="absolute top-3 left-3 text-white/30 text-[10px] font-bold tracking-wider pointer-events-none uppercase">{t(language, 'dragRotate')}</div>
                                        </div>

                                        {/* Параметры */}
                                        <div className="p-5 space-y-2 border-t border-white/5">
                                            <CartRow label={t(language, 'productLabel')} value={cartItem.productName} />
                                            {cartProductType === 'thermos' ? (
                                                <>
                                                    <CartRow label={t(language, 'bodyLabel')} value={<ColorDot color={cartThermosColor} />} />
                                                    <CartRow label={t(language, 'capLabel')} value={<ColorDot color={cartThermosColor} />} />
                                                </>
                                            ) : (
                                                <>
                                                    <CartRow label={t(language, 'formatLabel')} value={format} />
                                                    <CartRow label={t(language, 'bindingLabel')} value={bindingType === 'hard' ? t(language, 'bindingHard') : t(language, 'bindingSpiral')} />
                                                    <CartRow label={t(language, 'patternLabel')} value={{ blank: t(language, 'patternBlank'), lined: t(language, 'patternLined'), tlined: t(language, 'patternTLined'), grid: t(language, 'patternGrid'), dotted: t(language, 'patternDotted') }[paperPattern]} />
                                                    <CartRow label={t(language, 'coverLabel')} value={<ColorDot color={coverColor} />} />
                                                    {hasElastic && <CartRow label={t(language, 'elasticLabel')} value={<ColorDot color={elasticColor} />} />}
                                                    {bindingType === 'spiral' && <CartRow label={t(language, 'spiralLabel')} value={<ColorDot color={spiralColor} />} />}
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={onEdit}
                                        className="w-full py-3 rounded-[14px] border border-white/10 text-gray-400 font-bold uppercase tracking-widest text-xs hover:border-white/30 hover:text-white transition-all"
                                    >
                                        {t(language, 'editInEditor')}
                                    </button>
                                </div>

                                {/* ПРАВАЯ — контактные данные */}
                                <div className="w-full lg:w-3/5 flex flex-col gap-4">
                                    <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[20px] md:rounded-[24px] p-4 sm:p-6 md:p-8 flex flex-col gap-6">
                                        <h3 className="font-bold text-lg uppercase tracking-widest text-white">{t(language, 'contactsTitle')}</h3>

                                        {/* Физ/Юр переключатель */}
                                        <div className="bg-white/5 p-1.5 rounded-[14px] flex border border-white/8 min-w-0">
                                            <button
                                                onClick={() => setClientType('phys')}
                                                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-[12px] transition-all ${clientType === 'phys' ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                            >{t(language, 'physClient')}</button>
                                            <button
                                                onClick={() => setClientType('jur')}
                                                className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-[12px] transition-all ${clientType === 'jur' ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                                            >{t(language, 'jurClient')}</button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {clientType === 'phys' ? (<>
                                                <CartInput name="name" label={t(language, 'fullNameRequired')} placeholder={t(language, 'placeholderFullName')} value={formData.name} onChange={handleInputChange} />
                                                <CartInput name="phone" label={t(language, 'phoneRequired')} placeholder="+375..." type="tel" value={formData.phone} onChange={handleInputChange} />
                                                <CartInput name="email" label={t(language, 'emailLabel')} placeholder="mail@..." type="email" value={formData.email} onChange={handleInputChange} />
                                                <CartInput name="address" label={t(language, 'orderAddress')} placeholder={t(language, 'placeholderCityStreet')} value={formData.address} onChange={handleInputChange} />
                                                <div className="md:col-span-2">
                                                    <CartInput name="address" label={t(language, 'orderAddress')} placeholder={t(language, 'placeholderCityStreet')} value={formData.address} onChange={handleInputChange} />
                                                </div>
                                            </>) : (<>
                                                <CartInput name="name" label={t(language, 'companyRequired')} placeholder={t(language, 'placeholderCompany')} value={formData.name} onChange={handleInputChange} />
                                                <CartInput name="inn" label={t(language, 'unpInn')} placeholder="123456789" value={formData.inn} onChange={handleInputChange} />
                                                <CartInput name="contactPerson" label={t(language, 'contactPersonRequired')} placeholder={t(language, 'placeholderFio')} value={formData.contactPerson} onChange={handleInputChange} />
                                                <CartInput name="phone" label={t(language, 'phoneRequired')} placeholder="+375..." type="tel" value={formData.phone} onChange={handleInputChange} />
                                            </>)}
                                            <div className="md:col-span-2">
                                                <CartInput name="comment" label={t(language, 'orderComment')} placeholder={t(language, 'commentsPlaceholder')} value={formData.comment} onChange={handleInputChange} isTextarea />
                                            </div>
                                        </div>

                                        {/* Тираж и тиражный образец */}
                                        <div className="flex flex-col sm:flex-row gap-4 sm:items-end sm:justify-between pt-2 border-t border-white/8">
                                            <div className="flex flex-col gap-1.5">
                                                <span className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">{t(language, 'quantityLabel')}</span>
                                                <div className="flex items-center gap-2 bg-white/5 rounded-[12px] p-1.5 border border-white/10 w-max">
                                                    <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center bg-white/10 rounded-[9px] text-white font-bold text-lg hover:bg-white/20 active:scale-95 transition">−</button>
                                                    <span className="w-12 text-center font-black text-white text-xl select-none">{quantity}</span>
                                                    <button onClick={() => setQuantity(q => q + 1)} className="w-9 h-9 flex items-center justify-center bg-white/10 rounded-[9px] text-white font-bold text-lg hover:bg-white/20 active:scale-95 transition">+</button>
                                                </div>
                                            </div>

                                            {clientType === 'jur' && (
                                                <label className="flex items-center gap-3 cursor-pointer select-none bg-blue-500/8 border border-blue-500/20 hover:border-blue-500/40 px-4 py-3 rounded-[12px] transition-all" onClick={() => setIsSample(s => !s)}>
                                                    <div className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all shrink-0 ${isSample ? 'bg-white border-white' : 'bg-white/5 border-white/20'}`}>
                                                        {isSample && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#0B0F19" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-blue-300 uppercase tracking-wide">{t(language, 'sampleLabel')}</span>
                                                        <span className="text-[10px] text-blue-500">{t(language, 'sampleDesc')}</span>
                                                    </div>
                                                </label>
                                            )}
                                        </div>

                                        {formError && (
                                            <p className="text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-[10px]">
                                                {formError}
                                            </p>
                                        )}

                                        <button
                                            onClick={handleApprove}
                                            disabled={submitting}
                                            className={`w-full py-4 font-bold uppercase tracking-widest rounded-[14px] transition-all text-sm ${submitting ? 'bg-white/10 text-gray-500 cursor-wait' : 'bg-white text-black hover:bg-gray-100 shadow-[0_0_30px_rgba(255,255,255,0.15)] active:scale-[0.98]'}`}
                                        >
                                            {submitting ? t(language, 'sending') : t(language, 'cartOrderSubmit')}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ORDERS TAB */}
                {activeTab === 'orders' && (
                    <div>
                        <h2 className="text-xl font-bold uppercase tracking-widest mb-6 text-white">{t(language, 'myOrders')}</h2>
                        <div className="bg-white/[0.03] border border-white/10 backdrop-blur-xl rounded-[20px] md:rounded-[24px] overflow-hidden">
                            {ordersLoading ? (
                                <div className="py-16 flex flex-col items-center gap-3">
                                    <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                                    <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">{t(language, 'loading')}</p>
                                </div>
                            ) : orders.length === 0 ? (
                                <div className="py-16 flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center border border-white/10 text-2xl">📋</div>
                                    <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">{t(language, 'noOrders')}</p>
                                </div>
                            ) : (
                                orders.map((order, i) => {
                                    const isExpanded = expandedOrders.has(order.id);
                                    const toggleExpand = () => setExpandedOrders(prev => {
                                        const next = new Set(prev);
                                        next.has(order.id) ? next.delete(order.id) : next.add(order.id);
                                        return next;
                                    });
                                    return (
                                        <div
                                            key={order.id}
                                            className={`transition-colors ${i !== orders.length - 1 ? 'border-b border-white/5' : ''}`}
                                        >
                                            {/* Summary row */}
                                            <div
                                                className="px-4 md:px-6 py-4 md:py-5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-white/[0.03] cursor-pointer"
                                                onClick={toggleExpand}
                                            >
                                                <div className="flex items-center justify-between sm:block sm:min-w-[80px]">
                                                    <span className="font-bold text-sm text-white">#{order.id.substring(0, 6).toUpperCase()}</span>
                                                    <span className="text-[10px] text-gray-500 sm:mt-0.5 sm:block">{order.date}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-white truncate">{order.product}</p>
                                                    <p className="text-xs text-gray-500 truncate">
                                                        {order.quantity ? `${order.quantity} ${t(language, 'pcsUnit')}` : ''}
                                                        {order.quantity && order.configuration?.productConfig?.format ? ' · ' : ''}
                                                        {order.configuration?.productConfig?.format || ''}
                                                    </p>
                                                </div>
                                                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-4 shrink-0">
                                                    <span className="font-bold text-white text-sm">{order.price ? `${order.price} BYN` : ''}</span>
                                                    <OrderStatus status={order.status} language={language} />
                                                    <svg
                                                        width="14" height="14" viewBox="0 0 14 14" fill="none"
                                                        className={`text-gray-500 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                                                    >
                                                        <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                    </svg>
                                                </div>
                                            </div>

                                            {/* Expanded detail */}
                                            {isExpanded && (
                                                <div className="border-t border-white/5 bg-white/[0.02] px-4 md:px-6 pb-6 pt-5">
                                                    <div className="flex flex-col lg:flex-row gap-6">

                                                        {/* 3D preview */}
                                                        <div className="w-full lg:w-64 shrink-0">
                                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t(language, 'view3d')}</p>
                                                            <ClientOrder3DPreview configuration={order.configuration} productName={order.product} language={language} />
                                                        </div>

                                                        {/* Details */}
                                                        <div className="flex-1 flex flex-col gap-5">
                                                            {/* Order params */}
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-3">{t(language, 'orderParams')}</p>
                                                                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-2">
                                                                    {order.quantity && (
                                                                        <ClientDetailRow label={t(language, 'circulationLabel')} value={`${order.quantity} ${t(language, 'pcsUnit')}`} accent />
                                                                    )}
                                                                    {order.configuration?.isSample && (
                                                                        <ClientDetailRow label={t(language, 'sampleOrderLabel')} value={t(language, 'sampleLabel')} />
                                                                    )}
                                                                    {order.configuration?.productConfig?.format && (
                                                                        <ClientDetailRow label={t(language, 'formatLabel')} value={order.configuration.productConfig.format} />
                                                                    )}
                                                                    {order.configuration?.productConfig?.bindingType && (
                                                                        <ClientDetailRow label={t(language, 'bindingLabel')} value={order.configuration.productConfig.bindingType === 'hard' ? t(language, 'bindingHard') : t(language, 'bindingSpiral')} />
                                                                    )}
                                                                    {order.configuration?.productConfig?.paperPattern && (
                                                                        <ClientDetailRow label={t(language, 'patternLabel')} value={{ blank: t(language, 'patternBlank'), lined: t(language, 'patternLined'), tlined: t(language, 'patternTLined'), grid: t(language, 'patternGrid'), dotted: t(language, 'patternDotted') }[order.configuration.productConfig.paperPattern] || ''} />
                                                                    )}
                                                                    {order.configuration?.productConfig?.coverColor && (
                                                                        <ClientDetailRow label={t(language, 'coverLabel')} value={<ClientColorDot color={order.configuration.productConfig.coverColor} />} />
                                                                    )}
                                                                    {order.configuration?.productConfig?.hasElastic && order.configuration?.productConfig?.elasticColor && (
                                                                        <ClientDetailRow label={t(language, 'elasticLabel')} value={<ClientColorDot color={order.configuration.productConfig.elasticColor} />} />
                                                                    )}
                                                                    {order.configuration?.productConfig?.bindingType === 'spiral' && order.configuration?.productConfig?.spiralColor && (
                                                                        <ClientDetailRow label={t(language, 'spiralLabel')} value={<ClientColorDot color={order.configuration.productConfig.spiralColor} />} />
                                                                    )}
                                                                    {order.price > 0 && (
                                                                        <ClientDetailRow label={t(language, 'costLabel')} value={`${order.price} BYN`} />
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Progress */}
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">{t(language, 'orderStatusLabel')}</p>
                                                                <div className="touch-scroll-x pb-2">
                                                                    <div className="min-w-[520px]">
                                                                        <OrderProgressBar status={order.status} stageHistory={order.stageHistory} language={language} />
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Approval flow */}
                                                            <ApprovalPanel
                                                                order={order}
                                                                role="client"
                                                                onChanged={(updated) => setOrders(prev => prev.map(o => o.id === order.id
                                                                    ? {
                                                                        ...o,
                                                                        ...updated,
                                                                        approvalStatus: updated.approval_status,
                                                                        signedApprovalFileKey: updated.signed_approval_file_key,
                                                                        manufacturerQuotes: updated.manufacturer_quotes || o.manufacturerQuotes,
                                                                        selectedManufacturerId: updated.selected_manufacturer_id,
                                                                        selectedQuoteId: updated.selected_quote_id,
                                                                        status: updated.status,
                                                                        price: updated.total_price ?? o.price,
                                                                        stageHistory: updated.stage_history || o.stageHistory
                                                                    }
                                                                    : o))}
                                                            />
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

            {/* SUCCESS TOAST */}
            {orderSuccess && (
                <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
                    <div className="bg-[#1A1F2E]/90 backdrop-blur-2xl border border-white/10 rounded-[20px] md:rounded-[24px] px-6 sm:px-10 py-6 sm:py-8 shadow-[0_20px_60px_rgba(0,0,0,0.5)] text-center pointer-events-auto animate-fade-in max-w-[calc(100vw-2rem)]">
                        <div className="w-14 h-14 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        </div>
                        <p className="font-bold text-lg text-white uppercase tracking-wide">{t(language, 'orderAccepted')}</p>
                        <p className="text-sm text-gray-400 mt-2">{t(language, 'waitPrint')}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

const CartRow = ({ label, value }) => (
    <div className="flex justify-between items-center py-1">
        <span className="text-gray-500 font-bold text-xs uppercase tracking-wider min-w-0 break-words">{label}</span>
        <span className="font-bold text-white text-sm text-right min-w-0 break-words">{value}</span>
    </div>
);

const ColorDot = ({ color }) => (
    <div className="flex items-center gap-2">
        <div className="w-3.5 h-3.5 rounded-full border border-white/20" style={{ backgroundColor: color }} />
        <span className="uppercase text-xs font-black text-white">{color}</span>
    </div>
);

const CartInput = ({ label, name, placeholder, type = 'text', value, onChange, isTextarea = false }) => (
    <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">{label}</label>
        {isTextarea ? (
            <textarea
                name={name} value={value} onChange={onChange} placeholder={placeholder}
                className="w-full p-3 bg-white/5 border border-white/10 rounded-[12px] text-white font-bold placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 resize-none h-24 text-sm transition-colors"
            />
        ) : (
            <input
                name={name} value={value} onChange={onChange} type={type} placeholder={placeholder}
                className="w-full p-3 bg-white/5 border border-white/10 rounded-[12px] text-white font-bold placeholder:text-white/20 focus:outline-none focus:ring-1 focus:ring-white/20 text-sm transition-colors"
            />
        )}
    </div>
);

const ClientDetailRow = ({ label, value, accent }) => (
    <div className={`flex flex-col gap-1 rounded-[10px] px-3 py-2.5 border ${accent ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-white/[0.03] border-white/8'}`}>
        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
        <span className="font-bold text-sm text-white">{value}</span>
    </div>
);

const ClientColorDot = ({ color }) => (
    <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" style={{ backgroundColor: color }} />
        <span className="uppercase text-xs font-black text-white">{color}</span>
    </div>
);

const ClientOrder3DPreview = ({ configuration, productName, language = 'ru' }) => {
    const cfg = configuration?.productConfig || configuration || {};
    const isNote = productName?.toLowerCase().includes('ежедневник') || productName?.toLowerCase().includes('блокнот') || cfg.type === 'notebook';
    const isThermos = productName?.toLowerCase().includes('термос') || cfg.activeProduct === 'thermos' || cfg.type === 'thermos';

    if (!isNote && !isThermos) {
        return (
            <div className="w-full h-40 rounded-[14px] bg-white/[0.03] border border-white/8 flex items-center justify-center">
                <span className="text-gray-600 text-xs font-bold uppercase tracking-widest">{t(language, 'noLayout')}</span>
            </div>
        );
    }

    return (
        <div className="relative w-full h-40 rounded-[14px] bg-[#0A0E1A] border border-white/8 overflow-hidden">
            <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 0, 4.5], fov: 45 }} gl={{ antialias: true }}>
                <Environment preset="city" />
                <ambientLight intensity={0.6} />
                <directionalLight position={[10, 10, 5]} intensity={1.5} />
                <PresentationControls speed={1.5} global polar={[-0.1, Math.PI / 4]}>
                    <Stage environment={null} intensity={0} contactShadow={false}>
                        {isNote && <Notebook config={cfg} />}
                        {isThermos && <Thermos />}
                    </Stage>
                </PresentationControls>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
};
