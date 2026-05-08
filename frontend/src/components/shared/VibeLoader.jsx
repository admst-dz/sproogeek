import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import loaderFrame1 from '../../assets/loader/figma-loader-frame-1.svg';
import loaderFrame2 from '../../assets/loader/figma-loader-frame-2.svg';
import loaderFrame3 from '../../assets/loader/figma-loader-frame-3.svg';
import loaderFrame4 from '../../assets/loader/figma-loader-frame-4.svg';

const clampProgress = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));
const LOGO_ANIMATION_MS = 1760;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const loaderFrames = [
    { src: loaderFrame1, className: 'vibe-loader__logo-frame vibe-loader__logo-frame--one' },
    { src: loaderFrame2, className: 'vibe-loader__logo-frame vibe-loader__logo-frame--two' },
    { src: loaderFrame3, className: 'vibe-loader__logo-frame vibe-loader__logo-frame--three' },
    { src: loaderFrame4, className: 'vibe-loader__logo-frame vibe-loader__logo-frame--four' },
];

export function useLoaderCompletionGate(loading, duration = LOGO_ANIMATION_MS) {
    const [visible, setVisible] = useState(loading);
    const [startedAt, setStartedAt] = useState(() => (loading ? now() : 0));

    useEffect(() => {
        if (loading) {
            setStartedAt(now());
            setVisible(true);
            return undefined;
        }

        if (!visible) return undefined;

        const elapsed = Math.max(0, now() - startedAt);
        const remainingCycle = duration - (elapsed % duration);
        const delay = Math.max(520, remainingCycle);
        const timeout = window.setTimeout(() => setVisible(false), delay);
        return () => window.clearTimeout(timeout);
    }, [duration, loading, startedAt, visible]);

    return visible;
}

export function VibeLoader({ progress = 0, label = 'Собираем сцену', compact = false, className = '' }) {
    const pct = clampProgress(progress);

    return (
        <div className={`vibe-loader ${compact ? 'vibe-loader--compact' : ''} ${className}`}>
            <div className="vibe-loader__logo" aria-hidden="true">
                {loaderFrames.map((frame) => (
                    <img key={frame.src} src={frame.src} alt="" className={frame.className} />
                ))}
            </div>
            {!compact && (
                <div className="vibe-loader__meta">
                    <span>{label}</span>
                    <strong>{pct}%</strong>
                </div>
            )}
            <div className="vibe-loader__bar" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

export function SceneLoadingOverlay({ label, compact = false }) {
    const { active, progress } = useProgress();
    const [visible, setVisible] = useState(false);
    const [displayProgress, setDisplayProgress] = useState(0);
    const [startedAt, setStartedAt] = useState(0);

    useEffect(() => {
        if (active) {
            if (!visible) setStartedAt(now());
            setVisible(true);
            setDisplayProgress(clampProgress(progress));
            return undefined;
        }

        if (visible) {
            setDisplayProgress(100);
            const elapsed = Math.max(0, now() - startedAt);
            const remainingCycle = LOGO_ANIMATION_MS - (elapsed % LOGO_ANIMATION_MS);
            const delay = Math.max(520, remainingCycle);
            const timeout = window.setTimeout(() => setVisible(false), delay);
            return () => window.clearTimeout(timeout);
        }

        return undefined;
    }, [active, progress, startedAt, visible]);

    if (!visible) return null;

    return (
        <div className={`scene-loading-overlay ${compact ? 'scene-loading-overlay--compact' : ''}`} aria-live="polite">
            <VibeLoader progress={displayProgress} label={label} compact={compact} />
        </div>
    );
}

export function FullPageVibeLoader({ label = 'Загружаем' }) {
    return (
        <div className="app-bg fixed inset-0 flex items-center justify-center">
            <VibeLoader progress={72} label={label} />
        </div>
    );
}
