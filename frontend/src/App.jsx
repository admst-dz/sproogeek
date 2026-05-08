import { useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { Experience } from './components/configurator/Experience'
import { Interface, ZoomControls } from './components/configurator/Interface'
import { Home } from './components/home/Home'
import { Order } from './components/order/Order'
import { DealerDashboard } from './components/dashboard/DealerDashboard'
import { ManufacturerDashboard } from './components/dashboard/ManufacturerDashboard'
import { AuthModal } from './components/auth/AuthModal'
import { ClientDashboard } from './components/dashboard/ClientDashboard'
import { useConfigurator } from './store'
import { t } from './i18n'
import { restoreSession } from './api'
import { ThermosInterface } from './components/thermos/ThermosInterface'
import { PowerbankInterface } from './components/powerbank/PowerbankInterface'
import { CookieBanner } from './components/shared/CookieBanner'
import { SceneLoadingOverlay } from './components/shared/VibeLoader'
import { AdminAuth } from './components/auth/AdminAuth'
import { AdminDashboard } from './components/admin/AdminDashboard'
import { SceneHints } from './components/shared/SceneHints'
import { ConfirmModal } from './components/shared/ConfirmModal'
import { UndoRedoControls } from './components/shared/UndoRedoControls'
import { useUndoRedoHotkeys, useTemporalConfigurator } from './hooks/useTemporalConfigurator'
import { CommandPalette } from './components/shared/CommandPalette'

const SCREEN_TO_PATH = {
    home: '/',
    configurator: '/configurator',
    order: '/order',
    dealer: '/dealer',
    client_dashboard: '/dashboard',
    admin_auth: '/borodazaebal',
    admin_dashboard: '/admin',
};

const PATH_TO_SCREEN = Object.fromEntries(
    Object.entries(SCREEN_TO_PATH).map(([k, v]) => [v, k])
);

const TAB_TO_PATH = {
    catalog: '/dashboard/catalog',
    cart: '/dashboard/cart',
    orders: '/dashboard/orders',
};

const PATH_TO_TAB = {
    '/dashboard/catalog': 'catalog',
    '/dashboard/cart': 'cart',
    '/dashboard/orders': 'orders',
};

function getInitialState() {
    const path = window.location.pathname;
    if (path.startsWith('/dashboard/')) {
        return { screen: 'client_dashboard', tab: PATH_TO_TAB[path] ?? null };
    }
    return { screen: PATH_TO_SCREEN[path] ?? 'home', tab: null };
}

function App() {

    const urlParams = new URLSearchParams(window.location.search);
    const isRenderMode = urlParams.get('render_mode') === 'true';

    const { applyRenderConfig /* ... остальное ... */ } = useConfigurator();

    useEffect(() => {
        if (isRenderMode) {
            const configBase64 = urlParams.get('config');
            if (configBase64) {
                try {
                    const config = JSON.parse(decodeURIComponent(escape(atob(configBase64))));
                    applyRenderConfig(config);
                } catch (e) {
                    console.error("Failed to parse render config", e);
                }
            }
        }
    }, [isRenderMode, applyRenderConfig]);

    if (isRenderMode) {
        return (
            <div className="w-[1024px] h-[1024px] bg-[#E5E5E5] flex items-center justify-center">
                <Canvas
                    shadows
                    dpr={[1, 2]}
                    camera={{ position: [0, 0, 4.5], fov: 45 }}
                    gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false, powerPreference: 'high-performance' }}
                >
                    <Experience />
                </Canvas>
            </div>
        );
    }


    const [screen, setScreen] = useState(() => getInitialState().screen);
    const [showAuth, setShowAuth] = useState(false);
    const [pendingSuccessToast, setPendingSuccessToast] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState(null);

    const configuratorCanvasRef = useRef(null);

    const {
        activeProduct,
        setCurrentUser,
        setUserRole,
        setClientSubRole,
        setAuthLoading,
        currentUser,
        userRole,
        authLoading,
        logout,
        theme,
        zoomLevel,
        setZoom,
        cartItem,
        cartRestoredFromCookie,
        clearCart,
        resetConfigurator,
        language,
    } = useConfigurator();

    const isConfiguratorScreen = screen === 'configurator';
    useUndoRedoHotkeys(isConfiguratorScreen);
    const pastLen = useTemporalConfigurator((s) => s.pastStates.length);
    const isDirty = isConfiguratorScreen && pastLen > 0;

    const guardedNavigate = (target) => {
        if (isDirty) {
            setPendingNavigation(target);
        } else {
            setScreen(target);
        }
    };
    const confirmDiscardAndNavigate = () => {
        if (pendingNavigation) {
            try { useConfigurator.temporal.getState().clear(); } catch { /* noop */ }
            setScreen(pendingNavigation);
            setPendingNavigation(null);
        }
    };

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [theme]);

    useEffect(() => {
        const path = SCREEN_TO_PATH[screen];
        if (path && window.location.pathname !== path) {
            window.history.pushState({}, '', path);
        }
    }, [screen]);

    // --- ЛОГИКА: ПРОВЕРКА РОЛИ И РОУТИНГ ---
    useEffect(() => {
        if (['admin', 'owner'].includes(userRole)) {
            setScreen('admin_dashboard');
        } else if (userRole === 'dealer') {
            setScreen('dealer');
        } else if (userRole === 'manufacturer') {
            setScreen('manufacturer');
        } else if (userRole === 'client') {
            setScreen('client_dashboard');
        } else if (!userRole && ['dealer', 'manufacturer', 'client_dashboard', 'admin_dashboard'].includes(screen)) {
            setScreen('home');
        }
    }, [userRole, screen]);

    // ... остальной код (без изменений с прошлого рабочего варианта)

    // --- ЛОГИКА: ВОССТАНОВЛЕНИЕ СЕССИИ ПО JWT ---
    useEffect(() => {
        setAuthLoading(true);
        restoreSession().then((user) => {
            if (user) {
                setCurrentUser(user);
                setUserRole(user.role);
                if (user.sub_role) setClientSubRole(user.sub_role);
            }
        }).finally(() => setAuthLoading(false));
    }, [setCurrentUser, setUserRole, setClientSubRole, setAuthLoading]);

    const handleContinueOrder = () => {
        if (currentUser) {
            setScreen('client_dashboard');
        } else {
            setShowAuth(true);
        }
    };

    return (
        <>
            <CookieBanner />

            <CommandPalette
                navigate={guardedNavigate}
                screen={screen}
                openAuth={() => setShowAuth(true)}
            />

            <ConfirmModal
                open={!!pendingNavigation}
                title={t(language, 'leaveConfirmTitle')}
                message={t(language, 'leaveConfirmMsg')}
                confirmLabel={t(language, 'confirmLeaveBtn')}
                cancelLabel={t(language, 'stayBtn')}
                onConfirm={confirmDiscardAndNavigate}
                onCancel={() => setPendingNavigation(null)}
            />

            {/* --- МОДАЛЬНОЕ ОКНО АВТОРИЗАЦИИ --- */}
            {showAuth && (
                <AuthModal
                    onClose={() => setShowAuth(false)}
                    onRoleCreated={(user, role, subRole) => {
                        setCurrentUser(user);
                        setUserRole(role);
                        if (subRole) setClientSubRole(subRole);
                    }}
                />
            )}

            {/* --- БАННЕР: НЕЗАВЕРШЁННЫЙ ЗАКАЗ --- */}
            {cartRestoredFromCookie && screen === 'home' && (
                <div className="fixed bottom-6 left-6 z-50 max-w-xs w-[calc(100vw-3rem)] sm:w-80 bg-[#1A2642] border border-white/15 rounded-[20px] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-fade-in">
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-9 h-9 rounded-[12px] bg-white/8 border border-white/10 flex items-center justify-center shrink-0 text-base">
                            📦
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-white text-sm leading-tight mb-1">{t(language, 'cartRestoredTitle')}</p>
                            <p className="text-gray-400 text-xs truncate">{cartItem?.productName}</p>
                            {cartItem?.design && (
                                <p className="text-gray-600 text-[11px] truncate mt-0.5">{cartItem.design}</p>
                            )}
                        </div>
                        <button
                            onClick={clearCart}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
                            aria-label={t(language, 'cartDeleteBtn')}
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleContinueOrder}
                            className="flex-1 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-[12px] hover:bg-gray-100 active:scale-[0.98] transition-all"
                        >
                            {t(language, 'cartContinueBtn')}
                        </button>
                        <button
                            onClick={clearCart}
                            className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-gray-400 text-xs font-bold rounded-[12px] transition-all"
                        >
                            {t(language, 'cartDeleteBtn')}
                        </button>
                    </div>
                </div>
            )}


            {/* --- ЭКРАН: ГЛАВНАЯ СТРАНИЦА --- */}
            {screen === 'home' && (
                <Home
                    onStart={() => setScreen('configurator')}
                    onAuth={() => setShowAuth(true)}
                    user={currentUser}
                    logout={logout}
                />
            )}


            {/* --- ЭКРАН: КОРЗИНА ГОСТЯ --- */}
            {/* Доступно только для незарегистрированных пользователей */}
            {screen === 'order' && (
                <Order
                    onBack={() => setScreen('configurator')}
                    onSuccess={() => {
                        setPendingSuccessToast(true);
                        setShowAuth(true);
                    }}
                />
            )}


            {/* --- ЭКРАН: КАБИНЕТ ДИЛЕРА --- */}
            {screen === 'dealer' && (
                <DealerDashboard onBack={() => setScreen('home')} />
            )}


            {/* --- ЭКРАН: КАБИНЕТ ПРОИЗВОДСТВА --- */}
            {screen === 'manufacturer' && (
                <ManufacturerDashboard onBack={() => setScreen('home')} />
            )}


            {/* --- ЭКРАН: УМНЫЙ ДАШБОРД КЛИЕНТА (ПЛ, ПКЛ, КЛ) --- */}
            {screen === 'client_dashboard' && (
                <ClientDashboard
                    onBack={() => setScreen('home')}
                    onEdit={() => setScreen('configurator')}
                    showSuccessToast={pendingSuccessToast}
                    onSuccessToastShown={() => setPendingSuccessToast(false)}
                />
            )}


            {/* --- ЭКРАН: 3D КОНСТРУКТОР --- */}
            {screen === 'configurator' && (
                <div className="app-bg fixed inset-0 w-full h-full overflow-hidden font-sans flex flex-col md:block transition-colors duration-300">

                    <button
                        onClick={() => guardedNavigate(currentUser ? (userRole === 'dealer' ? 'dealer' : 'client_dashboard') : 'home')}
                        className="absolute top-6 left-6 z-50 px-6 py-2 bg-white/80 dark:bg-white/5 backdrop-blur-md rounded-full shadow-lg dark:shadow-none text-sm font-bold text-black dark:text-white hover:bg-white dark:hover:bg-white/10 font-zen active:scale-95 transition-all border border-black/10 dark:border-white/10"
                    >
                        {currentUser ? t(language, 'backToCabinet') : t(language, 'backToMenu')}
                    </button>

                    <ConfiguratorToolbar
                        onReset={() => resetConfigurator(activeProduct)}
                        productLabel={t(language, activeProduct) || activeProduct}
                        language={language}
                    />

                    {activeProduct === 'calendar' ? (
                        <div className="app-bg w-full h-full flex flex-col items-center justify-center font-zen select-none transition-colors duration-300">
                            <h1 className="text-4xl md:text-8xl font-black tracking-[0.1em] uppercase text-center px-4 text-[#cfcfcf] dark:text-white/10"
                                style={{ textShadow: '2px 2px 0px rgba(255,255,255,0.5), -1px -1px 0px rgba(0,0,0,0.1)' }}
                            >
                                {t(language, 'inDevHeading')}
                            </h1>
                            <p className="mt-8 font-bold uppercase tracking-[0.2em] text-xs md:text-sm text-center text-black/60 dark:text-white/30">
                                {t(language, 'calendarComingSoon')}
                            </p>
                        </div>
                    ) : (
                        <>
                            <div ref={configuratorCanvasRef} className="app-bg relative w-full h-[45%] md:absolute md:top-0 md:left-0 md:bottom-0 md:w-[70%] md:h-full md:bg-transparent dark:md:bg-transparent">
                                <div className="absolute bottom-4 right-4 z-10 md:hidden">
                                    <ZoomControls zoomLevel={zoomLevel} setZoom={setZoom} />
                                </div>
                                <Canvas
                                    shadows
                                    dpr={[1, 2]} // Адаптация под ретину (Safari/iPhone)
                                    camera={{ position: [0, 0, 4.5], fov: 45 }}
                                    gl={{
                                        antialias: true,
                                        preserveDrawingBuffer: true,
                                        alpha: true, // прозрачный canvas — палитра-градиент подложки видна
                                        powerPreference: 'high-performance',
                                        logarithmicDepthBuffer: true // Важно для устранения z-fighting в Safari
                                    }}
                                >
                                    <Experience />
                                </Canvas>
                                <SceneLoadingOverlay label={t(language, 'sceneLoading')} />
                                <SceneHints containerRef={configuratorCanvasRef} />
                            </div>

                            <div className="relative h-[55%] w-full z-10 md:absolute md:top-0 md:right-0 md:h-full md:w-[30%] pointer-events-none md:p-4 md:flex md:flex-col md:justify-center">
                                {activeProduct === 'thermos' ? (
                                    <ThermosInterface
                                        onFinish={() => {
                                            if (currentUser) {
                                                setScreen('client_dashboard');
                                            } else {
                                                setShowAuth(true);
                                            }
                                        }}
                                    />
                                ) : activeProduct === 'powerbank' ? (
                                    <PowerbankInterface
                                        onFinish={() => {
                                            if (currentUser) {
                                                setScreen('client_dashboard');
                                            } else {
                                                setShowAuth(true);
                                            }
                                        }}
                                    />
                                ) : (
                                    <Interface
                                        onFinish={() => {
                                            if (currentUser) {
                                                setScreen('client_dashboard');
                                            } else {
                                                setShowAuth(true);
                                            }
                                        }}
                                        onAuth={() => setShowAuth(true)}
                                        user={currentUser}
                                        logout={logout}
                                    />
                                )}
                            </div>
                        </>
                    )}

                </div>
            )}

            {screen === 'admin_auth' && (
                <AdminAuth onSuccess={(user) => {
                    setCurrentUser(user);
                    setUserRole(user.role);
                }} />
            )}

            {screen === 'admin_dashboard' && (
                <AdminDashboard onLogout={() => {
                    logout();
                    setScreen('home');
                }} />
            )}
        </>
    )
}

