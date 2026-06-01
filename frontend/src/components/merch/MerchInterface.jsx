import { useMemo, useState } from 'react';
import { captureRender, useConfigurator } from '../../store';
import { t } from '../../i18n';
import {
    ConstructorDock,
    ColorSwatches,
    DockGrid,
    FileUploadChip,
    LogoList,
    MiniSegment,
    RotationScrub,
    SettingGroup,
    SettingRow,
    SizeSlider,
    TransformPad,
} from '../configurator/ConstructorDock';
import { GuestApprovalModal } from '../shared/GuestApprovalModal';
import {
    APPAREL_SIZES,
    HOODIE_COLOR_PALETTE,
    LANYARD_CARABINERS,
    LANYARD_COLOR_PALETTE,
    LANYARD_LENGTHS_MM,
    LANYARD_REPEAT_OPTIONS_MM,
    SHOPPER_COLOR_PALETTE,
    SHOPPER_HANDLE_TYPES,
    TSHIRT_COLOR_PALETTE,
} from '../../config/productPalettes';

// Список «опций нанесения» зависит от типа товара. Для шопера/майки/худи
// печать спереди/сзади, для худи дополнительно «грудь», ланъярд — оба бока
// одновременно (поэтому селектор не показываем).
const PRINT_SIDES = {
    shopper: ['front', 'back'],
    tshirt: ['front', 'back'],
    hoodie: ['front', 'back', 'chest'],
};

const MATERIAL_LABELS = {
    canvas_220: 'Canvas 220 г/м²',
    canvas_280: 'Canvas 280 г/м²',
    oxford_300: 'Oxford 300D',
    nonwoven_80: 'Спанбонд 80',
    cotton_160: 'Хлопок 160 г/м²',
    cotton_180: 'Хлопок 180 г/м²',
    cotton_220: 'Хлопок 220 г/м²',
    fleece_280: 'Флис 280 г/м²',
    fleece_320: 'Флис 320 г/м²',
    polyester_150: 'Полиэстер 150D',
    polyester_10: 'Полиэстер 10 мм',
    polyester_15: 'Полиэстер 15 мм',
    polyester_20: 'Полиэстер 20 мм',
    satin_15: 'Сатин 15 мм',
};

const HANDLE_LABELS = { short: 'Короткие', long: 'Длинные', shoulder: 'Через плечо' };
const CARABINER_LABELS = { hook: 'Крючок', carabiner: 'Карабин', swivel: 'Вертлюг', j_hook: 'J-крючок' };
const PRINT_SIDE_LABELS = {
    front: 'Перёд', back: 'Спина', leftSleeve: 'Левый рукав', rightSleeve: 'Правый рукав', chest: 'Грудь',
};

