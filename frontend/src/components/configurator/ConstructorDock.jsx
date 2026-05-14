import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const ConstructorDock = ({ title, tabs = [], activeTab, onTabChange, onSave, saveLabel, desktopTitleColumn = false, children }) => (
    <div className="pointer-events-auto w-full h-full md:h-auto md:w-[min(1120px,calc(100vw-3rem))] lg:w-[min(1180px,calc(100vw-4rem))] md:max-h-[64vh] flex flex-col items-center gap-4 font-zen text-white">
        <button
            type="button"
            onClick={onSave}
            className="hidden md:inline-flex self-end mr-4 lg:mr-5 min-w-[118px] justify-center rounded-full bg-[#fff9ec] px-7 py-2 text-[14px] font-black text-[#1b1b1b] shadow-lg transition hover:bg-white active:scale-95"
        >
            {saveLabel}
        </button>

        <section className="w-full h-full md:h-auto md:max-h-[calc(64vh-54px)] min-h-0 flex flex-col rounded-t-[24px] md:rounded-[8px] border border-white/35 bg-[#4b393c]/84 shadow-2xl backdrop-blur-xl overflow-hidden">
            {tabs.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-b border-white/20 px-4 py-3 md:pl-4 md:pr-7 md:py-4 lg:pl-5 lg:pr-8">
                    <div className="min-w-0" />
                    <div className="flex shrink-0 gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => onTabChange?.(tab.id)}
                                className={`rounded-full px-3 py-1.5 md:px-5 md:py-2 text-[11px] md:text-[13px] font-black uppercase tracking-wider transition ${
                                    activeTab === tab.id ? 'bg-[#fff9ec] text-[#1b1b1b]' : 'text-white/60 hover:text-white'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-4 py-3 md:px-7 md:py-5">
                {children}
            </div>

            <div className="md:hidden border-t border-white/15 p-4">
                <button
                    type="button"
                    onClick={onSave}
                    className="w-full rounded-[12px] bg-[#fff9ec] py-3 text-sm font-black uppercase tracking-widest text-[#1b1b1b] shadow-lg active:scale-[0.98] transition"
                >
                    {saveLabel}
                </button>
            </div>
        </section>
    </div>
);

export const DockGrid = ({ children, cols = 'md:grid-cols-4', leading = null }) => (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-y-4 md:gap-y-0 md:divide-x md:divide-white/25 [&>*]:min-w-0`}>
        {leading}
        {children}
    </div>
);

export const DockTitleColumn = ({ title }) => (
    <div className="hidden md:flex min-w-0 flex-col justify-start px-0 py-0 pr-5 lg:pr-6" />
);

export const FloatingLogoSettings = ({ title, subtitle, children }) => {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <aside className="pointer-events-auto hidden md:block fixed right-5 lg:right-8 top-[38%] z-[90] w-[320px] max-w-[calc(100vw-2.5rem)] max-h-[min(560px,calc(100vh-8rem))] -translate-y-1/2 overflow-y-auto rounded-[12px] border border-white/30 bg-[#3f3438]/94 px-5 py-4 font-zen text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl custom-scrollbar">
            <div className="mb-4 border-b border-white/12 pb-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/42">{title}</p>
                {subtitle && <h3 className="mt-1 truncate text-[18px] font-black leading-tight">{subtitle}</h3>}
            </div>
            <div className="space-y-4">{children}</div>
        </aside>,
        document.body
    );
};

export const SettingGroup = ({ title, children, compact = false }) => (
    <div className={`${compact ? 'space-y-1.5 px-0 py-1 md:px-4 md:py-0 lg:px-5' : 'space-y-3 px-0 py-2 md:px-5 md:py-0 lg:px-6'} first:md:pl-0 last:md:pr-0`}>
        {title && <p className={`${compact ? 'text-[9px] md:text-[10px]' : 'text-[10px] md:text-[12px]'} font-black uppercase tracking-[0.2em] text-white/42`}>{title}</p>}
        <div className={compact ? 'space-y-1.5' : 'space-y-3'}>{children}</div>
    </div>
);

