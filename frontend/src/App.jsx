import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { ALL_PRODUCT_DEFAULTS, THEME_SWITCHING_ENABLED, getNotebookBindingCapabilities, mergeSectionVisibility, useConfigurator } from './store'
import { t } from './i18n'
import { CookieBanner } from './components/shared/CookieBanner'
import { getInitialRouteState, getPathForRouteState } from './config/routes'
import { fetchPublicSettings } from './api'

const Home = lazy(() => import('./components/home/Home').then((module) => ({ default: module.Home })));
const PrintCanvas = lazy(() => import('./components/print/PrintCanvas').then((module) => ({ default: module.PrintCanvas })));
const Order = lazy(() => import('./components/order/Order').then((module) => ({ default: module.Order })));
const DealerDashboard = lazy(() => import('./components/dashboard/DealerDashboard').then((module) => ({ default: module.DealerDashboard })));
const ManufacturerDashboard = lazy(() => import('./components/dashboard/ManufacturerDashboard').then((module) => ({ default: module.ManufacturerDashboard })));
const AuthModal = lazy(() => import('./components/auth/AuthModal').then((module) => ({ default: module.AuthModal })));
const ClientDashboard = lazy(() => import('./components/dashboard/ClientDashboard').then((module) => ({ default: module.ClientDashboard })));
const AdminAuth = lazy(() => import('./components/auth/AdminAuth').then((module) => ({ default: module.AdminAuth })));
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard').then((module) => ({ default: module.AdminDashboard })));
const CookiePolicy = lazy(() => import('./components/shared/CookiePolicy').then((module) => ({ default: module.CookiePolicy })));
const MobileLogoUpload = lazy(() => import('./components/shared/MobileLogoUpload').then((module) => ({ default: module.MobileLogoUpload })));
const ConfiguratorScreen = lazy(() => import('./components/configurator/ConfiguratorScreen').then((module) => ({ default: module.ConfiguratorScreen })));
const RenderModeView = lazy(() => import('./components/configurator/RenderModeView').then((module) => ({ default: module.RenderModeView })));
const CommandPalette = lazy(() => import('./components/shared/CommandPalette').then((module) => ({ default: module.CommandPalette })));

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

function pickConfiguratorDraft(state) {
    const draft = {};
    CONFIGURATOR_DRAFT_FIELDS.forEach((key) => {
        draft[key] = state[key];
    });
    return draft;
}

function hasMeaningfulConfiguratorDraft(state) {
    return [
        state?.logos,
        state?.thermosLogos,
        state?.powerbankLogos,
    ].some((items) => Array.isArray(items) && items.length > 0);
}