const PRODUCT_CONFIG = {
    shopper: {
        titleKey: 'shopperTitle',
        hintKey: 'merchHintShopper',
        palette: SHOPPER_COLOR_PALETTE,
        materials: ['canvas_220', 'canvas_280', 'oxford_300', 'nonwoven_80'],
        colorKey: 'shopperColor',
        materialKey: 'shopperMaterial',
        printSideKey: 'shopperPrintSide',
        logosKey: 'shopperLogos',
        selectedLogoKey: 'selectedShopperLogoId',
        setColorAction: 'setShopperColor',
        setMaterialAction: 'setShopperMaterial',
        setPrintSideAction: 'setShopperPrintSide',
        addLogoAction: 'addShopperLogo',
        selectLogoAction: 'selectShopperLogo',
        removeLogoAction: 'removeShopperLogo',
        setLogoPositionAction: 'setShopperLogoPosition',
        setLogoRotationAction: 'setShopperLogoRotation',
        setLogoScaleAction: 'setShopperLogoScale',
        resetLogoTransformAction: 'resetShopperLogoTransform',
        extras: ['handleType'],
    },
    tshirt: {
        titleKey: 'tshirtTitle',
        hintKey: 'merchHintTshirt',
        palette: TSHIRT_COLOR_PALETTE,
        materials: ['cotton_160', 'cotton_180', 'cotton_220'],
        colorKey: 'tshirtColor',
        materialKey: 'tshirtMaterial',
        printSideKey: 'tshirtPrintSide',
        logosKey: 'tshirtLogos',
        selectedLogoKey: 'selectedTshirtLogoId',
        setColorAction: 'setTshirtColor',
        setMaterialAction: 'setTshirtMaterial',
        setPrintSideAction: 'setTshirtPrintSide',
        addLogoAction: 'addTshirtLogo',
        selectLogoAction: 'selectTshirtLogo',
        removeLogoAction: 'removeTshirtLogo',
        setLogoPositionAction: 'setTshirtLogoPosition',
        setLogoRotationAction: 'setTshirtLogoRotation',
        setLogoScaleAction: 'setTshirtLogoScale',
        resetLogoTransformAction: 'resetTshirtLogoTransform',
        extras: ['size'],
    },
    hoodie: {
        titleKey: 'hoodieTitle',
        hintKey: 'merchHintHoodie',
        palette: HOODIE_COLOR_PALETTE,
        materials: ['fleece_280', 'fleece_320'],
        colorKey: 'hoodieColor',
        materialKey: 'hoodieMaterial',
        printSideKey: 'hoodiePrintSide',
        logosKey: 'hoodieLogos',
        selectedLogoKey: 'selectedHoodieLogoId',
        setColorAction: 'setHoodieColor',
        setMaterialAction: 'setHoodieMaterial',
        setPrintSideAction: 'setHoodiePrintSide',
        addLogoAction: 'addHoodieLogo',
        selectLogoAction: 'selectHoodieLogo',
        removeLogoAction: 'removeHoodieLogo',
        setLogoPositionAction: 'setHoodieLogoPosition',
        setLogoRotationAction: 'setHoodieLogoRotation',
        setLogoScaleAction: 'setHoodieLogoScale',
        resetLogoTransformAction: 'resetHoodieLogoTransform',
        extras: ['size'],
    },
    lanyard: {
        titleKey: 'lanyardTitle',
        hintKey: 'merchHintLanyard',
        palette: LANYARD_COLOR_PALETTE,
        materials: ['polyester_10', 'polyester_15', 'polyester_20', 'satin_15'],
        colorKey: 'lanyardColor',
        materialKey: 'lanyardMaterial',
        printSideKey: null,
        logosKey: 'lanyardLogos',
        selectedLogoKey: 'selectedLanyardLogoId',
        setColorAction: 'setLanyardColor',
        setMaterialAction: 'setLanyardMaterial',
        setPrintSideAction: null,
        addLogoAction: 'addLanyardLogo',
        selectLogoAction: 'selectLanyardLogo',
        removeLogoAction: 'removeLanyardLogo',
        setLogoPositionAction: 'setLanyardLogoPosition',
        setLogoRotationAction: 'setLanyardLogoRotation',
        setLogoScaleAction: 'setLanyardLogoScale',
        resetLogoTransformAction: 'resetLanyardLogoTransform',
        extras: ['length', 'repeat', 'carabiner'],
    },
};

