import { useEffect, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
    getVkAuthorizeUrl,
    getYandexAuthorizeUrl,
    loginUser,
    loginWithGoogleCode,
    loginWithVkCode,
    loginWithYandexCode,
    registerUser,
    updateUserRole,
} from '../../api';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';

const DEALER_ACCOUNT_TYPE = 'TP';
const YANDEX_STATE_KEY = 'spruzhuk_yandex_oauth_state';
const VK_STATE_KEY = 'spruzhuk_vk_oauth_state';

const YandexIcon = () => (
    <span className="w-[22px] h-[22px] rounded-[7px] bg-[#FC3F1D] flex items-center justify-center text-white font-black text-[15px] leading-none shadow-[0_6px_18px_rgba(252,63,29,0.3)]">
        Я
    </span>
);

const VkIcon = () => (
    <span className="w-[22px] h-[22px] rounded-[7px] bg-[#0077FF] flex items-center justify-center text-white font-black text-[13px] leading-none shadow-[0_6px_18px_rgba(0,119,255,0.32)]">
        VK
    </span>
);

const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
);

const makeOauthState = () => {
    if (window.crypto?.getRandomValues) {
        const bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const AuthModal = ({ onClose, onRoleCreated }) => {
    const { language } = useConfigurator();
    const [step, setStep] = useState(1);
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [pendingRole, setPendingRole] = useState(null);
    const [socialUser, setSocialUser] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const yandexPopupRef = useRef(null);
    const yandexPopupTimerRef = useRef(null);
    const yandexDoneRef = useRef(false);
    const vkPopupRef = useRef(null);
    const vkPopupTimerRef = useRef(null);
    const vkDoneRef = useRef(false);

    const completeSocialLogin = (data) => {
        if (data.needs_role_setup) {
            setSocialUser(data.user);
            setLoading(false);
            setStep(2);
        } else {
            onRoleCreated?.(data.user, data.user.role, data.user.sub_role || null);
            onClose();
        }
    };

    useEffect(() => {
        const handleYandexMessage = async (event) => {
            if (event.origin !== window.location.origin) return;
            const payload = event.data || {};
            if (payload.type !== 'spruzhuk:yandex-oauth') return;

            console.log('[Yandex] 5. Message received from popup:', payload);

            yandexDoneRef.current = true;
            window.clearInterval(yandexPopupTimerRef.current);
            yandexPopupRef.current?.close?.();

            const expectedState = sessionStorage.getItem(YANDEX_STATE_KEY);
            sessionStorage.removeItem(YANDEX_STATE_KEY);

            if (!expectedState || payload.state !== expectedState) {
                console.error('[Yandex] 6. State mismatch', { expected: expectedState, got: payload.state });
                setError(t(language, 'authErrYandex'));
                setLoading(false);
                return;
            }
            if (payload.error || !payload.code) {
                console.error('[Yandex] 6. Payload error or missing code', { error: payload.error, code: payload.code });
                setError(t(language, 'authErrYandexClosed'));
                setLoading(false);
                return;
            }

            console.log('[Yandex] 6. State OK, code received — exchanging with backend...');
            setError(null);
            setLoading(true);
            try {
                const redirectUri = `${window.location.origin}/auth/yandex/callback`;
                const data = await loginWithYandexCode(payload.code, redirectUri);
                console.log('[Yandex] 7. Backend exchange success:', data);
                completeSocialLogin(data);
            } catch (err) {
                console.error('[Yandex] 7. Backend exchange failed:', err?.response?.data ?? err);
                setError(t(language, 'authErrYandex'));
                setLoading(false);
            }
        };

        window.addEventListener('message', handleYandexMessage);
        return () => {
            window.removeEventListener('message', handleYandexMessage);
            window.clearInterval(yandexPopupTimerRef.current);
        };
    }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const handleVkMessage = async (event) => {
            if (event.origin !== window.location.origin) return;
            const payload = event.data || {};
            if (payload.type !== 'spruzhuk:vk-oauth') return;

            vkDoneRef.current = true;
            window.clearInterval(vkPopupTimerRef.current);
            vkPopupRef.current?.close?.();

            const expectedState = sessionStorage.getItem(VK_STATE_KEY);
            sessionStorage.removeItem(VK_STATE_KEY);

            if (!expectedState || payload.state !== expectedState) {
                setError(t(language, 'authErrVk'));
                setLoading(false);
                return;
            }
            if (payload.error || !payload.code) {
                setError(t(language, 'authErrVkClosed'));
                setLoading(false);
                return;
            }

            setError(null);
            setLoading(true);
            try {
                const redirectUri = `${window.location.origin}/auth/vk/callback`;
                const data = await loginWithVkCode(payload.code, redirectUri);
                completeSocialLogin(data);
            } catch (err) {
                console.error('[VK] Backend exchange failed:', err?.response?.data ?? err);
                setError(t(language, 'authErrVk'));
                setLoading(false);
            }
        };

        window.addEventListener('message', handleVkMessage);
        return () => {
            window.removeEventListener('message', handleVkMessage);
            window.clearInterval(vkPopupTimerRef.current);
        };
    }, [language]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            if (isRegistering) {
                if (password.length < 8) {
                    setError(t(language, 'authErrPassLength'));
                    setLoading(false);
                    return;
                }
                if (!/\d/.test(password)) {
                    setError(t(language, 'authErrPassDigit'));
                    setLoading(false);
                    return;
                }
                if (!/[a-zA-Z]/.test(password)) {
                    setError(t(language, 'authErrPassLetters'));
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
            setError(msg === 'Неверный Email или пароль' ? t(language, 'authErrWrongCreds') : t(language, 'authErrGeneric'));
            setLoading(false);
        }
    };

    const googleLogin = useGoogleLogin({
        flow: 'auth-code',
        onSuccess: async (codeResponse) => {
            setError(null);
            setLoading(true);
            try {
                const data = await loginWithGoogleCode(codeResponse.code);
                completeSocialLogin(data);
            } catch (err) {
                console.error("Google Auth Backend Error:", err);
                setError(t(language, 'authErrGoogle'));
                setLoading(false);
            }
        },
        onError: () => {
            setError(t(language, 'authErrGoogleClosed'));
            setLoading(false);
        },
    });

    const yandexLogin = async () => {
        setError(null);
        setLoading(true);
        yandexDoneRef.current = false;

        const state = makeOauthState();
        const redirectUri = `${window.location.origin}/auth/yandex/callback`;
        sessionStorage.setItem(YANDEX_STATE_KEY, state);
        console.log('[Yandex] 1. Login started', { redirectUri, state });

        // Open synchronously — browsers block window.open() called after await
        // (gesture context is lost after any async suspension).
        const popup = window.open(
            'about:blank',
            'spruzhuk_yandex_oauth',
            'width=520,height=680,menubar=no,toolbar=no,location=no,status=no'
        );
        if (!popup) {
            console.error('[Yandex] 2. Popup blocked by browser (window.open returned null)');
            sessionStorage.removeItem(YANDEX_STATE_KEY);
            setError(t(language, 'authErrYandexClosed'));
            setLoading(false);
            return;
        }
        console.log('[Yandex] 2. Popup opened');

        yandexPopupRef.current = popup;

        try {
            console.log('[Yandex] 3. Fetching authorize URL from backend...');
            const authorizeUrl = await getYandexAuthorizeUrl(redirectUri, state);
            console.log('[Yandex] 4. Got authorize URL, navigating popup:', authorizeUrl);
            popup.location.href = authorizeUrl;

            yandexPopupTimerRef.current = window.setInterval(() => {
                if (popup.closed) {
                    window.clearInterval(yandexPopupTimerRef.current);
                    if (!yandexDoneRef.current) {
                        console.warn('[Yandex] Interval: popup was closed before message received');
                        sessionStorage.removeItem(YANDEX_STATE_KEY);
                        setError(t(language, 'authErrYandexClosed'));
                        setLoading(false);
                    } else {
                        console.log('[Yandex] Interval: popup closed, message already handled — OK');
                    }
                }
            }, 500);
        } catch (err) {
            console.error('[Yandex] 3. Failed to fetch authorize URL:', err);
            popup.close();
            sessionStorage.removeItem(YANDEX_STATE_KEY);
            setError(t(language, 'authErrYandex'));
            setLoading(false);
        }
    };

    const vkLogin = async () => {
        setError(null);
        setLoading(true);
        vkDoneRef.current = false;

        const state = makeOauthState();
        const redirectUri = `${window.location.origin}/auth/vk/callback`;
        sessionStorage.setItem(VK_STATE_KEY, state);

        const popup = window.open(
            'about:blank',
            'spruzhuk_vk_oauth',
            'width=520,height=680,menubar=no,toolbar=no,location=no,status=no'
        );
        if (!popup) {
            sessionStorage.removeItem(VK_STATE_KEY);
            setError(t(language, 'authErrVkClosed'));
            setLoading(false);
            return;
        }

        vkPopupRef.current = popup;

        try {
            const authorizeUrl = await getVkAuthorizeUrl(redirectUri, state);
            popup.location.href = authorizeUrl;

            vkPopupTimerRef.current = window.setInterval(() => {
                if (popup.closed) {
                    window.clearInterval(vkPopupTimerRef.current);
                    if (!vkDoneRef.current) {
                        sessionStorage.removeItem(VK_STATE_KEY);
                        setError(t(language, 'authErrVkClosed'));
                        setLoading(false);
                    }
                }
            }, 500);
        } catch (err) {
            console.error('[VK] Failed to fetch authorize URL:', err);
            popup.close();
            sessionStorage.removeItem(VK_STATE_KEY);
            setError(t(language, 'authErrVk'));
            setLoading(false);
        }
    };

    const selectRole = (role) => {
        if (role === 'dealer') {
            finishRegistration(role, DEALER_ACCOUNT_TYPE);
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
            if (msg === 'Email уже зарегистрирован') setError(t(language, 'authErrEmailExists'));
            else if (msg) setError(msg);
            else setError(t(language, 'authErrRegister'));
            setStep(1);
            setSocialUser(null);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0B0F19]/80 backdrop-blur-xl p-4 font-sans text-white">
            <button onClick={onClose} className="absolute top-6 left-6 flex items-center gap-2 px-5 py-2 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors rounded-full backdrop-blur-md text-sm font-bold text-gray-300">
                {t(language, 'authBack')}
            </button>

            <div className="bg-[#1A1F2E]/60 backdrop-blur-2xl rounded-[32px] border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)] w-full max-w-md p-8 md:p-10 relative animate-fade-in overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-32 bg-white/5 blur-[50px] rounded-full pointer-events-none"></div>

                {step === 1 ? (
                    <div className="relative z-10 flex flex-col items-center">
                        <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 tracking-tight">
                            {isRegistering ? t(language, 'authCreateAccount') : t(language, 'authWelcomeBack')}
                        </h2>

                        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4 mt-6">
                            {isRegistering && (
                                <input type="text" placeholder={t(language, 'authYourName')} value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full py-4 pl-4 pr-4 bg-black/20 border border-white/10 rounded-[16px] text-white text-sm focus:outline-none focus:border-white/30 focus:bg-black/40" />
                            )}
                            <input type="email" placeholder="email@example.com" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full py-4 pl-4 pr-4 bg-black/20 border border-white/10 rounded-[16px] text-white text-sm focus:outline-none focus:border-white/30 focus:bg-black/40" />
                            <input type="password" placeholder={t(language, 'authPassword')} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full py-4 pl-4 pr-4 bg-black/20 border border-white/10 rounded-[16px] text-white text-sm focus:outline-none focus:border-white/30 focus:bg-black/40" />
                            {error && <p className="text-rose-400 text-xs font-bold text-center mt-1">{error}</p>}
                            <button type="submit" disabled={loading} className={`w-full py-4 mt-2 bg-white text-black rounded-[16px] font-bold text-sm ${loading ? 'opacity-50' : ''}`}>
                                {loading ? t(language, 'authLoading') : (isRegistering ? t(language, 'authContinue') : t(language, 'authSignIn'))}
                            </button>
                        </form>

                        <div className="flex items-center gap-4 w-full my-6">
                            <div className="h-[1px] bg-white/10 flex-1"></div>
                            <span className="text-gray-500 text-[10px] uppercase tracking-widest">{t(language, 'authOr')}</span>
                            <div className="h-[1px] bg-white/10 flex-1"></div>
                        </div>

                        <div className="w-full grid gap-3">
                            <button
                                onClick={vkLogin}
                                disabled={loading}
                                className="w-full py-3.5 bg-[#0077FF] text-white border border-[#0077FF] rounded-[16px] font-bold text-sm flex items-center justify-center gap-3 hover:bg-[#0b6fe5] transition-all active:scale-95 disabled:opacity-50 shadow-[0_16px_36px_rgba(0,119,255,0.25)]"
                            >
                                <VkIcon />
                                {t(language, 'authVkBtn')}
                            </button>

                            <button
                                onClick={yandexLogin}
                                disabled={loading}
                                className="w-full py-3.5 bg-white text-[#111827] border border-white rounded-[16px] font-bold text-sm flex items-center justify-center gap-3 hover:bg-[#f7f7f7] transition-all active:scale-95 disabled:opacity-50 shadow-[0_16px_36px_rgba(0,0,0,0.18)]"
                            >
                                <YandexIcon />
                                {t(language, 'authYandexBtn')}
                            </button>

                            <button
                                onClick={() => googleLogin()}
                                disabled={loading}
                                className="w-full py-3 bg-black/20 border border-white/10 rounded-[16px] font-bold text-sm flex items-center justify-center gap-3 hover:bg-white/5 transition-all text-white active:scale-95 disabled:opacity-50"
                            >
                                <GoogleIcon />
                                {t(language, 'authGoogleBtn')}
                            </button>
                        </div>

                        <div className="mt-6 text-center">
                            <button onClick={() => { setIsRegistering(!isRegistering); setError(null); }} className="text-[11px] text-gray-400 hover:text-white transition-colors">
                                {isRegistering ? `${t(language, 'authHaveAccount')} ` : `${t(language, 'authNoAccount')} `}
                                <span className="font-bold text-white">{isRegistering ? t(language, 'authSignIn') : t(language, 'authRegisterLink')}</span>
                            </button>
                        </div>
                    </div>
                ) : step === 2 ? (
                    <div className="relative z-10 flex flex-col items-center animate-fade-in text-center">
                         <h2 className="text-2xl font-bold text-white mb-2">{t(language, 'authWhoAreYou')}</h2>
                         <button onClick={() => selectRole('client')} className="w-full p-4 border border-white/10 rounded-[16px] mb-2 hover:bg-white/5">{t(language, 'authClient')}</button>
                         <button onClick={() => selectRole('dealer')} className="w-full p-4 border border-white/10 rounded-[16px] hover:bg-white/5">{t(language, 'authDealer')}</button>
                    </div>
                ) : (
                    <div className="relative z-10 flex flex-col items-center animate-fade-in text-center">
                         <h2 className="text-2xl font-bold text-white mb-2">{t(language, 'authHowOrder')}</h2>
                         <button onClick={() => selectSubRole('PL')} className="w-full p-4 border border-white/10 rounded-[16px] mb-2 hover:bg-white/5">{t(language, 'authIndividual')}</button>
                         <button onClick={() => selectSubRole('KL')} className="w-full p-4 border border-white/10 rounded-[16px] hover:bg-white/5">{t(language, 'authCompany')}</button>
                    </div>
                )}
            </div>
        </div>
    );
};