function readConfiguratorDraft() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(CONFIGURATOR_DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.state || !hasMeaningfulConfiguratorDraft(parsed.state)) {
            window.localStorage.removeItem(CONFIGURATOR_DRAFT_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

function writeConfiguratorDraft(state) {
    if (typeof window === 'undefined') return null;
    if (!hasMeaningfulConfiguratorDraft(state)) {
        clearConfiguratorDraft();
        return null;
    }
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
    const mobileLogoMatch = window.location.pathname.match(/^\/mobile-logo\/([^/]+)\/?$/);

    if (isRenderMode) {
        return (
            <Suspense fallback={<RouteLoader />}>
                <RenderModeView configBase64={urlParams.get('config')} />
            </Suspense>
        );
    }

    if (mobileLogoMatch) {
        return (
            <Suspense fallback={<RouteLoader />}>
                <MobileLogoUpload sessionId={mobileLogoMatch[1]} />
            </Suspense>
        );
    }

    return <MainApp />;
}

function RouteLoader() {
    return (
        <div className="app-bg fixed inset-0" aria-hidden="true" />
    );
}

function RouteSuspense({ children, fallback = <RouteLoader /> }) {
    return <Suspense fallback={fallback}>{children}</Suspense>;
}

function HomeFallbackCard({ title, actionLabel, tone, onClick }) {
    const toneClass = {
        blue: 'bg-blue-500/10 dark:bg-blue-400/15',
        slate: 'bg-slate-500/10 dark:bg-slate-400/15',
        emerald: 'bg-emerald-500/10 dark:bg-emerald-400/15',
        amber: 'bg-amber-500/10 dark:bg-amber-400/15',
        pink: 'bg-pink-500/10 dark:bg-pink-400/15',
    }[tone] || 'bg-gray-500/10 dark:bg-white/10';

    return (
        <button
            type="button"
            onClick={onClick}
            className="group relative flex flex-col items-center p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-white border border-gray-200 shadow-xl dark:bg-white/[0.03] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-none transition-colors duration-500 overflow-hidden text-center"
        >
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 ${toneClass} blur-[60px] transition-colors duration-500`} />
            <div className="h-40 sm:h-48 lg:h-56 w-full relative z-10 flex items-center justify-center">
                <div className="w-28 h-28 rounded-full bg-white/55 border border-gray-200/80 dark:bg-white/8 dark:border-white/10" />
            </div>
            <div className="relative z-10 mt-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white transition-colors">{title}</h3>
                <span className="inline-flex mt-5 px-5 py-2 rounded-full bg-gray-100 text-gray-600 border border-gray-200 dark:bg-white/10 dark:text-gray-300 dark:border-white/5 text-xs font-bold">
                    {actionLabel}
                </span>
            </div>
        </button>
    );
}

function HomeRouteFallback({ onStart, onAuth, user, logout, openCommandPalette, sectionVisibility, onPrintCanvas }) {
    const {
        language,
        setLanguage,
        setProduct,
        setFormat,
        setBindingType,
        setHasElastic,
    } = useConfigurator();

    const cycleLanguage = () => {
        if (language === 'ru') setLanguage('en');
        else if (language === 'en') setLanguage('by');
        else setLanguage('ru');
    };

    const handleSelect = (productType, config = {}) => {
        setProduct(productType);
        setFormat(config.format || 'A5');
        const nextBindingType = config.bindingType || 'hard';
        const nextBindingCaps = getNotebookBindingCapabilities(nextBindingType);
        setBindingType(nextBindingType);
        setHasElastic(nextBindingCaps.hasElastic && (config.hasElastic !== undefined ? config.hasElastic : true));
        onStart();
    };

    return (
        <div className="app-bg h-full w-full flex flex-col font-sans transition-colors duration-500 text-gray-900 dark:text-white overflow-y-auto overflow-x-hidden selection:bg-blue-500/30">
            <header className="w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 z-50 shrink-0">
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 active:scale-95"
                >
                    <img src="/SprooGeek.svg" alt="Spruzhuk logo" className="w-4 h-4 object-contain" />
                    <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                </button>

                <button
                    type="button"
                    onClick={openCommandPalette}
                    className="hidden md:flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md w-96 max-w-full text-sm text-gray-400 shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-left"
                    aria-label={t(language, 'search')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span className="flex-1">{t(language, 'search')}</span>
                    <span className="bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">⌘K</span>
                </button>

                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={openCommandPalette}
                        className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md shadow-sm dark:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        aria-label={t(language, 'search')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </button>
                    <button onClick={cycleLanguage} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md text-xs font-bold uppercase">
                        {language}
                    </button>
                    {user ? (
                        <button onClick={logout} className="bg-white border border-gray-200 text-red-500 dark:bg-white/5 dark:border-white/10 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors px-4 sm:px-5 py-2 rounded-full backdrop-blur-md text-sm font-bold shadow-sm dark:shadow-none">
                            {t(language, 'logout')}
                        </button>
                    ) : (
                        <button onClick={onAuth} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 dark:bg-white/5 dark:border-white/10 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors px-4 sm:px-5 py-2 rounded-full backdrop-blur-md text-sm font-bold shadow-sm dark:shadow-none">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            {t(language, 'login')}
                        </button>
                    )}
                </div>
            </header>

            <main className="flex-1 flex flex-col items-center pt-6 sm:pt-12 pb-16 sm:pb-24 px-4 z-10">
                <h1 className="text-[clamp(2.35rem,11vw,4.5rem)] md:text-7xl font-bold text-center leading-[1.05] tracking-tight mb-4 sm:mb-6 text-gray-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-b dark:from-white dark:to-gray-400 drop-shadow-sm dark:drop-shadow-2xl transition-colors">
                    {t(language, 'title1')}<br />{t(language, 'title2')}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base text-center max-w-lg mb-8 sm:mb-12 lg:mb-16 font-medium leading-relaxed transition-colors">
                    {t(language, 'subtitle')}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 w-full max-w-7xl">
                    {sectionVisibility?.notebook !== false && (
                        <HomeFallbackCard
                            title={t(language, 'notebook')}
                            actionLabel={t(language, 'openBtn')}
                            tone="blue"
                            onClick={() => handleSelect('notebook', { format: 'A5', bindingType: 'hard', hasElastic: false })}
                        />
                    )}
                    {sectionVisibility?.thermos !== false && (
                        <HomeFallbackCard
                            title={t(language, 'thermos')}
                            actionLabel={t(language, 'openBtn')}
                            tone="slate"
                            onClick={() => handleSelect('thermos')}
                        />
                    )}
                    {sectionVisibility?.powerbank !== false && (
                        <HomeFallbackCard
                            title={t(language, 'powerbank')}
                            actionLabel={t(language, 'openBtn')}
                            tone="emerald"
                            onClick={() => handleSelect('powerbank')}
                        />
                    )}
                    {sectionVisibility?.sticker !== false && (
                        <HomeFallbackCard
                            title={t(language, 'sticker3d')}
                            actionLabel={t(language, 'openBtn')}
                            tone="pink"
                            onClick={() => handleSelect('sticker')}
                        />
                    )}
                    {sectionVisibility?.print_canvas !== false && onPrintCanvas && (
                        <HomeFallbackCard
                            title={t(language, 'printCanvasHomeButton')}
                            actionLabel={t(language, 'printCanvasOpenBtn')}
                            tone="amber"
                            onClick={onPrintCanvas}
                        />
                    )}
                </div>
            </main>
        </div>
    );
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
    if (!initialStateRef.current) initialStateRef.current = getInitialRouteState();

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
        authLoading,
        currentUser,
        userRole,
        logout,
        theme,
        cartItems,
        cartRestoredFromCookie,
        clearCart,
        language,
        setAppSettings,
        appSettings,
    } = useConfigurator();

    const effectiveDashboardSections = useMemo(() => (
        mergeSectionVisibility(
            appSettings.dashboard_sections,
            currentUser?.section_visibility_overrides
        )
    ), [appSettings.dashboard_sections, currentUser?.section_visibility_overrides]);
    const homePrintCanvasEnabled = appSettings.home_sections?.print_canvas !== false;
    const dashboardPrintCanvasEnabled = effectiveDashboardSections?.print_canvas !== false;
    const printCanvasEnabledForCurrentUser = Boolean(
        homePrintCanvasEnabled
        || ['admin', 'owner'].includes(currentUser?.role)
        || (currentUser?.role === 'client' && dashboardPrintCanvasEnabled)
    );
    const visibleConfiguratorSections = useMemo(() => (
        currentUser?.role === 'client' ? effectiveDashboardSections : appSettings.home_sections
    ), [appSettings.home_sections, currentUser?.role, effectiveDashboardSections]);

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
        fetchPublicSettings()
            .then((settings) => setAppSettings(settings))
            .catch(() => setAppSettings({ guest_approval_enabled: true }));
    }, [setAppSettings]);

    useEffect(() => {
        if (!THEME_SWITCHING_ENABLED) {
            document.documentElement.classList.add('dark');
            if (theme !== 'dark') useConfigurator.setState({ theme: 'dark' });
            return;
        }
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
        if (authLoading || screen !== 'print_canvas') return undefined;
        if (printCanvasEnabledForCurrentUser) return undefined;
        const frame = window.requestAnimationFrame(() => {
            setScreen(currentUser ? 'client_dashboard' : 'home');
            if (currentUser) setClientTab('catalog');
        });
        return () => window.cancelAnimationFrame(frame);
    }, [authLoading, currentUser, printCanvasEnabledForCurrentUser, screen]);

    useEffect(() => {
        if (screen !== 'configurator') return undefined;
        if (visibleConfiguratorSections?.[activeProduct] !== false) return undefined;
        const frame = window.requestAnimationFrame(() => {
            setScreen(currentUser ? 'client_dashboard' : 'home');
            if (currentUser) setClientTab('catalog');
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activeProduct, currentUser, screen, visibleConfiguratorSections]);

    useEffect(() => {
        const path = getPathForRouteState(screen, activeProduct, clientTab, dealerTab, manufacturerTab);
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
            const next = getInitialRouteState();
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
        } else if (userRole === 'client' && screen !== 'configurator' && screen !== 'print_canvas') {
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

    const handleOpenPrintCanvas = () => {
        if (printCanvasEnabledForCurrentUser) {
            setScreen('print_canvas');
        } else if (currentUser) {
            setClientTab('catalog');
            setScreen('client_dashboard');
        } else {
            setShowAuth(true);
        }
    };

    const openCommandPalette = () => {
        window.dispatchEvent(new Event('spruzhuk:open-command-palette'));
    };

    return (
        <>
            <CookieBanner />

            <CommandPaletteGate
                navigate={guardedNavigate}
                screen={screen}
                openAuth={() => setShowAuth(true)}
                productVisibility={visibleConfiguratorSections}
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
                            <p className="text-gray-400 text-xs truncate">
                                {cartItems?.length > 1
                                    ? `${cartItems.length} × ${cartItems[0]?.productName}${cartItems.length > 1 ? '…' : ''}`
                                    : cartItems?.[0]?.productName}
                            </p>
                            {cartItems?.[0]?.design && cartItems.length === 1 && (
                                <p className="text-gray-600 text-[11px] truncate mt-0.5">{cartItems[0].design}</p>
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
                <RouteSuspense
                    fallback={(
                        <HomeRouteFallback
                            onStart={() => {
                                setClientTab(null);
                                setScreen('configurator');
                            }}
                            onAuth={() => setShowAuth(true)}
                            user={currentUser}
                            logout={logout}
                            openCommandPalette={openCommandPalette}
                            sectionVisibility={appSettings.home_sections}
                            onPrintCanvas={
                                homePrintCanvasEnabled
                                    ? handleOpenPrintCanvas
                                    : null
                            }
                        />
                    )}
                >
                    <Home
                        onStart={() => {
                            setClientTab(null);
                            setScreen('configurator');
                        }}
                        onPrintCanvas={
                            homePrintCanvasEnabled
                                ? handleOpenPrintCanvas
                                : null
                        }
                        sectionVisibility={appSettings.home_sections}
                        onAuth={() => setShowAuth(true)}
                        user={currentUser}
                        logout={logout}
                    />
                </RouteSuspense>
            )}

            {/* --- ЭКРАН: ПОЛОТНО НА ПЕЧАТЬ --- */}
            {screen === 'print_canvas' && printCanvasEnabledForCurrentUser && (
                <RouteSuspense>
                    <PrintCanvas onBack={() => {
                        if (currentUser?.role === 'client') {
                            setClientTab('catalog');
                            setScreen('client_dashboard');
                        } else {
                            setScreen('home');
                        }
                    }} />
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
                        onPrintCanvas={() => setScreen('print_canvas')}
                        sectionVisibility={effectiveDashboardSections}
                        printCanvasEnabled={dashboardPrintCanvasEnabled}
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
