import { useState } from 'react';
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

const STICKER_PRINT_SHEET = {
    widthMm: 100,
    heightMm: 141,
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
                    <p className="text-[10px] leading-tight text-white/35">{t(language, 'stickerHint')}</p>
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
                    <LogoList
                        logos={stickerImages}
                        selectedLogoId={selectedStickerImageId}
                        selectLogo={selectStickerImage}
                        removeLogo={removeStickerImage}
                        metaForLogo={(logo) => {
                            const slot = logo.slot ?? stickerImages.indexOf(logo);
                            const shape = stickerSheetMode === 'mixed'
                                ? (logo.shape || getStickerSlotShape('mixed', slot))
                                : getStickerSlotShape(stickerSheetMode, slot);
                            return `${t(language, 'stickerSlot')} ${slot + 1} · ${shape === 'square' ? t(language, 'stickerShapeSquare') : t(language, 'stickerShapeCircle')}`;
                        }}
                    />
                </SettingGroup>

                {selected && (
                    <SettingGroup title={t(language, 'selectedImage')}>
                        <div className="space-y-3 xl:hidden">
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
                        <FloatingLogoSettings title={t(language, 'selectedImage')} subtitle={selected.filename}>
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
                        </FloatingLogoSettings>
                    </SettingGroup>
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
    );
};
