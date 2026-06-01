import { useEffect, useMemo, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import lanyardModelUrl from '../../assets/lanyard_test.glb?url';

const MODEL_SCALE = 0.72;
const BADGE_COLOR = '#ffffff';
const BADGE_METALNESS = 0.04;
const BADGE_ROUGHNESS = 0.56;
const ATTACHMENT_METALNESS = 0.02;
const ATTACHMENT_ROUGHNESS = 0.78;
const PATTERN_CANVAS_WIDTH = 4096;
const PATTERN_CANVAS_HEIGHT = 256;

const clampScale = (value) => THREE.MathUtils.clamp(Number(value) || 0.6, 0.12, 3);

const loadImage = (src) => new Promise((resolve) => {
    if (!src) {
        resolve(null);
        return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.crossOrigin = 'anonymous';
    image.src = src;
});

const resolveHexColor = (color) => {
    try {
        return `#${new THREE.Color(color || '#1A1A1A').getHexString()}`;
    } catch {
        return '#1A1A1A';
    }
};

function drawRibbonBase(ctx, color) {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = resolveHexColor(color);
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, Math.max(2, height * 0.08));
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, height - Math.max(2, height * 0.08), width, Math.max(2, height * 0.08));

    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (let x = -height; x < width + height; x += 34) {
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x + height, 0);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawLogoOnRibbon(ctx, logo, image, centerX, periodPx) {
    const { height } = ctx.canvas;
    const scale = clampScale(logo.scale);
    const maxWidth = periodPx * 0.7 * scale;
    const maxHeight = height * 0.68 * scale;
    const fit = Math.min(maxWidth / image.width, maxHeight / image.height);
    if (!Number.isFinite(fit) || fit <= 0) return;

    const drawWidth = image.width * fit;
    const drawHeight = image.height * fit;
    ctx.save();
    ctx.translate(centerX, height / 2);
    ctx.rotate(logo.rotation ?? 0);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
}

function useLanyardPatternTexture({ color, logos, lengthMm, repeatMm }) {
    const [texture, setTexture] = useState(null);
    const logoSignature = useMemo(() => (
        (logos || []).map((logo) => [
            logo.id,
            logo.texture,
            logo.scale ?? 0.6,
            logo.rotation ?? 0,
        ].join(':')).join('|')
    ), [logos]);

    useEffect(() => {
        if (!logos?.length) {
            setTexture((current) => {
                current?.dispose();
                return null;
            });
            return undefined;
        }

        let cancelled = false;
        const canvas = document.createElement('canvas');
        canvas.width = PATTERN_CANVAS_WIDTH;
        canvas.height = PATTERN_CANVAS_HEIGHT;
        const ctx = canvas.getContext('2d');
        drawRibbonBase(ctx, color);

        Promise.all(logos.map((logo) => loadImage(logo.texture))).then((images) => {
            if (cancelled) return;

            const printable = logos
                .map((logo, index) => ({ logo, image: images[index] }))
                .filter(({ image }) => image?.width && image?.height);

            if (!printable.length) return;

            const periodPx = THREE.MathUtils.clamp(
                (Math.max(20, repeatMm || 50) / Math.max(1, lengthMm || 450)) * PATTERN_CANVAS_WIDTH,
                PATTERN_CANVAS_HEIGHT * 0.88,
                PATTERN_CANVAS_WIDTH,
            );
            const slots = Math.ceil(PATTERN_CANVAS_WIDTH / periodPx) + 2;

            for (let slot = -1; slot < slots; slot += 1) {
                const current = printable[((slot % printable.length) + printable.length) % printable.length];
                drawLogoOnRibbon(ctx, current.logo, current.image, slot * periodPx + periodPx / 2, periodPx);
            }

            const nextTexture = new THREE.CanvasTexture(canvas);
            nextTexture.colorSpace = THREE.SRGBColorSpace;
            nextTexture.wrapS = THREE.ClampToEdgeWrapping;
            nextTexture.wrapT = THREE.ClampToEdgeWrapping;
            nextTexture.minFilter = THREE.LinearMipmapLinearFilter;
            nextTexture.magFilter = THREE.LinearFilter;
            nextTexture.anisotropy = 16;
            nextTexture.needsUpdate = true;

            setTexture((current) => {
                current?.dispose();
                return nextTexture;
            });
        });

        return () => {
            cancelled = true;
        };
    }, [color, lengthMm, logoSignature, logos, repeatMm]);

    useEffect(() => () => {
        texture?.dispose();
    }, [texture]);

    return texture;
}

export function Lanyard({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.lanyardColor ?? state.lanyardColor;
    const lengthMm = config?.lanyardLengthMm ?? state.lanyardLengthMm;
    const widthMm = config?.lanyardWidthMm ?? state.lanyardWidthMm;
    const repeatMm = config?.lanyardRepeatMm ?? state.lanyardRepeatMm ?? 50;
    const logos = config?.lanyardLogos ?? state.lanyardLogos;
    const { scene: sourceScene } = useGLTF(lanyardModelUrl);
    const patternTexture = useLanyardPatternTexture({ color, logos, lengthMm, repeatMm });

    const { meshes, bbox, size, center } = useMemo(() => {
        sourceScene.updateMatrixWorld(true);
        const meshEntries = [];
        const box = new THREE.Box3();

        sourceScene.traverse((node) => {
            if (!node.isMesh || !node.geometry) return;
            const geometry = node.geometry.clone();
            geometry.applyMatrix4(node.matrixWorld);
            geometry.computeBoundingBox();
            box.union(geometry.boundingBox);
            meshEntries.push({ name: node.name, geometry });
        });

        const modelSize = new THREE.Vector3();
        const modelCenter = new THREE.Vector3();
        box.getSize(modelSize);
        box.getCenter(modelCenter);
        return { meshes: meshEntries, bbox: box, size: modelSize, center: modelCenter };
    }, [sourceScene]);

    const widthScale = widthMm / 15;
    const lengthScale = lengthMm / 450;
    const scaled = [MODEL_SCALE * widthScale, MODEL_SCALE * lengthScale, MODEL_SCALE * widthScale];

    return (
        <group position={position} rotation={preview ? [0.1, -0.28, 0] : [0.04, -0.14, 0]}>
            <group scale={scaled} position={[-center.x * scaled[0], -center.y * scaled[1], -center.z * scaled[2]]}>
                {meshes.map(({ name, geometry }) => {
                    const lowerName = name.toLowerCase();
                    const isBadge = lowerName.includes('badge');
                    const isRibbon = lowerName.includes('string') || lowerName.includes('lanyard') || lowerName.includes('strap') || lowerName.includes('ribbon');
                    const materialMap = isRibbon ? patternTexture : null;
                    const materialColor = isBadge ? BADGE_COLOR : materialMap ? '#ffffff' : color;
                    return (
                        <mesh
                            key={name}
                            geometry={geometry}
                            castShadow
                            receiveShadow
                        >
                            <meshStandardMaterial
                                key={`lanyard-${name}-${materialColor}`}
                                map={materialMap}
                                color={materialColor}
                                roughness={isBadge ? BADGE_ROUGHNESS : ATTACHMENT_ROUGHNESS}
                                metalness={isBadge ? BADGE_METALNESS : ATTACHMENT_METALNESS}
                                side={THREE.DoubleSide}
                            />
                        </mesh>
                    );
                })}
            </group>
        </group>
    );
}

useGLTF.preload(lanyardModelUrl);
