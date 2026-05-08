import { useEffect } from 'react';

export const ConfirmModal = ({
    open,
    title = 'Подтвердите действие',
    message,
    confirmLabel = 'Подтвердить',
    cancelLabel = 'Отмена',
    danger = false,
    onConfirm,
    onCancel,
}) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onCancel?.();
            if (e.key === 'Enter') onConfirm?.();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onConfirm, onCancel]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4"
            onClick={onCancel}
        >
            <div
                className="w-full max-w-sm bg-white dark:bg-[#1A2642] border border-black/10 dark:border-white/15 rounded-[20px] p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
            >
                <h3 className="text-lg font-bold text-black dark:text-white mb-2">{title}</h3>
                {message && (
                    <p className="text-sm text-black/70 dark:text-white/70 mb-6 leading-relaxed">{message}</p>
                )}
                <div className="flex gap-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white text-sm font-bold rounded-[12px] hover:bg-black/10 dark:hover:bg-white/10 active:scale-[0.98] transition-all"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        autoFocus
                        className={`flex-1 py-3 text-sm font-bold uppercase tracking-widest rounded-[12px] active:scale-[0.98] transition-all ${
                            danger
                                ? 'bg-red-500 text-white hover:bg-red-600'
                                : 'bg-black text-white dark:bg-white dark:text-black hover:opacity-90'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
