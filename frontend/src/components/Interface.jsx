import { useState, useRef } from 'react';
import { useConfigurator, captureRender } from "../store"

const palette = [
    { name: 'Yellow', bg: '#FDD835' },
    { name: 'Red', bg: '#D32F2F' },
    { name: 'Green', bg: '#43A047' },
    { name: 'Black', bg: '#1a1a1a' },
    { name: 'Blue', bg: '#1565C0' },
    { name: 'White', bg: '#ffffff' },
    { name: 'Pink', bg: '#EC407A' },
    { name: 'Silver', bg: '#Silver' },
];

export const Interface = ({ onFinish }) => {
    const [tab, setTab] = useState('cover');
    const [quantity, setQuantity] = useState(1);
    const [isSample, setIsSample] = useState(false);

    const {
        format, setFormat,
        bindingType, setBindingType,
        setColor, coverColor, elasticColor, spiralColor,
        hasElastic, setHasElastic,
        setNotebookOpen,
        paperPattern, setPaperPattern,
        logos, selectedLogoId, addLogo, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale,
        activeProduct,
        zoomLevel, setZoom,
        addToCart,
        setRenderSnapshot
    } = useConfigurator();

    if (activeProduct === 'calendar') {
        return (
            <div className="pointer-events-auto w-full h-full md:h-[95%] custom-gradient backdrop-blur-xl rounded-t-[30px] md:rounded-[9px] flex items-center justify-center border-t md:border border-white/30 relative">
                <ZoomControlsOverlay zoomLevel={zoomLevel} setZoom={setZoom} />
                <div className="font-zen text-2xl font-bold uppercase tracking-widest text-white drop-shadow-md">
                    В Разработке
                </div>
            </div>
        );
    }

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        const newItem = {
            productName: `Ежедневник ${format}`,
            design: `Переплет: ${bindingType === 'hard' ? 'Твердый' : 'Пружина'}, Блок: ${paperPattern}`,
            priceBYN: 1500,
            type: 'notebook',
            config: { format, coverColor, hasElastic, elasticColor, paperPattern, bindingType, spiralColor },
            format, coverColor, hasElastic, elasticColor, paperPattern, bindingType, spiralColor,
            status: 'draft',
            rendersGenerated: 0,
            quantity,
            isSample,
        };
        addToCart(newItem);
        onFinish();
    };

    return (
        <div className="pointer-events-auto w-full h-full md:h-[95%] custom-gradient backdrop-blur-xl rounded-t-[30px] md:rounded-[9px] shadow-2xl flex flex-col overflow-hidden font-zen border-t md:border border-white/20 relative">

            <div className="flex items-end gap-8 px-8 py-6 shrink-0 z-10 bg-white/5 backdrop-blur-sm">
                <button onClick={() => { setTab('cover'); setNotebookOpen(false); }} className={`text-2xl md:text-3xl transition-all leading-none ${tab === 'cover' ? 'opacity-100 scale-105 border-b-2 border-white pb-1' : 'opacity-50 hover:opacity-80'}`}>Обложка</button>
                <button onClick={() => { setTab('block'); setNotebookOpen(true); }} className={`text-2xl md:text-3xl transition-all leading-none ${tab === 'block' ? 'opacity-100 scale-105 border-b-2 border-white pb-1' : 'opacity-50 hover:opacity-80'}`}>Блок</button>
            </div>

            <div className="flex-1 px-4 md:px-6 pt-4 overflow-y-auto custom-scrollbar flex flex-col gap-3 relative z-0">
                {tab === 'cover' && (
                    <div className="animate-fade-in flex flex-col gap-3 pb-40">
                        <GlassDropdown label="Переплет" currentValue={bindingType === 'hard' ? 'Твердый' : 'Пружина'}>
                            <div className="flex flex-col gap-1">
                                <button onClick={() => setBindingType('hard')} className={`py-3 px-4 text-left rounded-[6px] transition-colors flex justify-between items-center ${bindingType === 'hard' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}><span>Твердый переплет</span> {bindingType === 'hard' && <span>✓</span>}</button>
                                <button onClick={() => setBindingType('spiral')} className={`py-3 px-4 text-left rounded-[6px] transition-colors flex justify-between items-center ${bindingType === 'spiral' ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}><span>На пружине (Soft)</span> {bindingType === 'spiral' && <span>✓</span>}</button>
                            </div>
                        </GlassDropdown>
                        {bindingType === 'spiral' && (<div className="glass-panel rounded-[11px] overflow-hidden animate-fade-in"><ColorGlassList currentColor={spiralColor} onSelect={(c) => setColor('spiral', c)} label="Цвет пружины"/></div>)}
                        <GlassDropdown label="Формат" currentValue={format}>
                            <div className="flex flex-col gap-1">
                                {['A5', 'A6'].map(f => (<button key={f} onClick={() => setFormat(f)} className={`py-3 px-4 text-left rounded-[6px] transition-colors flex justify-between items-center ${format === f ? 'bg-white/20 font-bold' : 'hover:bg-white/10'}`}><span>{f}</span> {format === f && <span>✓</span>}</button>))}
                            </div>
                        </GlassDropdown>
                        <div className="glass-panel rounded-[11px] overflow-hidden transition-all">
                            <div className="p-5 flex items-center justify-between cursor-pointer" onClick={() => setHasElastic(!hasElastic)}>
                                <span className="text-xl font-bold tracking-wide">Резинка</span>
                                <div className={`w-12 h-7 rounded-full p-1 transition-colors border border-white/30 ${hasElastic ? 'bg-green-500/80' : 'bg-gray-500/50'}`}><div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform ${hasElastic ? 'translate-x-5' : ''}`} /></div>
                            </div>
                            {hasElastic && (<div className="border-t border-white/10"><ColorGlassList currentColor={elasticColor} onSelect={(c) => setColor('elastic', c)} label="Цвет резинки" /></div>)}
                        </div>
                        <div className="glass-panel rounded-[11px] overflow-hidden"><ColorGlassList currentColor={coverColor} onSelect={(c) => setColor('cover', c)} label="Цвет обложки"/></div>
                        <LogoPanel logos={logos} selectedLogoId={selectedLogoId} addLogo={addLogo} selectLogo={selectLogo} removeLogo={removeLogo} resetLogoTransform={resetLogoTransform} setLogoPosition={setLogoPosition} setLogoRotation={setLogoRotation} setLogoScale={setLogoScale} />
                    </div>
                )}

                {tab === 'block' && (
                    <div className="animate-fade-in flex flex-col h-full pb-40">
                        <div className="glass-panel rounded-[11px] p-4 mb-4 text-center opacity-80 text-sm border-white/10">Выберите разлиновку страниц</div>
                        <div className="grid grid-cols-2 gap-3 h-full content-start">
                            {['blank', 'lined', 'grid', 'dotted'].map((pt) => (
                                <button key={pt} onClick={() => setPaperPattern(pt)} className={`glass-panel rounded-[11px] aspect-square flex flex-col items-center justify-center gap-3 transition-all group hover:bg-white/20 ${paperPattern === pt ? 'bg-white/30 border-white/50 shadow-lg scale-[1.02]' : ''}`}>
                                    <div className={`w-14 h-14 rounded-[11px] border-2 p-2 ${paperPattern === pt ? 'border-white bg-white/20' : 'border-white/20 bg-transparent'}`}><BlockIcon type={pt} /></div>
                                    <span className="text-lg font-bold tracking-wide">{pt === 'blank' && 'Пустой'}{pt === 'lined' && 'Линейка'}{pt === 'grid' && 'Клетка'}{pt === 'dotted' && 'Точка'}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* КНОПКА ОФОРМЛЕНИЯ */}
            <div className="absolute bottom-0 left-0 w-full px-4 md:px-6 pt-3 pb-4 md:pb-6 z-20 border-t border-white/10 bg-[#A4B0C9]/95 dark:bg-[#060911]/95 backdrop-blur-xl flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] opacity-50 font-bold uppercase tracking-widest">Тираж (шт.)</span>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-[8px] text-white font-bold text-lg hover:bg-white/20 active:scale-95 transition">−</button>
                            <span className="w-10 text-center font-black text-white text-lg select-none">{quantity}</span>
                            <button onClick={() => setQuantity(q => q + 1)} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-[8px] text-white font-bold text-lg hover:bg-white/20 active:scale-95 transition">+</button>
                        </div>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setIsSample(s => !s)}>
                        <div className={`w-5 h-5 rounded-[5px] border flex items-center justify-center transition-all shrink-0 ${isSample ? 'bg-white border-white' : 'bg-white/5 border-white/20'}`}>
                            {isSample && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="#0B0F19" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-white leading-tight">Тиражный образец</span>
                            <span className="text-[9px] text-white/40 leading-tight">1 шт. перед партией</span>
                        </div>
                    </label>
                </div>
                <button
                    onClick={handleAddToCart}
                    className="w-full py-4 bg-white text-[#1a1a1a] rounded-[11px] text-xl font-black tracking-[0.2em] uppercase hover:bg-gray-100 transition-all shadow-lg active:scale-[0.98]"
                >
                    Оформить заказ
                </button>
            </div>
        </div>
    )
}

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---
const LogoPanel = ({ logos, selectedLogoId, addLogo, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale }) => {
    const selected = logos.find(l => l.id === selectedLogoId) || null;
    const rotStart = useRef(0);
    const rotStartX = useRef(null);

    const updatePos = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        setLogoPosition((nx * 2 - 1) * 0.4, -(ny * 2 - 1) * 0.8);
    };

    return (
        <div className="glass-panel rounded-[11px] p-5">
            <h3 className="text-xl font-bold tracking-wide mb-4">Тиснение</h3>
            <label className="block w-full py-3 bg-white/10 rounded-[6px] text-center cursor-pointer border border-white/20 text-sm font-bold mb-4 hover:bg-white/20 transition-colors">
                + ДОБАВИТЬ ЛОГОТИП
                <input type="file" accept="image/*" onChange={(e) => { if (e.target.files[0]) { addLogo(e.target.files[0]); e.target.value = ''; } }} className="hidden"/>
            </label>
            {logos.length > 0 && (
                <div className="flex flex-col gap-2 mb-4">
                    {logos.map(logo => (
                        <div key={logo.id} className={`flex items-center rounded-[6px] border ${logo.id === selectedLogoId ? 'bg-white/30 border-white/40' : 'bg-white/10 border-white/10'}`}>
                            <button onClick={() => selectLogo(logo.id)} className="flex-1 py-2 px-3 text-left text-sm font-bold truncate hover:opacity-80 transition-opacity">{logo.filename}</button>
                            <button onClick={() => removeLogo(logo.id)} className="px-3 py-2 text-white/40 hover:text-white/90 text-lg leading-none transition-colors shrink-0" title="Удалить">×</button>
                        </div>
                    ))}
                </div>
            )}
            {selected && (
                <div className="flex flex-col gap-4 mt-1">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] opacity-50 font-bold uppercase tracking-widest">Позиция</span>
                            <button onClick={resetLogoTransform} className="text-[10px] font-bold opacity-40 hover:opacity-80 transition-opacity uppercase tracking-wider border border-white/20 px-2 py-0.5 rounded-[5px] hover:border-white/40">↺ По центру</button>
                        </div>
                        <div
                            className="relative w-full aspect-square bg-white/8 rounded-[10px] border border-white/15 cursor-crosshair touch-none select-none overflow-hidden"
                            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updatePos(e); }}
                            onPointerMove={(e) => { if (e.buttons) updatePos(e); }}
                        >
                            <div className="absolute inset-0 flex items-center pointer-events-none">
                                <div className="w-full h-px bg-white/15" />
                            </div>
                            <div className="absolute inset-0 flex justify-center pointer-events-none">
                                <div className="h-full w-px bg-white/15" />
                            </div>
                            <div
                                className="absolute w-4 h-4 bg-white rounded-full shadow-lg border-2 border-white/80 pointer-events-none"
                                style={{
                                    left: `${(selected.position[0] / 0.4 + 1) / 2 * 100}%`,
                                    top: `${(1 - (selected.position[1] / 0.8 + 1) / 2) * 100}%`,
                                    transform: 'translate(-50%, -50%)'
                                }}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] opacity-50 font-bold uppercase tracking-widest">Поворот</span>
                            <span className="text-xs font-bold opacity-80">{Math.round((selected.rotation ?? 0) * 180 / Math.PI)}°</span>
                        </div>
                        <div
                            className="relative h-10 rounded-[10px] border border-white/15 cursor-ew-resize touch-none select-none overflow-hidden"
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.07)',
                                backgroundImage: `repeating-linear-gradient(to right, transparent 14px, rgba(255,255,255,0.22) 14px, rgba(255,255,255,0.22) 15px, transparent 15px), repeating-linear-gradient(to right, transparent 89px, rgba(255,255,255,0.55) 89px, rgba(255,255,255,0.55) 90px, transparent 90px)`,
                                backgroundSize: '15px 35%, 90px 65%',
                                backgroundPosition: `${(selected.rotation ?? 0) * 180 / Math.PI * 1.5}px center, ${(selected.rotation ?? 0) * 180 / Math.PI * 1.5}px center`,
                                backgroundRepeat: 'repeat-x, repeat-x',
                            }}
                            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); rotStart.current = selected.rotation ?? 0; rotStartX.current = e.clientX; }}
                            onPointerMove={(e) => { if (!e.buttons || rotStartX.current === null) return; setLogoRotation(rotStart.current + (e.clientX - rotStartX.current) * 0.015); }}
                            onPointerUp={() => { rotStartX.current = null; }}
                        >
                            <div className="absolute inset-y-0 left-1/2 w-0.5 bg-white/50 -translate-x-1/2 rounded-full pointer-events-none" />
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] text-white/20 font-bold pointer-events-none select-none">←</span>
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-white/20 font-bold pointer-events-none select-none">→</span>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] opacity-50 font-bold uppercase tracking-widest">Размер</span>
                            <span className="text-xs font-bold opacity-80">{Math.round((selected.scale ?? 0.6) * 100)}%</span>
                        </div>
                        <input type="range" min="0.2" max="1.5" step="0.05"
                            value={selected.scale ?? 0.6}
                            onChange={(e) => setLogoScale(parseFloat(e.target.value))}
                            className="w-full h-1 bg-white/30 rounded-full appearance-none accent-white"/>
                    </div>
                </div>
            )}
        </div>
    );
};
export const ZoomControls = ({ zoomLevel, setZoom }) => (
    <div className="flex flex-col gap-1 bg-white/80 backdrop-blur-md rounded-[9px] p-1 border border-white/40 shadow-xl">
        <button onClick={() => setZoom(Math.min(zoomLevel + 0.1, 2.5))} className="w-10 h-10 flex items-center justify-center text-[#1a1a1a] hover:bg-white rounded-[6px] transition active:scale-95"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <div className="h-px w-full bg-black/10" />
        <button onClick={() => setZoom(Math.max(zoomLevel - 0.1, 0.5))} className="w-10 h-10 flex items-center justify-center text-[#1a1a1a] hover:bg-white rounded-[6px] transition active:scale-95"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
    </div>
)
const ZoomControlsOverlay = ({ zoomLevel, setZoom }) => (<div className="absolute top-4 right-4 z-50"><ZoomControls zoomLevel={zoomLevel} setZoom={setZoom} /></div>)
const GlassDropdown = ({ label, currentValue, children, isColor = false, colorValue }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="glass-panel rounded-[11px] transition-all overflow-hidden shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full p-5 flex items-center justify-between hover:bg-white/10 transition">
                <span className="text-xl font-bold tracking-wide">{label}</span>
                <div className="flex items-center gap-3">
                    {isColor ? (<div className="w-6 h-6 rounded-full border border-white/30 shadow-sm" style={{backgroundColor: colorValue}} />) : (<span className="font-bold opacity-80 text-sm bg-white/10 px-2 py-1 rounded-[6px]">{currentValue}</span>)}
                    <span className={`transform transition-transform duration-300 text-xl opacity-70 ${isOpen ? 'rotate-180' : ''}`}>⌄</span>
                </div>
            </button>
            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'}`}><div className="p-2 border-t border-white/10 bg-black/5">{children}</div></div>
        </div>
    )
}
const ColorGlassList = ({ label, currentColor, onSelect }) => (
    <GlassDropdown label={label} isColor={true} colorValue={currentColor}>
        <div className="flex flex-col gap-1">
            {palette.map((c) => (
                <button key={c.name} onClick={() => onSelect(c.bg)} className={`p-3 rounded-[6px] flex items-center gap-3 transition-colors ${currentColor === c.bg ? 'bg-white/30 shadow-sm border border-white/20' : 'hover:bg-white/10'}`}>
                    <div className="w-8 h-8 rounded-full border border-white/20 shadow-sm" style={{backgroundColor: c.bg}} />
                    <span className="font-bold text-sm">{c.name}</span>
                    {currentColor === c.bg && <span className="ml-auto text-xl">✓</span>}
                </button>
            ))}
        </div>
    </GlassDropdown>
)
const BlockIcon = ({ type }) => {
    const strokeClass = "stroke-white opacity-90";
    return (
        <svg viewBox="0 0 100 100" fill="none" className="w-full h-full drop-shadow-md">
            <rect x="10" y="10" width="80" height="80" rx="4" stroke="white" strokeWidth="2" className="opacity-40" />
            {type === 'blank' && <path d="M50 40 L50 60 M40 50 L60 50" stroke="white" strokeWidth="2" className="opacity-20" />}
            {type === 'lined' && ( <g strokeWidth="3" className={strokeClass}><line x1="20" y1="30" x2="80" y2="30" /><line x1="20" y1="50" x2="80" y2="50" /><line x1="20" y1="70" x2="80" y2="70" /></g>)}
            {type === 'grid' && (<g strokeWidth="2" className={strokeClass}><path d="M33 20 V80" /><path d="M66 20 V80" /><path d="M20 33 H80" /><path d="M20 66 H80" /></g>)}
            {type === 'dotted' && (<g fill="white" className="opacity-80"><circle cx="33" cy="33" r="3" /> <circle cx="66" cy="33" r="3" /><circle cx="33" cy="66" r="3" /> <circle cx="66" cy="66" r="3" /></g>)}
        </svg>
    )
}