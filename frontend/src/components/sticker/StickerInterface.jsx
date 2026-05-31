import { useState } from 'react';
import { captureRender, STICKER_SLOT_COUNT, useConfigurator } from '../../store';
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

export const StickerInterface = ({ onFinish }) => {
    const {
        stickerSheetColor,
        stickerImages,
        selectedStickerImageId,
        setStickerSheetColor,
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
        design: `${t(language, 'stickerCanvasSize')}: ${stickerSizeLabel}, ${t(language, 'stickerSheetColor')}: ${stickerSheetColor}, ${t(language, 'printCanvasItems')}: ${stickerImages.length}/${STICKER_SLOT_COUNT}`,
        priceBYN: 0,
        type: 'sticker',
        activeProduct: 'sticker',
        stickerWidthMm: 40,
        stickerHeightMm: 45,
        stickerSheetColor,
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
                        metaForLogo={(logo) => `${t(language, 'stickerSlot')} ${(logo.slot ?? stickerImages.indexOf(logo)) + 1} · ${logo.shape === 'square' ? t(language, 'stickerShapeSquare') : t(language, 'stickerShapeCircle')}`}
                    />
                </SettingGroup>

                {selected && (
                    <SettingGroup title={t(language, 'selectedImage')}>
                        <div className="space-y-3 xl:hidden">
                            <LogoBackgroundRemovalButton logo={selected} language={language} onApply={(file) => replaceStickerImageFile(selected.id, file)} />
                            <SettingRow label={t(language, 'stickerShape')}>
                                <MiniSegment
                                    value={selected.shape ?? 'circle'}
                                    onChange={setStickerImageShape}
                                    options={[
                                        { value: 'circle', label: t(language, 'stickerShapeCircle') },
                                        { value: 'square', label: t(language, 'stickerShapeSquare') },
                                    ]}
                                />
                            </SettingRow>
                            <TransformPad label={t(language, 'position')} value={selected.position} onChange={setStickerImagePosition} onReset={resetStickerImageTransform} aspect="aspect-square" xRange={0.34} yRange={0.34} />
                            <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setStickerImageRotation} />
                            <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.72} min={0.22} max={1.15} step={0.03} onChange={setStickerImageScale} />
                        </div>
                        <FloatingLogoSettings title={t(language, 'selectedImage')} subtitle={selected.filename}>
                            <LogoBackgroundRemovalButton logo={selected} language={language} onApply={(file) => replaceStickerImageFile(selected.id, file)} />
                            <SettingRow label={t(language, 'stickerShape')}>
                                <MiniSegment
                                    value={selected.shape ?? 'circle'}
                                    onChange={setStickerImageShape}
                                    options={[
                                        { value: 'circle', label: t(language, 'stickerShapeCircle') },
                                        { value: 'square', label: t(language, 'stickerShapeSquare') },
                                    ]}
                                />
                            </SettingRow>
                            <TransformPad label={t(language, 'position')} value={selected.position} onChange={setStickerImagePosition} onReset={resetStickerImageTransform} aspect="aspect-square" xRange={0.34} yRange={0.34} />
                            <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setStickerImageRotation} />
                            <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.72} min={0.22} max={1.15} step={0.03} onChange={setStickerImageScale} />
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
                quantity={quantity}
            />
        </ConstructorDock>
    );
};