export const MerchInterface = ({ onFinish }) => {
    const state = useConfigurator();
    const {
        activeProduct,
        language,
        guestApprovalEnabled,
        addToCart,
        setRenderSnapshot,
    } = state;

    const config = PRODUCT_CONFIG[activeProduct];
    const [quantity, setQuantity] = useState(1);
    const [approvalOpen, setApprovalOpen] = useState(false);
    const [approvalSnapshot, setApprovalSnapshot] = useState(null);

    const materialOptions = useMemo(() => (
        config?.materials.map((id) => ({ value: id, label: MATERIAL_LABELS[id] || id })) || []
    ), [config]);

    if (!config) return null;

    const color = state[config.colorKey];
    const material = state[config.materialKey];
    const rawPrintSide = config.printSideKey ? state[config.printSideKey] : null;
    const printSide = activeProduct === 'tshirt' && rawPrintSide !== 'back' ? 'front' : rawPrintSide;
    const logos = state[config.logosKey] || [];
    const selectedLogoId = state[config.selectedLogoKey];

    const setColor = state[config.setColorAction];
    const setMaterial = state[config.setMaterialAction];
    const setPrintSide = config.setPrintSideAction ? state[config.setPrintSideAction] : null;
    const addLogo = state[config.addLogoAction];
    const selectLogo = state[config.selectLogoAction];
    const removeLogo = state[config.removeLogoAction];
    const selectedLogo = logos.find(l => l.id === selectedLogoId) || null;
    const setLogoPosition = state[config.setLogoPositionAction];
    const setLogoRotation = state[config.setLogoRotationAction];
    const setLogoScale = state[config.setLogoScaleAction];
    const resetLogoTransform = state[config.resetLogoTransformAction];

    const buildCartItem = (snapshot) => {
        const item = {
            productName: t(language, config.titleKey),
            design: `${t(language, 'merchColor')}: ${color}, ${t(language, 'merchMaterial')}: ${MATERIAL_LABELS[material] || material}`,
            priceBYN: 0,
            type: activeProduct,
            activeProduct,
            color,
            material,
            printSide,
            size: state.tshirtSize || state.hoodieSize || null,
            handleType: state.shopperHandleType || null,
            lengthMm: state.lanyardLengthMm || null,
            widthMm: state.lanyardWidthMm || null,
            repeatMm: activeProduct === 'lanyard' ? state.lanyardRepeatMm || 50 : null,
            carabiner: state.lanyardCarabiner || null,
            logos,
            status: 'draft',
            rendersGenerated: 0,
            quantity,
            renderUrl: snapshot || null,
        };
        return {
            ...item,
            [config.colorKey]: color,
            [config.materialKey]: material,
            ...(config.printSideKey ? { [config.printSideKey]: printSide } : {}),
            [config.logosKey]: logos,
            ...(activeProduct === 'shopper' ? { shopperHandleType: state.shopperHandleType } : {}),
            ...(activeProduct === 'tshirt' ? { tshirtSize: state.tshirtSize } : {}),
            ...(activeProduct === 'hoodie' ? { hoodieSize: state.hoodieSize } : {}),
            ...(activeProduct === 'lanyard' ? {
                lanyardLengthMm: state.lanyardLengthMm,
                lanyardWidthMm: state.lanyardWidthMm,
                lanyardRepeatMm: state.lanyardRepeatMm,
                lanyardCarabiner: state.lanyardCarabiner,
            } : {}),
        };
    };

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        addToCart(buildCartItem(snapshot));
        onFinish();
    };

    const handleEmailApproval = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        setApprovalSnapshot(snapshot || null);
        setApprovalOpen(true);
    };

    const printSideOptions = config.printSideKey
        ? (PRINT_SIDES[activeProduct] || []).map((id) => ({ value: id, label: PRINT_SIDE_LABELS[id] || id }))
        : [];

    return (
        <ConstructorDock
            title={t(language, config.titleKey)}
            onSave={handleAddToCart}
            saveLabel={t(language, 'placeOrder')}
            onEmailApproval={guestApprovalEnabled ? handleEmailApproval : null}
            emailApprovalLabel={t(language, 'emailApproval')}
        >
            <DockGrid cols="md:grid-cols-2">
                <SettingGroup title={t(language, config.titleKey)}>
                    <SettingRow label={t(language, 'quantityLabel')} inline>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="h-6 w-6 rounded-full bg-white/10 font-black">-</button>
                            <span className="w-7 text-center text-sm font-black">{quantity}</span>
                            <button onClick={() => setQuantity(q => q + 1)} className="h-6 w-6 rounded-full bg-white/10 font-black">+</button>
                        </div>
                    </SettingRow>
                    <p className="text-[10px] leading-tight text-white/35">{t(language, config.hintKey)}</p>
                </SettingGroup>

                <SettingGroup title={t(language, 'merchColor')}>
                    <ColorSwatches colors={config.palette} currentColor={color} onSelect={setColor} />
                </SettingGroup>

                <SettingGroup title={t(language, 'merchMaterial')}>
                    <div className="flex flex-wrap gap-1.5">
                        {materialOptions.map(({ value, label }) => (
                            <button
                                key={value}
                                onClick={() => setMaterial(value)}
                                className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider ${material === value ? 'bg-[#fff9ec] text-[#1b1b1b]' : 'bg-white/8 text-white/70 hover:bg-white/15'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </SettingGroup>

                {config.extras.includes('size') && (
                    <SettingGroup title={t(language, 'merchSize')}>
                        <div className="flex flex-wrap gap-1.5">
                            {APPAREL_SIZES.map((size) => {
                                const current = activeProduct === 'hoodie' ? state.hoodieSize : state.tshirtSize;
                                const setSize = activeProduct === 'hoodie' ? state.setHoodieSize : state.setTshirtSize;
                                return (
                                    <button
                                        key={size}
                                        onClick={() => setSize(size)}
                                        className={`w-10 rounded-full px-2 py-1.5 text-[12px] font-black ${current === size ? 'bg-[#fff9ec] text-[#1b1b1b]' : 'bg-white/8 text-white/70 hover:bg-white/15'}`}
                                    >
                                        {size}
                                    </button>
                                );
                            })}
                        </div>
                    </SettingGroup>
                )}

                {config.extras.includes('handleType') && (
                    <SettingGroup title={t(language, 'merchHandleType')}>
                        <MiniSegment
                            value={state.shopperHandleType}
                            onChange={state.setShopperHandleType}
                            options={SHOPPER_HANDLE_TYPES.map((h) => ({ value: h, label: HANDLE_LABELS[h] || h }))}
                        />
                    </SettingGroup>
                )}

                {config.extras.includes('length') && (
                    <SettingGroup title={t(language, 'lanyardLength')}>
                        <MiniSegment
                            value={state.lanyardLengthMm}
                            onChange={state.setLanyardLengthMm}
                            options={LANYARD_LENGTHS_MM.map((mm) => ({ value: mm, label: `${mm} мм` }))}
                        />
                    </SettingGroup>
                )}

                {config.extras.includes('repeat') && (
                    <SettingGroup title={t(language, 'lanyardRepeat')}>
                        <MiniSegment
                            value={state.lanyardRepeatMm}
                            onChange={state.setLanyardRepeatMm}
                            options={LANYARD_REPEAT_OPTIONS_MM.map((mm) => ({ value: mm, label: `${mm / 10} см` }))}
                        />
                    </SettingGroup>
                )}

                {config.extras.includes('carabiner') && (
                    <SettingGroup title={t(language, 'lanyardCarabiner')}>
                        <div className="flex flex-wrap gap-1.5">
                            {LANYARD_CARABINERS.map((kind) => (
                                <button
                                    key={kind}
                                    onClick={() => state.setLanyardCarabiner(kind)}
                                    className={`rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-wider ${state.lanyardCarabiner === kind ? 'bg-[#fff9ec] text-[#1b1b1b]' : 'bg-white/8 text-white/70 hover:bg-white/15'}`}
                                >
                                    {CARABINER_LABELS[kind] || kind}
                                </button>
                            ))}
                        </div>
                    </SettingGroup>
                )}

                {printSideOptions.length > 0 && (
                    <SettingGroup title={t(language, 'merchPrintSide')}>
                        <MiniSegment
                            value={printSide}
                            onChange={setPrintSide}
                            options={printSideOptions}
                        />
                    </SettingGroup>
                )}

                <SettingGroup title={t(language, 'addImage')}>
                    <SettingRow label={t(language, 'addImage')}>
                        <FileUploadChip label={t(language, 'addImage')} onFile={addLogo} />
                    </SettingRow>
                    <LogoList
                        logos={logos}
                        selectedLogoId={selectedLogoId}
                        selectLogo={selectLogo}
                        removeLogo={removeLogo}
                    />
                    {selectedLogo && (
                        <div className="mt-3 grid gap-3 border-t border-white/10 pt-3">
                            {activeProduct !== 'lanyard' && (
                                <TransformPad
                                    label={t(language, 'position')}
                                    value={selectedLogo.position}
                                    onChange={setLogoPosition}
                                    onReset={resetLogoTransform}
                                    yRange={1}
                                />
                            )}
                            <RotationScrub
                                label={t(language, 'rotation')}
                                value={selectedLogo.rotation ?? 0}
                                onChange={setLogoRotation}
                            />
                            <SizeSlider
                                label={t(language, 'size')}
                                value={selectedLogo.scale ?? 0.6}
                                min={activeProduct === 'tshirt' ? 0.08 : activeProduct === 'lanyard' ? 0.28 : 0.2}
                                max={activeProduct === 'tshirt' ? 1 : activeProduct === 'lanyard' ? 1.8 : 4}
                                step={0.05}
                                onChange={setLogoScale}
                            />
                        </div>
                    )}
                </SettingGroup>
            </DockGrid>

            <GuestApprovalModal
                isOpen={approvalOpen}
                onClose={() => setApprovalOpen(false)}
                renderDataURL={approvalSnapshot}
                productName={t(language, config.titleKey)}
                configuration={{ productConfig: buildCartItem(approvalSnapshot) }}
                quantity={quantity}
            />
        </ConstructorDock>
    );
};
