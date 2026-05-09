import { useCallback, useEffect, useState } from 'react';
import apiClient from '../../api';
import { t } from '../../i18n';


const feedbackApi = {
    submit: (data) => apiClient.post('/feedback', data),
};


const emptyForm = {
    name: '',
    email: '',
    phone: '',
    rating: null,
    message: '',
};


function StarRating({ value, onChange, language }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
                <button
                    type="button"
                    key={n}
                    onClick={() => onChange(value === n ? null : n)}
                    aria-label={`${t(language, 'feedbackRating')} ${n}`}
                    className={`w-8 h-8 rounded-md transition-all ${value && n <= value
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-gray-300 dark:text-white/20 hover:text-gray-400 dark:hover:text-white/40'
                        }`}
                >
                    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">
                        <path d="M12 2 14.85 8.62 22 9.27 16.5 14.14 18.18 21.02 12 17.27 5.82 21.02 7.5 14.14 2 9.27 9.15 8.62 12 2z"/>
                    </svg>
                </button>
            ))}
        </div>
    );
}


export const FeedbackPanel = ({ language = 'ru' }) => {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [err, setErr] = useState('');

    const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

    const closeModal = useCallback(() => {
        setOpen(false);
        setErr('');
        if (done) {
            setDone(false);
            setForm(emptyForm);
        }
    }, [done]);

    useEffect(() => {
        if (!open) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                closeModal();
            }
        };

        document.addEventListener('keydown', onKeyDown);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, closeModal]);

    const submit = async (e) => {
        e.preventDefault();
        setErr('');

        if (!form.message.trim() || form.message.trim().length < 3) {
            setErr(t(language, 'feedbackErrEmpty'));
            return;
        }

        setBusy(true);
        try {
            const payload = {
                name: form.name.trim() || null,
                email: form.email.trim() || null,
                phone: form.phone.trim() || null,
                rating: form.rating ?? null,
                message: form.message.trim(),
            };
            await feedbackApi.submit(payload);
            setDone(true);
            setForm(emptyForm);
        } catch {
            setErr(t(language, 'feedbackErrSend'));
        } finally {
            setBusy(false);
        }
    };

    const modalContent = done ? (
        <div className="p-8 md:p-10 text-center transition-colors">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">
                {t(language, 'feedbackThanksTitle')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                {t(language, 'feedbackThanksMsg')}
            </p>
            <button
                type="button"
                onClick={closeModal}
                className="mt-6 px-6 py-3 rounded-full bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-[#080B13] dark:hover:bg-gray-100 text-sm font-bold transition-colors"
            >
                {t(language, 'feedbackClose')}
            </button>
        </div>
    ) : (
        <form
            onSubmit={submit}
            className="p-6 md:p-8 transition-colors"
        >
            <div className="mb-5 pr-10">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {t(language, 'feedbackTitle')}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5">
                    {t(language, 'feedbackSubtitle')}
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/30">
                        {t(language, 'feedbackName')} <span className="font-normal normal-case tracking-normal text-gray-300 dark:text-white/20">· {t(language, 'feedbackOptional')}</span>
                    </span>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => update('name', e.target.value)}
                        maxLength={120}
                        className="bg-white border border-gray-200 dark:bg-black/30 dark:border-white/10 rounded-[10px] px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-400/60 dark:focus:border-white/30 transition"
                    />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/30">
                        {t(language, 'feedbackEmail')} <span className="font-normal normal-case tracking-normal text-gray-300 dark:text-white/20">· {t(language, 'feedbackOptional')}</span>
                    </span>
                    <input
                        type="email"
                        value={form.email}
                        onChange={(e) => update('email', e.target.value)}
                        maxLength={120}
                        className="bg-white border border-gray-200 dark:bg-black/30 dark:border-white/10 rounded-[10px] px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-400/60 dark:focus:border-white/30 transition"
                    />
                </label>
                <label className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/30">
                        {t(language, 'feedbackPhone')} <span className="font-normal normal-case tracking-normal text-gray-300 dark:text-white/20">· {t(language, 'feedbackOptional')}</span>
                    </span>
                    <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => update('phone', e.target.value)}
                        maxLength={40}
                        className="bg-white border border-gray-200 dark:bg-black/30 dark:border-white/10 rounded-[10px] px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-400/60 dark:focus:border-white/30 transition"
                    />
                </label>
                <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/30">
                        {t(language, 'feedbackRating')} <span className="font-normal normal-case tracking-normal text-gray-300 dark:text-white/20">· {t(language, 'feedbackOptional')}</span>
                    </span>
                    <StarRating value={form.rating} onChange={(v) => update('rating', v)} language={language} />
                </div>
            </div>

            <label className="flex flex-col gap-1.5 mb-4">
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-white/30">
                    {t(language, 'feedbackMessage')}
                </span>
                <textarea
                    value={form.message}
                    onChange={(e) => update('message', e.target.value)}
                    rows={5}
                    maxLength={4000}
                    placeholder={t(language, 'feedbackMessagePlaceholder')}
                    className="bg-white border border-gray-200 dark:bg-black/30 dark:border-white/10 rounded-[12px] px-3.5 py-3 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-400/60 dark:focus:border-white/30 transition resize-y"
                />
            </label>

            {err && (
                <div className="mb-3 text-xs font-bold text-red-500 dark:text-red-400">{err}</div>
            )}

            <button
                type="submit"
                disabled={busy}
                className="w-full sm:w-auto px-6 py-3 rounded-full bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-[#080B13] dark:hover:bg-gray-100 text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {busy ? t(language, 'feedbackSubmitting') : t(language, 'feedbackSubmit')}
            </button>
        </form>
    );

    return (
        <section id="feedback" className="fixed right-3 bottom-24 sm:right-6 sm:bottom-8 z-40 pointer-events-none">
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="pointer-events-auto inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-[#080B13] dark:hover:bg-gray-100 text-xs sm:text-sm font-bold shadow-2xl transition-colors"
            >
                <svg className="shrink-0" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                    <path d="M8 9h8" />
                    <path d="M8 13h5" />
                </svg>
                <span className="leading-tight text-left">
                    <span className="block whitespace-nowrap">{t(language, 'feedbackCtaLine1')}</span>
                    <span className="block whitespace-nowrap">{t(language, 'feedbackCtaLine2')}</span>
                </span>
            </button>

            {open && (
                <div
                    className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
                    role="presentation"
                    onMouseDown={closeModal}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="feedback-title"
                        className="relative w-full max-w-3xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-[20px] md:rounded-[24px] bg-white border border-gray-200 shadow-2xl dark:bg-[#10131D] dark:border-white/10 dark:shadow-none text-left"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            onClick={closeModal}
                            aria-label={t(language, 'feedbackClose')}
                            className="absolute right-4 top-4 z-10 w-9 h-9 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/15 dark:hover:text-white transition-colors flex items-center justify-center"
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M18 6 6 18" />
                                <path d="m6 6 12 12" />
                            </svg>
                        </button>
                        <div id="feedback-title" className="sr-only">{t(language, 'feedbackTitle')}</div>
                        {modalContent}
                    </div>
                </div>
            )}
        </section>
    );
};
