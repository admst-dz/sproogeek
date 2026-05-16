import { useCallback } from 'react';
import { useTemporalConfigurator } from '../../hooks/useTemporalConfigurator';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';

export const UndoRedoControls = ({ className = '' }) => {
    const undo = useTemporalConfigurator((s) => s.undo);
    const redo = useTemporalConfigurator((s) => s.redo);
    const pastLen = useTemporalConfigurator((s) => s.pastStates.length);
    const futureLen = useTemporalConfigurator((s) => s.futureStates.length);

    const { language } = useConfigurator();
    const onUndo = useCallback(() => undo(), [undo]);
    const onRedo = useCallback(() => redo(), [redo]);

    return (
        <div className={`flex gap-1 bg-white/80 dark:bg-white/5 backdrop-blur-md rounded-[9px] p-1 border border-black/10 dark:border-white/10 shadow-xl ${className}`}>
            <button
                onClick={onUndo}
                disabled={pastLen === 0}
                title={t(language, 'undoTitle')}
                aria-label={t(language, 'undoLabel')}
                className="w-9 h-9 flex items-center justify-center text-[#1a1a1a] dark:text-white rounded-[6px] transition active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z" />
                </svg>
            </button>
            <div className="w-px h-6 self-center bg-black/10 dark:bg-white/10" />
            <button
                onClick={onRedo}
                disabled={futureLen === 0}
                title={t(language, 'redoTitle')}
                aria-label={t(language, 'redoLabel')}
                className="w-9 h-9 flex items-center justify-center text-[#1a1a1a] dark:text-white rounded-[6px] transition active:scale-95 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.4 10.6C16.55 9 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 15.7C5 12.5 8.03 10 11.5 10c1.97 0 3.73.72 5.12 1.88L13 15h9V6l-3.6 4.6z" />
                </svg>
            </button>
        </div>
    );
};
