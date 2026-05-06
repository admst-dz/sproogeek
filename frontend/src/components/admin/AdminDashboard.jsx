import { Fragment, useState, useEffect } from 'react';
import { adminApi, productApi } from '../../api';
import { VibeLoader } from '../shared/VibeLoader';

const STATUS_LABEL = { new: 'Новый', processing: 'В работе', production: 'Производство', in_delivery: 'Доставка', done: 'Готов' };
const BINDING_LABEL = { hard: 'Твёрдый', spiral: 'На пружине', soft: 'Мягкий' };
const PATTERN_LABEL = { blank: 'Пустой', lined: 'Линейка', grid: 'Клетка', dotted: 'Точка' };
const PRODUCT_LABEL = { notebook: 'Ежедневник', sketchbook: 'Скетчбук', thermos: 'Термос', powerbank: 'Повербанк' };
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
    client: 'text-white/40 bg-white/5',
};

function formatApiError(error) {
    const detail = error?.response?.data?.detail;
    const fallback = error?.message || 'Ошибка загрузки данных';

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

function useData(fetcher) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    useEffect(() => {
        fetcher()
            .then(r => { setData(r.data); setLoading(false); })
            .catch(e => { setError(formatApiError(e)); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return { data, setData, loading, error };
}

const Loader = () => (
    <div className="flex items-center justify-center py-20">
        <VibeLoader progress={64} label="Загружаем" compact />
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

function orderSummaryRows(order) {
    const config = order.configuration || {};
    const productConfig = config.productConfig || {};
    const contact = config.contact || {};
    const rows = [
        ['Клиент', contact.name || contact.contactPerson],
        ['Телефон', contact.phone],
        ['Email', order.user_email || contact.email],
        ['Адрес', contact.address],
        ['Компания / ИНН', [contact.name, contact.inn].filter(Boolean).join(' / ')],
        ['Тип клиента', config.clientType === 'jur' ? 'Юр. лицо' : config.clientType === 'phys' ? 'Физ. лицо' : config.clientType],
        ['Тиражный образец', config.isSample || productConfig.isSample ? 'Да' : null],
        ['Тип товара', PRODUCT_LABEL[productConfig.activeProduct || productConfig.type] || productConfig.activeProduct || productConfig.type],
        ['Формат', productConfig.format],
        ['Переплёт', BINDING_LABEL[productConfig.bindingType] || productConfig.bindingType],
        ['Разлиновка', PATTERN_LABEL[productConfig.paperPattern] || productConfig.paperPattern],
        ['Цвет обложки', productConfig.coverColor ? <ColorValue color={productConfig.coverColor} /> : null],
        ['Цвет корпуса', productConfig.powerbankBodyColor || productConfig.thermosBodyColor ? <ColorValue color={productConfig.powerbankBodyColor || productConfig.thermosBodyColor} /> : null],
        ['Резинка', productConfig.hasElastic ? <ColorValue color={productConfig.elasticColor} /> : null],
        ['Пружина', productConfig.spiralColor ? <ColorValue color={productConfig.spiralColor} /> : null],
        ['Уголки', productConfig.hasCorners === undefined ? null : (productConfig.hasCorners ? 'Да' : 'Нет')],
        ['Логотипы', [productConfig.logos, productConfig.thermosLogos, productConfig.powerbankLogos].find(Array.isArray)?.length],
        ['Комментарий', contact.comment],
    ];
    return rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
}

function OrderDetails({ order, onSaved }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState('');
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
            setMsg('✓ Сохранено');
        } catch (e) {
            setMsg('✗ ' + (e instanceof SyntaxError ? 'JSON заполнен с ошибкой' : formatApiError(e)));
        } finally {
            setSaving(false);
        }
    };

    const rows = orderSummaryRows(order);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5">
            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                        Данные заказа
                    </p>
                    {msg && <span className={`text-xs font-bold ${msg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
                    <button
                        onClick={() => setEditing(v => !v)}
                        className="ml-auto px-3 py-1.5 rounded-[8px] bg-white/10 hover:bg-white/15 text-xs font-bold transition"
                    >
                        {editing ? 'Просмотр' : 'Редактировать'}
                    </button>
                    {editing && (
                        <button
                            onClick={save}
                            disabled={saving}
                            className="px-3 py-1.5 rounded-[8px] bg-white text-[#080B13] hover:bg-gray-100 text-xs font-black disabled:opacity-50 transition"
                        >
                            {saving ? 'Сохранение…' : 'Сохранить'}
                        </button>
                    )}
                </div>

                {editing ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <AdminInput label="Продукт" value={form.product_name} onChange={v => update('product_name', v)} />
                            <AdminInput label="Email" value={form.user_email} onChange={v => update('user_email', v)} />
                            <AdminInput label="Количество" type="number" value={form.quantity} onChange={v => update('quantity', v)} />
                            <AdminInput label="Цена" type="number" value={form.total_price} onChange={v => update('total_price', v)} />
                            <AdminInput label="Валюта" value={form.currency} onChange={v => update('currency', v.toUpperCase())} />
                            <label className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Статус</span>
                                <select
                                    value={form.status}
                                    onChange={e => update('status', e.target.value)}
                                    className="bg-black/30 border border-white/10 rounded-[8px] px-3 py-2 text-sm text-white outline-none focus:border-white/30"
                                >
                                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Конфигурация заказа JSON</span>
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
                            <div className="text-sm text-white/25 py-8">Нет распознанных данных. Откройте режим редактирования, чтобы посмотреть JSON.</div>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-4">
                <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2">
                        История статусов
                    </p>
                    <div className="space-y-1.5">
                        {(order.stage_history ?? []).map((s, i) => (
                            <div key={i} className="flex items-center gap-3 bg-black/30 rounded-[7px] px-3 py-1.5">
                                <span className={`text-xs font-bold ${STATUS_CLS[s.status]?.split(' ')[0] ?? 'text-white/50'}`}>
                                    {STATUS_LABEL[s.status] ?? s.status}
                                </span>
                                {s.comment && <span className="text-xs text-white/45">{s.comment}</span>}
                                <span className="text-xs text-white/25 ml-auto">
                                    {s.updated_at ? new Date(s.updated_at).toLocaleString('ru') : ''}
                                </span>
                            </div>
                        ))}
                        {!(order.stage_history?.length) && (
                            <span className="text-xs text-white/20">Нет истории</span>
                        )}
                    </div>
                </div>
                <div>
                    <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">UUID</p>
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

function OrdersTab() {
    const { data, setData, loading, error } = useData(() => adminApi.getOrders(1, 100));
    const [expanded, setExpanded] = useState(null);

    if (loading) return <Loader />;
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
            <SectionHeader title="Заказы" count={orders.length} />
            <Table
                headers={['ID', 'Email', 'Продукт', 'Статус', 'Кол-во', 'Цена', 'Дата']}
                empty={orders.length === 0 ? 'Заказов нет' : null}
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
                                    {STATUS_LABEL[o.status] ?? o.status}
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
                                    <OrderDetails order={o} onSaved={updateOrderInList} />
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

function UsersTab() {
    const { data, loading, error } = useData(() => adminApi.getUsers());

    if (loading) return <Loader />;
    if (error) return <ErrBox msg={error} />;
    const users = data ?? [];

    return (
        <>
            <SectionHeader title="Пользователи" count={users.length} />
            <Table
                headers={['Email', 'Имя', 'Роль', 'Sub-роль', 'Баланс', 'Компания', 'Дата']}
                empty={users.length === 0 ? 'Нет пользователей' : null}
            >
                {users.map(u => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-2.5 text-sm text-white/80">{u.email}</td>
                        <td className="px-4 py-2.5 text-sm text-white/60">{u.display_name || '—'}</td>
                        <td className="px-4 py-2.5">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${ROLE_CLS[u.role] ?? 'text-white/40 bg-white/5'}`}>
                                {u.role}
                            </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-white/45">{u.sub_role || '—'}</td>
                        <td className="px-4 py-2.5 text-sm text-white/60">{u.token_balance ?? 0}</td>
                        <td className="px-4 py-2.5 text-sm text-white/45">{u.company_name || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-white/30">
                            {u.created_at ? new Date(u.created_at).toLocaleString('ru') : '—'}
                        </td>
                    </tr>
                ))}
            </Table>
        </>
    );
}

// ─── JSON-конфиги ────────────────────────────────────────────────────────────

function JsonTab() {
    const { data, loading, error } = useData(() => adminApi.listOrderTypes());
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
            setMsg('✓ Сохранено');
        } catch (e) {
            setMsg('✗ ' + e.message);
        } finally {
            setSaving(false);
            setTimeout(() => setMsg(''), 3000);
        }
    };

    if (loading) return <Loader />;
    if (error) return <ErrBox msg={error} />;
    const items = data?.items ?? [];

    return (
        <div className="flex gap-5 h-[calc(100vh-9rem)]">
            <div className="w-52 shrink-0 flex flex-col gap-1">
                <h2 className="text-xl font-bold mb-3">JSON-конфиги</h2>
                {items.map(item => (
                    <button
                        key={item.id}
                        onClick={() => loadFile(item.id)}
                        className={`text-left px-3 py-2.5 rounded-[10px] transition-all ${
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
                {items.length === 0 && <p className="text-white/20 text-xs px-3">Нет файлов</p>}
            </div>

            <div className="flex-1 flex flex-col min-w-0">
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
                                {saving ? 'Сохранение…' : 'Сохранить'}
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
                        Выберите файл слева
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Продукты ────────────────────────────────────────────────────────────────

function ProductsTab() {
    const { data, loading, error } = useData(() => productApi.getAll());

    if (loading) return <Loader />;
    if (error) return <ErrBox msg={error} />;
    const products = Array.isArray(data) ? data : [];

    return (
        <>
            <SectionHeader title="Продукты" count={products.length} />
            <Table
                headers={['Название', 'Дилер', 'Цена', 'Переплёт', 'Форматы', 'Создан']}
                empty={products.length === 0 ? 'Нет продуктов' : null}
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
    ['orders', 'Заказы'],
    ['users', 'Пользователи'],
    ['json', 'JSON-конфиги'],
    ['products', 'Продукты'],
];

export const AdminDashboard = ({ onLogout }) => {
    const [tab, setTab] = useState('orders');

    return (
        <div className="fixed inset-0 bg-[#080B13] text-white flex flex-col font-sans overflow-hidden">
            <header className="flex items-center gap-2 px-6 py-3 border-b border-white/8 bg-[#0A0E1A] shrink-0">
                <span className="text-[11px] font-black tracking-[0.25em] uppercase text-white/20">SPRUZHYK</span>
                <span className="text-white/12 mx-2 select-none">|</span>
                <span className="text-sm font-bold text-white/60">Admin Panel</span>
                <nav className="flex gap-1 ml-6">
                    {TABS.map(([id, label]) => (
                        <button
                            key={id}
                            onClick={() => setTab(id)}
                            className={`px-4 py-1.5 rounded-[8px] text-xs font-bold transition-all ${
                                tab === id
                                    ? 'bg-white text-[#080B13]'
                                    : 'text-white/35 hover:text-white/70 hover:bg-white/5'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </nav>
                <button
                    onClick={onLogout}
                    className="ml-auto text-xs text-white/25 hover:text-white/60 border border-white/8 hover:border-white/20 px-3 py-1.5 rounded-[8px] transition-all"
                >
                    Выйти
                </button>
            </header>

            <div className="flex-1 overflow-auto p-6">
                {tab === 'orders' && <OrdersTab />}
                {tab === 'users' && <UsersTab />}
                {tab === 'json' && <JsonTab />}
                {tab === 'products' && <ProductsTab />}
            </div>
        </div>
    );
};