export const SettingRow = ({ label, children, inline = false }) => (
    <div className={`flex min-w-0 leading-tight ${inline ? 'flex-row items-center justify-between gap-2 text-[11px] md:text-[12px]' : 'flex-col items-start gap-2 text-[13px] md:text-[15px] lg:text-[16px]'}`}>
        <span className={`font-bold ${inline ? 'shrink-0 text-white/70' : 'min-w-0 text-white/92'}`}>{label}</span>
        <div className={inline ? 'shrink-0' : 'w-full min-w-0'}>{children}</div>
    </div>
);

export const MiniToggle = ({ checked, onChange }) => (
    <button
        type="button"
        onClick={() => onChange?.(!checked)}
        className={`relative h-[14px] w-[28px] md:h-[18px] md:w-[36px] rounded-full border transition ${checked ? 'border-[#fff9ec] bg-[#fff9ec]' : 'border-white/55 bg-black/30'}`}
        aria-pressed={checked}
    >
        <span className={`absolute top-1/2 h-[8px] w-[8px] md:h-[11px] md:w-[11px] -translate-y-1/2 rounded-full transition ${checked ? 'left-[16px] md:left-[21px] bg-[#151515]' : 'left-[3px] md:left-[4px] bg-white/75'}`} />
    </button>
);

export const MiniSegment = ({ options, value, onChange }) => (
    <div className="flex w-full max-w-full flex-wrap justify-start gap-1.5">
        {options.map(opt => (
            <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={`rounded-full border px-2.5 py-1.5 md:px-3 md:py-1.5 text-[10px] md:text-[12px] font-black uppercase tracking-wider transition ${
                    value === opt.value ? 'border-[#fff9ec] bg-[#fff9ec] text-[#191919]' : 'border-white/20 bg-white/8 text-white/70 hover:text-white'
                }`}
            >
                {opt.label}
            </button>
        ))}
    </div>
);

const DropdownPortal = ({ btnRef, open, onClose, children, itemCount = 4 }) => {
    if (!open) return null;
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return null;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
    const gap = 4;
    const viewportPadding = 12;
    const estimatedPanelHeight = Math.min(Math.max(itemCount * 34, 44), 260);
    const spaceBelow = viewportHeight - r.bottom - viewportPadding;
    const spaceAbove = r.top - viewportPadding;
    const openUp = spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(44, Math.min(estimatedPanelHeight, openUp ? spaceAbove - gap : spaceBelow - gap));
    const panelStyle = {
        position: 'fixed',
        left: Math.min(r.left, viewportWidth - Math.max(r.width, 100) - viewportPadding),
        width: Math.max(r.width, 100),
        maxHeight,
        zIndex: 9999,
        ...(openUp ? { bottom: viewportHeight - r.top + gap } : { top: r.bottom + gap }),
    };
    return createPortal(
        <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={onClose} />
            <div style={panelStyle} className="rounded-[8px] border border-white/20 bg-[#3a2e31] shadow-2xl overflow-y-auto font-zen custom-scrollbar">
                {children}
            </div>
        </>,
        document.body
    );
};

