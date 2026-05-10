import { useConfigurator, captureRender } from '../../store';
import { t } from '../../i18n';
import {
    ColorSwatches,
    ConstructorDock,
    DockGrid,
    DockTitleColumn,
    FileUploadChip,
    FloatingLogoSettings,
    LogoList,
    MiniSegment,
    RotationScrub,
    SettingGroup,
    SettingRow,
    SizeSlider,
    TransformPad,
} from '../configurator/ConstructorDock';

const palette = [
    { bg: '#75787B' },
];

export const PowerbankInterface = ({ onFinish }) => {
    const {
        powerbankBodyColor,
        setColor,
        powerbankLogos, selectedPowerbankLogoId,
        addPowerbankLogo, selectPowerbankLogo, removePowerbankLogo,
        resetPowerbankLogoTransform,
        setPowerbankLogoPosition, setPowerbankLogoRotation, setPowerbankLogoScale, setPowerbankLogoSide,
        addToCart, setRenderSnapshot, language,
    } = useConfigurator();

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        addToCart({
            productName: t(language, 'powerbank'),
            design: `${t(language, 'bodyColor')}: ${powerbankBodyColor}`,
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
        <ConstructorDock title={t(language, 'powerbankTitle')} onSave={handleAddToCart} saveLabel={t(language, 'placeOrder')} desktopTitleColumn>
            <DockGrid
                cols="md:grid-cols-[0.78fr_0.9fr_1.16fr_0.85fr]"
                leading={<DockTitleColumn title={t(language, 'powerbankTitle')} />}
            >
                <SettingGroup title={t(language, 'bodyColor')}>
                    <SettingRow label={t(language, 'bodyColor')}>
                        <ColorSwatches colors={palette} currentColor={powerbankBodyColor} onSelect={(c) => setColor('powerbankBody', c)} />
                    </SettingRow>
                </SettingGroup>

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
                    language={language}
                />

                <SettingGroup title={t(language, 'powerbankTitle')}>
                    <SettingRow label={t(language, 'bodyColor')}>
                        <span className="text-[11px] font-black uppercase tracking-wider text-white/70">{powerbankBodyColor}</span>
                    </SettingRow>
                    <SettingRow label={t(language, 'logoLabel')}>
                        <span className="text-[11px] font-black uppercase tracking-wider text-white/70">{powerbankLogos.length}</span>
                    </SettingRow>
                </SettingGroup>
            </DockGrid>
        </ConstructorDock>
    );
};

const PowerbankLogoPanel = ({ logos, selectedLogoId, addLogo, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale, setLogoSide, language }) => {
    const selected = logos.find(l => l.id === selectedLogoId) || null;

    return (
        <SettingGroup title={t(language, 'logoLabel')}>
            <SettingRow label={t(language, 'logoLabel')}>
                <FileUploadChip label={t(language, 'addLogo')} onFile={addLogo} />
            </SettingRow>
            <LogoList
                logos={logos}
                selectedLogoId={selectedLogoId}
                selectLogo={selectLogo}
                removeLogo={removeLogo}
                metaForLogo={(logo) => (logo.side ?? 'outer') === 'charging' ? t(language, 'chargingSide') : t(language, 'outerSide')}
            />

            {selected && (
                <>
                    <div className="mt-3 space-y-3 md:hidden">
                        <SettingRow label={t(language, 'applicationSide')}>
                            <MiniSegment
                                value={selected.side ?? 'outer'}
                                onChange={setLogoSide}
                                options={[
                                    { value: 'outer', label: t(language, 'outerSide') },
                                    { value: 'charging', label: t(language, 'chargingSide') },
                                ]}
                            />
                        </SettingRow>
                        <p className="text-[10px] leading-tight text-white/35">
                            {(selected.side ?? 'outer') === 'charging' ? t(language, 'chargingSideDesc') : t(language, 'outerSideDesc')}
                        </p>
                        <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} aspect="aspect-[3/4]" />
                        <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                        <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.1} max={1.2} step={0.02} onChange={setLogoScale} />
                    </div>
                    <FloatingLogoSettings title={t(language, 'logoLabel')} subtitle={selected.filename}>
                    <SettingRow label={t(language, 'applicationSide')}>
                        <MiniSegment
                            value={selected.side ?? 'outer'}
                            onChange={setLogoSide}
                            options={[
                                { value: 'outer', label: t(language, 'outerSide') },
                                { value: 'charging', label: t(language, 'chargingSide') },
                            ]}
                        />
                    </SettingRow>
                    <p className="text-[10px] leading-tight text-white/35">
                        {(selected.side ?? 'outer') === 'charging' ? t(language, 'chargingSideDesc') : t(language, 'outerSideDesc')}
                    </p>
                    <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} aspect="aspect-[3/4]" />
                    <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                    <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.1} max={1.2} step={0.02} onChange={setLogoScale} />
                    </FloatingLogoSettings>
                </>
            )}
        </SettingGroup>
    );
};
