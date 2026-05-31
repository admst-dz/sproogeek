import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import {
    STICKER_DEFAULT_SLOT_SHAPES,
    STICKER_SLOT_COUNT,
    useConfigurator,
} from '../../store';
import { logoSizeFromTexture, useLogoTexture } from '../../utils/threeTextures';
import listModelUrl from '../../assets/list.glb?url';
import squareStickerModelUrl from '../../assets/kvadrat_for_list.glb?url';
import circleStickerModelUrl from '../../assets/crug_for_list.glb?url';

const MODEL_SCALE = 0.7;
const STICKER_Z = 0.034;
const LOGO_Z = -0.011;
const LOGO_RENDER_ORDER = 24;
const GLASS_RENDER_ORDER = 42;

const SLOT_LAYOUT = [
    { x: -0.78, y: 1.88, rotation: -0.12 },
    { x: 0.73, y: 1.61, rotation: 0.11 },
    { x: -0.67, y: 0.24, rotation: 0.07 },
    { x: 0.81, y: -0.08, rotation: -0.15 },
    { x: -0.77, y: -1.45, rotation: 0.16 },
    { x: 0.68, y: -1.74, rotation: -0.08 },
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
            color: '#ffffff',
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
            roughness: 0.08,
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

function SheetModel({ sourceScene, color }) {
    const { scene, offset } = useCenteredScene(sourceScene, 'sheet', color);
    return <primitive object={scene} position={offset} />;
}

function StickerShell({ sourceScene }) {
    const { scene, offset } = useCenteredScene(sourceScene, 'sticker');
    return <primitive object={scene} position={offset} />;
}

function clampLogoCenter({ position, rotation, logoWidth, logoHeight, shape }) {
    const px = Number(position?.[0]) || 0;
    const py = Number(position?.[1]) || 0;
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const projectedHalfWidth = (logoWidth * cos + logoHeight * sin) / 2;
    const projectedHalfHeight = (logoWidth * sin + logoHeight * cos) / 2;
    const printArea = shape === 'square' ? 1.02 : 0.96;
    const inset = 0.05;
    const maxX = Math.max(0, printArea / 2 - projectedHalfWidth - inset);
    const maxY = Math.max(0, printArea / 2 - projectedHalfHeight - inset);

    return {
        x: THREE.MathUtils.clamp(px, -maxX, maxX),
        y: THREE.MathUtils.clamp(py, -maxY, maxY),
    };
}

function StickerLogo({ image, shape }) {
    const map = useLogoTexture(image.texture);
    const rotation = image.rotation ?? 0;
    const scale = THREE.MathUtils.clamp(Number(image.scale) || 0.72, 0.18, 1.25);
    const maxLogoSide = shape === 'square' ? 0.78 : 0.74;
    const size = logoSizeFromTexture(map, maxLogoSide * scale);
    const center = clampLogoCenter({
        position: image.position,
        rotation,
        logoWidth: size.width,
        logoHeight: size.height,
        shape,
    });

    return (
        <mesh
            position={[center.x, center.y, LOGO_Z]}
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
    const stickerImages = useConfigurator((state) => state.stickerImages);
    const hasConfig = Boolean(config);
    const configuredImages = config?.stickerImages;
    const sheetColor = hasConfig ? (config.stickerSheetColor ?? '#F6F1E7') : stickerSheetColor;
    const images = useMemo(() => (
        hasConfig ? (configuredImages ?? EMPTY_IMAGES) : stickerImages
    ), [configuredImages, hasConfig, stickerImages]);
    const { scene: sheetScene } = useGLTF(listModelUrl);
    const { scene: squareScene } = useGLTF(squareStickerModelUrl);
    const { scene: circleScene } = useGLTF(circleStickerModelUrl);
    const imagesBySlot = useMemo(() => normalizeImagesBySlot(images), [images]);
    const showSamples = preview && imagesBySlot.size === 0;

    return (
        <group
            position={position}
            rotation={preview ? [0.18, -0.34, 0.08] : [0.08, -0.16, 0]}
            scale={MODEL_SCALE}
        >
            <SheetModel sourceScene={sheetScene} color={sheetColor} />
            <group position={[0, 0, STICKER_Z]}>
                {SLOT_LAYOUT.map((slot, index) => {
                    const image = imagesBySlot.get(index);
                    const shape = normalizeShape(image?.shape ?? STICKER_DEFAULT_SLOT_SHAPES[index]);
                    const sourceScene = shape === 'square' ? squareScene : circleScene;
                    return (
                        <group
                            key={index}
                            position={[slot.x, slot.y, 0]}
                            rotation={[0, 0, slot.rotation]}
                        >
                            <StickerShell sourceScene={sourceScene} />
                            {image?.texture ? (
                                <StickerLogo image={image} shape={shape} />
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

useGLTF.preload(listModelUrl);
useGLTF.preload(squareStickerModelUrl);
useGLTF.preload(circleStickerModelUrl);