export const MiniDropdown = ({ options, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const current = options.find(o => o.value === value);
    return (
        <div className="w-full">
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-[8px] border border-white/20 bg-white/8 px-2.5 py-1.5 text-[10px] md:text-[12px] font-black uppercase tracking-wider text-white transition hover:bg-white/14"
            >
                <span className="truncate">{current?.label ?? value}</span>
                <svg width="10" height="6" viewBox="0 0 10 6" className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <DropdownPortal btnRef={btnRef} open={open} onClose={() => setOpen(false)} itemCount={options.length}>
                {options.map(opt => (
                    <button
                        key={opt.value}
                        type="button"
                        onClick={() => { onChange(opt.value); setOpen(false); }}
                        className={`w-full px-3 py-2 text-left text-[10px] md:text-[12px] font-black uppercase tracking-wider transition ${opt.value === value ? 'bg-[#fff9ec] text-[#191919]' : 'text-white/80 hover:bg-white/12'}`}
                    >
                        {opt.label}
                    </button>
                ))}
            </DropdownPortal>
        </div>
    );
};

export const ColorDropdown = ({ colors, currentColor, onSelect }) => {
    const [open, setOpen] = useState(false);
    const btnRef = useRef(null);
    const current = colors.find(c => (c.bg ?? c) === currentColor);
    const label = current?.name ?? currentColor;
    return (
        <div className="w-full">
            <button
                ref={btnRef}
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 rounded-[8px] border border-white/20 bg-white/8 px-2.5 py-1.5 text-[10px] md:text-[12px] font-black uppercase tracking-wider text-white transition hover:bg-white/14"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <span className="h-[13px] w-[13px] shrink-0 rounded-full border border-white/30" style={{ backgroundColor: currentColor }} />
                    <span className="truncate">{label}</span>
                </div>
                <svg width="10" height="6" viewBox="0 0 10 6" className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none">
                    <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <DropdownPortal btnRef={btnRef} open={open} onClose={() => setOpen(false)} itemCount={colors.length}>
                {colors.map(color => {
                    const val = color.bg ?? color;
                    const name = color.name ?? val;
                    return (
                        <button
                            key={val}
                            type="button"
                            onClick={() => { onSelect(val); setOpen(false); }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[10px] md:text-[12px] font-black uppercase tracking-wider transition ${val === currentColor ? 'bg-white/20 text-white' : 'text-white/80 hover:bg-white/12'}`}
                        >
                            <span className="h-[14px] w-[14px] shrink-0 rounded-full border border-white/25" style={{ backgroundColor: val }} />
                            <span className="truncate">{name}</span>
                            {val === currentColor && <span className="ml-auto text-[10px] text-[#fff9ec]">✓</span>}
                        </button>
                    );
                })}
            </DropdownPortal>
        </div>
    );
};

export const ColorSwatches = ({ colors, currentColor, onSelect }) => (
    <div className="flex w-full max-w-full flex-wrap justify-start gap-2">
        {colors.map(color => {
            const value = color.bg ?? color;
            return (
                <button
                    key={value}
                    type="button"
                    onClick={() => onSelect(value)}
                    className={`h-[15px] w-[15px] md:h-[20px] md:w-[20px] rounded-full border transition active:scale-90 ${
                        currentColor === value ? 'border-[#fff9ec] ring-2 ring-[#fff9ec]/35' : 'border-white/45 hover:border-white'
                    }`}
                    style={{ backgroundColor: value }}
                    aria-label={value}
                />
            );
        })}
    </div>
);

export const FileUploadChip = ({ label, onFile }) => (
    <label className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 md:px-4 md:py-2 text-[10px] md:text-[12px] font-black uppercase tracking-wider transition hover:bg-white/18">
        <span className="min-w-0 leading-tight">{label}</span>
        <span className="text-base leading-none">+</span>
        <input
            type="file"
            accept="image/*"
            onChange={(e) => { if (e.target.files[0]) { onFile(e.target.files[0]); e.target.value = ''; } }}
            className="hidden"
        />
    </label>
);

export const LogoList = ({ logos, selectedLogoId, selectLogo, removeLogo, metaForLogo }) => {
    if (!logos.length) return null;
    return (
        <div className="mt-2 flex max-h-[88px] md:max-h-[120px] flex-col gap-1 md:gap-1.5 overflow-y-auto pr-1 custom-scrollbar">
            {logos.map(logo => (
                <div
                    key={logo.id}
                    className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-[6px] border px-2 py-1.5 md:px-3 md:py-2 ${
                        logo.id === selectedLogoId ? 'border-white/35 bg-white/20' : 'border-white/12 bg-white/8'
                    }`}
                >
                    <button type="button" onClick={() => selectLogo(logo.id)} className="min-w-0 text-left">
                        <span className="block truncate text-[11px] md:text-[13px] font-bold">{logo.filename}</span>
                        {metaForLogo && <span className="block truncate text-[9px] md:text-[10px] font-black uppercase tracking-wider text-white/38">{metaForLogo(logo)}</span>}
                    </button>
                    <button type="button" onClick={() => removeLogo(logo.id)} className="text-lg leading-none text-white/35 hover:text-white">×</button>
                </div>
            ))}
        </div>
    );
};

export const TransformPad = ({ label, value = [0, 0], onChange, onReset, xRange = 1, yRange = 1, aspect = 'aspect-square' }) => {
    const updatePos = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        onChange((nx * 2 - 1) * xRange, -(ny * 2 - 1) * yRange);
    };
    const x = ((value[0] / xRange + 1) / 2) * 100;
    const y = (1 - (value[1] / yRange + 1) / 2) * 100;

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] md:text-[12px] font-black uppercase tracking-wider text-white/45">{label}</span>
                {onReset && (
                    <button type="button" onClick={onReset} className="text-[9px] md:text-[12px] font-black uppercase tracking-wider text-white/35 hover:text-white">
                        ↺
                    </button>
                )}
            </div>
            <div
                className={`relative w-full ${aspect} min-h-[72px] md:min-h-[108px] max-h-[128px] md:max-h-[168px] rounded-[8px] border border-white/18 bg-white/8 touch-none select-none overflow-hidden cursor-crosshair`}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updatePos(e); }}
                onPointerMove={(e) => { if (e.buttons) updatePos(e); }}
                onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                onPointerCancel={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
            >
                <div className="absolute inset-0 flex items-center pointer-events-none"><div className="w-full h-px bg-white/14" /></div>
                <div className="absolute inset-0 flex justify-center pointer-events-none"><div className="h-full w-px bg-white/14" /></div>
                <span className="absolute h-3.5 w-3.5 rounded-full border-2 border-[#fff9ec] bg-white shadow pointer-events-none" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }} />
            </div>
        </div>
    );
};

