import { Fragment, useState, useEffect } from 'react';
import { adminApi, productApi } from '../../api';
import { VibeLoader, useLoaderCompletionGate } from '../shared/VibeLoader';
import { LiveOrderToasts } from '../shared/LiveOrderToasts';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';

const STATUS_KEYS = {
    new: 'adminStatusNew',
    processing: 'adminStatusProcessing',
    production: 'adminStatusProduction',
    in_delivery: 'adminStatusDelivery',
    done: 'adminStatusDone',
};
const BINDING_KEYS = { hard: 'bindingHardShort', spiral: 'bindingSpiralShort', soft: 'bindingSoft' };
const PATTERN_KEYS = { blank: 'patternBlank', lined: 'patternLined', tlined: 'patternTLined', grid: 'patternGrid', dotted: 'patternDotted' };
const PRODUCT_KEYS = { notebook: 'notebook', thermos: 'thermos', powerbank: 'powerbank' };

function getStatusLabel(status, language) {
    const key = STATUS_KEYS[status];
    return key ? t(language, key) : status;
}
function getBindingLabel(binding, language) {
    const key = BINDING_KEYS[binding];
    return key ? t(language, key) : binding;
}
function getPatternLabel(pattern, language) {
    const key = PATTERN_KEYS[pattern];
    return key ? t(language, key) : pattern;
}

const STATUS_CLS = {
    new: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    processing: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    production: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    in_delivery: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    done: 'text-green-400 bg-green-500/10 border-green-500/20',
};
const ROLE_CLS = {
    admin: 'text-red-400 bg-red-500/10',
    owner: 'text-yellow-400 bg-yellow-500/10',
    dealer: 'text-blue-400 bg-blue-500/10',
    manufacturer: 'text-purple-400 bg-purple-500/10',
    client: 'text-white/40 bg-white/5',
};
const ROLE_LABEL = {
    admin: 'Администратор',
    owner: 'Владелец',
    dealer: 'Дилер',
    manufacturer: 'Производство',
    client: 'Клиент',
};
const ADMIN_MANAGED_ROLES = ['client', 'dealer', 'manufacturer', 'admin'];
const ADMIN_MANAGED_SUB_ROLES = ['', 'PL', 'PKL', 'KL', 'KPR', 'PR', 'TP'];

function formatApiError(error, lang = 'ru') {
    const detail = error?.response?.data?.detail;
    const fallback = error?.message || t(lang, 'adminErrLoading');

    if (Array.isArray(detail)) {
        return detail
            .map(item => {
                if (typeof item === 'string') return item;
                if (!item || typeof item !== 'object') return String(item);
                const loc = Array.isArray(item.loc) ? item.loc.join('.') : item.loc;
                return [loc, item.msg].filter(Boolean).join(': ');
            })
            .filter(Boolean)
            .join('; ') || fallback;
    }

    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') return detail.msg || JSON.stringify(detail);
    return fallback;
}

