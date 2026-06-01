import { useCallback, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Experience } from './Experience'
import { Interface, ZoomControls } from './Interface'
import { ThermosInterface } from '../thermos/ThermosInterface'
import { PowerbankInterface } from '../powerbank/PowerbankInterface'
import { StickerInterface } from '../sticker/StickerInterface'
import { MerchInterface } from '../merch/MerchInterface'

const MERCH_PRODUCTS = new Set(['shopper', 'tshirt', 'hoodie', 'lanyard'])
import { SceneLoadingOverlay } from '../shared/VibeLoader'
import { SceneHints } from '../shared/SceneHints'
import { ConfirmModal } from '../shared/ConfirmModal'
import { UndoRedoControls } from '../shared/UndoRedoControls'
import { useUndoRedoHotkeys } from '../../hooks/useTemporalConfigurator'
import { useConfigurator } from '../../store'
import { t } from '../../i18n'

const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.5;
const clampZoom = (value) => Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);

export function ConfiguratorScreen({ currentUser, userRole, logout, onNavigate, onFinish, onAuth }) {
    const configuratorCanvasRef = useRef(null);
    const {
        activeProduct,
        language,
        zoomLevel,
        setZoom,
        resetConfigurator,
    } = useConfigurator();

    useUndoRedoHotkeys(true);

    const handleSceneWheel = useCallback((event) => {
        if (activeProduct === 'thermos' || activeProduct === 'powerbank' || MERCH_PRODUCTS.has(activeProduct)) return;

        event.preventDefault();
        const modeMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 80 : 1;
        const wheelDelta = event.deltaY * modeMultiplier;
        const sensitivity = event.ctrlKey ? 0.006 : 0.0018;
        setZoom(clampZoom(zoomLevel - wheelDelta * sensitivity));
    }, [activeProduct, setZoom, zoomLevel]);

    const goBack = () => {
        onNavigate?.(currentUser ? (userRole === 'dealer' ? 'dealer' : 'client_dashboard') : 'home');
    };

    return (
        <div className="app-bg fixed inset-0 w-full h-[100dvh] overflow-hidden font-sans flex flex-col md:block transition-colors duration-300">

            <button
                onClick={goBack}
                className="absolute top-2 left-3 md:top-3 md:left-5 z-50 max-w-[38vw] md:max-w-none truncate rounded-full border border-white/18 bg-[#1b2c3c]/72 px-4 py-2 text-xs font-bold text-white shadow-[0_14px_34px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-all hover:bg-[#24384b]/86 hover:border-white/28 active:scale-95 md:px-5 md:text-sm font-zen"
            >
                {currentUser ? t(language, 'backToCabinet') : t(language, 'backToMenu')}
            </button>

            <div className="absolute top-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 md:top-3">
                <UndoRedoControls />
                <ConfiguratorToolbar
                    onReset={() => resetConfigurator(activeProduct)}
                    productLabel={t(language, activeProduct) || activeProduct}
                    language={language}
                />
            </div>

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
                    <div
                        ref={configuratorCanvasRef}
                        onWheelCapture={handleSceneWheel}
                        className="app-bg relative w-full h-[50svh] min-h-[280px] max-h-[52svh] shrink-0 md:absolute md:inset-0 md:w-full md:h-full md:max-h-none md:bg-transparent dark:md:bg-transparent lg:right-[430px] lg:w-auto"
                    >
                        <div className="absolute bottom-3 right-3 z-10 md:hidden">
                            <ZoomControls zoomLevel={zoomLevel} setZoom={setZoom} />
                        </div>
                        <Canvas
                            shadows
                            dpr={[1, 2]}
                            camera={{ position: [0, 0, 4.5], fov: 45 }}
                            gl={{
                                antialias: true,
                                preserveDrawingBuffer: true,
                                alpha: true,
                                stencil: true,
                                powerPreference: 'high-performance',
                                logarithmicDepthBuffer: true
                            }}
                        >
                            <Experience />
                        </Canvas>
                        <SceneLoadingOverlay label={t(language, 'sceneLoading')} />
                        <SceneHints containerRef={configuratorCanvasRef} />
                    </div>

                    <div className="relative flex-1 min-h-0 w-full z-20 pointer-events-none md:absolute md:inset-x-0 md:bottom-5 md:top-auto md:h-auto md:px-6 md:flex md:justify-center lg:w-auto lg:inset-x-auto lg:right-5 lg:top-4 lg:bottom-5 lg:px-0 lg:justify-start">
                        {activeProduct === 'thermos' ? (
                            <ThermosInterface onFinish={onFinish} />
                        ) : activeProduct === 'powerbank' ? (
                            <PowerbankInterface onFinish={onFinish} />
                        ) : activeProduct === 'sticker' ? (
                            <StickerInterface onFinish={onFinish} />
                        ) : MERCH_PRODUCTS.has(activeProduct) ? (
                            <MerchInterface onFinish={onFinish} />
                        ) : (
                            <Interface
                                onFinish={onFinish}
                                onAuth={onAuth}
                                user={currentUser}
                                logout={logout}
                            />
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function ConfiguratorToolbar({ onReset, productLabel, language = 'ru' }) {
    const [confirmReset, setConfirmReset] = useState(false);
    return (
        <>
            <button
                onClick={() => setConfirmReset(true)}
                title={t(language, 'resetConfigTitle')}
                className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-black/10 bg-[#fff9ec] text-[#1a1a1a] shadow-xl backdrop-blur-md transition-all hover:bg-white active:scale-95"
            >
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                    <path d="M10 11v5" />
                    <path d="M14 11v5" />
                </svg>
            </button>
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