export const RotationScrub = ({ label, value = 0, onChange }) => {
    const start = useRef(0);
    const startX = useRef(null);
    return (
        <div className="space-y-1.5">
            <div className="flex justify-between gap-2">
                <span className="text-[10px] md:text-[12px] font-black uppercase tracking-wider text-white/45">{label}</span>
                <span className="text-[10px] md:text-[12px] font-black text-white/75">{Math.round(value * 180 / Math.PI)}°</span>
            </div>
            <div
                className="relative h-8 md:h-10 rounded-[8px] border border-white/18 bg-white/8 touch-none select-none overflow-hidden cursor-ew-resize"
                style={{
                    backgroundImage: `repeating-linear-gradient(to right, transparent 13px, rgba(255,255,255,0.22) 13px, rgba(255,255,255,0.22) 14px, transparent 14px)`,
                    backgroundPosition: `${value * 180 / Math.PI * 1.5}px center`,
                }}
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = value; startX.current = e.clientX; }}
                onPointerMove={(e) => { if (!e.buttons || startX.current === null) return; onChange(start.current + (e.clientX - startX.current) * 0.015); }}
                onPointerUp={() => { startX.current = null; }}
            >
                <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/45 -translate-x-1/2" />
            </div>
        </div>
    );
};

export const SizeSlider = ({ label, value = 0.6, min = 0.1, max = 1.5, step = 0.03, onChange }) => (
    <div className="space-y-1.5">
        <div className="flex justify-between gap-2">
            <span className="text-[10px] md:text-[12px] font-black uppercase tracking-wider text-white/45">{label}</span>
            <span className="text-[10px] md:text-[12px] font-black text-white/75">{Math.round(value * 100)}%</span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-1 rounded-full appearance-none bg-white/25 accent-[#fff9ec]"
        />
    </div>
);
