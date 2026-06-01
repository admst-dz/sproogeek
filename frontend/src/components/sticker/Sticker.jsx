import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
    STICKER_DEFAULT_SLOT_SHAPES,
    STICKER_SLOT_COUNT,
    useConfigurator,
} from '../../store';
import { logoSizeFromTexture, useLogoTexture } from '../../utils/threeTextures';
import squareStickerModelUrl from '../../assets/kvadrat_for_list.glb?url';
import circleStickerModelUrl from '../../assets/crug_for_list.glb?url';

const MODEL_SCALE = 0.7;
const SHEET_WIDTH = 4.2;
const SHEET_HEIGHT = 5.92;
const STICKER_Z = 0.034;
const SHEET_BACKGROUND_Z = -0.0056;
const LOGO_Z = -0.011;
const LOGO_RENDER_ORDER = 24;
const GLASS_RENDER_ORDER = 42;
const SHEET_STENCIL_REF = 7;
const STICKER_MASK_SIZE = 1.02;
const STICKER_MASK_RADIUS = 0.48;
const SHEET_BACKGROUND_MAX_SIDE = 3.2;

const SLOT_LAYOUT = [
    { x: -1.08, y: 2.05 },
    { x: 1.08, y: 1.52 },
    { x: -1.08, y: 0.28 },
    { x: 1.08, y: -0.34 },
    { x: -1.08, y: -1.58 },
    { x: 1.08, y: -2.05 },
];

const SAMPLE_COLORS = ['#38BDF8', '#F97316', '#111827', '#EC407A', '#43A047', '#1565C0'];
const EMPTY_IMAGES = [];

const normalizeShape = (shape) => (shape === 'square' ? 'square' : 'circle');

function materialForNode(node, variant, color) {
    if (variant === 'sheet') {
        return new THREE.MeshStandardMaterial({
            color,
            roughness: 0.78,
            metalness: 0.02,
            side: THREE.DoubleSide,
        });
    }

    const isGlass = /_2$/.test(node.name);
    if (isGlass) {
        return new THREE.MeshPhysicalMaterial({
            color: '#D8DEE6',
            transparent: true,
            opacity: 0.46,
            depthWrite: false,
            roughness: 0.12,
            metalness: 0.02,
            clearcoat: 0.95,
            clearcoatRoughness: 0.08,
            side: THREE.DoubleSide,
        });
    }

    return new THREE.MeshStandardMaterial({
        color: '#F7F0E6',
        roughness: 0.66,
        metalness: 0.02,
        side: THREE.DoubleSide,
    });
}

function useCenteredScene(sourceScene, variant, color = '#ffffff') {
    return useMemo(() => {
        const scene = sourceScene.clone(true);
        scene.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            node.material = materialForNode(node, variant, color);
            node.renderOrder = /_2$/.test(node.name) ? GLASS_RENDER_ORDER : 8;
        });
        scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(scene);
        const center = new THREE.Vector3();
        box.getCenter(center);
        return {
            scene,
            offset: center.multiplyScalar(-1).toArray(),
        };
    }, [color, sourceScene, variant]);
}

function SheetModel({ color }) {
    return (
        <group>
            <mesh position={[0, 0, -0.014]} castShadow receiveShadow>
                <boxGeometry args={[SHEET_WIDTH, SHEET_HEIGHT, 0.012]} />
                <meshStandardMaterial
                    color="#F7F3EA"
                    roughness={0.82}
                    metalness={0.01}
                />
            </mesh>
            <mesh position={[0, 0, -0.0072]} receiveShadow renderOrder={2}>
                <planeGeometry args={[SHEET_WIDTH, SHEET_HEIGHT]} />
                <meshStandardMaterial
                    color={color}
                    roughness={0.78}
                    metalness={0.02}
                    side={THREE.FrontSide}
                    polygonOffset
                    polygonOffsetFactor={-2}
                    polygonOffsetUnits={-2}
                />
            </mesh>
        </group>
    );
}

