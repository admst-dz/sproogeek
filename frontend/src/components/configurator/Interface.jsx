import { useState } from 'react';
import { useConfigurator, captureRender } from "../../store";
import { t } from '../../i18n';
import { BlockPDFPreview } from './BlockPDFPreview';
import { BlockBuilder } from './BlockBuilder';
import {
    ColorSwatches,
    ConstructorDock,
    DockGrid,
    FileUploadChip,
    FloatingLogoSettings,
    LogoList,
    MiniSegment,
    MiniToggle,
    RotationScrub,
    SettingGroup,
    SettingRow,
    SizeSlider,
    TransformPad,
} from './ConstructorDock';
import patternBlank  from '../../assets/icons/pattern-blank.svg';
import patternLined  from '../../assets/icons/pattern-lined.svg';
import patternTlined from '../../assets/icons/pattern-tlined.svg';
import patternGrid   from '../../assets/icons/pattern-grid.svg';
import patternDotted from '../../assets/icons/pattern-dotted.svg';

const PATTERN_IDS = ['blank', 'lined', 'tlined', 'grid', 'dotted'];
const PATTERN_ICONS = { blank: patternBlank, lined: patternLined, tlined: patternTlined, grid: patternGrid, dotted: patternDotted };
const PATTERN_KEYS = { blank: 'patternBlank', lined: 'patternLined', tlined: 'patternTLined', grid: 'patternGrid', dotted: 'patternDotted' };

