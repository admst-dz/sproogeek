import { useEffect } from 'react';
import { useStore } from 'zustand';
import { useConfigurator } from '../store';

export const useTemporalConfigurator = (selector) =>
    useStore(useConfigurator.temporal, selector);

const isEditableTarget = (el) => {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
};

export const useUndoRedoHotkeys = (enabled = true) => {
    const undo = useTemporalConfigurator((s) => s.undo);
    const redo = useTemporalConfigurator((s) => s.redo);

    useEffect(() => {
        if (!enabled) return;
        const onKey = (e) => {
            const cmd = e.metaKey || e.ctrlKey;
            if (!cmd) return;
            if (isEditableTarget(e.target)) return;
            const key = e.key.toLowerCase();
            if (key === 'z' && !e.shiftKey) {
                e.preventDefault();
                undo();
            } else if ((key === 'z' && e.shiftKey) || key === 'y') {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled, undo, redo]);
};