function SheetStencilMask() {
    return (
        <mesh position={[0, 0, SHEET_BACKGROUND_Z - 0.0002]} renderOrder={10}>
            <planeGeometry args={[SHEET_WIDTH, SHEET_HEIGHT]} />
            <meshBasicMaterial
                colorWrite={false}
                depthWrite={false}
                depthTest={false}
                side={THREE.DoubleSide}
                stencilWrite
                stencilRef={SHEET_STENCIL_REF}
                stencilFunc={THREE.AlwaysStencilFunc}
                stencilFail={THREE.ReplaceStencilOp}
                stencilZFail={THREE.ReplaceStencilOp}
                stencilZPass={THREE.ReplaceStencilOp}
            />
        </mesh>
    );
}

function SheetBackgroundImage({ image }) {
    const map = useLogoTexture(image.texture);
    const rotation = image.rotation ?? 0;
    const scale = THREE.MathUtils.clamp(Number(image.scale) || 1, 0.1, 3);
    const size = logoSizeFromTexture(map, SHEET_BACKGROUND_MAX_SIDE * scale);
    const x = Number(image.position?.[0]) || 0;
    const y = Number(image.position?.[1]) || 0;

    return (
        <mesh
            position={[x, y, SHEET_BACKGROUND_Z]}
            rotation={[0, 0, rotation]}
            renderOrder={12}
        >
            <planeGeometry args={[size.width, size.height]} />
            <meshStandardMaterial
                map={map}
                transparent
                alphaTest={0.02}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-4}
                polygonOffsetUnits={-4}
                roughness={0.68}
                metalness={0.02}
                side={THREE.DoubleSide}
                stencilWrite
                stencilRef={SHEET_STENCIL_REF}
                stencilFunc={THREE.EqualStencilFunc}
                stencilFail={THREE.KeepStencilOp}
                stencilZFail={THREE.KeepStencilOp}
                stencilZPass={THREE.KeepStencilOp}
            />
        </mesh>
    );
}

function StickerShell({ sourceScene }) {
    const { scene, offset } = useCenteredScene(sourceScene, 'sticker');
    return <primitive object={scene} position={offset} />;
}

function StickerStencilMask({ shape, stencilRef }) {
    return (
        <mesh position={[0, 0, LOGO_Z - 0.0004]} renderOrder={18}>
            {shape === 'circle' ? (
                <circleGeometry args={[STICKER_MASK_RADIUS, 96]} />
            ) : (
                <planeGeometry args={[STICKER_MASK_SIZE, STICKER_MASK_SIZE]} />
            )}
            <meshBasicMaterial
                colorWrite={false}
                depthWrite={false}
                depthTest={false}
                side={THREE.DoubleSide}
                stencilWrite
                stencilRef={stencilRef}
                stencilFunc={THREE.AlwaysStencilFunc}
                stencilFail={THREE.ReplaceStencilOp}
                stencilZFail={THREE.ReplaceStencilOp}
                stencilZPass={THREE.ReplaceStencilOp}
            />
        </mesh>
    );
}

function StickerLogo({ image, shape, stencilRef }) {
    const map = useLogoTexture(image.texture);
    const rotation = image.rotation ?? 0;
    const scale = THREE.MathUtils.clamp(Number(image.scale) || 0.72, 0.18, 3);
    const maxLogoSide = shape === 'square' ? 0.78 : 0.74;
    const size = logoSizeFromTexture(map, maxLogoSide * scale);
    const x = Number(image.position?.[0]) || 0;
    const y = Number(image.position?.[1]) || 0;

    return (
        <mesh
            position={[x, y, LOGO_Z]}
            rotation={[0, 0, rotation]}
            renderOrder={LOGO_RENDER_ORDER}
        >
            <planeGeometry args={[size.width, size.height]} />
            <meshStandardMaterial
                map={map}
                transparent
                alphaTest={0.04}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-10}
                polygonOffsetUnits={-10}
                roughness={0.42}
                metalness={0.02}
                side={THREE.DoubleSide}
                stencilWrite
                stencilRef={stencilRef}
                stencilFunc={THREE.EqualStencilFunc}
                stencilFail={THREE.KeepStencilOp}
                stencilZFail={THREE.KeepStencilOp}
                stencilZPass={THREE.KeepStencilOp}
            />
        </mesh>
    );
}

