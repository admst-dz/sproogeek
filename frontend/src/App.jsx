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
import { ALL_PRODUCT_DEFAULTS, useConfigurator } from './store'
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
import { useUndoRedoHotkeys } from './hooks/useTemporalConfigurator'
import { CommandPalette } from './components/shared/CommandPalette'
import { CookiePolicy } from './components/shared/CookiePolicy'

const SCREEN_TO_PATH = {
    home: '/',
    configurator: '/configurator',
    order: '/order',
    dealer: '/dealer',
    client_dashboard: '/dashboard',
    cookie_policy: '/cookie-policy',
    admin_auth: '/borodazaebal',
    admin_stub: '/admin',
    admin_dashboard: '/borodaadmin',
};

const CONFIGURATOR_PRODUCTS = new Set(['notebook', 'calendar', 'thermos', 'powerbank']);

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

const DEALER_TAB_TO_PATH = {
    products: '/dealer/products',
    orders: '/dealer/orders',
    clients: '/dealer/clients',
    orderTypes: '/dealer/order-types',
};

const PATH_TO_DEALER_TAB = {
    '/dealer/products': 'products',
    '/dealer/orders': 'orders',
    '/dealer/clients': 'clients',
    '/dealer/order-types': 'orderTypes',
};

const MANUFACTURER_TAB_TO_PATH = {
    queue: '/manufacturer/queue',
    materials: '/manufacturer/materials',
    history: '/manufacturer/history',
};

const PATH_TO_MANUFACTURER_TAB = {
    '/manufacturer/queue': 'queue',
    '/manufacturer/materials': 'materials',
    '/manufacturer/history': 'history',
};

const METRIKA_COUNTER_ID = 109128387;
const CONFIGURATOR_DRAFT_KEY = 'spruzhuk_configurator_draft';
const CONFIGURATOR_DRAFT_FIELDS = ['activeProduct', 'zoomLevel', ...Object.keys(ALL_PRODUCT_DEFAULTS)];

function sendMetrikaHit(url = window.location.href) {
    if (typeof window === 'undefined' || typeof window.ym !== 'function') return;
    window.ym(METRIKA_COUNTER_ID, 'hit', url, {
        referrer: document.referrer,
        title: document.title,
    });
}

function getInitialState() {
    const path = window.location.pathname;
    if (path.startsWith('/order/')) {
        const product = path.split('/').filter(Boolean)[1];
        const activeProduct = CONFIGURATOR_PRODUCTS.has(product) ? product : 'notebook';
        useConfigurator.getState().setProduct(activeProduct);
        return { screen: 'order', clientTab: null, dealerTab: null, manufacturerTab: null };
    }
    if (path === '/order') {
        return { screen: 'order', clientTab: null, dealerTab: null, manufacturerTab: null };
    }
    if (path.startsWith('/configurator/')) {
        const product = path.split('/').filter(Boolean)[1];
        const activeProduct = CONFIGURATOR_PRODUCTS.has(product) ? product : 'notebook';
        useConfigurator.getState().setProduct(activeProduct);
        return { screen: 'configurator', clientTab: null, dealerTab: null, manufacturerTab: null };
    }
    if (path === '/configurator') {
        return { screen: 'configurator', clientTab: null, dealerTab: null, manufacturerTab: null };
    }
    if (path.startsWith('/dashboard/')) {
        return { screen: 'client_dashboard', clientTab: PATH_TO_TAB[path] ?? null, dealerTab: null, manufacturerTab: null };
    }
    if (path.startsWith('/dealer/')) {
        return { screen: 'dealer', clientTab: null, dealerTab: PATH_TO_DEALER_TAB[path] ?? null, manufacturerTab: null };
    }
    if (path.startsWith('/manufacturer/')) {
        return { screen: 'manufacturer', clientTab: null, dealerTab: null, manufacturerTab: PATH_TO_MANUFACTURER_TAB[path] ?? null };
    }
    return { screen: PATH_TO_SCREEN[path] ?? 'home', clientTab: null, dealerTab: null, manufacturerTab: null };
}

