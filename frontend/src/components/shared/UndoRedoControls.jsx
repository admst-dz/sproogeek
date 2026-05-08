import { useCallback } from 'react';
import { useTemporalConfigurator } from '../../hooks/useTemporalConfigurator';

export const UndoRedoControls = ({ className = '' }) => {
    const undo = useTemporalConfigurator((s) => s.undo);
    const redo = useTemporalConfigurator((s) => s.redo);
    const pastLen = useTemporalConfigurator((s) => s.pastStates.length);
    const futureLen = useTemporalConfigurator((s) => s.futureStates.length);

    const onUndo = useCallback(() => undo(), [undo]);
    const onRedo = useCallback(() => redo(), [redo]);

    return (
        <div className={`flex gap-1 bg-white/80 dark:bg-white/5 backdrop-blur-md rounded-[9px] p-1 border border-black/10 dark:border-white/10 shadow-xl ${className}`}>
            <button
                onClick={onUndo}
                disabled={pastLen === 0}
                title="Отменить (Ctrl+Z)"
                aria-label="Отменить"
                className="w-9 h-9 flex items-center justify-center text-[#1a1a1a] dark:text-white rounded-[6px] transition active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7v6h6" />
                    <path d="M3 13a9 9 0 1 0 3-7.7L3 8" />
                </svg>
            </button>
            <div className="w-px h-6 self-center bg-black/10 dark:bg-white/10" />
            <button
                onClick={onRedo}
                disabled={futureLen === 0}
                title="Вернуть (Ctrl+Shift+Z)"
                aria-label="Вернуть"
                className="w-9 h-9 flex items-center justify-center text-[#1a1a1a] dark:text-white rounded-[6px] transition active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 7v6h-6" />
                    <path d="M21 13a9 9 0 1 1-3-7.7L21 8" />
                </svg>
            </button>
        </div>
    );
};