function SampleLogoMark({ shape, index }) {
    const color = SAMPLE_COLORS[index % SAMPLE_COLORS.length];
    return (
        <group position={[0, 0, LOGO_Z]} rotation={[0, 0, index % 2 ? 0.28 : -0.2]}>
            {shape === 'circle' ? (
                <mesh renderOrder={LOGO_RENDER_ORDER}>
                    <circleGeometry args={[0.27, 48]} />
                    <meshStandardMaterial color={color} roughness={0.46} metalness={0.02} />
                </mesh>
            ) : (
                <mesh renderOrder={LOGO_RENDER_ORDER}>
                    <planeGeometry args={[0.46, 0.32]} />
                    <meshStandardMaterial color={color} roughness={0.46} metalness={0.02} />
                </mesh>
            )}
        </group>
    );
}

function normalizeImagesBySlot(images = []) {
    const bySlot = new Map();
    const usedSlots = new Set();

    images.slice(0, STICKER_SLOT_COUNT).forEach((image, index) => {
        const storedSlot = Number(image?.slot);
        let slot = Number.isInteger(storedSlot) && storedSlot >= 0 && storedSlot < STICKER_SLOT_COUNT
            ? storedSlot
            : index;

        if (usedSlots.has(slot)) {
            slot = SLOT_LAYOUT.findIndex((_, candidate) => !usedSlots.has(candidate));
        }
        if (slot < 0) return;

        usedSlots.add(slot);
        bySlot.set(slot, {
            ...image,
            slot,
            shape: normalizeShape(image.shape ?? STICKER_DEFAULT_SLOT_SHAPES[slot]),
        });
    });

    return bySlot;
}

export function Sticker({ config = null, preview = false, position = [0, 0, 0] }) {
    const stickerSheetColor = useConfigurator((state) => state.stickerSheetColor);
    const stickerBackgroundImages = useConfigurator((state) => state.stickerBackgroundImages);
    const stickerImages = useConfigurator((state) => state.stickerImages);
    const hasConfig = Boolean(config);
    const configuredBackgroundImages = config?.stickerBackgroundImages;
    const configuredImages = config?.stickerImages;
    const sheetColor = hasConfig ? (config.stickerSheetColor ?? '#F6F1E7') : stickerSheetColor;
    const backgroundImages = useMemo(() => (
        hasConfig ? (configuredBackgroundImages ?? EMPTY_IMAGES) : stickerBackgroundImages
    ), [configuredBackgroundImages, hasConfig, stickerBackgroundImages]);
    const images = useMemo(() => (
        hasConfig ? (configuredImages ?? EMPTY_IMAGES) : stickerImages
    ), [configuredImages, hasConfig, stickerImages]);
    const { scene: squareScene } = useGLTF(squareStickerModelUrl);
    const { scene: circleScene } = useGLTF(circleStickerModelUrl);
    const imagesBySlot = useMemo(() => normalizeImagesBySlot(images), [images]);
    const showSamples = preview && imagesBySlot.size === 0;

    return (
        <group
            position={position}
            rotation={preview ? [0.12, -0.18, 0.04] : [0, 0, 0]}
            scale={MODEL_SCALE}
        >
            <SheetModel color={sheetColor} />
            <SheetStencilMask />
            {backgroundImages.map((image) => (
                image?.texture ? <SheetBackgroundImage key={image.id} image={image} /> : null
            ))}
            <group position={[0, 0, STICKER_Z]}>
                {SLOT_LAYOUT.map((slot, index) => {
                    const image = imagesBySlot.get(index);
                    const shape = normalizeShape(image?.shape ?? STICKER_DEFAULT_SLOT_SHAPES[index]);
                    const sourceScene = shape === 'square' ? squareScene : circleScene;
                    const stencilRef = index + 1;
                    return (
                        <group
                            key={index}
                            position={[slot.x, slot.y, 0]}
                        >
                            <StickerShell sourceScene={sourceScene} />
                            <StickerStencilMask shape={shape} stencilRef={stencilRef} />
                            {image?.texture ? (
                                <StickerLogo image={image} shape={shape} stencilRef={stencilRef} />
                            ) : showSamples ? (
                                <SampleLogoMark shape={shape} index={index} />
                            ) : null}
                        </group>
                    );
                })}
            </group>
        </group>
    );
}

useGLTF.preload(squareStickerModelUrl);
useGLTF.preload(circleStickerModelUrl);
