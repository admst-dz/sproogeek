import { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

const clampProgress = (value) => Math.max(0, Math.min(100, Math.round(value || 0)));

export function VibeLoader({ progress = 0, label = 'Собираем сцену', compact = false, className = '' }) {
    const pct = clampProgress(progress);

    return (
        <div className={`vibe-loader ${compact ? 'vibe-loader--compact' : ''} ${className}`}>
            <div className="vibe-loader__core" aria-hidden="true">
                <div className="vibe-loader__ring" />
                <div className="vibe-loader__stack vibe-loader__stack--back" />
                <div className="vibe-loader__stack vibe-loader__stack--middle" />
                <div className="vibe-loader__stack vibe-loader__stack--front" />
                <div className="vibe-loader__spark vibe-loader__spark--a" />
                <div className="vibe-loader__spark vibe-loader__spark--b" />
                <div className="vibe-loader__spark vibe-loader__spark--c" />
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

    useEffect(() => {
        if (active) {
            setVisible(true);
            setDisplayProgress(clampProgress(progress));
            return undefined;
        }

        if (visible) {
            setDisplayProgress(100);
            const timeout = window.setTimeout(() => setVisible(false), 520);
            return () => window.clearTimeout(timeout);
        }

        return undefined;
    }, [active, progress, visible]);

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
