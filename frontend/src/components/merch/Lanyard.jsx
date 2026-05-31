import { useMemo } from 'react';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import { MerchLogoPlane } from './MerchLogoPlane';

// Ланъярд = тонкая лента, свисающая петлёй + металлический карабин внизу.
// Длина и ширина из стора влияют на пропорции, заготовка позже сменится glb.
const LOOP_RADIUS = 1.05;
const STRAP_THICKNESS = 0.012;

function makeLanyardCurve() {
    const points = [];
    const segments = 96;
    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const angle = Math.PI * (1 - t);
        const x = Math.cos(angle) * LOOP_RADIUS;
        const yLoop = Math.sin(angle) * LOOP_RADIUS * 0.92;
        points.push(new THREE.Vector3(x, yLoop, 0));
    }
    // Спускаем «хвостики» к карабину
    const tailLen = LOOP_RADIUS * 1.4;
    const lastTop = points[points.length - 1];
    points.push(new THREE.Vector3(lastTop.x * 0.3, -tailLen, 0));
    return new THREE.CatmullRomCurve3(points);
}

function StrapMesh({ color, lengthMm, widthMm }) {
    const widthScale = widthMm / 15;
    const lengthScale = lengthMm / 450;

    const curve = useMemo(() => makeLanyardCurve(), []);
    const geometry = useMemo(() => (
        new THREE.TubeGeometry(curve, 160, STRAP_THICKNESS, 8, false)
    ), [curve]);

    return (
        <group scale={[widthScale, lengthScale, widthScale]}>
            <mesh geometry={geometry} castShadow receiveShadow>
                <meshStandardMaterial color={color} roughness={0.72} metalness={0.02} />
            </mesh>
            {/* Плоская лента поверх трубки, чтобы дать «текстильность» силуэту */}
            <mesh>
                <tubeGeometry args={[curve, 160, STRAP_THICKNESS * 4, 4, false]} />
                <meshStandardMaterial color={color} roughness={0.86} metalness={0.01} side={THREE.DoubleSide} transparent opacity={0.85} />
            </mesh>
        </group>
    );
}

function Carabiner({ kind = 'carabiner' }) {
    const isHook = kind === 'hook' || kind === 'j_hook';
    return (
        <group position={[0, -1.55, 0]}>
            <mesh>
                <torusGeometry args={[0.12, 0.018, 16, 64, isHook ? Math.PI * 1.4 : Math.PI * 2]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.65} roughness={0.32} />
            </mesh>
            <mesh position={[0, -0.15, 0]}>
                <boxGeometry args={[0.05, 0.18, 0.025]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.55} roughness={0.4} />
            </mesh>
        </group>
    );
}

export function Lanyard({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.lanyardColor ?? state.lanyardColor;
    const lengthMm = config?.lanyardLengthMm ?? state.lanyardLengthMm;
    const widthMm = config?.lanyardWidthMm ?? state.lanyardWidthMm;
    const carabiner = config?.lanyardCarabiner ?? state.lanyardCarabiner;
    const logos = config?.lanyardLogos ?? state.lanyardLogos;

    // Зона лого размещаем спереди на «прямом» участке слева/справа,
    // одинаково — placeholder, реальное распределение появится с glb.
    const printAreaWidth = (widthMm / 15) * 0.18;
    const printAreaHeight = 0.8;

    return (
        <group position={[position[0], position[1] + 0.2, position[2]]} rotation={preview ? [0.12, -0.3, 0] : [0.05, -0.18, 0]}>
            <StrapMesh color={color} lengthMm={lengthMm} widthMm={widthMm} />
            <Carabiner kind={carabiner} />

            {logos.map((image, idx) => (
                <MerchLogoPlane
                    key={image.id}
                    image={image}
                    areaWidth={printAreaWidth}
                    areaHeight={printAreaHeight}
                    offset={[idx % 2 === 0 ? -LOOP_RADIUS * 0.78 : LOOP_RADIUS * 0.78, 0.2, 0.04]}
                    rotationFix={[0, 0, 0]}
                />
            ))}
        </group>
    );
}
