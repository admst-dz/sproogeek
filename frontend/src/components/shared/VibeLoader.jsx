import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import Lottie from 'lottie-react';
import animationData from '../../assets/loader/loader.json';

const clampProgress = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));
const LOGO_ANIMATION_MS = 4000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

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

export function VibeLoader({ progress = 0, label = 'Loading...', compact = false, className = '' }) {
    const pct = clampProgress(progress);

    return (
        <div className={`vibe-loader ${compact ? 'vibe-loader--compact' : ''} ${className}`}>
            <div className="vibe-loader__logo" aria-hidden="true">
                <Lottie
                    animationData={animationData}
                    loop
                    autoplay
                    style={{ width: '100%', height: '100%' }}
                />
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

export function FullPageVibeLoader({ label = 'Loading...' }) {
    return (
        <div className="app-bg fixed inset-0 flex items-center justify-center">
            <VibeLoader progress={72} label={label} />
        </div>
    );
}
