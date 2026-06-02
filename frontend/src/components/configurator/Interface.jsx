import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConfigurator, captureRender, getNotebookBindingCapabilities } from "../../store";
import { t } from '../../i18n';
import { BlockPDFPreview } from './BlockPDFPreview';
import { BlockBuilder } from './BlockBuilder';
import {
    ColorDropdown,
    ColorSwatches,
    ConstructorDock,
    DockGrid,
    FileUploadChip,
    FloatingLogoSettings,
    LogoList,
    MiniDropdown,
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
import { NOTEBOOK_COLOR_PALETTE } from '../../config/productPalettes';
import { GuestApprovalModal } from '../shared/GuestApprovalModal';
import { LogoBackgroundRemovalButton } from '../shared/LogoBackgroundRemovalButton';

const PATTERN_IDS = ['blank', 'lined', 'tlined', 'grid', 'dotted'];
const PATTERN_ICONS = { blank: patternBlank, lined: patternLined, tlined: patternTlined, grid: patternGrid, dotted: patternDotted };
const PATTERN_KEYS = { blank: 'patternBlank', lined: 'patternLined', tlined: 'patternTLined', grid: 'patternGrid', dotted: 'patternDotted' };
const GAME_COPY = {
    ru: {
        modeGame: 'Игровой режим',
        modePro: 'Детально',
        stepFormat: 'Собери основу',
        stepCover: 'Цвет обложки',
        stepSpiral: 'Пружина',
        stepLogo: 'Нанесение',
        stepBlock: 'Блок',
        stepFinish: 'Финиш',
        gameTitle: 'Ежедневник на пружине',
        gameSubtitle: 'Проходи шаги и сразу смотри результат на модели.',
        gameProgress: 'шаг',
        outerCoverHint: 'Лицевая сторона',
        innerCoverHint: 'Внутренняя сторона',
        stitchHint: 'Нить по краю',
        spiralHint: 'Металл пружины',
        elasticHint: 'Резинка',
        logoEmpty: 'Можно оставить без логотипа или добавить файл.',
        logoTune: 'Выбери логотип и настрой посадку на обложке.',
        next: 'Далее',
        back: 'Назад',
        finishOrder: 'Оформить',
        sampleToggle: 'Образец',
        quantityShort: 'Тираж',
        readyTitle: 'Готовый сценарий',
        readyDesc: 'Проверь параметры и отправляй заказ.',
        finalCover: 'Обложка',
        finalSpring: 'Пружина',
        finalLogos: 'Логотипы',
        finalPattern: 'Блок',
        proModeHint: 'Расширенные настройки',
        mission: 'Миссия',
        screenFormatTitle: 'Выбери размер ежедневника',
        screenCoverTitle: 'Подбери настроение обложки',
        screenSpiralTitle: 'Настрой металл и детали',
        screenLogoTitle: 'Размести логотип',
        screenBlockTitle: 'Выбери страницы внутри',
        screenFinishTitle: 'Проверь сборку',
    },
    en: {
        modeGame: 'Game mode',
        modePro: 'Detailed',
        stepFormat: 'Build base',
        stepCover: 'Cover color',
        stepSpiral: 'Spring',
        stepLogo: 'Logo',
        stepBlock: 'Block',
        stepFinish: 'Finish',
        gameTitle: 'Spiral notebook',
        gameSubtitle: 'Move step by step and watch the model update.',
        gameProgress: 'step',
        outerCoverHint: 'Front cover',
        innerCoverHint: 'Inside cover',
        stitchHint: 'Edge thread',
        spiralHint: 'Spring metal',
        elasticHint: 'Elastic band',
        logoEmpty: 'Keep it clean or upload a logo file.',
        logoTune: 'Select a logo and tune its placement on the cover.',
        next: 'Next',
        back: 'Back',
        finishOrder: 'Order',
        sampleToggle: 'Sample',
        quantityShort: 'Qty',
        readyTitle: 'Ready setup',
        readyDesc: 'Check the details and send the order.',
        finalCover: 'Cover',
        finalSpring: 'Spring',
        finalLogos: 'Logos',
        finalPattern: 'Block',
        proModeHint: 'Advanced settings',
        mission: 'Mission',
        screenFormatTitle: 'Choose the notebook size',
        screenCoverTitle: 'Set the cover mood',
        screenSpiralTitle: 'Tune the metal and details',
        screenLogoTitle: 'Place the logo',
        screenBlockTitle: 'Choose the inner pages',
        screenFinishTitle: 'Review the build',
    },
    by: {
        modeGame: 'Гульнявы рэжым',
        modePro: 'Падрабязна',
        stepFormat: 'Збяры аснову',
        stepCover: 'Колер вокладкі',
        stepSpiral: 'Пружына',
        stepLogo: 'Нанясенне',
        stepBlock: 'Блок',
        stepFinish: 'Фініш',
        gameTitle: 'Штодзённік на пружыне',
        gameSubtitle: 'Ідзі па кроках і адразу глядзі вынік на мадэлі.',
        gameProgress: 'крок',
        outerCoverHint: 'Ліцавы бок',
        innerCoverHint: 'Унутраны бок',
        stitchHint: 'Нітка па краі',
        spiralHint: 'Метал пружыны',
        elasticHint: 'Гумка',
        logoEmpty: 'Можна пакінуць без лагатыпа або дадаць файл.',
        logoTune: 'Выберы лагатып і наладзь яго месца на вокладцы.',
        next: 'Далей',
        back: 'Назад',
        finishOrder: 'Аформіць',
        sampleToggle: 'Узор',
        quantityShort: 'Наклад',
        readyTitle: 'Гатовы сцэнар',
        readyDesc: 'Правер параметры і адпраўляй заказ.',
        finalCover: 'Вокладка',
        finalSpring: 'Пружына',
        finalLogos: 'Лагатыпы',
        finalPattern: 'Блок',
        proModeHint: 'Пашыраныя налады',
        mission: 'Місія',
        screenFormatTitle: 'Выберы памер штодзённіка',
        screenCoverTitle: 'Падбяры настрой вокладкі',
        screenSpiralTitle: 'Наладзь метал і дэталі',
        screenLogoTitle: 'Размясці лагатып',
        screenBlockTitle: 'Выберы старонкі ўнутры',
        screenFinishTitle: 'Правер зборку',
    },
};

const gameText = (language, key) => GAME_COPY[language]?.[key] ?? GAME_COPY.ru[key] ?? key;

export const Interface = ({ onFinish }) => {
    const [tab, setTab] = useState('cover');
    const [mode, setMode] = useState('game');
    const [gameStep, setGameStep] = useState(0);
    const [quantity, setQuantity] = useState(1);
    const [isSample, setIsSample] = useState(false);

    const {
        format, setFormat,
        bindingType, setBindingType,
        setColor, coverColor, innerCoverColor, stitchColor, elasticColor, spiralColor,
        hasElastic, setHasElastic,
        hasCorners, toggleCorners,
        setNotebookOpen,
        paperPattern, setPaperPattern,
        blockPages, paperType,
        logos, selectedLogoId, addLogo, replaceLogoFile, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale, setLogoSide,
        activeProduct,
        zoomLevel, setZoom,
        addToCart,
        setRenderSnapshot,
        language,
        guestApprovalEnabled,
    } = useConfigurator();

    const [approvalOpen, setApprovalOpen] = useState(false);
    const [approvalSnapshot, setApprovalSnapshot] = useState(null);
    const selectedLogo = logos.find(l => l.id === selectedLogoId) || null;
    const gameSteps = useMemo(() => ([
        { id: 'format', label: gameText(language, 'stepFormat') },
        { id: 'cover', label: gameText(language, 'stepCover') },
        { id: 'spiral', label: gameText(language, 'stepSpiral') },
        { id: 'logo', label: gameText(language, 'stepLogo') },
        { id: 'block', label: gameText(language, 'stepBlock') },
        { id: 'finish', label: gameText(language, 'stepFinish') },
    ]), [language]);

    useEffect(() => {
        if (mode !== 'game' || bindingType === 'spiral') return;
        setBindingType('spiral');
    }, [bindingType, mode, setBindingType]);

    useEffect(() => {
        if (mode !== 'game') return;
        setNotebookOpen(gameSteps[gameStep]?.id === 'block');
    }, [gameStep, gameSteps, mode, setNotebookOpen]);

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

    const bindingCaps = getNotebookBindingCapabilities(bindingType);

    const buildNotebookItem = (snapshot) => {
        const bindingLabel = bindingType === 'hard' ? t(language, 'bindingHard') : bindingType === 'spiral' ? t(language, 'bindingSpiral') : t(language, 'bindingSoft');
        const orderHasElastic = bindingCaps.hasElastic && hasElastic;
        const orderHasCorners = bindingCaps.hasCorners && hasCorners;
        const orderSpiralColor = bindingCaps.hasSpiralColor ? spiralColor : null;
        const orderInnerCoverColor = bindingCaps.hasInnerCoverColor ? innerCoverColor : null;
        const orderStitchColor = bindingCaps.hasStitchColor ? stitchColor : null;
        return {
            productName: `${t(language, 'notebook')} ${format}`,
            design: `${t(language, 'bindingFormatLabel')} ${bindingLabel}, ${t(language, 'patternLabel')}: ${paperPattern}`,
            priceBYN: 1500,
            type: 'notebook',
            activeProduct: 'notebook',
            config: { format, coverColor, innerCoverColor: orderInnerCoverColor, hasInnerCover: bindingCaps.hasInnerCoverColor, hasStitch: bindingCaps.hasStitch, stitchColor: orderStitchColor, hasElastic: orderHasElastic, elasticColor: orderHasElastic ? elasticColor : null, paperPattern, bindingType, spiralColor: orderSpiralColor, hasCorners: orderHasCorners, blockPages, paperType, logos },
            format, coverColor, innerCoverColor: orderInnerCoverColor, hasInnerCover: bindingCaps.hasInnerCoverColor, hasStitch: bindingCaps.hasStitch, stitchColor: orderStitchColor, hasElastic: orderHasElastic, elasticColor: orderHasElastic ? elasticColor : null, paperPattern, bindingType, spiralColor: orderSpiralColor, hasCorners: orderHasCorners, blockPages, paperType, logos,
            status: 'draft',
            rendersGenerated: 0,
            quantity,
            isSample,
            renderUrl: snapshot || null,
        };
    };

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        addToCart(buildNotebookItem(snapshot));
        onFinish();
    };

    const handleEmailApproval = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        setApprovalSnapshot(snapshot || null);
        setApprovalOpen(true);
    };

    if (mode === 'game') {
        return (
            <>
                <SpiralGameEditor
                    steps={gameSteps}
                    currentStep={gameStep}
                    setCurrentStep={setGameStep}
                    language={language}
                    format={format}
                    setFormat={setFormat}
                    coverColor={coverColor}
                    innerCoverColor={innerCoverColor}
                    stitchColor={stitchColor}
                    spiralColor={spiralColor}
                    elasticColor={elasticColor}
                    hasElastic={hasElastic}
                    setHasElastic={setHasElastic}
                    setColor={setColor}
                    paperPattern={paperPattern}
                    setPaperPattern={setPaperPattern}
                    logos={logos}
                    selectedLogo={selectedLogo}
                    selectedLogoId={selectedLogoId}
                    addLogo={addLogo}
                    replaceLogoFile={replaceLogoFile}
                    selectLogo={selectLogo}
                    removeLogo={removeLogo}
                    resetLogoTransform={resetLogoTransform}
                    setLogoPosition={setLogoPosition}
                    setLogoRotation={setLogoRotation}
                    setLogoScale={setLogoScale}
                    setLogoSide={setLogoSide}
                    quantity={quantity}
                    setQuantity={setQuantity}
                    isSample={isSample}
                    setIsSample={setIsSample}
                    onFinishOrder={handleAddToCart}
                    onEmailApproval={guestApprovalEnabled ? handleEmailApproval : null}
                    onSwitchPro={() => setMode('pro')}
                />
                <GuestApprovalModal
                    isOpen={approvalOpen}
                    onClose={() => setApprovalOpen(false)}
                    renderDataURL={approvalSnapshot}
                    productName={`${t(language, 'notebook')} ${format}`}
                    configuration={{ productConfig: buildNotebookItem(approvalSnapshot) }}
                    quantity={quantity}
                />
            </>
        );
    }

    return (
        <ConstructorDock
            title={t(language, 'notebook')}
            onSave={handleAddToCart}
            saveLabel={t(language, 'placeOrder')}
            onEmailApproval={guestApprovalEnabled ? handleEmailApproval : null}
            emailApprovalLabel={t(language, 'emailApproval')}
        >
            <div className="mb-3 md:mb-4 flex flex-col items-center gap-2">
                <div className="flex gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                    {[
                        { id: 'game', label: gameText(language, 'modeGame') },
                        { id: 'pro', label: gameText(language, 'modePro') },
                    ].map(({ id, label }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => { setMode(id); if (id === 'game') { setTab('cover'); setNotebookOpen(false); } }}
                            className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition md:px-5 md:py-2 md:text-[12px] ${
                                mode === id ? 'bg-[#fff9ec] text-[#1b1b1b]' : 'text-white/60 hover:text-white'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {mode === 'pro' && (
                    <div className="flex gap-1 rounded-full border border-white/15 bg-white/10 p-1">
                        {[
                            { id: 'cover', label: t(language, 'tabCover') },
                            { id: 'block', label: t(language, 'tabBlock') },
                        ].map(({ id, label }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={() => { setTab(id); setNotebookOpen(id === 'block'); }}
                                className={`rounded-full px-4 py-1.5 md:px-6 md:py-2 text-[11px] md:text-[12px] font-black uppercase tracking-wider transition ${
                                    tab === id ? 'bg-[#fff9ec] text-[#1b1b1b]' : 'text-white/60 hover:text-white'
                                }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {mode === 'pro' && tab === 'cover' && (
                <DockGrid
                    cols="md:grid-cols-2"
                >
                    <SettingGroup title={t(language, 'formatLabel')} compact>
                        <SettingRow label={t(language, 'formatLabel')}>
                            <FormatGlassTable value={format} onChange={setFormat} />
                        </SettingRow>
                        <SettingRow label={t(language, 'bindingTypeLabel')} inline>
                            <MiniDropdown
                                value={bindingType}
                                onChange={setBindingType}
                                options={[
                                    { value: 'hard', label: t(language, 'bindingHard') },
                                    { value: 'soft', label: t(language, 'bindingSoft') },
                                    { value: 'spiral', label: t(language, 'bindingSpiral') },
                                ]}
                            />
                        </SettingRow>
                        {bindingCaps.hasCorners && (
                            <SettingRow label={t(language, 'cornersLabel')} inline>
                                <MiniToggle checked={hasCorners} onChange={toggleCorners} />
                            </SettingRow>
                        )}
                    </SettingGroup>

                    <SettingGroup title={bindingCaps.hasInnerCoverColor ? t(language, 'coverColorsLabel') : t(language, 'coverColorLabel')} compact>
                        <SettingRow label={bindingCaps.hasInnerCoverColor ? t(language, 'outerCoverColorLabel') : t(language, 'coverColorLabel')}>
                            <ColorDropdown colors={NOTEBOOK_COLOR_PALETTE} currentColor={coverColor} onSelect={(c) => setColor('cover', c)} />
                        </SettingRow>
                        {bindingCaps.hasInnerCoverColor && (
                            <SettingRow label={t(language, 'innerCoverColorLabel')}>
                                <ColorDropdown colors={NOTEBOOK_COLOR_PALETTE} currentColor={innerCoverColor} onSelect={(c) => setColor('innerCover', c)} />
                            </SettingRow>
                        )}
                        {bindingCaps.hasStitchColor && (
                            <SettingRow label={t(language, 'threadColorLabel')}>
                                <ColorDropdown colors={NOTEBOOK_COLOR_PALETTE} currentColor={stitchColor} onSelect={(c) => setColor('stitch', c)} />
                            </SettingRow>
                        )}
                        {bindingCaps.hasElastic && (
                            <>
                                <SettingRow label={t(language, 'elasticLabel')} inline>
                                    <MiniToggle checked={hasElastic} onChange={setHasElastic} />
                                </SettingRow>
                                {hasElastic && (
                                    <SettingRow label={t(language, 'elasticColorLabel')}>
                                        <ColorDropdown colors={NOTEBOOK_COLOR_PALETTE} currentColor={elasticColor} onSelect={(c) => setColor('elastic', c)} />
                                    </SettingRow>
                                )}
                            </>
                        )}
                        {bindingCaps.hasSpiralColor && (
                            <SettingRow label={t(language, 'spiralColorLabel')}>
                                <ColorDropdown colors={NOTEBOOK_COLOR_PALETTE} currentColor={spiralColor} onSelect={(c) => setColor('spiral', c)} />
                            </SettingRow>
                        )}
                    </SettingGroup>

                    <LogoPanel
                        logos={logos}
                        selectedLogoId={selectedLogoId}
                        addLogo={addLogo}
                        replaceLogoFile={replaceLogoFile}
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

            {mode === 'pro' && tab === 'block' && (
                <DockGrid
                    cols="md:grid-cols-1"
                >
                    <div className="min-w-0 space-y-3 md:-mx-2 lg:-mx-1">
                        <PatternChooser language={language} paperPattern={paperPattern} setPaperPattern={setPaperPattern} />
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

            <GuestApprovalModal
                isOpen={approvalOpen}
                onClose={() => setApprovalOpen(false)}
                renderDataURL={approvalSnapshot}
                productName={`${t(language, 'notebook')} ${format}`}
                configuration={{ productConfig: buildNotebookItem(approvalSnapshot) }}
                quantity={quantity}
            />
        </ConstructorDock>
    )
}

// --- ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ---
const SpiralGameEditor = ({
    steps,
    currentStep,
    setCurrentStep,
    language,
    format,
    setFormat,
    coverColor,
    innerCoverColor,
    stitchColor,
    spiralColor,
    elasticColor,
    hasElastic,
    setHasElastic,
    setColor,
    paperPattern,
    setPaperPattern,
    logos,
    selectedLogo,
    selectedLogoId,
    addLogo,
    replaceLogoFile,
    selectLogo,
    removeLogo,
    resetLogoTransform,
    setLogoPosition,
    setLogoRotation,
    setLogoScale,
    setLogoSide,
    quantity,
    setQuantity,
    isSample,
    setIsSample,
    onFinishOrder,
    onEmailApproval,
    onSwitchPro,
}) => {
    const [uploadSide, setUploadSide] = useState('front');
    const step = steps[currentStep] ?? steps[0];
    const activeSide = selectedLogo?.side ?? uploadSide;
    const canGoBack = currentStep > 0;
    const canGoNext = currentStep < steps.length - 1;
    const screenTitle = {
        format: gameText(language, 'screenFormatTitle'),
        cover: gameText(language, 'screenCoverTitle'),
        spiral: gameText(language, 'screenSpiralTitle'),
        logo: gameText(language, 'screenLogoTitle'),
        block: gameText(language, 'screenBlockTitle'),
        finish: gameText(language, 'screenFinishTitle'),
    }[step.id] ?? step.label;

    const selectSide = (side) => {
        setUploadSide(side);
        if (selectedLogo) setLogoSide(side);
    };

    const overlay = (
        <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden font-zen text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_52%_44%,transparent_0,transparent_33%,rgba(18,24,32,0.36)_58%,rgba(18,24,32,0.72)_100%)]" />
            <div className="absolute inset-x-3 top-[58px] z-10 md:left-24 md:right-6">
                <div className="pointer-events-auto flex items-center justify-between gap-3 rounded-[10px] border border-white/18 bg-[#1f2d38]/72 px-3 py-2 shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-2xl md:px-4">
                    <div className="min-w-0">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/42">
                            {gameText(language, 'mission')} {currentStep + 1}/{steps.length}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] font-black md:text-[15px]">{step.label}</p>
                    </div>
                    <GameProgress steps={steps} currentStep={currentStep} setCurrentStep={setCurrentStep} />
                    <button
                        type="button"
                        onClick={onSwitchPro}
                        className="hidden shrink-0 rounded-full border border-white/20 bg-white/8 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white/78 transition hover:bg-white/14 md:inline-flex"
                    >
                        {gameText(language, 'proModeHint')}
                    </button>
                </div>
            </div>

            <div className="absolute inset-x-3 bottom-3 top-[112px] grid gap-3 md:left-6 md:right-6 md:bottom-5 md:top-[116px] md:grid-cols-[minmax(260px,1fr)_minmax(390px,500px)] lg:grid-cols-[minmax(360px,1fr)_minmax(430px,540px)]">
                <aside className="pointer-events-none hidden min-w-0 items-end md:flex">
                    <div className="max-w-[560px] pb-3">
                        <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#fff9ec]/75">
                            {gameText(language, 'gameTitle')}
                        </p>
                        <h2 className="mt-3 text-[clamp(2.4rem,5vw,4.8rem)] font-black leading-[0.98] text-white drop-shadow-[0_18px_44px_rgba(0,0,0,0.45)]">
                            {screenTitle}
                        </h2>
                        <p className="mt-4 max-w-[420px] text-[14px] font-bold leading-relaxed text-white/62">
                            {gameText(language, 'gameSubtitle')}
                        </p>
                    </div>
                </aside>

                <section className="pointer-events-auto flex min-h-0 flex-col self-end rounded-[14px] border border-white/24 bg-[#3f3438]/88 shadow-[0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl md:self-stretch">
                    <header className="border-b border-white/14 px-4 py-4 md:px-5">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/42">
                            {gameText(language, 'gameProgress')} {currentStep + 1}
                        </p>
                        <h3 className="mt-1 text-[22px] font-black leading-tight md:text-[28px]">{screenTitle}</h3>
                    </header>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 custom-scrollbar md:px-5">
                        {step.id === 'format' && (
                            <div className="space-y-4">
                        <FormatGlassTable value={format} onChange={setFormat} />
                        <div className="grid grid-cols-2 gap-2">
                            <StatusTile label={t(language, 'bindingTypeLabel')} value={t(language, 'bindingSpiral')} color="#fff9ec" />
                            <StatusTile label={t(language, 'formatLabel')} value={format} color={coverColor} />
                        </div>
                            </div>
                        )}

                        {step.id === 'cover' && (
                            <div className="space-y-4">
                                <ColorQuestRow title={t(language, 'outerCoverColorLabel')} subtitle={gameText(language, 'outerCoverHint')} color={coverColor} onSelect={(c) => setColor('cover', c)} />
                                <ColorQuestRow title={t(language, 'innerCoverColorLabel')} subtitle={gameText(language, 'innerCoverHint')} color={innerCoverColor} onSelect={(c) => setColor('innerCover', c)} />
                            </div>
                        )}

                        {step.id === 'spiral' && (
                            <div className="space-y-4">
                                <ColorQuestRow title={t(language, 'spiralColorLabel')} subtitle={gameText(language, 'spiralHint')} color={spiralColor} onSelect={(c) => setColor('spiral', c)} />
                                <ColorQuestRow title={t(language, 'threadColorLabel')} subtitle={gameText(language, 'stitchHint')} color={stitchColor} onSelect={(c) => setColor('stitch', c)} />
                                <div className="rounded-[8px] border border-white/12 bg-white/7 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-black text-white">{t(language, 'elasticLabel')}</p>
                                            <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/38">{gameText(language, 'elasticHint')}</p>
                                        </div>
                                        <MiniToggle checked={hasElastic} onChange={setHasElastic} />
                                    </div>
                                    {hasElastic && (
                                        <div className="mt-3">
                                            <ColorSwatches colors={NOTEBOOK_COLOR_PALETTE} currentColor={elasticColor} onSelect={(c) => setColor('elastic', c)} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {step.id === 'logo' && (
                            <div className="space-y-4">
                                <div className="rounded-[8px] border border-white/12 bg-white/7 p-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0">
                                            <p className="text-[13px] font-black text-white">{t(language, 'embossing')}</p>
                                            <p className="mt-1 text-[11px] font-bold leading-snug text-white/45">
                                                {selectedLogo ? gameText(language, 'logoTune') : gameText(language, 'logoEmpty')}
                                            </p>
                                        </div>
                                        <FileUploadChip label={t(language, 'addLogo')} onFile={(file) => addLogo(file, activeSide)} />
                                    </div>
                                    <div className="mt-3">
                                        <MiniSegment
                                            value={activeSide}
                                            onChange={selectSide}
                                            options={[
                                                { value: 'front', label: t(language, 'sideFront') },
                                                { value: 'back', label: t(language, 'sideBack') },
                                            ]}
                                        />
                                    </div>
                                </div>

                                <LogoList
                                    logos={logos}
                                    selectedLogoId={selectedLogoId}
                                    selectLogo={(id) => { selectLogo(id); const picked = logos.find(l => l.id === id); setUploadSide(picked?.side ?? 'front'); }}
                                    removeLogo={removeLogo}
                                    metaForLogo={(logo) => (logo.side ?? 'front') === 'back' ? t(language, 'sideBack') : t(language, 'sideFront')}
                                />

                                {selectedLogo && (
                                    <div className="space-y-3 rounded-[8px] border border-white/12 bg-white/7 p-3">
                                        <LogoBackgroundRemovalButton logo={selectedLogo} language={language} onApply={(file) => replaceLogoFile(selectedLogo.id, file)} />
                                        <TransformPad label={t(language, 'position')} value={selectedLogo.position} onChange={setLogoPosition} onReset={resetLogoTransform} />
                                        <RotationScrub label={t(language, 'rotation')} value={selectedLogo.rotation ?? 0} onChange={setLogoRotation} />
                                        <SizeSlider label={t(language, 'size')} value={selectedLogo.scale ?? 0.6} min={0.2} max={4.0} step={0.05} onChange={setLogoScale} />
                                    </div>
                                )}
                            </div>
                        )}

                        {step.id === 'block' && (
                            <div className="space-y-3">
                                <PatternChooser language={language} paperPattern={paperPattern} setPaperPattern={setPaperPattern} />
                                <BlockPDFPreview pattern={paperPattern} />
                                {paperPattern === 'blank' && (
                                    <div className="rounded-[8px] border border-white/12 bg-white/8 p-3 text-center text-xs text-white/55">
                                        {t(language, 'blankPages')}
                                    </div>
                                )}
                            </div>
                        )}

                        {step.id === 'finish' && (
                            <div className="space-y-4">
                                <div>
                                    <h3 className="text-[18px] font-black leading-tight">{gameText(language, 'readyTitle')}</h3>
                                    <p className="mt-1 text-[11px] font-bold leading-snug text-white/48">{gameText(language, 'readyDesc')}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <StatusTile label={gameText(language, 'finalCover')} value={format} color={coverColor} />
                                    <StatusTile label={gameText(language, 'finalSpring')} value={t(language, 'bindingSpiral')} color={spiralColor} />
                                    <StatusTile label={gameText(language, 'finalLogos')} value={`${logos.length}`} color="#fff9ec" />
                                    <StatusTile label={gameText(language, 'finalPattern')} value={t(language, PATTERN_KEYS[paperPattern])} color="#f7f5ef" />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <QuantityStepper label={gameText(language, 'quantityShort')} value={quantity} setValue={setQuantity} />
                                    <div className="rounded-[8px] border border-white/12 bg-white/7 p-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[11px] font-black uppercase tracking-[0.16em] text-white/45">{gameText(language, 'sampleToggle')}</span>
                                            <MiniToggle checked={isSample} onChange={setIsSample} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <footer className="grid gap-2 border-t border-white/14 p-4 md:grid-cols-[1fr_1fr] md:p-5">
                        <button
                            type="button"
                            disabled={!canGoBack}
                            onClick={() => setCurrentStep(step => Math.max(0, step - 1))}
                            className="rounded-full border border-white/20 bg-white/8 px-5 py-3 text-[12px] font-black uppercase tracking-widest text-white/75 transition hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                            {gameText(language, 'back')}
                        </button>
                        <button
                            type="button"
                            onClick={() => canGoNext ? setCurrentStep(step => Math.min(steps.length - 1, step + 1)) : onFinishOrder()}
                            className="rounded-full bg-[#fff9ec] px-5 py-3 text-[12px] font-black uppercase tracking-widest text-[#1b1b1b] shadow-lg transition hover:bg-white active:scale-95"
                        >
                            {canGoNext ? gameText(language, 'next') : gameText(language, 'finishOrder')}
                        </button>
                        {onEmailApproval && step.id === 'finish' && (
                            <button
                                type="button"
                                onClick={onEmailApproval}
                                className="rounded-full border border-white/22 bg-white/8 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white/78 transition hover:bg-white/14 md:col-span-2"
                            >
                                {t(language, 'emailApproval')}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onSwitchPro}
                            className="rounded-full border border-white/18 bg-white/6 px-5 py-3 text-[11px] font-black uppercase tracking-widest text-white/55 transition hover:bg-white/12 md:hidden"
                        >
                            {gameText(language, 'proModeHint')}
                        </button>
                    </footer>
                </section>
            </div>
        </div>
    );

    return typeof document === 'undefined' ? overlay : createPortal(overlay, document.body);
};

const GameProgress = ({ steps, currentStep, setCurrentStep }) => (
    <div className="hidden min-w-[180px] flex-1 grid-cols-6 gap-1.5 sm:grid">
        {steps.map((step, index) => {
            const active = index === currentStep;
            const done = index < currentStep;
            return (
                <button
                    key={step.id}
                    type="button"
                    onClick={() => setCurrentStep(index)}
                    className={`h-9 min-w-0 rounded-[8px] border px-1 text-[9px] font-black uppercase leading-tight transition md:h-10 ${
                        active
                            ? 'border-[#fff9ec] bg-[#fff9ec] text-[#171717]'
                            : done
                                ? 'border-white/24 bg-white/16 text-white'
                                : 'border-white/12 bg-white/6 text-white/38 hover:text-white/70'
                    }`}
                    title={step.label}
                >
                    <span className="block truncate">{step.label}</span>
                </button>
            );
        })}
    </div>
);

const ColorQuestRow = ({ title, subtitle, color, onSelect }) => (
    <div className="rounded-[8px] border border-white/12 bg-white/7 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
                <p className="text-[13px] font-black text-white">{title}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/38">{subtitle}</p>
            </div>
            <span className="h-8 w-8 shrink-0 rounded-full border border-white/35 shadow-lg" style={{ backgroundColor: color }} />
        </div>
        <ColorSwatches colors={NOTEBOOK_COLOR_PALETTE} currentColor={color} onSelect={onSelect} />
    </div>
);

const StatusTile = ({ label, value, color }) => (
    <div className="min-w-0 rounded-[8px] border border-white/12 bg-white/7 p-3">
        <div className="mb-2 h-4 w-4 rounded-full border border-white/30" style={{ backgroundColor: color }} />
        <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-white/38">{label}</p>
        <p className="mt-1 truncate text-[14px] font-black text-white">{value}</p>
    </div>
);

const QuantityStepper = ({ label, value, setValue }) => (
    <div className="rounded-[8px] border border-white/12 bg-white/7 p-3">
        <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-white/45">{label}</p>
        <div className="grid grid-cols-[32px_1fr_32px] items-center gap-1">
            <button type="button" onClick={() => setValue(q => Math.max(1, q - 1))} className="h-8 rounded-full bg-white/10 text-lg font-black">−</button>
            <span className="text-center text-lg font-black">{value}</span>
            <button type="button" onClick={() => setValue(q => q + 1)} className="h-8 rounded-full bg-white/10 text-lg font-black">+</button>
        </div>
    </div>
);

const PatternChooser = ({ language, paperPattern, setPaperPattern }) => (
    <div className="grid grid-cols-2 gap-2 min-[380px]:grid-cols-3 sm:grid-cols-5">
        {PATTERN_IDS.map((id) => (
            <button
                key={id}
                type="button"
                onClick={() => setPaperPattern(id)}
                className={`rounded-[8px] border px-2 py-2 transition ${paperPattern === id ? 'border-[#fff9ec] bg-[#fff9ec] text-[#191919]' : 'border-white/18 bg-white/8 text-white/75 hover:text-white'}`}
            >
                <div className="mx-auto mb-1 h-8 w-8 rounded-[6px] border border-current/20 p-1">
                    <img src={PATTERN_ICONS[id]} alt={t(language, PATTERN_KEYS[id])} className="h-full w-full object-contain" />
                </div>
                <span className="block truncate text-[10px] font-black uppercase tracking-wider">{t(language, PATTERN_KEYS[id])}</span>
            </button>
        ))}
    </div>
);

const FormatGlassTable = ({ value, onChange }) => (
    <div className="grid w-full grid-cols-2 overflow-hidden rounded-[9px] border border-white/25 bg-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
        {[
            { value: 'A5', size: '148 x 210' },
            { value: 'A6', size: '105 x 148' },
        ].map(option => {
            const selected = value === option.value;
            return (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`min-h-[52px] border-white/15 px-3 py-2 text-left transition first:border-r ${
                        selected ? 'bg-[#fff9ec] text-[#191919] shadow-inner' : 'bg-white/6 text-white hover:bg-white/14'
                    }`}
                    aria-pressed={selected}
                >
                    <span className="block text-[16px] font-black leading-none tracking-wider">{option.value}</span>
                    <span className={`mt-1 block text-[9px] font-black uppercase tracking-[0.16em] ${selected ? 'text-black/48' : 'text-white/42'}`}>{option.size}</span>
                </button>
            );
        })}
    </div>
);

const LogoPanel = ({ logos, selectedLogoId, addLogo, replaceLogoFile, selectLogo, removeLogo, resetLogoTransform, setLogoPosition, setLogoRotation, setLogoScale, setLogoSide, language, compact = false }) => {
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
                    <div className="mt-3 space-y-3 xl:hidden">
                        <LogoBackgroundRemovalButton logo={selected} language={language} onApply={(file) => replaceLogoFile(selected.id, file)} />
                        <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} />
                        <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                        <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.2} max={4.0} step={0.05} onChange={setLogoScale} />
                    </div>
                    <FloatingLogoSettings title={t(language, 'logoLabel')} subtitle={selected.filename}>
                    <LogoBackgroundRemovalButton logo={selected} language={language} onApply={(file) => replaceLogoFile(selected.id, file)} />
                    <TransformPad label={t(language, 'position')} value={selected.position} onChange={setLogoPosition} onReset={resetLogoTransform} />
                    <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setLogoRotation} />
                    <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.6} min={0.2} max={4.0} step={0.05} onChange={setLogoScale} />
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
            {NOTEBOOK_COLOR_PALETTE.map((c) => (
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
