import { useEffect, useMemo } from 'react';
import { useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { useConfigurator } from '../../store';

const STICKER_WIDTH = 2.4;
const STICKER_HEIGHT = 2.7;
const CORNER_RADIUS = 0.18;

function roundedRectShape(width, height, radius) {
    const x = -width / 2;
    const y = -height / 2;
    const r = Math.min(radius, width / 2, height / 2);
    const shape = new THREE.Shape();
    shape.moveTo(x + r, y);
    shape.lineTo(x + width - r, y);
    shape.quadraticCurveTo(x + width, y, x + width, y + r);
    shape.lineTo(x + width, y + height - r);
    shape.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    shape.lineTo(x + r, y + height);
    shape.quadraticCurveTo(x, y + height, x, y + height - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
    return shape;
}

function StickerImagePlane({ image, index }) {
    const texture = useLoader(THREE.TextureLoader, image.texture);
    const aspect = texture.image?.width && texture.image?.height
        ? texture.image.width / texture.image.height
        : 1;
    const base = Math.max(0.18, Number(image.scale) || 0.72);
    const height = Math.min(STICKER_HEIGHT * 0.86, base);
    const width = Math.min(STICKER_WIDTH * 0.86, height * aspect);
    const [x = 0, y = 0] = image.position || [];

    useEffect(() => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.needsUpdate = true;
    }, [texture]);

    return (
        <mesh
            position={[
                THREE.MathUtils.clamp(x, -0.82, 0.82),
                THREE.MathUtils.clamp(y, -0.95, 0.95),
                0.048 + index * 0.006,
            ]}
            rotation={[0, 0, image.rotation || 0]}
            renderOrder={10 + index}
        >
            <planeGeometry args={[width, height]} />
            <meshStandardMaterial
                map={texture}
                transparent
                roughness={0.42}
                metalness={0.02}
                polygonOffset
                polygonOffsetFactor={-1}
            />
        </mesh>
    );
}

function SampleStickerArt() {
    return (
        <group>
            <mesh position={[-0.36, 0.18, 0.052]} rotation={[0, 0, -0.18]}>
                <circleGeometry args={[0.42, 64]} />
                <meshStandardMaterial color="#38bdf8" roughness={0.36} metalness={0.04} />
            </mesh>
            <mesh position={[0.32, -0.2, 0.056]} rotation={[0, 0, 0.22]}>
                <planeGeometry args={[0.74, 0.54]} />
                <meshStandardMaterial color="#f97316" roughness={0.42} metalness={0.03} />
            </mesh>
            <mesh position={[0.08, 0.46, 0.06]} rotation={[0, 0, 0.35]}>
                <ringGeometry args={[0.17, 0.26, 48]} />
                <meshStandardMaterial color="#111827" roughness={0.5} metalness={0.02} />
            </mesh>
        </group>
    );
}

export function Sticker({ config = null, preview = false, position = [0, 0, 0] }) {
    const stickerImages = useConfigurator((state) => state.stickerImages);
    const images = config?.stickerImages ?? stickerImages;
    const bodyShape = useMemo(() => roundedRectShape(STICKER_WIDTH, STICKER_HEIGHT, CORNER_RADIUS), []);
    const edgeShape = useMemo(() => roundedRectShape(STICKER_WIDTH + 0.08, STICKER_HEIGHT + 0.08, CORNER_RADIUS + 0.03), []);

    return (
        <group position={position} rotation={preview ? [0.18, -0.38, 0.08] : [0.08, -0.18, 0]}>
            <mesh position={[0, 0, -0.028]} castShadow receiveShadow>
                <extrudeGeometry args={[edgeShape, { depth: 0.045, bevelEnabled: true, bevelSegments: 4, bevelSize: 0.018, bevelThickness: 0.016 }]} />
                <meshStandardMaterial color="#e5e7eb" roughness={0.72} metalness={0.01} />
            </mesh>
            <mesh position={[0, 0, 0.018]} castShadow receiveShadow>
                <shapeGeometry args={[bodyShape]} />
                <meshStandardMaterial color="#fffaf0" roughness={0.48} metalness={0.02} />
            </mesh>
            <mesh position={[0, 0, 0.04]}>
                <shapeGeometry args={[bodyShape]} />
                <meshStandardMaterial color="#ffffff" roughness={0.28} metalness={0.04} transparent opacity={0.36} />
            </mesh>
            {images.length > 0
                ? images.map((image, index) => <StickerImagePlane key={image.id || index} image={image} index={index} />)
                : <SampleStickerArt />}
        </group>
    );
}
