import { useEffect, useRef, useState } from 'react';
import { THEME_SWITCHING_ENABLED, getNotebookBindingCapabilities, useConfigurator } from '../../store';
import { t } from '../../i18n';
import { getUserDisplayName } from '../../utils/user';
import { FeedbackPanel } from './FeedbackPanel';
import { SiteFooter } from '../shared/SiteFooter';

const CLOUD_PREVIEW_TONES = {
    notebook: ['#0d47a1', '#42a5f5'],
    thermos: ['#8f2f08', '#f97316'],
    powerbank: ['#263238', '#78909c'],
    sticker: ['#7c2d12', '#facc15'],
    shopper: ['#6b4f2a', '#e7d7b2'],
    tshirt: ['#334155', '#f8fafc'],
    hoodie: ['#111827', '#6d28d9'],
    lanyard: ['#134e4a', '#2dd4bf'],
};

function CloudProductPreview({ product }) {
    const [failed, setFailed] = useState(false);
    const [from, to] = CLOUD_PREVIEW_TONES[product] || ['#1e293b', '#64748b'];
    return (
        <div
            className="relative h-full w-full overflow-hidden rounded-[14px] border border-white/10 bg-slate-900"
            style={{ background: `radial-gradient(circle at 52% 38%, ${to}66, transparent 46%), linear-gradient(145deg, ${from}, #090d14 72%)` }}
        >
            {!failed && (
                <img
                    src={`/cloud-render/poster/${product}.jpg`}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                    onError={() => setFailed(true)}
                />
            )}
            {failed && (
                <div className="absolute inset-0 grid place-items-center">
                    <svg width="74" height="74" viewBox="0 0 64 64" fill="none" className="text-white/65" aria-hidden="true">
                        <path d="M32 7 54 19.5v25L32 57 10 44.5v-25L32 7Z" stroke="currentColor" strokeWidth="2.4" />
                        <path d="m10 19.5 22 13 22-13M32 57V32.5" stroke="currentColor" strokeWidth="2.4" />
                    </svg>
                </div>
            )}
            <span className="absolute bottom-2.5 left-2.5 rounded-full border border-emerald-200/15 bg-black/45 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-emerald-100/80 backdrop-blur-md">
                Cloud render
            </span>
        </div>
    );
}


// Карточки реагируют только на собственное наведение: лёгкий подъём плюс
// локальный блик под курсором без движения соседних элементов.
function ProductCard({ children, onClick, glowColor, className = '' }) {
    const cardRef = useRef(null);

    const updateSpotlight = (event) => {
        const el = cardRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        el.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
        el.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
    };

    const resetSpotlight = () => {
        const el = cardRef.current;
        if (!el) return;

        el.style.setProperty('--spotlight-x', '50%');
        el.style.setProperty('--spotlight-y', '18%');
    };

    return (
        <button
            ref={cardRef}
            type="button"
            onClick={onClick}
            onPointerMove={updateSpotlight}
            onPointerLeave={resetSpotlight}
            style={{
                '--spotlight-x': '50%',
                '--spotlight-y': '18%',
                '--spotlight-color': glowColor,
            }}
            className={`home-product-card group relative isolate flex min-h-[17.5rem] flex-col items-center justify-between overflow-hidden rounded-[20px] border border-gray-200 bg-white p-4 text-left shadow-xl transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out hover:-translate-y-1 hover:border-gray-300 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:translate-y-0 active:scale-[0.99] sm:min-h-[18.5rem] sm:p-5 md:rounded-[22px] xl:min-h-[19.5rem] xl:rounded-[24px] xl:p-6 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none dark:backdrop-blur-xl dark:hover:border-white/20 dark:hover:bg-white/[0.06] ${className}`}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: 'radial-gradient(280px circle at var(--spotlight-x) var(--spotlight-y), var(--spotlight-color), transparent 68%)' }}
            />
            {children}
        </button>
    );
}

function ProductGrid({ children }) {
    return (
        <div className="home-product-grid grid w-full grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))] gap-4 md:gap-5 xl:gap-6">
            {children}
        </div>
    );
}

