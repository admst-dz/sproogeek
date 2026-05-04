import { useState, useEffect } from 'react';

const COOKIE_CONSENT_KEY = 'spruzhuk_cookie_consent';

export const CookieBanner = () => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
        if (!stored) setVisible(true);
    }, []);

    const accept = () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
        setVisible(false);
    };

    const decline = () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-[calc(100vw-3rem)] sm:w-[360px] animate-fade-in">
            <div className="bg-[#10151F] border border-white/10 rounded-[20px] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                <div className="flex items-start gap-3 mb-4">
                    <div className="w-8 h-8 rounded-[10px] bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-sm">
                        🍪
                    </div>
                    <div>
                        <p className="font-bold text-white text-sm leading-snug mb-1">Мы используем файлы cookie</p>
                        <p className="text-gray-400 text-xs leading-relaxed">
                            Для авторизации и сохранения заказа мы используем куки. Продолжая, вы соглашаетесь с{' '}
                            <a
                                href="/cookie-policy"
                                className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                политикой куки
                            </a>.
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={accept}
                        className="flex-1 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-[12px] hover:bg-gray-100 active:scale-[0.98] transition-all"
                    >
                        Принять
                    </button>
                    <button
                        onClick={decline}
                        className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold rounded-[12px] transition-all"
                    >
                        Отклонить
                    </button>
                </div>
            </div>
        </div>
    );
};
