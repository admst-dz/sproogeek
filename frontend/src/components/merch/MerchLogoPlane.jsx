import * as THREE from 'three';
import { useLogoTexture, logoSizeFromTexture } from '../../utils/threeTextures';

// Универсальная плоскость с логотипом для мерч-моделей. Параметры
// position/rotation/scale из стора подаются «нормализованными» — внутри
// клиппим в пределах разрешённой зоны печати чтобы лого не вылезал за край.
export function MerchLogoPlane({
    image,
    areaWidth,
    areaHeight,
    offset = [0, 0, 0],
    rotationFix = [0, 0, 0],
    scaleBase = 0.9,
}) {
    const map = useLogoTexture(image.texture);
    const size = logoSizeFromTexture(map, Math.max(areaWidth, areaHeight) * scaleBase * (image.scale ?? 0.6));

    const [px = 0, py = 0] = image.position || [];
    const maxX = Math.max(0, areaWidth / 2 - size.width / 2);
    const maxY = Math.max(0, areaHeight / 2 - size.height / 2);
    const x = THREE.MathUtils.clamp(px * maxX, -maxX, maxX);
    const y = THREE.MathUtils.clamp(py * maxY, -maxY, maxY);

    return (
        <mesh
            position={[offset[0] + x, offset[1] + y, offset[2]]}
            rotation={[rotationFix[0], rotationFix[1], (image.rotation ?? 0) + rotationFix[2]]}
            renderOrder={5}
        >
            <planeGeometry args={[size.width, size.height]} />
            <meshStandardMaterial
                map={map}
                transparent
                roughness={0.55}
                metalness={0.02}
                polygonOffset
                polygonOffsetFactor={-4}
                polygonOffsetUnits={-4}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}
