import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import loaderFrame01 from '../../assets/loader/logo-loader-01.svg';
import loaderFrame02 from '../../assets/loader/logo-loader-02.svg';
import loaderFrame03 from '../../assets/loader/logo-loader-03.svg';
import loaderFrame04 from '../../assets/loader/logo-loader-04.svg';
import loaderFrame05 from '../../assets/loader/logo-loader-05.svg';
import loaderFrame06 from '../../assets/loader/logo-loader-06.svg';
import loaderFrame07 from '../../assets/loader/logo-loader-07.svg';
import loaderFrame08 from '../../assets/loader/logo-loader-08.svg';

const clampProgress = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));
const LOGO_ANIMATION_MS = 2600;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const loaderFrames = [
    loaderFrame01,
    loaderFrame02,
    loaderFrame03,
    loaderFrame04,
    loaderFrame05,
    loaderFrame06,
    loaderFrame07,
    loaderFrame08,
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
                {loaderFrames.map((frame, index) => (
                    <img
                        key={frame}
                        src={frame}
                        alt=""
                        className={`vibe-loader__logo-frame ${index === loaderFrames.length - 1 ? 'vibe-loader__logo-frame--final' : ''}`}
                        style={{ '--frame-index': String(index) }}
                    />
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
            const delay = Math.max(520, LOGO_ANIMATION_MS - elapsed);
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