const palette = [
    { name: 'Yellow', bg: '#FDD835' },
    { name: 'Red', bg: '#D32F2F' },
    { name: 'Green', bg: '#43A047' },
    { name: 'Black', bg: '#1a1a1a' },
    { name: 'Blue', bg: '#1565C0' },
    { name: 'White', bg: '#ffffff' },
    { name: 'Pink', bg: '#EC407A' },
    { name: 'Silver', bg: '#C0C0C0' },
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
        hasCorners, toggleCorners,
        setNotebookOpen,
        paperPattern, setPaperPattern,
        blockPages, paperType,
        logos, selectedLogoId, addLogo, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale, setLogoSide,
        activeProduct,
        zoomLevel, setZoom,
        addToCart,
        setRenderSnapshot,
        language
    } = useConfigurator();

    if (activeProduct === 'calendar') {
        return (
            <div className="pointer-events-auto w-full h-full md:h-[95%] custom-gradient backdrop-blur-xl rounded-t-[30px] md:rounded-[9px] flex items-center justify-center border-t md:border border-white/30 relative">
                <ZoomControlsOverlay zoomLevel={zoomLevel} setZoom={setZoom} />
                <div className="font-zen text-2xl font-bold uppercase tracking-widest text-white drop-shadow-md">
                    {t(language, 'wip')}
                </div>
            </div>
        );
    }

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        const bindingLabel = bindingType === 'hard' ? t(language, 'bindingHard') : bindingType === 'spiral' ? t(language, 'bindingSpiral') : t(language, 'bindingSoft');
        const orderHasElastic = bindingType !== 'hard' && hasElastic;
        const newItem = {
            productName: `${t(language, 'notebook')} ${format}`,
            design: `${t(language, 'bindingFormatLabel')} ${bindingLabel}, ${t(language, 'patternLabel')}: ${paperPattern}`,
            priceBYN: 1500,
            type: 'notebook',
            config: { format, coverColor, hasElastic: orderHasElastic, elasticColor, paperPattern, bindingType, spiralColor, hasCorners, blockPages, paperType },
            format, coverColor, hasElastic: orderHasElastic, elasticColor, paperPattern, bindingType, spiralColor, hasCorners, blockPages, paperType,
            status: 'draft',
            rendersGenerated: 0,
            quantity,
            isSample,
        };
        addToCart(newItem);
        onFinish();
    };

    return (
        <ConstructorDock
            title={t(language, 'notebook')}
            tabs={[
                { id: 'cover', label: t(language, 'tabCover') },
                { id: 'block', label: t(language, 'tabBlock') },
            ]}
            activeTab={tab}
            onTabChange={(next) => { setTab(next); setNotebookOpen(next === 'block'); }}
            onSave={handleAddToCart}
            saveLabel={t(language, 'placeOrder')}
        >
            {tab === 'cover' && (
                <DockGrid
                    cols="md:grid-cols-[1fr_1fr_1.12fr_0.85fr]"
                >
                    <SettingGroup title={t(language, 'formatLabel')} compact>
                        <SettingRow label={t(language, 'formatLabel')} inline>
                            <MiniSegment
                                value={format}
                                onChange={setFormat}
                                options={['A5', 'A6'].map(value => ({ value, label: value }))}
                            />
                        </SettingRow>
                        <SettingRow label={t(language, 'bindingTypeLabel')} inline>
                            <MiniSegment
                                value={bindingType}
                                onChange={setBindingType}
                                options={[
                                    { value: 'hard', label: t(language, 'bindingHard') },
                                    { value: 'soft', label: t(language, 'bindingSoft') },
                                    { value: 'spiral', label: t(language, 'bindingSpiral') },
                                ]}
                            />
                        </SettingRow>
                        {(bindingType === 'hard' || bindingType === 'soft') && (
                            <SettingRow label={t(language, 'cornersLabel')} inline>
                                <MiniToggle checked={hasCorners} onChange={toggleCorners} />
                            </SettingRow>
                        )}
                    </SettingGroup>

                    <SettingGroup title={t(language, 'coverColorLabel')} compact>
                        <SettingRow label={t(language, 'coverColorLabel')}>
                            <ColorSwatches colors={palette} currentColor={coverColor} onSelect={(c) => setColor('cover', c)} />
                        </SettingRow>
                        {bindingType !== 'hard' && (
                            <>
                                <SettingRow label={t(language, 'elasticLabel')} inline>
                                    <MiniToggle checked={hasElastic} onChange={setHasElastic} />
                                </SettingRow>
                                {hasElastic && (
                                    <SettingRow label={t(language, 'elasticColorLabel')}>
                                        <ColorSwatches colors={palette} currentColor={elasticColor} onSelect={(c) => setColor('elastic', c)} />
                                    </SettingRow>
                                )}
                            </>
                        )}
                        {bindingType === 'spiral' && (
                            <SettingRow label={t(language, 'spiralColorLabel')}>
                                <ColorSwatches colors={palette} currentColor={spiralColor} onSelect={(c) => setColor('spiral', c)} />
                            </SettingRow>
                        )}
                    </SettingGroup>

                    <LogoPanel
                        logos={logos}
                        selectedLogoId={selectedLogoId}
                        addLogo={addLogo}
                        selectLogo={selectLogo}
                        removeLogo={removeLogo}
                        resetLogoTransform={resetLogoTransform}
                        setLogoPosition={setLogoPosition}
                        setLogoRotation={setLogoRotation}
                        setLogoScale={setLogoScale}
                        setLogoSide={setLogoSide}
                        language={language}
                        compact
                    />

                    <SettingGroup title={t(language, 'placeOrder')} compact>
                        <SettingRow label={t(language, 'quantityLabel')} inline>
                            <div className="flex items-center gap-1">
                                <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="h-6 w-6 rounded-full bg-white/10 font-black">−</button>
                                <span className="w-7 text-center text-sm font-black">{quantity}</span>
                                <button onClick={() => setQuantity(q => q + 1)} className="h-6 w-6 rounded-full bg-white/10 font-black">+</button>
                            </div>
                        </SettingRow>
                        <SettingRow label={t(language, 'sampleLabel')} inline>
                            <MiniToggle checked={isSample} onChange={setIsSample} />
                        </SettingRow>
                        <p className="text-[10px] leading-tight text-white/35">{t(language, 'sampleDesc')}</p>
                    </SettingGroup>
                </DockGrid>
            )}

            {tab === 'block' && (
                <DockGrid
                    cols="md:grid-cols-1"
                >
                    <div className="min-w-0 space-y-3 md:pl-5 lg:pl-6">
                        <div className="grid grid-cols-2 min-[380px]:grid-cols-3 sm:grid-cols-5 gap-2">
                            {PATTERN_IDS.map((id) => (
                                <button
                                    key={id}
                                    onClick={() => setPaperPattern(id)}
                                    className={`rounded-[8px] border px-2 py-2 transition ${paperPattern === id ? 'border-[#fff9ec] bg-[#fff9ec] text-[#191919]' : 'border-white/18 bg-white/8 text-white/75 hover:text-white'}`}
                                >
                                    <div className="mx-auto mb-1 h-8 w-8 rounded-[6px] border border-current/20 p-1">
                                        <img src={PATTERN_ICONS[id]} alt={t(language, PATTERN_KEYS[id])} className="h-full w-full object-contain" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-wider">{t(language, PATTERN_KEYS[id])}</span>
                                </button>
                            ))}
                        </div>
                        <BlockPDFPreview pattern={paperPattern} />
                        {paperPattern === 'blank' && (
                            <div className="rounded-[8px] border border-white/12 bg-white/8 p-3 text-center text-xs text-white/55">
                                {t(language, 'blankPages')}
                            </div>
                        )}
                        <BlockBuilder />
                    </div>
                </DockGrid>
            )}
        </ConstructorDock>
    )
}

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---
const LogoPanel = ({ logos, selectedLogoId, addLogo, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale, setLogoSide, language, compact = false }) => {
    const selected = logos.find(l => l.id === selectedLogoId) || null;
    const [uploadSide, setUploadSide] = useState('front');
    const activeSide = selected?.side ?? uploadSide;

    const selectSide = (side) => {
        if (selected) setLogoSide(side);
        setUploadSide(side);
    };

    return (
        <SettingGroup title={t(language, 'embossing')} compact={compact}>
            <SettingRow label={t(language, 'embossing')} inline={compact}>
                <FileUploadChip label={t(language, 'addLogo')} onFile={(file) => addLogo(file, activeSide)} />
            </SettingRow>
            <SettingRow label={t(language, 'applicationSide') || t(language, 'sideFront')} inline={compact}>
                <MiniSegment
                    value={activeSide}
                    onChange={selectSide}
                    options={[
                        { value: 'front', label: t(language, 'sideFront') },
                        { value: 'back', label: t(language, 'sideBack') },
                    ]}
                />
            </SettingRow>
            <LogoList
                logos={logos}
                selectedLogoId={selectedLogoId}
                selectLogo={(id) => { selectLogo(id); const picked = logos.find(l => l.id === id); setUploadSide(picked?.side ?? 'front'); }}
                removeLogo={removeLogo}
                metaForLogo={(logo) => (logo.side ?? 'front') === 'back' ? t(language, 'sideBack') : t(language, 'sideFront')}
            />
            {selected && (
                <>
                    <div className="mt-3 space-y-3 md:hidden">
                        <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} />
                        <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                        <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.2} max={1.5} step={0.05} onChange={setLogoScale} />
                    </div>
                    <FloatingLogoSettings title={t(language, 'logoLabel')} subtitle={selected.filename}>
                    <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} />
                    <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                    <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.2} max={1.5} step={0.05} onChange={setLogoScale} />
                    </FloatingLogoSettings>
                </>
            )}
        </SettingGroup>
    );
};
export const ZoomControls = ({ zoomLevel, setZoom }) => (
    <div className="flex flex-col gap-1 bg-white/80 backdrop-blur-md rounded-[9px] p-1 border border-white/40 shadow-xl">
        <button onClick={() => setZoom(Math.min(zoomLevel + 0.1, 2.5))} className="w-10 h-10 flex items-center justify-center text-[#1a1a1a] hover:bg-white rounded-[6px] transition active:scale-95"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
        <div className="h-px w-full bg-black/10" />
        <button onClick={() => setZoom(Math.max(zoomLevel - 0.1, 0.35))} className="w-10 h-10 flex items-center justify-center text-[#1a1a1a] hover:bg-white rounded-[6px] transition active:scale-95"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg></button>
    </div>
)
const ZoomControlsOverlay = ({ zoomLevel, setZoom }) => (<div className="absolute top-4 right-4 z-50"><ZoomControls zoomLevel={zoomLevel} setZoom={setZoom} /></div>)
const GlassDropdown = ({ label, currentValue, children, isColor = false, colorValue }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="glass-panel rounded-[11px] transition-all overflow-hidden shadow-sm">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full p-4 md:p-5 flex items-center justify-between gap-3 hover:bg-white/10 transition">
                <span className="text-lg md:text-xl font-bold tracking-wide text-left leading-tight">{label}</span>
                <div className="flex items-center gap-2 md:gap-3 shrink-0">
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
