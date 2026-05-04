import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { loginUser, registerUser, updateUserRole } from '../api';
import apiClient from '../api';

export const AuthModal = ({ onClose, onRoleCreated }) => {
    const [step, setStep] = useState(1);
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [pendingRole, setPendingRole] = useState(null);
    const [socialUser, setSocialUser] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isRegistering) {
                if (password.length < 8) {
                    setError('Пароль должен быть не менее 8 символов.');
                    setLoading(false);
                    return;
                }
                if (!/\d/.test(password)) {
                    setError('Пароль должен содержать хотя бы одну цифру.');
                    setLoading(false);
                    return;
                }
                if (!/[a-zA-Z]/.test(password)) {
                    setError('Пароль должен содержать буквы.');
                    setLoading(false);
                    return;
                }
                setStep(2);
                setLoading(false);
            } else {
                const user = await loginUser(email, password);
                onRoleCreated?.(user, user.role, user.sub_role || null);
                onClose();
            }
        } catch (err) {
            const msg = err.response?.data?.detail;
            setError(msg === 'Неверный Email или пароль' ? msg : 'Произошла ошибка. Попробуйте снова.');
            setLoading(false);
        }
    };

    // --- НОВАЯ GOOGLE АВТОРИЗАЦИЯ ---
    const googleLogin = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            setError(null);
            setLoading(true);
            try {
                // Отправляем код от Гугла на наш бэкенд
                const { data } = await apiClient.post('/auth/google', { google_code: codeResponse.code });
                localStorage.setItem('token', data.access_token);

                if (data.needs_role_setup) {
                    setSocialUser(data.user);
                    setLoading(false);
                    setStep(2);
                } else {
                    onRoleCreated?.(data.user, data.user.role, data.user.sub_role || null);
                    onClose();
                }
            } catch (err) {
                console.error("Google Auth Backend Error:", err);
                setError('Ошибка входа через Google. Попробуйте снова.');
                setLoading(false);
            }
        },
        onError: () => {
            setError('Ошибка входа через Google. Окно было закрыто.');
            setLoading(false);
        },
    });

    const selectRole = (role) => {
        if (role === 'dealer') {
            finishRegistration(role, null);
        } else {
            setPendingRole(role);
            setStep(3);
        }
    };

    const selectSubRole = (subRole) => {
        finishRegistration(pendingRole || 'client', subRole);
    };

    const finishRegistration = async (role, subRole) => {
        setLoading(true);
        try {
            let user;
            if (socialUser) {
                user = await updateUserRole(role, subRole);
            } else {
                user = await registerUser(email, password, displayName, role, subRole);
            }
            onRoleCreated?.(user, user.role, user.sub_role || null);
            onClose();
        } catch (err) {
            const detail = err.response?.data?.detail;
            const msg = Array.isArray(detail)
                ? detail.map(d => d.msg?.replace(/^Value error, /, '')).join(' ')
                : detail;
            if (msg === 'Email уже зарегистрирован') setError('Этот Email уже зарегистрирован.');
            else if (msg) setError(msg);
            else setError('Ошибка при регистрации. Попробуйте снова.');
            setStep(1);
            setSocialUser(null);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0F19]/80 backdrop-blur-xl p-4 font-sans text-white">
            <button onClick={onClose} className="absolute top-6 left-6 flex items-center gap-2 px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-full backdrop-blur-md text-sm font-bold text-gray-300">
                <span>←</span> Назад
            </button>

            <div className="bg-[#1A1F2E]/60 backdrop-blur-2xl rounded-[32px] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] w-full max-w-md p-8 md:p-10 relative animate-fade-in overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-white/5 blur-[50px] rounded-full pointer-events-none"></div>

                {step === 1 ? (
                    <div className="relative z-10 flex flex-col items-center">
                        {/* ... (UI заголовков и формы Email оставлен без изменений для краткости, он верный) ... */}

                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 tracking-tight">
                            {isRegistering ? 'Создать аккаунт' : 'С возвращением'}
                        </h2>

                        {/* Форма Email */}
                        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 mt-6">
                            {isRegistering && (
                                <input type="text" placeholder="Ваше имя" value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full py-4 pl-4 pr-4 bg-black/20 border border-white/10 rounded-[16px] text-white text-sm focus:outline-none focus:border-white/30 focus:bg-black/40" />
                            )}
                            <input type="email" placeholder="email@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full py-4 pl-4 pr-4 bg-black/20 border border-white/10 rounded-[16px] text-white text-sm focus:outline-none focus:border-white/30 focus:bg-black/40" />
                            <input type="password" placeholder="Пароль" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full py-4 pl-4 pr-4 bg-black/20 border border-white/10 rounded-[16px] text-white text-sm focus:outline-none focus:border-white/30 focus:bg-black/40" />
                            {error && <p className="text-rose-400 text-xs font-bold text-center mt-1">{error}</p>}
                            <button type="submit" disabled={loading} className={`w-full py-4 mt-2 bg-white text-black rounded-[16px] font-bold text-sm ${loading ? 'opacity-50' : ''}`}>
                                {loading ? 'Загрузка...' : (isRegistering ? 'Продолжить' : 'Войти')}
                            </button>
                        </form>

                        <div className="flex items-center gap-4 w-full my-6">
                            <div className="h-[1px] bg-white/10 flex-1"></div>
                            <span className="text-gray-500 text-[10px] uppercase tracking-widest">или</span>
                            <div className="h-[1px] bg-white/10 flex-1"></div>
                        </div>

                        {/* КНОПКА GOOGLE - ТЕПЕРЬ ПРИВЯЗАНА К googleLogin() */}
                        <button
                            onClick={() => googleLogin()}
                            disabled={loading}
                            className="w-full py-3 bg-black/20 border border-white/10 rounded-[16px] font-bold text-sm flex items-center justify-center gap-3 hover:bg-white/5 transition-all text-white active:scale-95 disabled:opacity-50"
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            Войти через Google
                        </button>

                        <div className="mt-6 text-center">
                            <button onClick={() => { setIsRegistering(!isRegistering); setError(null); }} className="text-[11px] text-gray-400 hover:text-white transition-colors">
                                {isRegistering ? 'Уже есть аккаунт? ' : 'Нет аккаунта? '}
                                <span className="font-bold text-white">{isRegistering ? 'Войти' : 'Зарегистрироваться'}</span>
                            </button>
                        </div>
                    </div>
                ) : step === 2 ? (
                    // ... Шаги выбора ролей остаются без изменений ...
                    <div className="relative z-10 flex flex-col items-center animate-fade-in text-center">
                         <h2 className="text-2xl font-bold text-white mb-2">Кто вы?</h2>
                         <button onClick={() => selectRole('client')} className="w-full p-4 border border-white/10 rounded-[16px] mb-2 hover:bg-white/5">Клиент</button>
                         <button onClick={() => selectRole('dealer')} className="w-full p-4 border border-white/10 rounded-[16px] hover:bg-white/5">Дилер</button>
                    </div>
                ) : (
                    <div className="relative z-10 flex flex-col items-center animate-fade-in text-center">
                         <h2 className="text-2xl font-bold text-white mb-2">Как будете заказывать?</h2>
                         <button onClick={() => selectSubRole('PL')} className="w-full p-4 border border-white/10 rounded-[16px] mb-2 hover:bg-white/5">Физ. лицо</button>
                         <button onClick={() => selectSubRole('KL')} className="w-full p-4 border border-white/10 rounded-[16px] hover:bg-white/5">Компания</button>
                    </div>
                )}
            </div>
        </div>
    );
};