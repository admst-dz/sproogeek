import { useState } from 'react';
import { captureRender, useConfigurator } from '../../store';
import { t } from '../../i18n';
import {
    ConstructorDock,
    DockGrid,
    FileUploadChip,
    FloatingLogoSettings,
    LogoList,
    RotationScrub,
    SettingGroup,
    SettingRow,
    SizeSlider,
    TransformPad,
} from '../configurator/ConstructorDock';
import { GuestApprovalModal } from '../shared/GuestApprovalModal';
import { LogoBackgroundRemovalButton } from '../shared/LogoBackgroundRemovalButton';

const STICKER_SIZE_LABEL = '40 x 45 мм';

export const StickerInterface = ({ onFinish }) => {
    const {
        stickerImages,
        selectedStickerImageId,
        addStickerImage,
        replaceStickerImageFile,
        selectStickerImage,
        removeStickerImage,
        resetStickerImageTransform,
        setStickerImagePosition,
        setStickerImageRotation,
        setStickerImageScale,
        addToCart,
        setRenderSnapshot,
        language,
        guestApprovalEnabled,
    } = useConfigurator();
    const [quantity, setQuantity] = useState(1);
    const [approvalOpen, setApprovalOpen] = useState(false);
    const [approvalSnapshot, setApprovalSnapshot] = useState(null);

    const buildStickerCartItem = (snapshot) => ({
        productName: t(language, 'sticker3d'),
        design: `${t(language, 'stickerCanvasSize')}: ${STICKER_SIZE_LABEL}, ${t(language, 'printCanvasItems')}: ${stickerImages.length}`,
        priceBYN: 0,
        type: 'sticker',
        activeProduct: 'sticker',
        stickerWidthMm: 40,
        stickerHeightMm: 45,
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
                        <span className="text-[11px] font-black uppercase tracking-wider text-white/75">{STICKER_SIZE_LABEL}</span>
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
                        <FileUploadChip label={t(language, 'addImage')} onFile={addStickerImage} />
                    </SettingRow>
                    <LogoList
                        logos={stickerImages}
                        selectedLogoId={selectedStickerImageId}
                        selectLogo={selectStickerImage}
                        removeLogo={removeStickerImage}
                    />
                </SettingGroup>

                {selected && (
                    <SettingGroup title={t(language, 'selectedImage')}>
                        <div className="space-y-3 xl:hidden">
                            <LogoBackgroundRemovalButton logo={selected} language={language} onApply={(file) => replaceStickerImageFile(selected.id, file)} />
                            <TransformPad label={t(language, 'position')} value={selected.position} onChange={setStickerImagePosition} onReset={resetStickerImageTransform} aspect="aspect-[8/9]" xRange={0.82} yRange={0.95} />
                            <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setStickerImageRotation} />
                            <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.72} min={0.18} max={1.9} step={0.04} onChange={setStickerImageScale} />
                        </div>
                        <FloatingLogoSettings title={t(language, 'selectedImage')} subtitle={selected.filename}>
                            <LogoBackgroundRemovalButton logo={selected} language={language} onApply={(file) => replaceStickerImageFile(selected.id, file)} />
                            <TransformPad label={t(language, 'position')} value={selected.position} onChange={setStickerImagePosition} onReset={resetStickerImageTransform} aspect="aspect-[8/9]" xRange={0.82} yRange={0.95} />
                            <RotationScrub label={t(language, 'rotation')} value={selected.rotation ?? 0} onChange={setStickerImageRotation} />
                            <SizeSlider label={t(language, 'size')} value={selected.scale ?? 0.72} min={0.18} max={1.9} step={0.04} onChange={setStickerImageScale} />
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
