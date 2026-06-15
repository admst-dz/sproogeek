import { useMemo } from 'react';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import { MerchLogoPlane } from './MerchLogoPlane';

// Худи отличается от майки: ниже линия низа, шире плечи + есть капюшон и
// карман-кенгуру. Силуэт по-прежнему упрощённый — placeholder под glb/gltf.
const HOODIE_HALF_WIDTH = 1.85;
const HOODIE_HEIGHT = 2.9;
const HOODIE_DEPTH = 0.32;

const HOODIE_PRINT_SIDES = ['front', 'back', 'chest', 'leftSleeve', 'rightSleeve'];

const normalizeHoodiePrintSide = (side) => (
    HOODIE_PRINT_SIDES.includes(side) ? side : 'front'
);

function buildHoodieShape() {
    const shape = new THREE.Shape();
    const halfBottom = HOODIE_HALF_WIDTH * 0.86;
    const sleeveOutset = HOODIE_HALF_WIDTH * 1.05;
    const shoulderInset = HOODIE_HALF_WIDTH * 0.66;
    const collarHalf = HOODIE_HALF_WIDTH * 0.34;
    const topY = HOODIE_HEIGHT;

    shape.moveTo(-halfBottom, 0);
    shape.lineTo(halfBottom, 0);
    shape.lineTo(halfBottom + (sleeveOutset - halfBottom) * 0.9, HOODIE_HEIGHT * 0.5);
    shape.lineTo(sleeveOutset, HOODIE_HEIGHT * 0.74);
    shape.lineTo(shoulderInset, HOODIE_HEIGHT * 0.86);
    shape.quadraticCurveTo(collarHalf + 0.1, topY * 0.97, collarHalf, topY * 0.9);
    shape.quadraticCurveTo(0, topY * 0.86, -collarHalf, topY * 0.9);
    shape.quadraticCurveTo(-collarHalf - 0.1, topY * 0.97, -shoulderInset, HOODIE_HEIGHT * 0.86);
    shape.lineTo(-sleeveOutset, HOODIE_HEIGHT * 0.74);
    shape.lineTo(-halfBottom - (sleeveOutset - halfBottom) * 0.9, HOODIE_HEIGHT * 0.5);
    shape.closePath();
    return shape;
}

function HoodieHood({ color }) {
    return (
        <group position={[0, HOODIE_HEIGHT * 0.92, 0]}>
            <mesh castShadow receiveShadow>
                <sphereGeometry args={[HOODIE_HALF_WIDTH * 0.46, 24, 16, 0, Math.PI * 2, 0, Math.PI / 1.7]} />
                <meshStandardMaterial color={color} roughness={0.82} metalness={0.02} side={THREE.DoubleSide} />
            </mesh>
            {/* Шнурки капюшона */}
            <mesh position={[-0.08, -HOODIE_HALF_WIDTH * 0.34, HOODIE_DEPTH * 0.5]}>
                <cylinderGeometry args={[0.018, 0.018, 0.42, 8]} />
                <meshStandardMaterial color="#ffffff" roughness={0.8} />
            </mesh>
            <mesh position={[0.08, -HOODIE_HALF_WIDTH * 0.34, HOODIE_DEPTH * 0.5]}>
                <cylinderGeometry args={[0.018, 0.018, 0.42, 8]} />
                <meshStandardMaterial color="#ffffff" roughness={0.8} />
            </mesh>
        </group>
    );
}

function KangarooPocket({ color }) {
    const shape = useMemo(() => {
        const s = new THREE.Shape();
        const w = HOODIE_HALF_WIDTH * 1.1;
        const h = HOODIE_HEIGHT * 0.32;
        s.moveTo(-w / 2, -h / 2);
        s.lineTo(w / 2, -h / 2);
        s.lineTo(w / 2 - 0.18, h / 2);
        s.lineTo(-w / 2 + 0.18, h / 2);
        s.closePath();
        return s;
    }, []);
    return (
        <mesh position={[0, HOODIE_HEIGHT * 0.32, HOODIE_DEPTH + 0.02]}>
            <extrudeGeometry args={[shape, { depth: 0.04, bevelEnabled: false }]} />
            <meshStandardMaterial color={color} roughness={0.86} metalness={0.02} />
        </mesh>
    );
}

function getHoodieLogoArea(side) {
    const normalizedSide = normalizeHoodiePrintSide(side);
    const frontZ = HOODIE_DEPTH + 0.08;

    if (normalizedSide === 'leftSleeve' || normalizedSide === 'rightSleeve') {
        const isLeftSleeve = normalizedSide === 'leftSleeve';
        return {
            areaWidth: HOODIE_HALF_WIDTH * 0.36,
            areaHeight: HOODIE_HEIGHT * 0.22,
            offset: [
                isLeftSleeve ? HOODIE_HALF_WIDTH * 0.92 : -HOODIE_HALF_WIDTH * 0.92,
                HOODIE_HEIGHT * 0.61,
                frontZ,
            ],
            rotationFix: [0, 0, isLeftSleeve ? -0.24 : 0.24],
            scaleBase: 0.86,
            maxScale: 1.2,
        };
    }

    const isFront = normalizedSide !== 'back';
    return {
        areaWidth: HOODIE_HALF_WIDTH * 1.2,
        areaHeight: HOODIE_HEIGHT * 0.4,
        offset: [
            0,
            normalizedSide === 'chest' ? HOODIE_HEIGHT * 0.62 : HOODIE_HEIGHT * 0.45,
            isFront ? frontZ : -0.08,
        ],
        rotationFix: [0, isFront ? 0 : Math.PI, 0],
        scaleBase: normalizedSide === 'chest' ? 0.5 : 0.9,
    };
}

export function Hoodie({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.hoodieColor ?? state.hoodieColor;
    const printSide = normalizeHoodiePrintSide(config?.hoodiePrintSide ?? state.hoodiePrintSide);
    const logos = config?.hoodieLogos ?? state.hoodieLogos;

    const geometry = useMemo(() => {
        const shape = buildHoodieShape();
        return new THREE.ExtrudeGeometry(shape, {
            depth: HOODIE_DEPTH,
            bevelEnabled: true,
            bevelSegments: 3,
            bevelSize: 0.08,
            bevelThickness: 0.06,
        });
    }, []);

    return (
        <group position={[position[0], position[1] - HOODIE_HEIGHT / 2 + 0.6, position[2]]} rotation={preview ? [0.16, -0.4, 0] : [0.04, -0.18, 0]}>
            <mesh geometry={geometry} castShadow receiveShadow>
                <meshStandardMaterial color={color} roughness={0.84} metalness={0.02} />
            </mesh>
            <HoodieHood color={color} />
            <KangarooPocket color={color} />

            {logos.map((image) => {
                const logoSide = normalizeHoodiePrintSide(image.side ?? printSide);
                const area = getHoodieLogoArea(logoSide);
                const safeImage = area.maxScale
                    ? { ...image, scale: Math.min(image.scale ?? 0.6, area.maxScale) }
                    : image;
                return (
                    <MerchLogoPlane
                        key={image.id}
                        image={safeImage}
                        areaWidth={area.areaWidth}
                        areaHeight={area.areaHeight}
                        offset={area.offset}
                        rotationFix={area.rotationFix}
                        scaleBase={area.scaleBase}
                    />
                );
            })}
        </group>
    );
}
