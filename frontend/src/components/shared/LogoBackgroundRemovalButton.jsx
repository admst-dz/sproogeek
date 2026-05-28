import { useState } from 'react';
import { t } from '../../i18n';
import { LogoBackgroundEditor } from './LogoBackgroundEditor';

export const LogoBackgroundRemovalButton = ({ logo, language, onApply, className = '' }) => {
    const [open, setOpen] = useState(false);

    if (!logo) return null;

    return (
        <div className={`space-y-1.5 ${className}`}>
            <button
                type="button"
                disabled={!logo.texture}
                onClick={() => setOpen(true)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[9px] border border-white/20 bg-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-white/16 disabled:opacity-50"
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 7h16M7 7v13h10V7M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t(language, 'logoBackgroundRemoveButton')}
            </button>
            {open && logo.texture && (
                <LogoBackgroundEditor
                    logo={logo}
                    language={language}
                    onApply={onApply}
                    onClose={() => setOpen(false)}
                />
            )}
        </div>
    );
};
