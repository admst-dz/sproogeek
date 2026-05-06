import { useRef } from 'react';
import { useConfigurator, captureRender } from '../../store';

const palette = [
    { name: 'Серый',        bg: '#75787B' },
];

export const PowerbankInterface = ({ onFinish }) => {
    const {
        powerbankBodyColor,
        setColor,
        powerbankLogos, selectedPowerbankLogoId,
        addPowerbankLogo, selectPowerbankLogo, removePowerbankLogo,
        resetPowerbankLogoTransform,
        setPowerbankLogoPosition, setPowerbankLogoRotation, setPowerbankLogoScale, setPowerbankLogoSide,
        zoomLevel, setZoom,
        addToCart, setRenderSnapshot,
    } = useConfigurator();

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        addToCart({
            productName: 'Повербанк',
            design: `Цвет: ${powerbankBodyColor}`,
            priceTK: 80,
            priceBYN: 3200,
            activeProduct: 'powerbank',
            powerbankBodyColor,
            powerbankLogos,
            status: 'draft',
            rendersGenerated: 0,
        });
        onFinish();
    };

    return (
        <div className="pointer-events-auto w-full h-full md:h-[95%] custom-gradient backdrop-blur-xl rounded-t-[30px] md:rounded-[9px] shadow-2xl flex flex-col overflow-hidden font-zen border-t md:border border-white/20 relative">

            <div className="flex items-end gap-4 px-8 py-6 shrink-0 z-10 bg-white/5 backdrop-blur-sm">
                <span className="text-2xl md:text-3xl font-bold leading-none opacity-100">Повербанк</span>
            </div>

            <div className="px-4 md:px-6 pt-3 pb-3 shrink-0">
                <div className="glass-panel rounded-[11px] px-4 py-3">
                    <span className="text-[11px] font-bold uppercase tracking-widest opacity-50 block mb-2">Цвет корпуса</span>
                    <div className="flex flex-wrap gap-2">
                        {palette.map(c => (
                            <button
                                key={c.name}
                                title={c.name}
                                onClick={() => setColor('powerbankBody', c.bg)}
                                className={`w-8 h-8 rounded-full border-2 transition-all active:scale-90 ${powerbankBodyColor === c.bg ? 'border-white scale-110 shadow-lg' : 'border-white/20 hover:border-white/60'}`}
                                style={{ backgroundColor: c.bg }}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div className="flex-1 px-4 md:px-6 pt-1 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-40">
                <PowerbankLogoPanel
                    logos={powerbankLogos}
                    selectedLogoId={selectedPowerbankLogoId}
                    addLogo={addPowerbankLogo}
                    selectLogo={selectPowerbankLogo}
                    removeLogo={removePowerbankLogo}
                    resetLogoTransform={resetPowerbankLogoTransform}
                    setLogoPosition={setPowerbankLogoPosition}
                    setLogoRotation={setPowerbankLogoRotation}
                    setLogoScale={setPowerbankLogoScale}
                    setLogoSide={setPowerbankLogoSide}
                />
            </div>

            <div className="absolute bottom-0 left-0 w-full p-4 md:p-6 z-20 border-t border-white/10 bg-[#A4B0C9]/95 dark:bg-[#060911]/95 backdrop-blur-xl">
                <button
                    onClick={handleAddToCart}
                    className="w-full py-4 bg-white text-[#1a1a1a] rounded-[11px] text-xl font-black tracking-[0.2em] uppercase hover:bg-gray-100 transition-all shadow-lg active:scale-[0.98]"
                >
                    Оформить заказ
                </button>
            </div>
        </div>
    );
};

const LOGO_X_RANGE = 0.5;
const LOGO_Y_RANGE = 0.25;

const PowerbankLogoPanel = ({ logos, selectedLogoId, addLogo, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale, setLogoSide }) => {
    const selected = logos.find(l => l.id === selectedLogoId) || null;
    const rotStart = useRef(0);
    const rotStartX = useRef(null);

    const clampedPos = (rawX, rawY, scale) => {
        const half = (scale ?? 0.6) / 2;
        const maxX = Math.max(0, LOGO_X_RANGE - half);
        const maxY = Math.max(0, LOGO_Y_RANGE - half);
        return [
            Math.max(-maxX, Math.min(maxX, rawX)),
            Math.max(-maxY, Math.min(maxY, rawY)),
        ];
    };

    const updatePos = (e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        const rawX = (nx * 2 - 1) * LOGO_X_RANGE;
        const rawY = -(ny * 2 - 1) * LOGO_Y_RANGE;
        const [cx, cy] = clampedPos(rawX, rawY, selected?.scale);
        setLogoPosition(cx, cy);
    };

    const dotX = selected ? (selected.position[0] / LOGO_X_RANGE + 1) / 2 * 100 : 50;
    const dotY = selected ? (1 - (selected.position[1] / LOGO_Y_RANGE + 1) / 2) * 100 : 50;

    return (
        <div className="glass-panel rounded-[11px] p-5">
            <h3 className="text-xl font-bold tracking-wide mb-4">Логотип</h3>

            <label className="block w-full py-3 bg-white/10 rounded-[6px] text-center cursor-pointer border border-white/20 text-sm font-bold mb-4 hover:bg-white/20 transition-colors">
                + ДОБАВИТЬ ЛОГОТИП
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => { if (e.target.files[0]) { addLogo(e.target.files[0]); e.target.value = ''; } }}
                    className="hidden"
                />
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
                    <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] opacity-50 font-bold uppercase tracking-widest">Сторона нанесения</span>
                        <div className="grid grid-cols-2 gap-1.5">
                            {[
                                { value: 'outer', label: 'Внешняя' },
                                { value: 'charging', label: 'Зарядки' },
                            ].map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setLogoSide(opt.value)}
                                    className={`py-2.5 text-sm font-bold rounded-[7px] border transition-all ${(selected.side ?? 'outer') === opt.value ? 'bg-white text-[#1a1a1a] border-white' : 'bg-white/10 border-white/20 hover:bg-white/20'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-[10px] opacity-35 leading-tight mt-0.5">
                            {(selected.side ?? 'outer') === 'charging'
                                ? 'Сторона с кольцом и индикаторами'
                                : 'Противоположная плоская сторона'}
                        </p>
                    </div>

                    <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] opacity-50 font-bold uppercase tracking-widest">Позиция</span>
                            <button onClick={resetLogoTransform} className="text-[10px] font-bold opacity-40 hover:opacity-80 transition-opacity uppercase tracking-wider border border-white/20 px-2 py-0.5 rounded-[5px] hover:border-white/40">↺ По центру</button>
                        </div>
                        <div
                            className="relative w-full aspect-[2/1] bg-white/8 rounded-[10px] border border-white/15 cursor-crosshair touch-none select-none overflow-hidden"
                            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); updatePos(e); }}
                            onPointerMove={(e) => { if (e.buttons) updatePos(e); }}
                            onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                            onPointerCancel={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
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
                                    left: `${dotX}%`,
                                    top: `${dotY}%`,
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
                        <input
                            type="range" min="0.1" max="1.2" step="0.02"
                            value={selected.scale ?? 0.6}
                            onChange={(e) => {
                                const newScale = parseFloat(e.target.value);
                                setLogoScale(newScale);
                                const [cx, cy] = clampedPos(selected.position[0], selected.position[1], newScale);
                                if (cx !== selected.position[0] || cy !== selected.position[1]) {
                                    setLogoPosition(cx, cy);
                                }
                            }}
                            className="w-full h-1 bg-white/30 rounded-full appearance-none accent-white"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
