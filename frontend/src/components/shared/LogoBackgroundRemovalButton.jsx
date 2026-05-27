import { useCallback, useState } from 'react';
import { t } from '../../i18n';
import { BackgroundRemovalEditor } from './BackgroundRemovalEditor';

const fileFromTexture = async (texture, filename = 'logo.png') => {
    if (!texture) throw new Error('Missing texture');
    const response = await fetch(texture);
    if (!response.ok) throw new Error('Could not read texture');
    const blob = await response.blob();
    return new File([blob], filename || 'logo.png', { type: blob.type || 'image/png' });
};

export const LogoBackgroundRemovalButton = ({ logo, language, onApply, className = '' }) => {
    const [editorFile, setEditorFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const openEditor = useCallback(async () => {
        if (!logo?.texture) return;
        setBusy(true);
        setError('');
        try {
            setEditorFile(await fileFromTexture(logo.texture, logo.filename));
        } catch {
            setError(t(language, 'logoBackgroundOpenFailed'));
        } finally {
            setBusy(false);
        }
    }, [language, logo]);

    const apply = useCallback(async (file) => {
        setBusy(true);
        setError('');
        try {
            await onApply?.(file);
            setEditorFile(null);
        } catch {
            setError(t(language, 'logoBackgroundFailed'));
        } finally {
            setBusy(false);
        }
    }, [language, onApply]);

    if (!logo) return null;

    return (
        <>
            <div className={`space-y-1.5 ${className}`}>
                <button
                    type="button"
                    disabled={busy}
                    onClick={openEditor}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-[9px] border border-white/20 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-white/16 disabled:opacity-50"
                >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M4 7h16M7 7v13h10V7M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {busy ? t(language, 'logoBackgroundPreparingShort') : t(language, 'logoBackgroundRemoveButton')}
                </button>
                {error && <p className="text-[11px] font-bold leading-tight text-red-100">{error}</p>}
            </div>
            <BackgroundRemovalEditor
                open={Boolean(editorFile)}
                file={editorFile}
                language={language}
                onApply={apply}
                onSkip={() => setEditorFile(null)}
                onCancel={() => setEditorFile(null)}
            />
        </>
    );
};
