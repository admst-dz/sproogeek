import { lazy, Suspense, useState, useEffect, useRef } from 'react'
import { ALL_PRODUCT_DEFAULTS, useConfigurator } from './store'
import { t } from './i18n'
import { CookieBanner } from './components/shared/CookieBanner'

const Home = lazy(() => import('./components/home/Home').then((module) => ({ default: module.Home })));
const Order = lazy(() => import('./components/order/Order').then((module) => ({ default: module.Order })));
const DealerDashboard = lazy(() => import('./components/dashboard/DealerDashboard').then((module) => ({ default: module.DealerDashboard })));
const ManufacturerDashboard = lazy(() => import('./components/dashboard/ManufacturerDashboard').then((module) => ({ default: module.ManufacturerDashboard })));
const AuthModal = lazy(() => import('./components/auth/AuthModal').then((module) => ({ default: module.AuthModal })));
const ClientDashboard = lazy(() => import('./components/dashboard/ClientDashboard').then((module) => ({ default: module.ClientDashboard })));
const AdminAuth = lazy(() => import('./components/auth/AdminAuth').then((module) => ({ default: module.AdminAuth })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const CookiePolicy = lazy(() => import('./components/shared/CookiePolicy').then((module) => ({ default: module.CookiePolicy })));
const ConfiguratorScreen = lazy(() => import('./components/configurator/ConfiguratorScreen').then((module) => ({ default: module.ConfiguratorScreen })));
const RenderModeView = lazy(() => import('./components/configurator/RenderModeView').then((module) => ({ default: module.RenderModeView })));
const CommandPalette = lazy(() => import('./components/shared/CommandPalette').then((module) => ({ default: module.CommandPalette })));

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

function App() {
    const urlParams = new URLSearchParams(window.location.search);
    const isRenderMode = urlParams.get('render_mode') === 'true';

    if (isRenderMode) {
        return (
            <Suspense fallback={<RouteLoader />}>
                <RenderModeView configBase64={urlParams.get('config')} />
            </Suspense>
        );
    }

    return <MainApp />;
}

function RouteLoader() {
    return (
        <div className="app-bg fixed inset-0 flex items-center justify-center font-sans text-sm font-bold uppercase tracking-[0.2em] text-gray-500 dark:text-white/50">
            Loading
        </div>
    );
}

function RouteSuspense({ children }) {
    return <Suspense fallback={<RouteLoader />}>{children}</Suspense>;
}

function CommandPaletteGate(props) {
    const [loaded, setLoaded] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const openPalette = () => {
            setLoaded(true);
            setOpen(true);
        };
        const onKey = (event) => {
            if (event.key === 'Escape') {
                setOpen((value) => {
                    if (!value) return value;
                    event.preventDefault();
                    return false;
                });
                return;
            }

            const cmd = event.metaKey || event.ctrlKey;
            if (!cmd || (event.key !== 'k' && event.key !== 'K')) return;
            event.preventDefault();
            setLoaded(true);
            setOpen((value) => !value);
        };

        window.addEventListener('spruzhuk:open-command-palette', openPalette);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('spruzhuk:open-command-palette', openPalette);
            window.removeEventListener('keydown', onKey);
        };
    }, []);

    if (!loaded) return null;

    return (
        <Suspense fallback={null}>
            <CommandPalette {...props} open={open} onOpenChange={setOpen} />
        </Suspense>
    );
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
        cartItem,
        cartRestoredFromCookie,
        clearCart,
        language,
    } = useConfigurator();

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
        let cancelled = false;
        setAuthLoading(true);
        import('./api').then(({ restoreSession }) => restoreSession()).then((user) => {
            if (cancelled) return;
            if (user) {
                setCurrentUser(user);
                setUserRole(user.role);
                if (user.sub_role) setClientSubRole(user.sub_role);
            }
        }).finally(() => {
            if (!cancelled) setAuthLoading(false);
        });
        return () => { cancelled = true; };
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

            <CommandPaletteGate
                navigate={guardedNavigate}
                screen={screen}
                openAuth={() => setShowAuth(true)}
            />

            {/* --- МОДАЛЬНОЕ ОКНО АВТОРИЗАЦИИ --- */}
            {showAuth && (
                <Suspense fallback={null}>
                    <AuthModal
                        onClose={() => setShowAuth(false)}
                        onRoleCreated={(user, role, subRole) => {
                            setCurrentUser(user);
                            setUserRole(role);
                            if (subRole) setClientSubRole(subRole);
                        }}
                    />
                </Suspense>
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
                <RouteSuspense>
                    <Home
                        onStart={() => {
                            setClientTab(null);
                            setScreen('configurator');
                        }}
                        onAuth={() => setShowAuth(true)}
                        user={currentUser}
                        logout={logout}
                    />
                </RouteSuspense>
            )}


            {/* --- ЭКРАН: ПОЛИТИКА COOKIE --- */}
            {screen === 'cookie_policy' && (
                <RouteSuspense>
                    <CookiePolicy onBack={() => setScreen('home')} />
                </RouteSuspense>
            )}


            {/* --- ЭКРАН: КОРЗИНА ГОСТЯ --- */}
            {/* Доступно только для незарегистрированных пользователей */}
            {screen === 'order' && (
                <RouteSuspense>
                    <Order
                        onBack={() => setScreen('configurator')}
                        onSuccess={() => {
                            setPendingSuccessToast(true);
                            setShowAuth(true);
                        }}
                    />
                </RouteSuspense>
            )}


            {/* --- ЭКРАН: КАБИНЕТ ДИЛЕРА --- */}
            {screen === 'dealer' && (
                <RouteSuspense>
                    <DealerDashboard
                        onBack={() => setScreen('home')}
                        initialTab={dealerTab}
                        onTabChange={setDealerTab}
                    />
                </RouteSuspense>
            )}


            {/* --- ЭКРАН: КАБИНЕТ ПРОИЗВОДСТВА --- */}
            {screen === 'manufacturer' && (
                <RouteSuspense>
                    <ManufacturerDashboard
                        onBack={() => setScreen('home')}
                        initialTab={manufacturerTab}
                        onTabChange={setManufacturerTab}
                    />
                </RouteSuspense>
            )}


            {/* --- ЭКРАН: УМНЫЙ ДАШБОРД КЛИЕНТА (ПЛ, ПКЛ, КЛ) --- */}
            {screen === 'client_dashboard' && (
                <RouteSuspense>
                    <ClientDashboard
                        onBack={() => setScreen('home')}
                        onEdit={() => setScreen('configurator')}
                        showSuccessToast={pendingSuccessToast}
                        onSuccessToastShown={() => setPendingSuccessToast(false)}
                        initialTab={clientTab}
                        onTabChange={setClientTab}
                    />
                </RouteSuspense>
            )}


            {/* --- ЭКРАН: 3D КОНСТРУКТОР --- */}
            {screen === 'configurator' && (
                <RouteSuspense>
                    <ConfiguratorScreen
                        currentUser={currentUser}
                        userRole={userRole}
                        logout={logout}
                        onNavigate={guardedNavigate}
                        onFinish={completeConfiguratorFlow}
                        onAuth={() => setShowAuth(true)}
                    />
                </RouteSuspense>
            )}

            {screen === 'admin_auth' && (
                <RouteSuspense>
                    <AdminAuth onSuccess={(user) => {
                        setCurrentUser(user);
                        setUserRole(user.role);
                    }} />
                </RouteSuspense>
            )}

            {screen === 'admin_stub' && (
                <div className="app-bg fixed inset-0 flex items-center justify-center font-sans text-gray-900 dark:text-white">
                    <h1 className="text-6xl md:text-8xl font-black tracking-widest">ХА, а админки то у нас и нет</h1>
                </div>
            )}

            {screen === 'admin_dashboard' && (
                <RouteSuspense>
                    <AdminDashboard onLogout={() => {
                        logout();
                        setScreen('home');
                    }} />
                </RouteSuspense>
            )}
        </>
    )
}

export default App