function getPathForScreen(screen, activeProduct, clientTab, dealerTab, manufacturerTab) {
    if (screen === 'configurator') {
        const product = CONFIGURATOR_PRODUCTS.has(activeProduct) ? activeProduct : 'notebook';
        return `/configurator/${product}`;
    }
    if (screen === 'order') {
        const product = CONFIGURATOR_PRODUCTS.has(activeProduct) ? activeProduct : 'notebook';
        return `/order/${product}`;
    }
    if (screen === 'client_dashboard') {
        return TAB_TO_PATH[clientTab || 'orders'] || SCREEN_TO_PATH.client_dashboard;
    }
    if (screen === 'dealer') {
        return DEALER_TAB_TO_PATH[dealerTab || 'products'] || SCREEN_TO_PATH.dealer;
    }
    if (screen === 'manufacturer') {
        return MANUFACTURER_TAB_TO_PATH[manufacturerTab || 'queue'] || SCREEN_TO_PATH.manufacturer;
    }
    return SCREEN_TO_PATH[screen];
}

function pickConfiguratorDraft(state) {
    const draft = {};
    CONFIGURATOR_DRAFT_FIELDS.forEach((key) => {
        draft[key] = state[key];
    });
    return draft;
}

function readConfiguratorDraft() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(CONFIGURATOR_DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.state ? parsed : null;
    } catch {
        return null;
    }
}

function writeConfiguratorDraft(state) {
    if (typeof window === 'undefined') return null;
    const draft = {
        version: 1,
        updatedAt: Date.now(),
        state: pickConfiguratorDraft(state),
    };
    window.localStorage.setItem(CONFIGURATOR_DRAFT_KEY, JSON.stringify(draft));
    return draft;
}

function clearConfiguratorDraft() {
    if (typeof window !== 'undefined') {
        window.localStorage.removeItem(CONFIGURATOR_DRAFT_KEY);
    }
}

