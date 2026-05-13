import { useEffect, useMemo, useState } from 'react';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';

const PAPER_OPTIONS = [
    { id: 'offset_80', labelKey: 'paperOffset80' },
    { id: 'offset_100', labelKey: 'paperOffset100' },
    { id: 'offset_110', labelKey: 'paperOffset110' },
    { id: 'coated_115', labelKey: 'paperCoated115' },
    { id: 'coated_130', labelKey: 'paperCoated130' },
];

export const BlockBuilder = () => {
    const {
        language,
        paperType,
        setPaperType,
        blockPages,
        addBlockPage,
        removeBlockPageAt,
        moveBlockPage,
        clearBlockPages,
    } = useConfigurator();

    const [manifest, setManifest] = useState(null);
    const [paperOpen, setPaperOpen] = useState(false);
    const [draggingIdx, setDraggingIdx] = useState(null);

    useEffect(() => {
        let cancelled = false;
        fetch('/block-templates/manifest.json')
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(json => { if (!cancelled) setManifest(json); })
            .catch(() => { if (!cancelled) setManifest({ templates: [] }); });
        return () => { cancelled = true; };
    }, []);

    const templates = manifest?.templates || [];
    const templatesLocked = true;
    const byId = useMemo(() => {
        const map = new Map();
        for (const tpl of templates) map.set(tpl.id, tpl);
        return map;
    }, [templates]);

    const currentPaper = PAPER_OPTIONS.find(p => p.id === paperType) || PAPER_OPTIONS[1];

    return (
        <div className="flex flex-col gap-3">
            {/* Бумага */}
            <div className="glass-panel rounded-[11px] overflow-hidden">
                <button
                    type="button"
                    onClick={() => setPaperOpen(o => !o)}
                    className="w-full p-5 flex items-center justify-between"
                >
                    <span className="text-xl font-bold tracking-wide">{t(language, 'paperLabel')}</span>
                    <span className="text-sm opacity-80">{t(language, currentPaper.labelKey)}</span>
                </button>
                {paperOpen && (
                    <div className="border-t border-white/10 p-2 flex flex-col gap-1">
                        {PAPER_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => { setPaperType(opt.id); setPaperOpen(false); }}
                                className={`py-3 px-4 text-left rounded-[6px] transition-colors flex justify-between items-center ${paperType === opt.id ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}
                            >
                                <span>{t(language, opt.labelKey)}</span>
                                {paperType === opt.id && <span>✓</span>}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Состав блока */}
            <div className="glass-panel rounded-[11px] overflow-hidden">
                <div className="p-4 flex items-center justify-between">
                    <span className="text-xl font-bold tracking-wide">{t(language, 'blockBuilderLabel')}</span>
                    <span className="text-xs opacity-60">{blockPages.length} {t(language, 'pagesShort')}</span>
                </div>
                {blockPages.length > 0 ? (
                    <div className="border-t border-white/10 p-3 flex flex-wrap gap-2">
                        {blockPages.map((tid, idx) => {
                            const tpl = byId.get(tid);
                            return (
                                <div
                                    key={`${tid}-${idx}`}
                                    draggable
                                    onDragStart={() => setDraggingIdx(idx)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => {
                                        if (draggingIdx !== null && draggingIdx !== idx) moveBlockPage(draggingIdx, idx);
                                        setDraggingIdx(null);
                                    }}
                                    onDragEnd={() => setDraggingIdx(null)}
                                    className="relative w-[60px] rounded-[6px] overflow-hidden border border-white/15 bg-white/5 group cursor-move"
                                >
                                    {tpl ? (
                                        <img src={tpl.preview} alt={`#${tid}`} className="w-full block aspect-[2/3] object-cover" />
                                    ) : (
                                        <div className="w-full aspect-[2/3] bg-white/10" />
                                    )}
                                    <div className="absolute top-0 left-0 bg-black/60 text-[9px] px-1 py-0.5 rounded-br-[6px]">
                                        {idx + 1} · #{tid}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeBlockPageAt(idx)}
                                        className="absolute top-0 right-0 w-5 h-5 bg-red-500/80 text-white text-[11px] leading-5 text-center opacity-0 group-hover:opacity-100 transition rounded-bl-[6px]"
                                    >×</button>
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            onClick={clearBlockPages}
                            className="text-xs text-red-300 hover:text-red-200 underline ml-auto self-end"
                        >
                            {t(language, 'clear')}
                        </button>
                    </div>
                ) : (
                    <div className="border-t border-white/10 p-4 text-xs opacity-60 text-center">
                        {t(language, 'blockBuilderEmpty')}
                    </div>
                )}
            </div>

            {/* Каталог шаблонов */}
            <div className="glass-panel relative rounded-[11px] overflow-hidden cursor-not-allowed" aria-disabled={templatesLocked}>
                <div className={templatesLocked ? 'pointer-events-none select-none blur-[2px] opacity-55' : undefined}>
                    <div className="p-4 flex items-center justify-between">
                        <span className="text-xl font-bold tracking-wide">{t(language, 'blockTemplatesLabel')}</span>
                        <span className="text-xs opacity-60">{templates.length}</span>
                    </div>
                    <div className="border-t border-white/10 p-3 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                        {templates.map(tpl => (
                            <button
                                key={tpl.id}
                                type="button"
                                disabled={templatesLocked}
                                onClick={() => addBlockPage(tpl.id)}
                                className="relative rounded-[6px] overflow-hidden border border-white/15 hover:border-white/40 transition group disabled:pointer-events-none"
                                title={`#${tpl.id} · ${tpl.width_mm}×${tpl.height_mm} mm`}
                                tabIndex={templatesLocked ? -1 : undefined}
                            >
                                <img src={tpl.preview} alt={`template ${tpl.id}`} className="w-full block aspect-[2/3] object-cover" />
                                <span className="absolute top-0 left-0 bg-black/60 text-[10px] px-1.5 py-0.5 rounded-br-[6px]">#{tpl.id}</span>
                                <span className="absolute inset-0 bg-emerald-500/0 group-hover:bg-emerald-500/15 transition flex items-center justify-center">
                                    <span className="opacity-0 group-hover:opacity-100 text-emerald-200 text-2xl font-bold transition">＋</span>
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
                {templatesLocked && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10 backdrop-blur-[1px]">
                        <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white/55">
                            {t(language, 'comingSoon')}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