function useData(fetcher, lang = 'ru') {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const gatedLoading = useLoaderCompletionGate(loading);
    useEffect(() => {
        fetcher()
            .then(r => { setData(r.data); setLoading(false); })
            .catch(e => { setError(formatApiError(e, lang)); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return { data, setData, loading: gatedLoading, error };
}

const Loader = ({ language = 'ru' }) => (
    <div className="flex items-center justify-center py-20">
        <VibeLoader progress={64} label={t(language, 'adminLoadingLabel')} compact />
    </div>
);

const ErrBox = ({ msg }) => (
    <div className="text-red-400 text-sm py-12 text-center opacity-70">{String(msg)}</div>
);

function SectionHeader({ title, count }) {
    return (
        <div className="flex items-center gap-3 mb-5">
            <h2 className="text-xl font-bold">{title}</h2>
            {count != null && (
                <span className="text-xs text-white/40 bg-white/5 px-2.5 py-0.5 rounded-full border border-white/8">
                    {count}
                </span>
            )}
        </div>
    );
}

function Table({ headers, children, empty }) {
    return (
        <div className="border border-white/8 rounded-[14px] overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full min-w-max">
                    <thead>
                        <tr className="border-b border-white/8 bg-white/[0.02]">
                            {headers.map(h => (
                                <th key={h} className="text-left px-4 py-2.5 text-[11px] font-bold text-white/35 uppercase tracking-widest whitespace-nowrap">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>{children}</tbody>
                </table>
            </div>
            {empty && <p className="text-center text-white/20 py-12 text-sm">{empty}</p>}
        </div>
    );
}

const ValueRow = ({ label, value }) => {
    if (value === undefined || value === null || value === '') return null;
    return (
        <div className="flex items-center justify-between gap-4 rounded-[8px] bg-white/[0.03] px-3 py-2 border border-white/5">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</span>
            <span className="text-sm text-white/75 text-right min-w-0 break-words">{value}</span>
        </div>
    );
};

const ColorValue = ({ color }) => (
    <span className="inline-flex items-center gap-2">
        <span className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: color }} />
        <span className="font-mono text-xs text-white/55">{color}</span>
    </span>
);

function orderSummaryRows(order, language) {
    const config = order.configuration || {};
    const productConfig = config.productConfig || {};
    const contact = config.contact || {};
    const rows = [
        [t(language, 'adminClientLabel'), contact.name || contact.contactPerson],
        [t(language, 'adminPhoneLabel'), contact.phone],
        ['Email', order.user_email || contact.email],
        [t(language, 'adminAddressLabel'), contact.address],
        [t(language, 'adminCompanyInn'), [contact.name, contact.inn].filter(Boolean).join(' / ')],
        [t(language, 'adminClientType'), config.clientType === 'jur' ? t(language, 'adminJurLabel') : config.clientType === 'phys' ? t(language, 'adminPhysLabel') : config.clientType],
        [t(language, 'adminSampleOrder'), config.isSample || productConfig.isSample ? t(language, 'adminYes') : null],
        [t(language, 'adminProductType'), (() => { const k = PRODUCT_KEYS[productConfig.activeProduct || productConfig.type]; return k ? t(language, k) : (productConfig.activeProduct || productConfig.type); })()],
        [t(language, 'adminFormatLabel'), productConfig.format],
        [t(language, 'adminBindingLabel'), getBindingLabel(productConfig.bindingType, language) || productConfig.bindingType],
        [t(language, 'adminPatternLabel'), getPatternLabel(productConfig.paperPattern, language) || productConfig.paperPattern],
        [t(language, 'adminCoverColorLabel'), productConfig.coverColor ? <ColorValue color={productConfig.coverColor} /> : null],
        [t(language, 'bodyLabel'), productConfig.powerbankBodyColor || productConfig.thermosBodyColor ? <ColorValue color={productConfig.powerbankBodyColor || productConfig.thermosBodyColor} /> : null],
        [t(language, 'adminElasticLabel'), productConfig.hasElastic ? <ColorValue color={productConfig.elasticColor} /> : null],
        [t(language, 'adminSpiralLabel'), productConfig.spiralColor ? <ColorValue color={productConfig.spiralColor} /> : null],
        [t(language, 'adminCornersLabel'), productConfig.hasCorners === undefined ? null : (productConfig.hasCorners ? t(language, 'adminYes') : t(language, 'adminNo'))],
        [t(language, 'adminLogosLabel'), [productConfig.logos, productConfig.thermosLogos, productConfig.powerbankLogos].find(Array.isArray)?.length],
        [t(language, 'adminCommentLabel'), contact.comment],
    ];
    return rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function OrderDetails({ order, onSaved, language }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
    const [tcBusy, setTcBusy] = useState(false);

    const downloadTechcard = async () => {
        try {
            setTcBusy(true);
            setMsg('');
            const { data: meta } = await adminApi.generateTechcard(order.id);
            const filename = (meta?.s3_key || '').split('/').pop() || `techcard-${order.id}.pdf`;
            const { data: blob } = await adminApi.downloadTechcard(order.id, filename);
            const url = window.URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(url);
            setMsg(t(language, 'adminTechcardDownloaded'));
        } catch (e) {
            setMsg('✗ ' + formatApiError(e, language));
        } finally {
            setTcBusy(false);
        }
    };
    const [form, setForm] = useState(() => ({
        product_name: order.product_name || '',
        user_email: order.user_email || '',
        quantity: String(order.quantity ?? 1),
        total_price: order.total_price ?? '',
        currency: order.currency || 'BYN',
        status: order.status || 'new',
        configuration: JSON.stringify(order.configuration || {}, null, 2),
    }));

    useEffect(() => {
        setEditing(false);
        setMsg('');
        setForm({
            product_name: order.product_name || '',
            user_email: order.user_email || '',
            quantity: String(order.quantity ?? 1),
            total_price: order.total_price ?? '',
            currency: order.currency || 'BYN',
            status: order.status || 'new',
            configuration: JSON.stringify(order.configuration || {}, null, 2),
        });
    }, [order.id]);

    const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const save = async () => {
        try {
            setSaving(true);
            setMsg('');
            const configuration = JSON.parse(form.configuration || '{}');
            const payload = {
                product_name: form.product_name || null,
                user_email: form.user_email || '',
                quantity: Number(form.quantity) || 1,
                total_price: form.total_price === '' ? null : Number(form.total_price),
                currency: (form.currency || 'BYN').toUpperCase(),
                status: form.status,
                configuration,
            };
            const { data } = await adminApi.updateOrder(order.id, payload);
            onSaved(data);
            setEditing(false);
            setMsg(t(language, 'adminSaved'));
        } catch (e) {
            setMsg('✗ ' + (e instanceof SyntaxError ? t(language, 'adminJsonSyntaxErr') : formatApiError(e, language)));
        } finally {
            setSaving(false);
        }
    };

    const rows = orderSummaryRows(order, language);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5">
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                        {t(language, 'adminOrderData')}
                    </p>
                    {msg && <span className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
                    <button
                        onClick={downloadTechcard}
                        disabled={tcBusy}
                        className="ml-auto px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/15 text-xs font-bold transition disabled:opacity-50"
                        title={t(language, 'adminTechcardTitle')}
                    >
                        {tcBusy ? t(language, 'adminTechcardGenerating') : t(language, 'adminTechcardBtn')}
                    </button>
                    <button
                        onClick={() => setEditing(v => !v)}
                        className="px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/15 text-xs font-bold transition"
                    >
                        {editing ? t(language, 'adminViewBtn') : t(language, 'adminEditBtn')}
                    </button>
                    {editing && (
                        <button
                            onClick={save}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-[8px] bg-white text-[#080B13] hover:bg-gray-100 text-xs font-black disabled:opacity-50 transition"
                        >
                            {saving ? t(language, 'adminSaving') : t(language, 'adminSaveBtn')}
                        </button>
                    )}
                </div>

                {editing ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <AdminInput label={t(language, 'adminProductLabel')} value={form.product_name} onChange={v => update('product_name', v)} />
                            <AdminInput label="Email" value={form.user_email} onChange={v => update('user_email', v)} />
                            <AdminInput label={t(language, 'adminQtyLabel')} type="number" value={form.quantity} onChange={v => update('quantity', v)} />
                            <AdminInput label={t(language, 'adminPriceLabel')} type="number" value={form.total_price} onChange={v => update('total_price', v)} />
                            <AdminInput label={t(language, 'adminCurrencyLabel')} value={form.currency} onChange={v => update('currency', v.toUpperCase())} />
                            <label className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{t(language, 'adminStatusLabel')}</span>
                                <select
                                    value={form.status}
                                    onChange={e => update('status', e.target.value)}
                                    className="bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                                >
                                    {Object.entries(STATUS_KEYS).map(([value, key]) => (
                                        <option key={value} value={value}>{t(language, key)}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{t(language, 'adminOrderConfigJson')}</span>
                            <textarea
                                value={form.configuration}
                                onChange={e => update('configuration', e.target.value)}
                                spellCheck={false}
                                className="min-h-80 bg-black/35 border border-white/10 rounded-[10px] p-3 font-mono text-xs text-emerald-400 resize-y outline-none focus:border-white/30 leading-relaxed"
                            />
                        </label>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {rows.map(([label, value]) => (
                            <ValueRow key={label} label={label} value={value} />
                        ))}
                        {rows.length === 0 && (
                            <div className="text-sm text-white/25 py-8">{t(language, 'adminNoData')}</div>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                        {t(language, 'adminStageHistory')}
                    </p>
                    <div className="space-y-1.5">
                        {(order.stage_history ?? []).map((s, i) => (
                            <div key={i} className="flex items-center gap-3 bg-black/30 rounded-[7px] px-3 py-1.5">
                                <span className={`text-xs font-bold ${STATUS_CLS[s.status]?.split(' ')[0] ?? 'text-white/50'}`}>
                                    {getStatusLabel(s.status, language)}
                                </span>
                                {s.comment && <span className="text-xs text-white/45">{s.comment}</span>}
                                <span className="text-xs text-white/25 ml-auto">
                                    {s.updated_at ? new Date(s.updated_at).toLocaleString('ru') : ''}
                                </span>
                            </div>
                        ))}
                        {!(order.stage_history?.length) && (
                            <span className="text-xs text-white/20">{t(language, 'adminNoHistory')}</span>
                        )}
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">{t(language, 'adminStatusHistoryUuid')}</p>
                    <code className="text-xs font-mono text-white/30 break-all">{order.id}</code>
                </div>
                {order.user_id && (
                    <div>
                        <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">User ID</p>
                        <code className="text-xs font-mono text-white/30 break-all">{order.user_id}</code>
                    </div>
                )}
            </div>
        </div>
    );
}

function AdminInput({ label, value, onChange, type = 'text' }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">{label}</span>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
            />
        </label>
    );
}

// ─── Заказы ──────────────────────────────────────────────────────────────────

function OrdersTab({ language }) {
    const { data, setData, loading, error } = useData(() => adminApi.getOrders(1, 100), language);
    const [expanded, setExpanded] = useState(null);

    if (loading) return <Loader language={language} />;
    if (error) return <ErrBox msg={error} />;
    const orders = data?.items ?? [];
    const updateOrderInList = (updatedOrder) => {
        setData(prev => ({
            ...prev,
            items: (prev?.items || []).map(order => order.id === updatedOrder.id ? updatedOrder : order),
        }));
    };

    return (
        <>
            <SectionHeader title={t(language, 'adminOrdersHeader')} count={orders.length} />
            <Table
                headers={[
                    t(language, 'adminColId'),
                    t(language, 'adminColEmail'),
                    t(language, 'adminColProduct'),
                    t(language, 'adminColStatus'),
                    t(language, 'adminColQty'),
                    t(language, 'adminColPrice'),
                    t(language, 'adminColDate'),
                ]}
                empty={orders.length === 0 ? t(language, 'adminOrdersEmpty') : null}
            >
                {orders.map(o => (
                    <Fragment key={o.id}>
                        <tr
                            onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                            className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors select-none"
                        >
                            <td className="px-4 py-2.5 font-mono text-xs text-white/35">{String(o.id).slice(0, 8)}…</td>
                            <td className="px-4 py-2.5 text-sm text-white/75">{o.user_email || '—'}</td>
                            <td className="px-4 py-2.5 text-sm text-white/65">{o.product_name || '—'}</td>
                            <td className="px-4 py-2.5">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_CLS[o.status] ?? 'text-white/40 bg-white/5 border-white/10'}`}>
                                    {getStatusLabel(o.status, language)}
                                </span>
                            </td>
                            <td className="px-4 py-2.5 text-sm text-white/60">{o.quantity}</td>
                            <td className="px-4 py-2.5 text-sm text-white/60">
                                {o.total_price != null ? `${o.total_price} ${o.currency ?? 'BYN'}` : '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs text-white/30">
                                {o.created_at ? new Date(o.created_at).toLocaleString('ru') : '—'}
                            </td>
                        </tr>
                        {expanded === o.id && (
                            <tr className="bg-black/20">
                                <td colSpan={7} className="px-5 py-5">
                                    <OrderDetails order={o} onSaved={updateOrderInList} language={language} />
                                </td>
                            </tr>
                        )}
                    </Fragment>
                ))}
            </Table>
        </>
    );
}

// ─── Пользователи ────────────────────────────────────────────────────────────

function suggestPassword() {
    const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const len = 14;
    let out = '';
    const buf = new Uint32Array(len);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (let i = 0; i < len; i += 1) out += charset[buf[i] % charset.length];
    return out;
}

function CreateUserDialog({ initialRole = 'dealer', onClose, onCreated }) {
    const [form, setForm] = useState({
        email: '',
        password: suggestPassword(),
        display_name: '',
        role: initialRole,
        sub_role: '',
        company_name: '',
        token_balance: 0,
    });
    const [showPassword, setShowPassword] = useState(true);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');

    const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
    const regenerate = () => update('password', suggestPassword());
    const copyPassword = async () => {
        try {
            await navigator.clipboard.writeText(form.password);
            setMsg('✓ Пароль скопирован');
            setTimeout(() => setMsg(''), 1500);
        } catch {
            setMsg('✗ Не удалось скопировать');
        }
    };

    const submit = async (e) => {
        e.preventDefault();
        setMsg('');
        setBusy(true);
        try {
            const payload = {
                email: form.email.trim().toLowerCase(),
                password: form.password,
                display_name: form.display_name || null,
                role: form.role,
                sub_role: form.sub_role || null,
                company_name: form.company_name || null,
                token_balance: Number(form.token_balance) || 0,
            };
            const { data } = await adminApi.createUser(payload);
            onCreated(data, form.password);
        } catch (err) {
            setMsg('✗ ' + formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <form
                onSubmit={submit}
                className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#0F1422] border border-white/10 rounded-t-[24px] sm:rounded-[18px] p-5 sm:p-6 shadow-[0_32px_80px_rgba(0,0,0,0.8)] space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Новый пользователь</h2>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white">✕</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <AdminInput label="Email" value={form.email} onChange={v => update('email', v)} />
                    <AdminInput label="Имя" value={form.display_name} onChange={v => update('display_name', v)} />
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Роль</span>
                        <select
                            value={form.role}
                            onChange={e => update('role', e.target.value)}
                            className="bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                        >
                            {ADMIN_MANAGED_ROLES.map(role => (
                                <option key={role} value={role}>{ROLE_LABEL[role] || role}</option>
                            ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Sub-роль</span>
                        <select
                            value={form.sub_role}
                            onChange={e => update('sub_role', e.target.value)}
                            className="bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                        >
                            {ADMIN_MANAGED_SUB_ROLES.map(s => (
                                <option key={s || 'none'} value={s}>{s || '— нет —'}</option>
                            ))}
                        </select>
                    </label>
                    <AdminInput label="Компания" value={form.company_name} onChange={v => update('company_name', v)} />
                    <AdminInput label="Баланс токенов" type="number" value={form.token_balance} onChange={v => update('token_balance', v)} />
                </div>

                <div>
                    <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1.5">
                        Пароль (запишите — после закрытия скрытого окна вернуть его нельзя)
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={form.password}
                            onChange={e => update('password', e.target.value)}
                            className="flex-1 bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm font-mono text-emerald-300 outline-none focus:border-white/30"
                        />
                        <button type="button" onClick={() => setShowPassword(v => !v)} className="px-3 py-2 rounded-[8px] bg-white/5 hover:bg-white/10 text-xs">
                            {showPassword ? 'Скрыть' : 'Показать'}
                        </button>
                        <button type="button" onClick={regenerate} className="px-3 py-2 rounded-[8px] bg-white/5 hover:bg-white/10 text-xs">↻</button>
                        <button type="button" onClick={copyPassword} className="px-3 py-2 rounded-[8px] bg-white/5 hover:bg-white/10 text-xs">📋</button>
                    </div>
                </div>

                {msg && (
                    <div className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</div>
                )}

                <div className="flex gap-2 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-[10px] bg-white/5 hover:bg-white/10 text-sm font-bold"
                    >
                        Отмена
                    </button>
                    <button
                        type="submit"
                        disabled={busy}
                        className="flex-1 px-4 py-2.5 rounded-[10px] bg-white text-[#080B13] hover:bg-gray-100 text-sm font-black disabled:opacity-40"
                    >
                        {busy ? 'Создание…' : 'Создать'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function ResetPasswordDialog({ user, onClose, onDone }) {
    const [pw, setPw] = useState(suggestPassword());
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [show, setShow] = useState(true);

    const submit = async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
            await adminApi.resetUserPassword(user.id, pw);
            onDone(pw);
        } catch (err) {
            setMsg('✗ ' + formatApiError(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
            <form
                onSubmit={submit}
                className="w-full max-w-md max-h-[92dvh] overflow-y-auto bg-[#0F1422] border border-white/10 rounded-t-[24px] sm:rounded-[18px] p-5 sm:p-6 shadow-[0_32px_80px_rgba(0,0,0,0.8)] space-y-4"
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold">Сбросить пароль</h2>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white">✕</button>
                </div>
                <p className="text-xs text-white/40">
                    Пароль для <span className="font-bold text-white/70">{user.email}</span>. После сохранения старый
                    пароль перестанет работать. Запишите новый — поднять прежний нельзя.
                </p>
                <div className="flex flex-wrap gap-2">
                    <input
                        type={show ? 'text' : 'password'}
                        value={pw}
                        onChange={e => setPw(e.target.value)}
                        className="flex-1 bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm font-mono text-emerald-300 outline-none focus:border-white/30"
                    />
                    <button type="button" onClick={() => setShow(v => !v)} className="px-3 py-2 rounded-[8px] bg-white/5 hover:bg-white/10 text-xs">
                        {show ? 'Скрыть' : 'Показать'}
                    </button>
                    <button type="button" onClick={() => setPw(suggestPassword())} className="px-3 py-2 rounded-[8px] bg-white/5 hover:bg-white/10 text-xs">↻</button>
                </div>
                {msg && <div className="text-xs font-bold text-red-400">{msg}</div>}
                <div className="flex gap-2 pt-2">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 rounded-[10px] bg-white/5 hover:bg-white/10 text-sm font-bold">
                        Отмена
                    </button>
                    <button type="submit" disabled={busy} className="flex-1 px-4 py-2.5 rounded-[10px] bg-white text-[#080B13] hover:bg-gray-100 text-sm font-black disabled:opacity-40">
                        {busy ? 'Сохранение…' : 'Сбросить пароль'}
                    </button>
                </div>
            </form>
        </div>
    );
}

function ShowPasswordDialog({ user, password, onClose }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(password);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {/* noop */}
    };
    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#0F1422] border border-emerald-500/20 rounded-[18px] p-6 space-y-4">
                <h2 className="text-lg font-bold">Пароль установлен</h2>
                <p className="text-xs text-white/50">
                    Сохраните пароль для <span className="font-bold text-white/80">{user.email}</span>. Это
                    единственный момент, когда вы видите его в открытом виде — после закрытия окна восстановить
                    его нельзя, только сбросить заново.
                </p>
                <div className="flex gap-2">
                    <code className="flex-1 bg-black/40 border border-white/10 rounded-[8px] px-3 py-2.5 text-sm font-mono text-emerald-300 break-all">
                        {password}
                    </code>
                    <button onClick={copy} className="px-3 rounded-[8px] bg-white/10 hover:bg-white/15 text-xs font-bold">
                        {copied ? '✓' : '📋'}
                    </button>
                </div>
                <button onClick={onClose} className="w-full px-4 py-2.5 rounded-[10px] bg-white text-[#080B13] hover:bg-gray-100 text-sm font-black">
                    Готово
                </button>
            </div>
        </div>
    );
}

function UserDetails({ user, onSaved, onDeleted, onResetRequested }) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState(() => ({
        display_name: user.display_name || '',
        role: user.role || 'client',
        sub_role: user.sub_role || '',
        company_name: user.company_name || '',
        token_balance: user.token_balance ?? 0,
    }));
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    useEffect(() => {
        setEditing(false);
        setMsg('');
        setForm({
            display_name: user.display_name || '',
            role: user.role || 'client',
            sub_role: user.sub_role || '',
            company_name: user.company_name || '',
            token_balance: user.token_balance ?? 0,
        });
    }, [user.id]);

    const update = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const save = async () => {
        try {
            setSaving(true);
            setMsg('');
            const payload = {
                display_name: form.display_name || null,
                role: form.role,
                sub_role: form.sub_role || null,
                company_name: form.company_name || null,
                token_balance: Number(form.token_balance) || 0,
            };
            const { data } = await adminApi.updateUser(user.id, payload);
            onSaved(data);
            setEditing(false);
            setMsg('✓ Сохранено');
        } catch (e) {
            setMsg('✗ ' + formatApiError(e));
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!window.confirm(`Удалить пользователя ${user.email}? Действие необратимо.`)) return;
        try {
            await adminApi.deleteUser(user.id);
            onDeleted(user.id);
        } catch (e) {
            setMsg('✗ ' + formatApiError(e));
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
            <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Профиль</p>
                    {msg && <span className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
                    <button
                        onClick={() => onResetRequested(user)}
                        className="sm:ml-auto px-3 py-1.5 rounded-[8px] bg-orange-500/15 hover:bg-orange-500/25 text-orange-300 text-xs font-bold transition"
                    >
                        🔑 Сбросить пароль
                    </button>
                    <button
                        onClick={() => setEditing(v => !v)}
                        className="px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/15 text-xs font-bold transition"
                    >
                        {editing ? 'Просмотр' : 'Редактировать'}
                    </button>
                    {editing && (
                        <button
                            onClick={save}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-[8px] bg-white text-[#080B13] hover:bg-gray-100 text-xs font-black disabled:opacity-50 transition"
                        >
                            {saving ? '…' : 'Сохранить'}
                        </button>
                    )}
                    <button
                        onClick={remove}
                        className="px-3 py-1.5 rounded-[8px] bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs font-bold transition"
                    >
                        Удалить
                    </button>
                </div>

                {editing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <AdminInput label="Имя" value={form.display_name} onChange={v => update('display_name', v)} />
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Роль</span>
                            <select
                                value={form.role}
                                onChange={e => update('role', e.target.value)}
                                className="bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                            >
                                {ADMIN_MANAGED_ROLES.map(role => (
                                    <option key={role} value={role}>{ROLE_LABEL[role] || role}</option>
                                ))}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Sub-роль</span>
                            <select
                                value={form.sub_role}
                                onChange={e => update('sub_role', e.target.value)}
                                className="bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                            >
                                {ADMIN_MANAGED_SUB_ROLES.map(s => (
                                    <option key={s || 'none'} value={s}>{s || '— нет —'}</option>
                                ))}
                            </select>
                        </label>
                        <AdminInput label="Компания" value={form.company_name} onChange={v => update('company_name', v)} />
                        <AdminInput label="Баланс токенов" type="number" value={form.token_balance} onChange={v => update('token_balance', v)} />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <ValueRow label="Email" value={user.email} />
                        <ValueRow label="Имя" value={user.display_name} />
                        <ValueRow label="Роль" value={ROLE_LABEL[user.role] || user.role} />
                        <ValueRow label="Sub-роль" value={user.sub_role} />
                        <ValueRow label="Компания" value={user.company_name} />
                        <ValueRow label="Баланс" value={`${user.token_balance ?? 0}`} />
                        <ValueRow label="Заказов" value={`${user.orders_count ?? 0}`} />
                        <ValueRow label="Последний заказ" value={user.last_order_at ? new Date(user.last_order_at).toLocaleString('ru') : '—'} />
                        <ValueRow label="Пароль установлен" value={user.has_password ? 'Да' : 'Нет (только OAuth)'} />
                        <ValueRow label="Создан" value={user.created_at ? new Date(user.created_at).toLocaleString('ru') : null} />
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">UUID</p>
                    <code className="text-xs font-mono text-white/35 break-all">{user.id}</code>
                </div>
                <div className="text-[10px] text-white/35 leading-relaxed">
                    Чтобы посмотреть пароль пользователя — нельзя: хеш bcrypt односторонний.
                    Кнопка «Сбросить пароль» задаёт новый и единожды показывает его.
                </div>
            </div>
        </div>
    );
}

function UsersTab({ initialFilter = null }) {
    const [filter, setFilter] = useState({ role: initialFilter, search: '' });
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expanded, setExpanded] = useState(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [resetTarget, setResetTarget] = useState(null);
    const [showPasswordFor, setShowPasswordFor] = useState(null);
    const [showPassword, setShowPassword] = useState('');
    const gatedLoading = useLoaderCompletionGate(loading);

    const reload = async (params = filter) => {
        setLoading(true);
        setError(null);
        try {
            const { data } = await adminApi.getUsers({
                role: params.role || undefined,
                search: params.search || undefined,
            });
            setUsers(data || []);
        } catch (err) {
            setError(formatApiError(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { reload(filter); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
    useEffect(() => {
        if (initialFilter !== filter.role) {
            const next = { ...filter, role: initialFilter };
            setFilter(next);
            reload(next);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialFilter]);

    const onCreated = (created, password) => {
        setCreateOpen(false);
        setShowPasswordFor(created);
        setShowPassword(password);
        reload();
    };

    const onSaved = (updated) => {
        setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
    };

    const onDeleted = (deletedId) => {
        setUsers(prev => prev.filter(u => u.id !== deletedId));
        setExpanded(null);
    };

    const tabTitle = initialFilter
        ? `${ROLE_LABEL[initialFilter] || initialFilter}`
        : 'Пользователи';

    return (
        <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
                <SectionHeader title={tabTitle} count={users.length} />
                <input
                    type="search"
                    value={filter.search}
                    onChange={e => setFilter({ ...filter, search: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') reload({ ...filter }); }}
                    placeholder="Поиск email / имя / компания"
                    className="bg-black/30 border border-white/10 rounded-[10px] px-3 py-2 sm:py-1.5 text-sm w-full sm:w-64 outline-none focus:border-white/30"
                />
                {!initialFilter && (
                    <select
                        value={filter.role || ''}
                        onChange={e => { const next = { ...filter, role: e.target.value || null }; setFilter(next); reload(next); }}
                        className="bg-black/30 border border-white/10 rounded-[10px] px-3 py-1.5 text-sm outline-none"
                    >
                        <option value="">Все роли</option>
                        {ADMIN_MANAGED_ROLES.map(role => (
                            <option key={role} value={role}>{ROLE_LABEL[role] || role}</option>
                        ))}
                        <option value="owner">Владелец</option>
                    </select>
                )}
                <button
                    onClick={() => reload(filter)}
                    className="px-3 py-1.5 rounded-[10px] bg-white/5 hover:bg-white/10 text-xs font-bold"
                >
                    ↻ Обновить
                </button>
                <button
                    onClick={() => setCreateOpen(true)}
                    className="sm:ml-auto px-4 py-2 sm:py-1.5 rounded-[10px] bg-white text-[#080B13] hover:bg-gray-100 text-sm font-black"
                >
                    + Добавить
                </button>
            </div>

            {gatedLoading ? <Loader /> : error ? <ErrBox msg={error} /> : (
                <Table
                    headers={['Email', 'Имя', 'Роль', 'Sub-роль', 'Компания', 'Заказов', 'Пароль', 'Создан']}
                    empty={users.length === 0 ? 'Нет пользователей' : null}
                >
                    {users.map(u => (
                        <Fragment key={u.id}>
                            <tr
                                onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                                className="border-b border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors select-none"
                            >
                                <td className="px-4 py-2.5 text-sm text-white/80">{u.email}</td>
                                <td className="px-4 py-2.5 text-sm text-white/60">{u.display_name || '—'}</td>
                                <td className="px-4 py-2.5">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_CLS[u.role] ?? 'text-white/40 bg-white/5'}`}>
                                        {ROLE_LABEL[u.role] || u.role}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-white/45">{u.sub_role || '—'}</td>
                                <td className="px-4 py-2.5 text-sm text-white/45">{u.company_name || '—'}</td>
                                <td className="px-4 py-2.5 text-sm text-white/60">{u.orders_count ?? 0}</td>
                                <td className="px-4 py-2.5 text-xs">
                                    {u.has_password
                                        ? <span className="text-emerald-400">✓ задан</span>
                                        : <span className="text-white/30">OAuth</span>}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-xs text-white/30">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString('ru') : '—'}
                                </td>
                            </tr>
                            {expanded === u.id && (
                                <tr className="bg-black/20">
                                    <td colSpan={8} className="px-5 py-5">
                                        <UserDetails
                                            user={u}
                                            onSaved={onSaved}
                                            onDeleted={onDeleted}
                                            onResetRequested={setResetTarget}
                                        />
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    ))}
                </Table>
            )}

            {createOpen && (
                <CreateUserDialog
                    initialRole={initialFilter || 'dealer'}
                    onClose={() => setCreateOpen(false)}
                    onCreated={onCreated}
                />
            )}
            {resetTarget && (
                <ResetPasswordDialog
                    user={resetTarget}
                    onClose={() => setResetTarget(null)}
                    onDone={(pw) => { setResetTarget(null); setShowPasswordFor(resetTarget); setShowPassword(pw); }}
                />
            )}
            {showPasswordFor && (
                <ShowPasswordDialog
                    user={showPasswordFor}
                    password={showPassword}
                    onClose={() => { setShowPasswordFor(null); setShowPassword(''); }}
                />
            )}
        </>
    );
}

// ─── Dashboard / статистика ──────────────────────────────────────────────────

function StatCard({ label, value, hint }) {
    return (
        <div className="bg-white/[0.03] border border-white/10 rounded-[14px] p-4">
            <div className="text-[10px] font-bold text-white/35 uppercase tracking-widest">{label}</div>
            <div className="text-3xl font-black mt-1.5">{value}</div>
            {hint && <div className="text-xs text-white/40 mt-1.5">{hint}</div>}
        </div>
    );
}

function DashboardTab({ onJumpToUsers, language }) {
    const { data, loading, error } = useData(() => adminApi.getStats(), language);
    if (loading) return <Loader language={language} />;
    if (error) return <ErrBox msg={error} />;
    const s = data || {};
    const usersByRole = s.users_by_role || [];
    const ordersByStatus = s.orders_by_status || [];

    return (
        <>
            <SectionHeader title="Сводка" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Пользователей" value={s.users_total ?? 0} hint={`+${s.new_users_last_30d ?? 0} за 30 дней`} />
                <StatCard label="Заказов" value={s.orders_total ?? 0} hint={`+${s.new_orders_last_30d ?? 0} за 30 дней`} />
                <StatCard label="Выручка (всего)" value={`${(s.revenue_total ?? 0).toLocaleString('ru')} ${s.revenue_currency || 'BYN'}`} />
                <StatCard label="Дилеров" value={usersByRole.find(r => r.role === 'dealer')?.count ?? 0} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
                <div>
                    <SectionHeader title="Пользователи по ролям" />
                    <div className="space-y-1.5">
                        {usersByRole.map(({ role, count }) => (
                            <button
                                key={role}
                                onClick={() => onJumpToUsers(role)}
                                className="w-full flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-[10px] px-3 py-2 hover:bg-white/[0.06] transition text-left"
                            >
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_CLS[role] ?? 'text-white/40 bg-white/5'}`}>
                                    {ROLE_LABEL[role] || role}
                                </span>
                                <span className="font-mono text-sm text-white/70">{count}</span>
                            </button>
                        ))}
                        {usersByRole.length === 0 && <div className="text-white/25 text-sm">Нет данных</div>}
                    </div>
                </div>

                <div>
                    <SectionHeader title="Заказы по статусам" />
                    <div className="space-y-1.5">
                        {ordersByStatus.map(({ role: status, count }) => (
                            <div
                                key={status}
                                className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-[10px] px-3 py-2"
                            >
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_CLS[status] ?? 'text-white/40 bg-white/5 border-white/10'}`}>
                                    {getStatusLabel(status, language)}
                                </span>
                                <span className="font-mono text-sm text-white/70">{count}</span>
                            </div>
                        ))}
                        {ordersByStatus.length === 0 && <div className="text-white/25 text-sm">Нет данных</div>}
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── JSON-конфиги ────────────────────────────────────────────────────────────

function JsonTab({ language }) {
    const { data, loading, error } = useData(() => adminApi.listOrderTypes(), language);
    const [selected, setSelected] = useState(null);
    const [editText, setEditText] = useState('');
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');

    const loadFile = async (id) => {
        setSelected(id);
        setMsg('');
        const r = await adminApi.getOrderType(id);
        setEditText(JSON.stringify(r.data.data, null, 2));
    };

    const save = async () => {
        try {
            const parsed = JSON.parse(editText);
            setSaving(true);
            await adminApi.updateOrderType(selected, parsed);
            setMsg(t(language, 'adminSaved'));
        } catch (e) {
            setMsg('✗ ' + e.message);
        } finally {
            setSaving(false);
            setTimeout(() => setMsg(''), 3000);
        }
    };

    if (loading) return <Loader language={language} />;
    if (error) return <ErrBox msg={error} />;
    const items = data?.items ?? [];

    return (
        <div className="flex flex-col md:flex-row gap-5 h-[calc(100dvh-9rem)] min-h-0">
            <div className="w-full md:w-52 md:shrink-0 flex md:flex-col gap-1 touch-scroll-x md:overflow-visible pb-2 md:pb-0">
                <h2 className="text-xl font-bold mb-3">{t(language, 'adminJsonHeader')}</h2>
                {items.map(item => (
                    <button
                        key={item.id}
                        onClick={() => loadFile(item.id)}
                        className={`text-left px-3 py-2.5 rounded-[10px] transition-all shrink-0 md:shrink ${
                            selected === item.id
                                ? 'bg-white text-[#080B13]'
                                : 'text-white/55 hover:bg-white/5 hover:text-white/90'
                        }`}
                    >
                        <div className="text-sm font-bold">{item.id}</div>
                        <div className={`text-xs mt-0.5 ${selected === item.id ? 'text-black/40' : 'text-white/25'}`}>
                            {(item.size_bytes / 1024).toFixed(1)} KB
                            {item.updated_at && (
                                <> · {new Date(item.updated_at * 1000).toLocaleDateString('ru')}</>
                            )}
                        </div>
                    </button>
                ))}
                {items.length === 0 && <p className="text-white/20 text-xs px-3">{t(language, 'adminJsonEmpty')}</p>}
            </div>

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {selected ? (
                    <>
                        <div className="flex items-center gap-3 mb-3 shrink-0">
                            <span className="font-bold text-sm text-white/70">{selected}.json</span>
                            {msg && (
                                <span className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                                    {msg}
                                </span>
                            )}
                            <button
                                onClick={save}
                                disabled={saving}
                                className="ml-auto px-4 py-1.5 bg-white text-[#080B13] text-xs font-black rounded-[8px] hover:bg-gray-100 disabled:opacity-40 transition-all"
                            >
                                {saving ? t(language, 'adminSaving') : t(language, 'adminSaveBtn')}
                            </button>
                        </div>
                        <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            spellCheck={false}
                            className="flex-1 bg-black/30 border border-white/10 rounded-[12px] p-4 font-mono text-xs text-emerald-400 resize-none outline-none focus:border-white/25 leading-relaxed"
                        />
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-white/15 text-sm">
                        {t(language, 'adminJsonSelectFile')}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Продукты ────────────────────────────────────────────────────────────────

function ProductsTab({ language }) {
    const { data, loading, error } = useData(() => productApi.getAll(), language);

    if (loading) return <Loader language={language} />;
    if (error) return <ErrBox msg={error} />;
    const products = Array.isArray(data) ? data : [];

    return (
        <>
            <SectionHeader title={t(language, 'adminProductsHeader')} count={products.length} />
            <Table
                headers={[
                    t(language, 'adminColProduct'),
                    t(language, 'adminColDealer'),
                    t(language, 'adminColPrice'),
                    t(language, 'adminColBinding'),
                    t(language, 'adminColFormats'),
                    t(language, 'adminColCreated'),
                ]}
                empty={products.length === 0 ? t(language, 'adminProductsEmpty') : null}
            >
                {products.map(p => (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-2.5 text-sm font-bold text-white/80">{p.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-white/40">{p.dealer_id || '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-white/60">
                            {(p.retailPrice ?? p.retail_price) != null ? `${p.retailPrice ?? p.retail_price} BYN` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-white/50">
                            {Array.isArray(p.binding) ? p.binding.join(', ') : (p.binding || '—')}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-white/50">
                            {Array.isArray(p.formats) ? p.formats.join(', ') : (p.formats || '—')}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-white/30">
                            {p.created_at ? new Date(p.created_at).toLocaleString('ru') : '—'}
                        </td>
                    </tr>
                ))}
            </Table>
        </>
    );
}

// ─── Дашборд ─────────────────────────────────────────────────────────────────

const TABS = [
    ['dashboard', 'adminTabDashboard'],
    ['orders', 'adminTabOrders'],
    ['users', 'adminTabUsers'],
    ['dealers', 'adminTabDealers'],
    ['manufacturers', 'adminTabManufacturers'],
    ['admins', 'adminTabAdmins'],
    ['json', 'adminTabJson'],
    ['products', 'adminTabProducts'],
];

export const AdminDashboard = ({ onLogout }) => {
    const { language } = useConfigurator();
    const [tab, setTab] = useState('dashboard');

    return (
        <div className="app-bg fixed inset-0 text-gray-900 dark:text-white flex flex-col font-sans overflow-hidden">
            <LiveOrderToasts />
            <header className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-white/8 bg-[#0A0E1A] shrink-0">
                <span className="text-[11px] font-black tracking-[0.18em] sm:tracking-[0.25em] uppercase text-white/20">SPRUZHYK</span>
                <span className="text-white/12 mx-2 select-none">|</span>
                <span className="text-sm font-bold text-white/60">{t(language, 'adminPanelLabel')}</span>
                <nav className="order-3 w-full lg:order-none lg:w-auto flex gap-1 lg:ml-6 touch-scroll-x pb-1 lg:pb-0">
                    {TABS.map(([id, labelKey]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`px-3 sm:px-4 py-1.5 rounded-[8px] text-xs font-bold transition-all whitespace-nowrap ${
                                tab === id
                                    ? 'bg-white text-[#080B13]'
                                    : 'text-white/35 hover:text-white/70 hover:bg-white/5'
                            }`}
                        >
                            {t(language, labelKey)}
                        </button>
                    ))}
                </nav>
                <button
                    onClick={onLogout}
                    className="ml-auto text-xs text-white/25 hover:text-white/60 border border-white/8 hover:border-white/20 px-3 py-1.5 rounded-[8px] transition-all"
                >
                    {t(language, 'adminLogout')}
                </button>
            </header>

            <div className="flex-1 overflow-auto p-4 sm:p-6">
                {tab === 'dashboard' && <DashboardTab language={language} onJumpToUsers={(role) => setTab(role === 'dealer' ? 'dealers' : role === 'manufacturer' ? 'manufacturers' : role === 'admin' ? 'admins' : 'users')} />}
                {tab === 'orders' && <OrdersTab language={language} />}
                {tab === 'users' && <UsersTab key="all" initialFilter={null} />}
                {tab === 'dealers' && <UsersTab key="dealers" initialFilter="dealer" />}
                {tab === 'manufacturers' && <UsersTab key="manufacturers" initialFilter="manufacturer" />}
                {tab === 'admins' && <UsersTab key="admins" initialFilter="admin" />}
                {tab === 'json' && <JsonTab language={language} />}
                {tab === 'products' && <ProductsTab language={language} />}
            </div>
        </div>
    );
};
