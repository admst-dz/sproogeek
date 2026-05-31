import { useMemo } from 'react';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import { MerchLogoPlane } from './MerchLogoPlane';

// Placeholder-модель шопера: тонкий прямоугольник «полотна» + две полукруглые
// ручки. Геометрия временная, в дальнейшем меняется на glb/gltf.
const BAG_WIDTH = 2.4;
const BAG_HEIGHT = 2.8;
const BAG_DEPTH = 0.18;
const HANDLE_RADIUS = 0.72;
const HANDLE_TUBE = 0.045;

function ShopperHandles({ color, handleType }) {
    const handleY = BAG_HEIGHT / 2 + HANDLE_RADIUS * 0.62;
    const handleScale = handleType === 'short' ? 0.62 : 1;

    return (
        <group position={[0, handleY, 0]} scale={[1, handleScale, 1]}>
            <mesh position={[-BAG_WIDTH * 0.3, 0, BAG_DEPTH / 2 + 0.005]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[HANDLE_RADIUS, HANDLE_TUBE, 12, 32, Math.PI]} />
                <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
            </mesh>
            <mesh position={[BAG_WIDTH * 0.3, 0, BAG_DEPTH / 2 + 0.005]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[HANDLE_RADIUS, HANDLE_TUBE, 12, 32, Math.PI]} />
                <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
            </mesh>
            <mesh position={[-BAG_WIDTH * 0.3, 0, -BAG_DEPTH / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[HANDLE_RADIUS, HANDLE_TUBE, 12, 32, Math.PI]} />
                <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
            </mesh>
            <mesh position={[BAG_WIDTH * 0.3, 0, -BAG_DEPTH / 2 - 0.005]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[HANDLE_RADIUS, HANDLE_TUBE, 12, 32, Math.PI]} />
                <meshStandardMaterial color={color} roughness={0.7} metalness={0.02} />
            </mesh>
        </group>
    );
}

export function Shopper({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.shopperColor ?? state.shopperColor;
    const handleType = config?.shopperHandleType ?? state.shopperHandleType;
    const printSide = config?.shopperPrintSide ?? state.shopperPrintSide;
    const logos = config?.shopperLogos ?? state.shopperLogos;

    const printAreaWidth = BAG_WIDTH * 0.62;
    const printAreaHeight = BAG_HEIGHT * 0.5;
    const isFront = printSide === 'front';
    const logoZ = isFront ? BAG_DEPTH / 2 + 0.01 : -BAG_DEPTH / 2 - 0.01;
    const logoYaw = isFront ? 0 : Math.PI;

    const bagGeometry = useMemo(() => new THREE.BoxGeometry(BAG_WIDTH, BAG_HEIGHT, BAG_DEPTH), []);

    return (
        <group position={position} rotation={preview ? [0.18, -0.42, 0] : [0.06, -0.18, 0]}>
            <mesh geometry={bagGeometry} castShadow receiveShadow>
                <meshStandardMaterial color={color} roughness={0.92} metalness={0.01} />
            </mesh>
            <ShopperHandles color={color} handleType={handleType} />

            {logos.map((image) => (
                <MerchLogoPlane
                    key={image.id}
                    image={image}
                    areaWidth={printAreaWidth}
                    areaHeight={printAreaHeight}
                    offset={[0, 0, logoZ]}
                    rotationFix={[0, logoYaw, 0]}
                />
            ))}
        </group>
    );
}
