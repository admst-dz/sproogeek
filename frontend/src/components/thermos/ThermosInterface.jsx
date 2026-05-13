import { useState } from 'react';
import { useConfigurator, captureRender } from '../../store';
import { t } from '../../i18n';
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
} from '../configurator/ConstructorDock';

const palette = [
    { bg: '#e65405' },
    { bg: '#003087' },
    { bg: '#115740' },
    { bg: '#5E366E' },
    { bg: '#BA0C2F' },
    { bg: '#716D6A' },
    { bg: '#1B365D' },
];

export const ThermosInterface = ({ onFinish }) => {
    const [logoArea, setLogoArea] = useState('body');
    const [capLogoTarget, setCapLogoTarget] = useState('capTop');
    const {
        thermosBodyColor, thermosCapVisible,
        setColor, toggleThermosCap,
        thermosLogos, selectedThermosLogoId,
        addThermosLogo, selectThermosLogo, removeThermosLogo,
        resetThermosLogoTransform, setThermosLogoPosition,
        setThermosLogoRotation, setThermosLogoScale,
        addToCart, setRenderSnapshot, language,
    } = useConfigurator();
    const activeLogoTarget = logoArea === 'body' ? 'body' : capLogoTarget;

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        // Поля на верхнем уровне — applyRenderConfig мёрджит их напрямую в store
        const newItem = {
            productName: t(language, 'thermos'),
            design: `${t(language, 'thermosBodyPart')}: ${thermosBodyColor}, ${t(language, 'thermosCapPart')}: ${thermosBodyColor}`,
            priceTK: 50,
            priceBYN: 2000,
            activeProduct: 'thermos',
            thermosBodyColor,
            thermosCapColor: thermosBodyColor,
            thermosLogos,
            status: 'draft',
            rendersGenerated: 0,
        };
        addToCart(newItem);
        onFinish();
    };

    return (
        <ConstructorDock title={t(language, 'thermosTitle')} onSave={handleAddToCart} saveLabel={t(language, 'placeOrder')}>
            <DockGrid
                cols="md:grid-cols-[0.9fr_1.08fr_1.24fr_0.85fr]"
            >
                <SettingGroup title={t(language, 'thermosBodyPart')}>
                    <SettingRow label={t(language, 'bodyColor')}>
                        <ColorSwatches colors={palette} currentColor={thermosBodyColor} onSelect={(c) => setColor('thermosBody', c)} />
                    </SettingRow>
                    <SettingRow label={t(language, 'thermosCap')}>
                        <MiniToggle checked={thermosCapVisible} onChange={toggleThermosCap} />
                    </SettingRow>
                </SettingGroup>

                <SettingGroup title={t(language, 'logoLabel')}>
                    <SettingRow label={t(language, 'applicationSide')}>
                        <MiniSegment
                            value={logoArea}
                            onChange={setLogoArea}
                            options={[
                                { value: 'body', label: t(language, 'thermosBodyPart') },
                                { value: 'cap', label: t(language, 'thermosCapPart') },
                            ]}
                        />
                    </SettingRow>
                    {logoArea === 'cap' && (
                        <SettingRow label={t(language, 'thermosCapPart')}>
                            <MiniSegment
                                value={capLogoTarget}
                                onChange={setCapLogoTarget}
                                options={[
                                    { value: 'capTop', label: t(language, 'thermosCapTop') },
                                    { value: 'capSide', label: t(language, 'thermosCapSide') },
                                ]}
                            />
                        </SettingRow>
                    )}
                    <SettingRow label={activeLogoTarget === 'body' ? t(language, 'aiWrap') : t(language, 'aiDesign')}>
                        <span className="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/38">{t(language, 'comingSoon')}</span>
                    </SettingRow>
                </SettingGroup>

                <ThermosLogoPanel
                    logos={thermosLogos}
                    selectedLogoId={selectedThermosLogoId}
                    activeLogoTarget={activeLogoTarget}
                    addLogo={addThermosLogo}
                    selectLogo={selectThermosLogo}
                    removeLogo={removeThermosLogo}
                    resetLogoTransform={resetThermosLogoTransform}
                    setLogoPosition={setThermosLogoPosition}
                    setLogoRotation={setThermosLogoRotation}
                    setLogoScale={setThermosLogoScale}
                    language={language}
                />

                <SettingGroup title={t(language, 'thermosTitle')}>
                    <SettingRow label={t(language, 'thermosBodyPart')}>
                        <span className="text-[11px] font-black uppercase tracking-wider text-white/70">{thermosBodyColor}</span>
                    </SettingRow>
                    <SettingRow label={t(language, 'thermosCapPart')}>
                        <span className="text-[11px] font-black uppercase tracking-wider text-white/70">{thermosCapVisible ? t(language, 'thermosCap') : '—'}</span>
                    </SettingRow>
                </SettingGroup>
            </DockGrid>
        </ConstructorDock>
    );
};

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---