export default App

function ConfiguratorToolbar({ onReset, productLabel, language = 'ru' }) {
    const [confirmReset, setConfirmReset] = useState(false);
    return (
        <>
            <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
                <UndoRedoControls />
                <button
                    onClick={() => setConfirmReset(true)}
                    title={t(language, 'resetConfigTitle')}
                    className="h-[42px] px-4 flex items-center gap-2 bg-white/80 dark:bg-white/5 backdrop-blur-md rounded-[9px] border border-black/10 dark:border-white/10 shadow-xl text-[#1a1a1a] dark:text-white text-xs font-bold uppercase tracking-widest hover:bg-white dark:hover:bg-white/10 active:scale-95 transition-all"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 12a9 9 0 1 0 3-6.7" />
                        <polyline points="3 4 3 9 8 9" />
                    </svg>
                    <span className="hidden sm:inline">{t(language, 'resetBtn')}</span>
                </button>
            </div>
            <ConfirmModal
                open={confirmReset}
                title={`${t(language, 'resetBtn')} «${productLabel}»?`}
                message={t(language, 'resetConfirmMsg')}
                confirmLabel={t(language, 'resetBtn')}
                cancelLabel={t(language, 'keepBtn')}
                danger
                onConfirm={() => { onReset(); setConfirmReset(false); }}
                onCancel={() => setConfirmReset(false)}
            />
        </>
    );
}