function PrintCanvasPreview() {
    const dots = [
        [9, 18], [27, 18], [45, 18], [63, 18],
        [18, 37], [36, 37], [54, 37], [72, 37],
        [9, 58], [27, 58], [45, 58], [63, 58],
    ];

    return (
        <div className="relative h-full w-full overflow-hidden rounded-[14px] border border-gray-200/80 bg-[#fffdf8] shadow-inner dark:border-white/10">
            <div
                className="absolute inset-0 opacity-90"
                style={{
                    backgroundImage: 'linear-gradient(rgba(17,24,39,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(17,24,39,0.07) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                }}
            />
            <div className="absolute left-5 right-5 top-8 h-[68%] rounded-[10px] border border-dashed border-gray-300 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.10)]">
                {dots.map(([left, top], index) => (
                    <span
                        key={`${left}-${top}`}
                        className="absolute grid h-8 w-8 place-items-center rounded-full border border-blue-100 bg-blue-600 text-[11px] font-black text-white shadow-sm sm:h-9 sm:w-9"
                        style={{ left: `${left}%`, top: `${top}%` }}
                    >
                        {index % 3 === 0 ? 'S' : ''}
                    </span>
                ))}
                <span className="absolute bottom-[14%] right-[13%] rounded-[6px] border-2 border-slate-800 bg-white px-3 py-1 text-[9px] font-black text-slate-800">
                    LOGO
                </span>
            </div>
            <div className="absolute bottom-4 left-6 right-6 grid grid-cols-3 gap-2">
                <span className="h-2 rounded-full bg-blue-600/90" />
                <span className="h-2 rounded-full bg-slate-800/80" />
                <span className="h-2 rounded-full bg-emerald-500/90" />
            </div>
        </div>
    );
}

const DEFAULT_SECTION_VISIBILITY = {
    notebook: true,
    thermos: true,
    powerbank: true,
    sticker: true,
    shopper: true,
    tshirt: true,
    hoodie: true,
    lanyard: true,
    print_canvas: false,
};

export function ConfiguratorProductMenu({ onStart, onPrintCanvas, visibility = DEFAULT_SECTION_VISIBILITY }) {
    const {
        setProduct, setFormat, setBindingType, setHasElastic,
        setColor,
        language,
    } = useConfigurator();

    const handleSelect = (productType, config = {}) => {
        setProduct(productType);
        setFormat(config.format || 'A5');
        const nextBindingType = config.bindingType || 'hard';
        const nextBindingCaps = getNotebookBindingCapabilities(nextBindingType);
        setBindingType(nextBindingType);
        if (config.coverColor) setColor('cover', config.coverColor);
        if (config.innerCoverColor) setColor('innerCover', config.innerCoverColor);
        if (config.stitchColor) setColor('stitch', config.stitchColor);
        if (config.elasticColor) setColor('elastic', config.elasticColor);
        if (config.spiralColor) setColor('spiral', config.spiralColor);
        setHasElastic(nextBindingCaps.hasElastic && (config.hasElastic !== undefined ? config.hasElastic : true));
        onStart();
    };

    return (
        <ProductGrid>
            {visibility.notebook !== false && (
                <ProductCard
                    glowColor="rgba(59, 130, 246, 0.22)"
                    onClick={() => handleSelect('notebook', {
                        format: 'A5',
                        bindingType: 'spiral',
                        hasElastic: true,
                        coverColor: '#1565C0',
                        innerCoverColor: '#1565C0',
                        stitchColor: '#ffffff',
                        spiralColor: '#C0C0C0',
                        elasticColor: '#1a1a1a',
                    })}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="notebook" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'notebook')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-blue-50 group-hover:text-blue-600 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.thermos !== false && (
                <ProductCard glowColor="rgba(100, 116, 139, 0.22)" onClick={() => handleSelect('thermos', {})}>
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="thermos" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'thermos')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-slate-50 group-hover:text-slate-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.powerbank !== false && (
                <ProductCard
                    glowColor="rgba(16, 185, 129, 0.2)"
                    onClick={() => handleSelect('powerbank', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="powerbank" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'powerbank')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-emerald-50 group-hover:text-emerald-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.sticker !== false && (
                <ProductCard
                    glowColor="rgba(236, 72, 153, 0.18)"
                    onClick={() => handleSelect('sticker', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="sticker" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'sticker3d')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-pink-50 group-hover:text-pink-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.shopper !== false && (
                <ProductCard
                    glowColor="rgba(202, 138, 4, 0.18)"
                    onClick={() => handleSelect('shopper', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="shopper" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'shopper')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-amber-50 group-hover:text-amber-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.tshirt !== false && (
                <ProductCard
                    glowColor="rgba(14, 165, 233, 0.18)"
                    onClick={() => handleSelect('tshirt', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="tshirt" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'tshirt')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-sky-50 group-hover:text-sky-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.hoodie !== false && (
                <ProductCard
                    glowColor="rgba(124, 58, 237, 0.18)"
                    onClick={() => handleSelect('hoodie', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="hoodie" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'hoodie')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-violet-50 group-hover:text-violet-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.lanyard !== false && (
                <ProductCard
                    glowColor="rgba(20, 184, 166, 0.18)"
                    onClick={() => handleSelect('lanyard', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <CloudProductPreview product="lanyard" />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'lanyard')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-teal-50 group-hover:text-teal-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.print_canvas !== false && onPrintCanvas && (
                <ProductCard glowColor="rgba(245, 158, 11, 0.2)" onClick={onPrintCanvas}>
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <PrintCanvasPreview />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'printCanvasHomeButton')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-amber-50 group-hover:text-amber-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'printCanvasOpenBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}
        </ProductGrid>
    );
}

export const Home = ({ onStart, onAuth, user, logout, sectionVisibility, onPrintCanvas }) => {
    const {
        language, setLanguage, theme, toggleTheme
    } = useConfigurator();

    useEffect(() => {
        if (!THEME_SWITCHING_ENABLED) {
            document.documentElement.classList.add('dark');
            if (theme !== 'dark') useConfigurator.setState({ theme: 'dark' });
            return;
        }
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [theme]);

    const cycleLanguage = () => {
        if (language === 'ru') setLanguage('en');
        else if (language === 'en') setLanguage('by');
        else setLanguage('ru');
    };

    const openCommandPalette = () => {
        window.dispatchEvent(new Event('spruzhuk:open-command-palette'));
    };

    return (
        // h-full + overflow-y-auto делают саму главную скроллящимся контейнером.
        // Глобально html/body имеют overflow:hidden (нужно конструктору с 3D-канвасом),
        // поэтому скролл вешаем здесь, а не на body.
        <div className="home-route app-bg h-full w-full flex flex-col font-sans transition-colors duration-500 text-gray-900 dark:text-white overflow-y-auto overflow-x-hidden selection:bg-blue-500/30">

            <header className="home-header relative w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 z-50 shrink-0">
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 active:scale-95"
                >
                    <img src="/SprooGeek.svg" alt="Spruzhuk logo" className="w-4 h-4 object-contain" />
                    <span className="font-bold text-sm tracking-wide">Sproogeek 3D</span>
                </button>

                {/* Поисковое окно — абсолютным центрированием, чтобы не зависеть
                    от ширины левого/правого блоков и стоять строго посередине вьюпорта. */}
                <button
                    type="button"
                    onClick={openCommandPalette}
                    className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md w-80 xl:w-96 text-sm text-gray-400 shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-left"
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
                    {THEME_SWITCHING_ENABLED && (
                        <button onClick={toggleTheme} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md">
                            {theme === 'light' ? (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>) : (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>)}
                        </button>
                    )}
                    {user ? (
                        <div className="flex items-center gap-2 sm:gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-3 sm:px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors min-w-0 max-w-[52vw] sm:max-w-none">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 truncate">{getUserDisplayName(user)}</span>
                            <div className="w-px h-4 bg-gray-300 dark:bg-white/20"></div>
                            <button onClick={logout} className="text-xs text-red-500 dark:text-red-400 font-bold hover:text-red-700 dark:hover:text-red-300 transition">{t(language, 'logout')}</button>
                        </div>
                    ) : (
                        <button onClick={onAuth} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 dark:bg-white/5 dark:border-white/10 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors px-4 sm:px-5 py-2 rounded-full backdrop-blur-md text-sm font-bold shadow-sm dark:shadow-none">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            {t(language, 'login')}
                        </button>
                    )}
                </div>
            </header>

            <main className="home-main flex-1 flex w-full flex-col items-center pt-6 sm:pt-10 lg:pt-12 2xl:pt-16 pb-20 sm:pb-24 px-4 sm:px-6 lg:px-8 z-10">
                <h1 className="home-title max-w-[72rem] break-words px-2 pb-2 text-[2.35rem] font-bold text-center leading-[1.16] tracking-normal mb-3 sm:text-5xl md:text-6xl xl:text-7xl sm:mb-4 text-gray-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-b dark:from-white dark:to-gray-400 drop-shadow-sm dark:drop-shadow-2xl transition-colors">
                    {t(language, 'title1')}<br />{t(language, 'title2')}
                </h1>
                <p className="home-subtitle text-gray-500 dark:text-gray-400 text-sm md:text-base text-center max-w-xl mb-8 sm:mb-10 lg:mb-12 xl:mb-14 font-medium leading-relaxed transition-colors">
                    {t(language, 'subtitle')}
                </p>

                <ConfiguratorProductMenu
                    onStart={onStart}
                    onPrintCanvas={onPrintCanvas}
                    visibility={sectionVisibility}
                />

                <FeedbackPanel language={language} />
            </main>
            <SiteFooter className="shrink-0" />
        </div>
    );
};