const ThermosLogoPanel = ({ logos, selectedLogoId, activeLogoTarget, addLogo, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale, language }) => {
    const visibleLogos = logos.filter(l => (l.target ?? 'body') === activeLogoTarget);
    const selected = visibleLogos.find(l => l.id === selectedLogoId) || null;
    const xRange = 0.35;
    const yRange = activeLogoTarget === 'body' ? 2.5 : activeLogoTarget === 'capSide' ? 1 : 0.35;

    return (
        <SettingGroup title={t(language, 'logoLabel')}>
            <SettingRow label={t(language, 'logoLabel')}>
                <FileUploadChip label={t(language, 'addLogo')} onFile={(file) => addLogo(file, activeLogoTarget)} />
            </SettingRow>
            <LogoList logos={visibleLogos} selectedLogoId={selectedLogoId} selectLogo={selectLogo} removeLogo={removeLogo} />
            {selected && (
                <>
                    <div className="mt-3 space-y-3 md:hidden">
                        {selected.mode === 'wrap' && (
                            <div className="rounded-[8px] border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold text-white/60">
                                {t(language, 'aiWrapApplied')}
                            </div>
                        )}
                        {selected.mode !== 'wrap' && (
                            <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} xRange={xRange} yRange={yRange} />
                        )}
                        {selected.mode !== 'wrap' && (
                            <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                        )}
                        {selected.mode !== 'wrap' && (
                            <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.12} max={activeLogoTarget === 'body' ? 1.5 : 0.9} step={0.03} onChange={setLogoScale} />
                        )}
                    </div>
                    <FloatingLogoSettings title={t(language, 'logoLabel')} subtitle={selected.filename}>
                    {selected.mode === 'wrap' && (
                        <div className="rounded-[8px] border border-white/10 bg-white/8 px-3 py-2 text-xs font-bold text-white/60">
                            {t(language, 'aiWrapApplied')}
                        </div>
                    )}
                    {selected.mode !== 'wrap' && (
                        <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} xRange={xRange} yRange={yRange} />
                    )}
                    {selected.mode !== 'wrap' && (
                        <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                    )}
                    {selected.mode !== 'wrap' && (
                        <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.12} max={activeLogoTarget === 'body' ? 1.5 : 0.9} step={0.03} onChange={setLogoScale} />
                    )}
                    </FloatingLogoSettings>
                </>
            )}
        </SettingGroup>
    );
};

export const ZoomControls = ({ zoomLevel, setZoom }) => (
    <div className="flex flex-col gap-1 bg-white/80 backdrop-blur-md rounded-[9px] p-1 border border-white/40 shadow-xl">
        <button onClick={() => setZoom(Math.min(zoomLevel + 0.1, 2.5))} className="w-10 h-10 flex items-center justify-center text-[#1a1a1a] hover:bg-white rounded-[6px] transition active:scale-95">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <div className="h-px w-full bg-black/10" />
        <button onClick={() => setZoom(Math.max(zoomLevel - 0.1, 0.35))} className="w-10 h-10 flex items-center justify-center text-[#1a1a1a] hover:bg-white rounded-[6px] transition active:scale-95">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
    </div>
);
