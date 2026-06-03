import { useState } from 'react';
import { createPortal } from 'react-dom';
import { captureRender, getStickerSlotShape, STICKER_SLOT_COUNT, useConfigurator } from '../../store';
import { t } from '../../i18n';
import {
    ColorDropdown,
    ConstructorDock,
    DockGrid,
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
import { STICKER_SHEET_COLOR_PALETTE } from '../../config/productPalettes';
import { GuestApprovalModal } from '../shared/GuestApprovalModal';
import { LogoBackgroundRemovalButton } from '../shared/LogoBackgroundRemovalButton';
import { hexToCmyk } from '../../utils/cmyk';

const STICKER_PRINT_SHEET = {
    // Final pack size is A6 (105 x 148 mm), printed at 300 DPI.
    widthMm: 105,
    heightMm: 148,
    widthUnits: 4.2,
    heightUnits: 5.92,
    dpi: 300,
};

const STICKER_PRINT_SLOTS = [
    { x: -1.08, y: 2.05 },
    { x: 1.08, y: 1.52 },
    { x: -1.08, y: 0.28 },
    { x: 1.08, y: -0.34 },
    { x: -1.08, y: -1.58 },
    { x: 1.08, y: -2.05 },
];

const stickerSheetModeLabel = (language, mode) => {
    if (mode === 'square') return t(language, 'stickerSheetModeSquare');
    if (mode === 'circle') return t(language, 'stickerSheetModeCircle');
    return t(language, 'stickerSheetModeMixed');
};

const getStickerImageMeta = (language, stickerSheetMode, logo, index) => {
    const slot = Number.isInteger(logo.slot) ? logo.slot : index;
    const shape = stickerSheetMode === 'mixed'
        ? (logo.shape || getStickerSlotShape('mixed', slot))
        : getStickerSlotShape(stickerSheetMode, slot);

    return `${t(language, 'stickerSlot')} ${slot + 1} · ${shape === 'square' ? t(language, 'stickerShapeSquare') : t(language, 'stickerShapeCircle')}`;
};

const StickerPackList = ({
    language,
    stickerImages,
    selectedStickerImageId,
    stickerSheetMode,
    addStickerImage,
    selectStickerImage,
    removeStickerImage,
}) => {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <aside className="pointer-events-auto hidden xl:flex fixed right-[430px] top-[4.75rem] z-[90] w-[340px] max-w-[calc(100vw-1.5rem)] max-h-[min(640px,calc(100vh-6rem))] flex-col overflow-hidden rounded-[12px] border border-white/30 bg-[#3f3438]/94 font-zen text-white shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
            <div className="border-b border-white/12 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/42">{t(language, 'stickerPackList')}</p>
                        <h3 className="mt-1 text-[18px] font-black leading-tight">{stickerImages.length}/{STICKER_SLOT_COUNT}</h3>
                    </div>
                    <FileUploadChip label={t(language, 'addImage')} onFile={addStickerImage} />
                </div>
                <p className="mt-3 text-[10px] font-black uppercase tracking-wider text-white/45">
                    {Math.max(0, STICKER_SLOT_COUNT - stickerImages.length)} {t(language, 'stickerSlotsLeft')}
                </p>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
                {stickerImages.length === 0 ? (
                    <div className="rounded-[10px] border border-dashed border-white/18 bg-white/6 px-4 py-6 text-center text-[12px] font-bold leading-snug text-white/45">
                        {t(language, 'stickerPackEmpty')}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {stickerImages.map((logo, index) => {
                            const active = logo.id === selectedStickerImageId;
                            return (
                                <div
                                    key={logo.id}
                                    className={`group grid grid-cols-[52px_minmax(0,1fr)_28px] items-center gap-3 rounded-[10px] border px-2.5 py-2 transition ${
                                        active ? 'border-[#fff9ec]/75 bg-[#fff9ec]/14' : 'border-white/12 bg-white/7 hover:border-white/28 hover:bg-white/10'
                                    }`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => selectStickerImage(logo.id)}
                                        className="h-[52px] w-[52px] overflow-hidden rounded-[8px] border border-white/12 bg-black/18"
                                        aria-label={logo.filename}
                                    >
                                        <img src={logo.texture} alt="" className="h-full w-full object-contain" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => selectStickerImage(logo.id)}
                                        className="min-w-0 text-left"
                                    >
                                        <span className="block truncate text-[13px] font-black leading-tight text-white">{logo.filename}</span>
                                        <span className="mt-1 block truncate text-[10px] font-black uppercase tracking-wider text-white/45">
                                            {getStickerImageMeta(language, stickerSheetMode, logo, index)}
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => removeStickerImage(logo.id)}
                                        className="h-7 w-7 rounded-full border border-white/15 bg-black/20 text-[15px] font-black leading-none text-white/50 transition hover:border-white/35 hover:bg-white/12 hover:text-white"
                                        aria-label={`${t(language, 'cartDeleteBtn')} ${logo.filename}`}
                                    >
                                        ×
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </aside>,
        document.body
    );
};

const SelectedStickerImageControls = ({
    language,
    selected,
    stickerSheetMode,
    replaceStickerImageFile,
    setStickerImageShape,
    setStickerImagePosition,
    resetStickerImageTransform,
    setStickerImageRotation,
    setStickerImageScale,
}) => (
    <div className="space-y-3">
        <LogoBackgroundRemovalButton logo={selected} language={language} onApply={(file) => replaceStickerImageFile(selected.id, file)} />
        {stickerSheetMode === 'mixed' && (
            <SettingRow label={t(language, 'stickerShape')}>
                <MiniSegment
                    value={selected.shape ?? getStickerSlotShape('mixed', selected.slot ?? 0)}
                    onChange={setStickerImageShape}
                    options={[
                        { value: 'circle', label: t(language, 'stickerShapeCircle') },
                        { value: 'square', label: t(language, 'stickerShapeSquare') },
                    ]}
                />
            </SettingRow>
        )}
        <TransformPad label={t(language, 'position')} value={selected.position} onChange={setStickerImagePosition} onReset={resetStickerImageTransform} aspect="aspect-square" xRange={0.92} yRange={0.92} />
        <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setStickerImageRotation} />
        <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.72} min={0.22} max={3} step={0.03} onChange={setStickerImageScale} />
    </div>
);

const buildStickerPrintPayload = ({
    stickerSheetColor,
    stickerSheetMode,
    stickerBackgroundImages,
    stickerImages,
}) => ({
    sheet_width_mm: STICKER_PRINT_SHEET.widthMm,
    sheet_height_mm: STICKER_PRINT_SHEET.heightMm,
    scene_width_units: STICKER_PRINT_SHEET.widthUnits,
    scene_height_units: STICKER_PRINT_SHEET.heightUnits,
    export_dpi: STICKER_PRINT_SHEET.dpi,
    sheet_color: stickerSheetColor,
    sheet_cmyk: hexToCmyk(stickerSheetColor),
    sheet_mode: stickerSheetMode,
    slots: STICKER_PRINT_SLOTS.map((slot, index) => ({
        index,
        shape: getStickerSlotShape(stickerSheetMode, index),
        x_units: slot.x,
        y_units: slot.y,
        center_x_mm: STICKER_PRINT_SHEET.widthMm / 2 + (slot.x / STICKER_PRINT_SHEET.widthUnits) * STICKER_PRINT_SHEET.widthMm,
        center_y_mm: STICKER_PRINT_SHEET.heightMm / 2 - (slot.y / STICKER_PRINT_SHEET.heightUnits) * STICKER_PRINT_SHEET.heightMm,
    })),
    background_images: stickerBackgroundImages.map((image, index) => ({
        id: image.id,
        index,
        filename: image.filename,
        texture: image.texture,
        position: image.position || [0, 0],
        rotation: image.rotation || 0,
        scale: image.scale || 1,
    })),
    sticker_images: stickerImages.map((image, index) => ({
        id: image.id,
        index,
        filename: image.filename,
        texture: image.texture,
        slot: Number.isInteger(image.slot) ? image.slot : index,
        shape: stickerSheetMode === 'mixed'
            ? (image.shape || getStickerSlotShape('mixed', Number.isInteger(image.slot) ? image.slot : index))
            : getStickerSlotShape(stickerSheetMode, Number.isInteger(image.slot) ? image.slot : index),
        position: image.position || [0, 0],
        rotation: image.rotation || 0,
        scale: image.scale || 0.72,
    })),
});

export const StickerInterface = ({ onFinish }) => {
    const {
        stickerSheetColor,
        stickerSheetMode,
        stickerBackgroundImages,
        selectedStickerBackgroundImageId,
        stickerImages,
        selectedStickerImageId,
        setStickerSheetColor,
        setStickerSheetMode,
        addStickerBackgroundImage,
        selectStickerBackgroundImage,
        removeStickerBackgroundImage,
        resetStickerBackgroundImageTransform,
        setStickerBackgroundImagePosition,
        setStickerBackgroundImageRotation,
        setStickerBackgroundImageScale,
        addStickerImage,
        replaceStickerImageFile,
        selectStickerImage,
        removeStickerImage,
        resetStickerImageTransform,
        setStickerImagePosition,
        setStickerImageRotation,
        setStickerImageScale,
        setStickerImageShape,
        addToCart,
        setRenderSnapshot,
        language,
        guestApprovalEnabled,
    } = useConfigurator();
    const [quantity, setQuantity] = useState(1);
    const [approvalOpen, setApprovalOpen] = useState(false);
    const [approvalSnapshot, setApprovalSnapshot] = useState(null);
    const stickerSizeLabel = t(language, 'stickerSheetFormat');

    const buildStickerCartItem = (snapshot) => ({
        productName: t(language, 'sticker3d'),
        design: `${t(language, 'stickerCanvasSize')}: ${stickerSizeLabel}, ${t(language, 'stickerSheetMode')}: ${stickerSheetModeLabel(language, stickerSheetMode)}, ${t(language, 'stickerSheetColor')}: ${stickerSheetColor}, ${t(language, 'stickerBackgroundImages')}: ${stickerBackgroundImages.length}, ${t(language, 'printCanvasItems')}: ${stickerImages.length}/${STICKER_SLOT_COUNT}`,
        priceBYN: 0,
        type: 'sticker',
        activeProduct: 'sticker',
        stickerWidthMm: 40,
        stickerHeightMm: 45,
        stickerSheetColor,
        stickerSheetMode,
        stickerBackgroundImages,
        stickerImages,
        status: 'draft',
        rendersGenerated: 0,
        quantity,
        renderUrl: snapshot || null,
    });

    const handleAddToCart = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        addToCart(buildStickerCartItem(snapshot));
        onFinish();
    };

    const handleEmailApproval = () => {
        const snapshot = captureRender();
        if (snapshot) setRenderSnapshot(snapshot);
        setApprovalSnapshot(snapshot || null);
        setApprovalOpen(true);
    };

    const selectedBackground = stickerBackgroundImages.find((image) => image.id === selectedStickerBackgroundImageId) || null;
    const selected = stickerImages.find((image) => image.id === selectedStickerImageId) || null;

    return (
        <>
            <StickerPackList
                language={language}
                stickerImages={stickerImages}
                selectedStickerImageId={selectedStickerImageId}
                stickerSheetMode={stickerSheetMode}
                addStickerImage={addStickerImage}
                selectStickerImage={selectStickerImage}
                removeStickerImage={removeStickerImage}
            />
            {selected && (
                <FloatingLogoSettings
                    title={t(language, 'selectedImage')}
                    subtitle={selected.filename}
                >
                    <SelectedStickerImageControls
                        language={language}
                        selected={selected}
                        stickerSheetMode={stickerSheetMode}
                        replaceStickerImageFile={replaceStickerImageFile}
                        setStickerImageShape={setStickerImageShape}
                        setStickerImagePosition={setStickerImagePosition}
                        resetStickerImageTransform={resetStickerImageTransform}
                        setStickerImageRotation={setStickerImageRotation}
                        setStickerImageScale={setStickerImageScale}
                    />
                </FloatingLogoSettings>
            )}
            <ConstructorDock
                title={t(language, 'sticker3d')}
                onSave={handleAddToCart}
                saveLabel={t(language, 'placeOrder')}
                onEmailApproval={guestApprovalEnabled ? handleEmailApproval : null}
                emailApprovalLabel={t(language, 'emailApproval')}
            >
            <DockGrid cols="md:grid-cols-2">
                <SettingGroup title={t(language, 'sticker3d')}>
                    <SettingRow label={t(language, 'stickerCanvasSize')} inline>
                        <span className="text-[11px] font-black uppercase tracking-wider text-white/75">{stickerSizeLabel}</span>
                    </SettingRow>
                    <SettingRow label={t(language, 'stickerSheetColor')}>
                        <ColorDropdown
                            colors={STICKER_SHEET_COLOR_PALETTE}
                            currentColor={stickerSheetColor}
                            onSelect={setStickerSheetColor}
                        />
                    </SettingRow>
                    <SettingRow label={t(language, 'stickerSheetMode')}>
                        <MiniSegment
                            value={stickerSheetMode}
                            onChange={setStickerSheetMode}
                            options={[
                                { value: 'square', label: t(language, 'stickerSheetModeSquare') },
                                { value: 'circle', label: t(language, 'stickerSheetModeCircle') },
                                { value: 'mixed', label: t(language, 'stickerSheetModeMixed') },
                            ]}
                        />
                    </SettingRow>
                    <SettingRow label={t(language, 'stickerSlots')} inline>
                        <span className="text-[11px] font-black uppercase tracking-wider text-white/75">{stickerImages.length}/{STICKER_SLOT_COUNT}</span>
                    </SettingRow>
                    <SettingRow label={t(language, 'quantityLabel')} inline>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="h-6 w-6 rounded-full bg-white/10 font-black">-</button>
                            <span className="w-7 text-center text-sm font-black">{quantity}</span>
                            <button onClick={() => setQuantity(q => q + 1)} className="h-6 w-6 rounded-full bg-white/10 font-black">+</button>
                        </div>
                    </SettingRow>
                </SettingGroup>

                <SettingGroup title={t(language, 'stickerBackgroundImages')}>
                    <SettingRow label={t(language, 'stickerSheetBackground')}>
                        <div className="flex flex-wrap items-center gap-2">
                            <FileUploadChip label={t(language, 'addBackgroundImage')} onFile={addStickerBackgroundImage} />
                            <span className="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/45">
                                {stickerBackgroundImages.length}
                            </span>
                        </div>
                    </SettingRow>
                    <LogoList
                        logos={stickerBackgroundImages}
                        selectedLogoId={selectedStickerBackgroundImageId}
                        selectLogo={selectStickerBackgroundImage}
                        removeLogo={removeStickerBackgroundImage}
                        metaForLogo={(logo) => `${t(language, 'stickerSheetBackground')} ${stickerBackgroundImages.indexOf(logo) + 1}`}
                    />
                </SettingGroup>

                {selectedBackground && (
                    <SettingGroup title={t(language, 'selectedBackgroundImage')}>
                        <TransformPad
                            label={t(language, 'position')}
                            value={selectedBackground.position}
                            onChange={setStickerBackgroundImagePosition}
                            onReset={resetStickerBackgroundImageTransform}
                            aspect="aspect-[7/10]"
                            xRange={2.2}
                            yRange={3.1}
                        />
                        <RotationScrub label={t(language, 'rotation')} value={selectedBackground.rotation ?? 0} onChange={setStickerBackgroundImageRotation} />
                        <SizeSlider label={t(language, 'size')} value={selectedBackground.scale ?? 1} min={0.15} max={3} step={0.03} onChange={setStickerBackgroundImageScale} />
                    </SettingGroup>
                )}

                <SettingGroup title={t(language, 'stickerImages')}>
                    <SettingRow label={t(language, 'stickerImages')}>
                        <div className="flex flex-wrap items-center gap-2">
                            <FileUploadChip label={t(language, 'addImage')} onFile={addStickerImage} />
                            <span className="rounded-full border border-white/15 bg-white/8 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white/45">
                                {Math.max(0, STICKER_SLOT_COUNT - stickerImages.length)} {t(language, 'stickerSlotsLeft')}
                            </span>
                        </div>
                    </SettingRow>
                    <div className="xl:hidden">
                        <LogoList
                            logos={stickerImages}
                            selectedLogoId={selectedStickerImageId}
                            selectLogo={selectStickerImage}
                            removeLogo={removeStickerImage}
                            metaForLogo={(logo) => getStickerImageMeta(language, stickerSheetMode, logo, stickerImages.indexOf(logo))}
                        />
                    </div>
                </SettingGroup>

                {selected && (
                    <div className="xl:hidden">
                        <SettingGroup title={t(language, 'selectedImage')}>
                            <SelectedStickerImageControls
                                language={language}
                                selected={selected}
                                stickerSheetMode={stickerSheetMode}
                                replaceStickerImageFile={replaceStickerImageFile}
                                setStickerImageShape={setStickerImageShape}
                                setStickerImagePosition={setStickerImagePosition}
                                resetStickerImageTransform={resetStickerImageTransform}
                                setStickerImageRotation={setStickerImageRotation}
                                setStickerImageScale={setStickerImageScale}
                            />
                        </SettingGroup>
                    </div>
                )}
            </DockGrid>

            <GuestApprovalModal
                isOpen={approvalOpen}
                onClose={() => setApprovalOpen(false)}
                renderDataURL={approvalSnapshot}
                productName={t(language, 'sticker3d')}
                configuration={{ productConfig: buildStickerCartItem(approvalSnapshot) }}
                extraPayload={{
                    sticker_print_payload: buildStickerPrintPayload({
                        stickerSheetColor,
                        stickerSheetMode,
                        stickerBackgroundImages,
                        stickerImages,
                    }),
                }}
                quantity={quantity}
            />
            </ConstructorDock>
        </>
    );
};
