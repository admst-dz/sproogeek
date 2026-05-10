import { useRef } from 'react';

export const ConstructorDock = ({ title, tabs = [], activeTab, onTabChange, onSave, saveLabel, children }) => (
    <div className="pointer-events-auto w-full h-full md:h-auto md:w-[min(980px,calc(100vw-6rem))] md:max-h-[64vh] flex flex-col items-center gap-4 font-zen text-white">
        <button
            type="button"
            onClick={onSave}
            className="hidden md:inline-flex min-w-[118px] justify-center rounded-full bg-[#fff9ec] px-7 py-2 text-[14px] font-black text-[#1b1b1b] shadow-lg transition hover:bg-white active:scale-95"
        >
            {saveLabel}
        </button>

        <section className="w-full h-full md:h-auto md:max-h-[calc(64vh-54px)] min-h-0 flex flex-col rounded-t-[24px] md:rounded-[8px] border border-white/35 bg-[#4b393c]/72 shadow-2xl backdrop-blur-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-white/20 px-4 py-3 md:px-7 md:py-4">
                <div className="min-w-0">
                    <p className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.24em] text-white/45">Конструктор</p>
                    <h2 className="truncate text-lg md:text-[22px] font-black leading-tight">{title}</h2>
                </div>
                {tabs.length > 0 && (
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
                )}
            </div>

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

export const DockGrid = ({ children, cols = 'md:grid-cols-4' }) => (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-0 md:divide-x md:divide-white/25`}>
        {children}
    </div>
);

export const SettingGroup = ({ title, children }) => (
    <div className="space-y-2 px-0 py-2 md:px-6 md:py-0 first:md:pl-0 last:md:pr-0">
        {title && <p className="text-[10px] md:text-[12px] font-black uppercase tracking-[0.2em] text-white/42">{title}</p>}
        <div className="space-y-1.5 md:space-y-2.5">{children}</div>
    </div>
);

export const SettingRow = ({ label, children }) => (
    <div className="grid grid-cols-[minmax(92px,1fr)_auto] md:grid-cols-[minmax(130px,1fr)_auto] items-center gap-3 md:gap-5 text-[13px] md:text-[16px] leading-tight">
        <span className="min-w-0 truncate font-bold text-white/92">{label}</span>
        <div className="justify-self-end">{children}</div>
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
    <div className="flex max-w-[170px] md:max-w-[240px] flex-wrap justify-end gap-1 md:gap-1.5">
        {options.map(opt => (
            <button
                key={opt.value}
                type="button"
                onClick={() => onChange(opt.value)}
                className={`rounded-full border px-2 py-1 md:px-3 md:py-1.5 text-[10px] md:text-[12px] font-black uppercase tracking-wider transition ${
                    value === opt.value ? 'border-[#fff9ec] bg-[#fff9ec] text-[#191919]' : 'border-white/20 bg-white/8 text-white/70 hover:text-white'
                }`}
            >
                {opt.label}
            </button>
        ))}
    </div>
);

export const ColorSwatches = ({ colors, currentColor, onSelect }) => (
    <div className="flex max-w-[150px] md:max-w-[210px] flex-wrap justify-end gap-1.5 md:gap-2">
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
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 md:px-4 md:py-2 text-[10px] md:text-[12px] font-black uppercase tracking-wider transition hover:bg-white/18">
        <span>{label}</span>
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
