import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';
import { requestGuestApproval } from '../../api';

const compactApprovalConfiguration = (value) => {
    if (Array.isArray(value)) return value.map(compactApprovalConfiguration);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(
        Object.entries(value)
            .filter(([key, item]) => {
                if (key === 'renderUrl') return false;
                if (key === 'texture' && typeof item === 'string' && item.startsWith('data:')) return false;
                return true;
            })
            .map(([key, item]) => [key, compactApprovalConfiguration(item)])
    );
};

/**
 * Модалка «Получить согласование на email» — гостевой flow без логина.
 *
 * Принимает на вход уже готовый renderDataURL (PNG) и payload конфигурации
 * товара. Сама ничего не рендерит сцены — снимок берётся снаружи через
 * captureRender() ровно в момент, когда пользователь нажимает кнопку.
 */
export const GuestApprovalModal = ({
    isOpen,
    onClose,
    renderDataURL,
    productName,
    configuration,
    quantity = 1,
    totalPrice = null,
    currency = 'BYN',
}) => {
    const language = useConfigurator((s) => s.language);

    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [sentTo, setSentTo] = useState('');

    useEffect(() => {
        if (isOpen) {
            setError('');
            setSentTo('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e?.preventDefault?.();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError(t(language, 'emailApprovalError'));
            return;
        }
        if (!renderDataURL) {
            setError(t(language, 'emailApprovalError'));
            return;
        }
        setSubmitting(true);
        setError('');
        try {
            await requestGuestApproval({
                email: email.trim(),
                product_name: productName || 'Spruzhyk design',
                render_data_url: renderDataURL,
                configuration: compactApprovalConfiguration(configuration || {}),
                quantity: Number.isFinite(quantity) ? Math.max(1, quantity) : 1,
                total_price: totalPrice ?? null,
                currency,
                name: name.trim() || null,
                phone: phone.trim() || null,
                comment: comment.trim() || null,
            });
            setSentTo(email.trim());
        } catch (err) {
            if (err?.response?.status === 413) {
                setError(t(language, 'emailApprovalTooLarge'));
                return;
            }
            const msg = err?.response?.data?.detail || err?.message || '';
            setError(msg || t(language, 'emailApprovalError'));
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[150] flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-md rounded-[20px] border border-white/15 bg-[#1A2236] p-5 sm:p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white hover:bg-white/10 transition"
                >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    </svg>
                </button>

                <div className="flex items-center gap-3 mb-3">
                    {renderDataURL ? (
                        <img src={renderDataURL} alt="preview" className="w-12 h-12 rounded-[10px] object-contain bg-black/40 border border-white/10" />
                    ) : (
                        <div className="w-12 h-12 rounded-[10px] bg-white/8 border border-white/10" />
                    )}
                    <div className="min-w-0">
                        <h2 className="text-base font-bold text-white truncate">{t(language, 'emailApprovalTitle')}</h2>
                        <p className="text-[11px] text-white/55 truncate">{productName}</p>
                    </div>
                </div>

                {sentTo ? (
                    <div className="flex flex-col gap-4">
                        <div className="rounded-[12px] border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                            {t(language, 'emailApprovalSent')} <strong className="text-white">{sentTo}</strong>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full py-2.5 rounded-[12px] bg-white text-[#0B0F19] text-sm font-bold uppercase tracking-widest hover:bg-gray-100 active:scale-[0.98] transition"
                        >
                            OK
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                        <p className="text-[12px] leading-snug text-white/55">
                            {t(language, 'emailApprovalDesc')}
                        </p>

                        <ApprovalInput value={email} onChange={(v) => setEmail(v)} placeholder={t(language, 'emailApprovalEmail')} type="email" autoFocus required />
                        <ApprovalInput value={name} onChange={(v) => setName(v)} placeholder={t(language, 'emailApprovalName')} />
                        <ApprovalInput value={phone} onChange={(v) => setPhone(v)} placeholder={t(language, 'emailApprovalPhone')} type="tel" />
                        <ApprovalTextarea value={comment} onChange={(v) => setComment(v)} placeholder={t(language, 'emailApprovalComment')} />

                        {error && (
                            <p className="text-red-300 text-xs font-bold bg-red-500/10 border border-red-500/30 rounded-[10px] px-3 py-2">
                                {error}
                            </p>
                        )}

                        <button
                            type="submit"
                            disabled={submitting || !email}
                            className={`w-full py-2.5 rounded-[12px] text-sm font-bold uppercase tracking-widest transition ${
                                submitting || !email
                                    ? 'bg-white/10 text-white/40 cursor-not-allowed'
                                    : 'bg-white text-[#0B0F19] hover:bg-gray-100 active:scale-[0.98]'
                            }`}
                        >
                            {submitting ? t(language, 'sending') : t(language, 'emailApprovalSubmit')}
                        </button>
                    </form>
                )}
            </div>
        </div>,
        document.body,
    );
};

const ApprovalInput = ({ value, onChange, placeholder, type = 'text', required = false, autoFocus = false }) => (
    <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className="w-full p-3 bg-white/5 border border-white/10 rounded-[12px] text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-white/30 transition"
    />
);

const ApprovalTextarea = ({ value, onChange, placeholder }) => (
    <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full p-3 bg-white/5 border border-white/10 rounded-[12px] text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-white/30 transition resize-none"
    />
);