function RenderModeView({ configBase64 }) {
    const { applyRenderConfig } = useConfigurator();

    useEffect(() => {
        if (!configBase64) return;
        try {
            const config = JSON.parse(decodeURIComponent(escape(atob(configBase64))));
            applyRenderConfig(config);
        } catch (e) {
            console.error("Failed to parse render config", e);
        }
    }, [configBase64, applyRenderConfig]);

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

function App() {
    const urlParams = new URLSearchParams(window.location.search);
    const isRenderMode = urlParams.get('render_mode') === 'true';

    if (isRenderMode) {
        return <RenderModeView configBase64={urlParams.get('config')} />;
    }

    return <MainApp />;
}

function MainApp() {
    const initialStateRef = useRef(null);
    if (!initialStateRef.current) initialStateRef.current = getInitialState();

    const [screen, setScreen] = useState(() => initialStateRef.current.screen);
    const [clientTab, setClientTab] = useState(() => initialStateRef.current.clientTab);
    const [dealerTab, setDealerTab] = useState(() => initialStateRef.current.dealerTab);
    const [manufacturerTab, setManufacturerTab] = useState(() => initialStateRef.current.manufacturerTab);
    const [showAuth, setShowAuth] = useState(false);
    const [pendingSuccessToast, setPendingSuccessToast] = useState(false);
    const [configuratorDraft, setConfiguratorDraft] = useState(() => readConfiguratorDraft());

    const configuratorCanvasRef = useRef(null);
    const skipNextDraftSaveRef = useRef(false);
    const lastMetrikaUrlRef = useRef(typeof window !== 'undefined' ? window.location.href : '');

    const {
        activeProduct,
        setCurrentUser,
        setUserRole,
        setClientSubRole,
        setAuthLoading,
        currentUser,
        userRole,
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

    const guardedNavigate = (target) => {
        setScreen(target);
    };

    const syncConfiguratorDraftState = () => {
        setConfiguratorDraft(readConfiguratorDraft());
    };

    const restoreConfiguratorDraft = () => {
        const draft = readConfiguratorDraft();
        if (!draft?.state) return;
        useConfigurator.setState(draft.state);
        try { useConfigurator.temporal.getState().clear(); } catch { /* noop */ }
        setConfiguratorDraft(draft);
        setClientTab(null);
        setScreen('configurator');
    };

    const deleteConfiguratorDraft = () => {
        clearConfiguratorDraft();
        setConfiguratorDraft(null);
    };

    const completeConfiguratorFlow = () => {
        if (currentUser) {
            skipNextDraftSaveRef.current = true;
            clearConfiguratorDraft();
            setConfiguratorDraft(null);
            setClientTab('cart');
            setScreen('client_dashboard');
        } else {
            setShowAuth(true);
        }
    };

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [theme]);

    useEffect(() => {
        if (screen !== 'home') return undefined;
        const frame = window.requestAnimationFrame(syncConfiguratorDraftState);
        return () => window.cancelAnimationFrame(frame);
    }, [screen]);

    useEffect(() => {
        if (screen !== 'configurator') return undefined;

        let saveTimer = null;
        const saveDraft = () => {
            const draft = writeConfiguratorDraft(useConfigurator.getState());
            setConfiguratorDraft(draft);
        };
        const scheduleSave = () => {
            window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(saveDraft, 150);
        };

        saveDraft();
        const unsubscribe = useConfigurator.subscribe(scheduleSave);

        return () => {
            window.clearTimeout(saveTimer);
            if (skipNextDraftSaveRef.current) {
                skipNextDraftSaveRef.current = false;
            } else {
                saveDraft();
            }
            unsubscribe();
        };
    }, [screen]);

    useEffect(() => {
        const path = getPathForScreen(screen, activeProduct, clientTab, dealerTab, manufacturerTab);
        if (path && window.location.pathname !== path) {
            window.history.pushState({}, '', path);
            const nextUrl = window.location.href;
            if (lastMetrikaUrlRef.current !== nextUrl) {
                sendMetrikaHit(nextUrl);
                lastMetrikaUrlRef.current = nextUrl;
            }
        }
    }, [activeProduct, clientTab, dealerTab, manufacturerTab, screen]);

    useEffect(() => {
        const handlePopState = () => {
            const next = getInitialState();
            setScreen(next.screen);
            setClientTab(next.clientTab);
            setDealerTab(next.dealerTab);
            setManufacturerTab(next.manufacturerTab);
            window.requestAnimationFrame(() => {
                const nextUrl = window.location.href;
                if (lastMetrikaUrlRef.current !== nextUrl) {
                    sendMetrikaHit(nextUrl);
                    lastMetrikaUrlRef.current = nextUrl;
                }
            });
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // --- ЛОГИКА: ПРОВЕРКА РОЛИ И РОУТИНГ ---
    useEffect(() => {
        if (screen === 'cookie_policy' || screen === 'admin_stub') return undefined;

        let targetScreen = null;
        if (['admin', 'owner'].includes(userRole)) {
            targetScreen = 'admin_dashboard';
        } else if (userRole === 'dealer') {
            targetScreen = 'dealer';
        } else if (userRole === 'manufacturer') {
            targetScreen = 'manufacturer';
        } else if (userRole === 'client' && screen !== 'configurator') {
            targetScreen = 'client_dashboard';
        } else if (!userRole && ['dealer', 'manufacturer', 'client_dashboard', 'admin_dashboard'].includes(screen)) {
            targetScreen = 'home';
        }

        if (!targetScreen || targetScreen === screen) return undefined;
        const frame = window.requestAnimationFrame(() => setScreen(targetScreen));
        return () => window.cancelAnimationFrame(frame);
    }, [userRole, screen]);

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
            setClientTab('cart');
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

            {configuratorDraft && screen === 'home' && (
                <div className={`fixed ${cartRestoredFromCookie ? 'bottom-[11.5rem]' : 'bottom-6'} left-6 z-50 max-w-xs w-[calc(100vw-3rem)] sm:w-80 bg-[#142235] border border-white/15 rounded-[20px] p-5 shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl animate-fade-in`}>
                    <div className="flex items-start gap-3 mb-4">
                        <div className="w-9 h-9 rounded-[12px] bg-white/8 border border-white/10 flex items-center justify-center shrink-0">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                            </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-white text-sm leading-tight mb-1">У вас осталась незавершенная модель</p>
                            <p className="text-gray-400 text-xs truncate">{t(language, configuratorDraft.state.activeProduct) || configuratorDraft.state.activeProduct}</p>
                        </div>
                        <button
                            onClick={deleteConfiguratorDraft}
                            className="w-6 h-6 flex items-center justify-center text-gray-600 hover:text-gray-300 transition-colors shrink-0 mt-0.5"
                            aria-label="Удалить черновик"
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={restoreConfiguratorDraft}
                            className="flex-1 py-2.5 bg-white text-black text-xs font-bold uppercase tracking-widest rounded-[12px] hover:bg-gray-100 active:scale-[0.98] transition-all"
                        >
                            Продолжить
                        </button>
                        <button
                            onClick={deleteConfiguratorDraft}
                            className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-gray-400 text-xs font-bold rounded-[12px] transition-all"
                        >
                            Удалить
                        </button>
                    </div>
                </div>
            )}


            {/* --- ЭКРАН: ГЛАВНАЯ СТРАНИЦА --- */}
            {screen === 'home' && (
                <Home
                    onStart={() => {
                        setClientTab(null);
                        setScreen('configurator');
                    }}
                    onAuth={() => setShowAuth(true)}
                    user={currentUser}
                    logout={logout}
                />
            )}


            {/* --- ЭКРАН: ПОЛИТИКА COOKIE --- */}
            {screen === 'cookie_policy' && (
                <CookiePolicy onBack={() => setScreen('home')} />
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
                <DealerDashboard
                    onBack={() => setScreen('home')}
                    initialTab={dealerTab}
                    onTabChange={setDealerTab}
                />
            )}


            {/* --- ЭКРАН: КАБИНЕТ ПРОИЗВОДСТВА --- */}
            {screen === 'manufacturer' && (
                <ManufacturerDashboard
                    onBack={() => setScreen('home')}
                    initialTab={manufacturerTab}
                    onTabChange={setManufacturerTab}
                />
            )}


            {/* --- ЭКРАН: УМНЫЙ ДАШБОРД КЛИЕНТА (ПЛ, ПКЛ, КЛ) --- */}
            {screen === 'client_dashboard' && (
                <ClientDashboard
                    onBack={() => setScreen('home')}
                    onEdit={() => setScreen('configurator')}
                    showSuccessToast={pendingSuccessToast}
                    onSuccessToastShown={() => setPendingSuccessToast(false)}
                    initialTab={clientTab}
                    onTabChange={setClientTab}
                />
            )}


            {/* --- ЭКРАН: 3D КОНСТРУКТОР --- */}
            {screen === 'configurator' && (
                <div className="app-bg fixed inset-0 w-full h-[100dvh] overflow-hidden font-sans flex flex-col md:block transition-colors duration-300">

                    <button
                        onClick={() => guardedNavigate(currentUser ? (userRole === 'dealer' ? 'dealer' : 'client_dashboard') : 'home')}
                        className="absolute top-3 left-3 md:top-8 md:left-9 z-50 max-w-[42vw] md:max-w-none truncate rounded-full border border-white/18 bg-[#1b2c3c]/72 px-4 py-2 text-xs font-bold text-white shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-[#24384b]/86 hover:border-white/28 active:scale-95 md:px-5 md:text-sm font-zen"
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
                            <div ref={configuratorCanvasRef} className="app-bg relative w-full h-[40svh] min-h-[270px] max-h-[46svh] shrink-0 md:absolute md:inset-0 md:w-full md:h-full md:max-h-none md:bg-transparent dark:md:bg-transparent">
                                <div className="absolute bottom-3 right-3 z-10 md:hidden">
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

                            <div className="relative flex-1 min-h-0 w-full z-20 pointer-events-none md:absolute md:inset-x-0 md:bottom-5 md:top-auto md:h-auto md:px-6 md:flex md:justify-center">
                                {activeProduct === 'thermos' ? (
                                    <ThermosInterface
                                        onFinish={completeConfiguratorFlow}
                                    />
                                ) : activeProduct === 'powerbank' ? (
                                    <PowerbankInterface
                                        onFinish={completeConfiguratorFlow}
                                    />
                                ) : (
                                    <Interface
                                        onFinish={completeConfiguratorFlow}
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

            {screen === 'admin_stub' && (
                <div className="app-bg fixed inset-0 flex items-center justify-center font-sans text-gray-900 dark:text-white">
                    <h1 className="text-6xl md:text-8xl font-black tracking-widest">ХА, а админки то у нас и нет</h1>
                </div>
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
            <div className="absolute top-3 right-3 md:top-8 md:right-9 z-50 flex items-center gap-2">
                <UndoRedoControls />
                <button
                    onClick={() => setConfirmReset(true)}
                    title={t(language, 'resetConfigTitle')}
                    className="h-[34px] w-[34px] flex items-center justify-center bg-[#fff9ec] backdrop-blur-md rounded-full border border-black/10 shadow-xl text-[#1a1a1a] hover:bg-white active:scale-95 transition-all"
                >
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v5" />
                        <path d="M14 11v5" />
                    </svg>
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
