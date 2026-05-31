import { useMemo } from 'react';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import { MerchLogoPlane } from './MerchLogoPlane';

// Силуэт майки собирается из ExtrudeGeometry по 2D-форме. Это временный
// плейсхолдер до подключения реальной glb/gltf-модели.
const SHIRT_HALF_WIDTH = 1.6;
const SHIRT_HEIGHT = 2.6;
const SHIRT_DEPTH = 0.2;

function buildShirtShape({ withSleeves = true } = {}) {
    const shape = new THREE.Shape();
    // Стартуем от низа-левой кромки и идём по периметру против часовой
    const halfBottom = SHIRT_HALF_WIDTH * 0.78;
    const sleeveOutset = withSleeves ? SHIRT_HALF_WIDTH : SHIRT_HALF_WIDTH * 0.72;
    const sleeveTop = SHIRT_HEIGHT * 0.78;
    const shoulderInset = SHIRT_HALF_WIDTH * 0.58;
    const neckHalf = SHIRT_HALF_WIDTH * 0.22;
    const neckDip = SHIRT_HEIGHT - SHIRT_HALF_WIDTH * 0.16;

    shape.moveTo(-halfBottom, 0);
    shape.lineTo(halfBottom, 0);
    shape.lineTo(halfBottom + (sleeveOutset - halfBottom) * 0.85, SHIRT_HEIGHT * 0.55);
    shape.lineTo(sleeveOutset, sleeveTop);
    shape.lineTo(shoulderInset, SHIRT_HEIGHT * 0.92);
    shape.quadraticCurveTo(neckHalf + 0.1, SHIRT_HEIGHT, neckHalf, neckDip);
    shape.quadraticCurveTo(0, neckDip - SHIRT_HALF_WIDTH * 0.04, -neckHalf, neckDip);
    shape.quadraticCurveTo(-neckHalf - 0.1, SHIRT_HEIGHT, -shoulderInset, SHIRT_HEIGHT * 0.92);
    shape.lineTo(-sleeveOutset, sleeveTop);
    shape.lineTo(-halfBottom - (sleeveOutset - halfBottom) * 0.85, SHIRT_HEIGHT * 0.55);
    shape.closePath();
    return shape;
}

export function Tshirt({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.tshirtColor ?? state.tshirtColor;
    const printSide = config?.tshirtPrintSide ?? state.tshirtPrintSide;
    const logos = config?.tshirtLogos ?? state.tshirtLogos;

    const geometry = useMemo(() => {
        const shape = buildShirtShape({ withSleeves: true });
        return new THREE.ExtrudeGeometry(shape, {
            depth: SHIRT_DEPTH,
            bevelEnabled: true,
            bevelSegments: 3,
            bevelSize: 0.06,
            bevelThickness: 0.04,
        });
    }, []);

    const printAreaWidth = SHIRT_HALF_WIDTH * 1.1;
    const printAreaHeight = SHIRT_HEIGHT * 0.5;
    const isFront = printSide !== 'back';
    const logoZ = isFront ? SHIRT_DEPTH + 0.06 : -0.06;
    const logoYaw = isFront ? 0 : Math.PI;

    return (
        <group position={[position[0], position[1] - SHIRT_HEIGHT / 2 + 0.6, position[2]]} rotation={preview ? [0.18, -0.42, 0] : [0.04, -0.18, 0]}>
            <mesh geometry={geometry} castShadow receiveShadow>
                <meshStandardMaterial color={color} roughness={0.78} metalness={0.02} />
            </mesh>
            {/* Резинка по горловине */}
            <mesh position={[0, SHIRT_HEIGHT * 0.92, SHIRT_DEPTH / 2]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[SHIRT_HALF_WIDTH * 0.24, 0.025, 12, 48]} />
                <meshStandardMaterial color={color} roughness={0.6} metalness={0.04} />
            </mesh>

            {logos.map((image) => (
                <MerchLogoPlane
                    key={image.id}
                    image={image}
                    areaWidth={printAreaWidth}
                    areaHeight={printAreaHeight}
                    offset={[0, SHIRT_HEIGHT * 0.4, logoZ]}
                    rotationFix={[0, logoYaw, 0]}
                />
            ))}
        </group>
    );
}
