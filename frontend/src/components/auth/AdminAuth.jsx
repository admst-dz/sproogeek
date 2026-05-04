import { useState } from 'react';

export const AdminAuth = ({ onSuccess }) => {
    const [login, setLogin] = useState('');
    const [password, setPassword] = useState('');
    const [rsaKey, setRsaKey] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!login.trim() || !password.trim() || !rsaKey.trim()) {
            setError('Заполните все поля');
            return;
        }

        const rsaTrimmed = rsaKey.trim();
        if (!rsaTrimmed.startsWith('-----BEGIN') || !rsaTrimmed.includes('-----END')) {
            setError('Некорректный формат RSA-ключа');
            return;
        }

        setLoading(true);
        // Подключить валидацию к бэкенду
        setTimeout(() => {
            setLoading(false);
            setError('Доступ запрещён');
        }, 800);
    };

    return (
        <div className="fixed inset-0 bg-[#080B13] flex items-center justify-center p-4">

            <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                    backgroundImage: 'repeating-linear-gradient(0deg, #ffffff 0px, #ffffff 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #ffffff 0px, #ffffff 1px, transparent 1px, transparent 40px)',
                }}
            />

            <div className="relative w-full max-w-md">

                <div className="bg-[#0F1422] border border-white/8 rounded-[24px] p-8 shadow-[0_32px_80px_rgba(0,0,0,0.8)]">

                    <div className="mb-8">
                        <div className="w-10 h-10 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center mb-5">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/60">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                            </svg>
                        </div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Административный доступ</h1>
                        <p className="text-sm text-white/30 mt-1">Введите учётные данные для входа</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">

                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
                                Логин
                            </label>
                            <input
                                type="text"
                                value={login}
                                onChange={e => setLogin(e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                                placeholder="admin"
                                className="w-full bg-white/5 border border-white/10 rounded-[12px] px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 focus:bg-white/8 transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
                                Пароль
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    placeholder="••••••••••••"
                                    className="w-full bg-white/5 border border-white/10 rounded-[12px] px-4 py-3 pr-12 text-sm text-white placeholder-white/20 outline-none focus:border-white/30 focus:bg-white/8 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                                >
                                    {showPassword ? (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                                            <line x1="1" y1="1" x2="23" y2="23"/>
                                        </svg>
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                            <circle cx="12" cy="12" r="3"/>
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-white/40 uppercase tracking-widest mb-2">
                                RSA Private Key
                            </label>
                            <textarea
                                value={rsaKey}
                                onChange={e => setRsaKey(e.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                                rows={5}
                                placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
                                className="w-full bg-white/5 border border-white/10 rounded-[12px] px-4 py-3 text-xs text-white/80 placeholder-white/15 outline-none focus:border-white/30 focus:bg-white/8 transition-all resize-none font-mono leading-relaxed"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2.5 bg-red-500/8 border border-red-500/20 rounded-[10px] px-4 py-3">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                                <span className="text-red-400 text-xs">{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 py-3.5 bg-white text-black text-sm font-bold rounded-[12px] hover:bg-gray-100 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                                        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
                                    </svg>
                                    Проверка...
                                </span>
                            ) : 'Войти'}
                        </button>

                    </form>
                </div>

                <p className="text-center text-white/10 text-xs mt-6 tracking-widest uppercase">
                    Restricted Access
                </p>
            </div>
        </div>
    );
};
