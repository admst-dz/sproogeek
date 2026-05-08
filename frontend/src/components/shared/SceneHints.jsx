import { useEffect, useState } from 'react';

const STORAGE_KEY = 'spruzhuk_scene_hints_dismissed';

const readDismissed = () => {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; }
    catch { return false; }
};

const writeDismissed = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* noop */ }
};

export const SceneHints = ({ containerRef }) => {
    const [hidden, setHidden] = useState(() => readDismissed());
    const [fadingOut, setFadingOut] = useState(false);

    useEffect(() => {
        if (hidden) return;
        const target = containerRef?.current;
        if (!target) return;

        const dismiss = () => {
            setFadingOut(true);
            writeDismissed();
            setTimeout(() => setHidden(true), 250);
        };

        target.addEventListener('pointerdown', dismiss, { once: true });
        target.addEventListener('wheel', dismiss, { once: true, passive: true });
        target.addEventListener('touchstart', dismiss, { once: true, passive: true });

        const autoTimer = setTimeout(dismiss, 9000);

        return () => {
            target.removeEventListener('pointerdown', dismiss);
            target.removeEventListener('wheel', dismiss);
            target.removeEventListener('touchstart', dismiss);
            clearTimeout(autoTimer);
        };
    }, [hidden, containerRef]);

    if (hidden) return null;

    return (
        <div
            className={`absolute inset-0 z-30 pointer-events-none flex items-center justify-center transition-opacity duration-300 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}
            aria-hidden
        >
            <div className="flex flex-col gap-2.5 items-center bg-black/45 dark:bg-black/60 backdrop-blur-md rounded-[16px] px-6 py-4 border border-white/15 shadow-xl font-zen">
                <div className="flex items-center gap-3 text-white text-xs md:text-sm font-bold uppercase tracking-wider">
                    <DragIcon />
                    <span>Перетащи — поверни модель</span>
                </div>
                <div className="flex items-center gap-3 text-white text-xs md:text-sm font-bold uppercase tracking-wider">
                    <ZoomIcon />
                    <span>Колесо мыши — приближение</span>
                </div>
                <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">
                    Скроется при первом действии
                </div>
            </div>
        </div>
    );
};

const DragIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
        <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
    </svg>
);

const ZoomIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" />
        <line x1="8" y1="11" x2="14" y2="11" />
    </svg>
);
