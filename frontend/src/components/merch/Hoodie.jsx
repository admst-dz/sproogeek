import { useMemo } from 'react';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import { MerchLogoPlane } from './MerchLogoPlane';

// Худи отличается от майки: ниже линия низа, шире плечи + есть капюшон и
// карман-кенгуру. Силуэт по-прежнему упрощённый — placeholder под glb/gltf.
const HOODIE_HALF_WIDTH = 1.85;
const HOODIE_HEIGHT = 2.9;
const HOODIE_DEPTH = 0.32;

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

export function Hoodie({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.hoodieColor ?? state.hoodieColor;
    const printSide = config?.hoodiePrintSide ?? state.hoodiePrintSide;
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

    const printAreaWidth = HOODIE_HALF_WIDTH * 1.2;
    const printAreaHeight = HOODIE_HEIGHT * 0.4;
    const isFront = printSide !== 'back';
    const logoZ = isFront ? HOODIE_DEPTH + 0.08 : -0.08;
    const logoYaw = isFront ? 0 : Math.PI;
    const logoY = printSide === 'chest' ? HOODIE_HEIGHT * 0.62 : HOODIE_HEIGHT * 0.45;

    return (
        <group position={[position[0], position[1] - HOODIE_HEIGHT / 2 + 0.6, position[2]]} rotation={preview ? [0.16, -0.4, 0] : [0.04, -0.18, 0]}>
            <mesh geometry={geometry} castShadow receiveShadow>
                <meshStandardMaterial color={color} roughness={0.84} metalness={0.02} />
            </mesh>
            <HoodieHood color={color} />
            <KangarooPocket color={color} />

            {logos.map((image) => (
                <MerchLogoPlane
                    key={image.id}
                    image={image}
                    areaWidth={printAreaWidth}
                    areaHeight={printAreaHeight}
                    offset={[0, logoY, logoZ]}
                    rotationFix={[0, logoYaw, 0]}
                    scaleBase={printSide === 'chest' ? 0.5 : 0.9}
                />
            ))}
        </group>
    );
}
