import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useConfigurator } from '../../store'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import powerbankModelUrl from '../../assets/poverbank.glb?url'
import { useLogoTexture } from '../../utils/threeTextures'

const DETAIL_SURFACE_OFFSET = 0.004;
const LOGO_SURFACE_OFFSET = 0.008;
const LOGO_POLYGON_OFFSET = -18;
const DETAIL_POLYGON_OFFSET = -12;

function OverlayMaterial({ color, opacity = 1, polygonOffsetFactor = DETAIL_POLYGON_OFFSET }) {
    return (
        <meshStandardMaterial
            color={color}
            transparent={opacity < 1}
            opacity={opacity}
            depthTest
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={polygonOffsetFactor}
            polygonOffsetUnits={polygonOffsetFactor}
            side={THREE.DoubleSide}
            roughness={0.88}
            metalness={0.02}
        />
    );
}

function logoSizeFromTexture(map, scale) {
    const imageWidth = map?.image?.width ?? map?.image?.naturalWidth ?? 1;
    const imageHeight = map?.image?.height ?? map?.image?.naturalHeight ?? 1;
    const aspect = imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1;

    if (aspect >= 1) {
        return { width: scale, height: scale / aspect };
    }

    return { width: scale * aspect, height: scale };
}

function clampedLogoCenter({
    position,
    rotation,
    logoWidth,
    logoHeight,
    faceWidth,
    faceHeight,
}) {
    const px = THREE.MathUtils.clamp(position?.[0] ?? 0, -1, 1);
    const py = THREE.MathUtils.clamp(position?.[1] ?? 0, -1, 1);
    const cos = Math.abs(Math.cos(rotation));
    const sin = Math.abs(Math.sin(rotation));
    const projectedHalfWidth = (logoWidth * cos + logoHeight * sin) / 2;
    const projectedHalfHeight = (logoWidth * sin + logoHeight * cos) / 2;
    const edgeInset = Math.min(faceWidth, faceHeight) * 0.035;
    const maxOffsetX = Math.max(0, faceWidth / 2 - projectedHalfWidth - edgeInset);
    const maxOffsetY = Math.max(0, faceHeight / 2 - projectedHalfHeight - edgeInset);

    return {
        x: px * maxOffsetX,
        y: py * maxOffsetY,
    };
}

function LogoPlane({ texture, position, frontZ, backZ, centerX, centerY, width, height, side = 'outer', rotation = 0, scale = 0.6 }) {
    const map = useLogoTexture(texture);
    const isCharging = side === 'charging';
    const z = isCharging ? frontZ + LOGO_SURFACE_OFFSET : backZ - LOGO_SURFACE_OFFSET;
    const rotY = isCharging ? 0 : Math.PI;
    const logoSize = logoSizeFromTexture(map, scale);
    const logoCenter = clampedLogoCenter({
        position,
        rotation,
        logoWidth: logoSize.width,
        logoHeight: logoSize.height,
        faceWidth: width,
        faceHeight: height,
    });
    const worldX = centerX + (isCharging ? logoCenter.x : -logoCenter.x);
    const worldY = centerY + logoCenter.y;

    return (
        <mesh
            position={[worldX, worldY, z]}
            rotation={[0, rotY, rotation]}
            renderOrder={30}
        >
            <planeGeometry args={[logoSize.width, logoSize.height]} />
            <meshStandardMaterial
                map={map}
                transparent
                alphaTest={0.08}
                alphaToCoverage
                depthTest
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={LOGO_POLYGON_OFFSET}
                polygonOffsetUnits={LOGO_POLYGON_OFFSET}
                side={THREE.DoubleSide}
                roughness={0.42}
                metalness={0.05}
            />
        </mesh>
    );
}

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

function PowerbankFaceDetails({ bbox, frontZ, bodyColor }) {
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;
    const centerX = (bbox.min.x + bbox.max.x) / 2;
    const bottomY = bbox.min.y;
    const ringOuterRadius = Math.min(width * 0.34, height * 0.235);
    const ringThickness = Math.max(width * 0.018, 0.018);
    const capsuleWidth = width * 0.06;
    const capsuleHeight = height * 0.18;
    const detailColor = new THREE.Color(bodyColor).lerp(new THREE.Color('#050505'), 0.58).getStyle();
    const z = frontZ + DETAIL_SURFACE_OFFSET;

    const ringGeometry = useMemo(() => (
        new THREE.RingGeometry(ringOuterRadius - ringThickness, ringOuterRadius, 96)
    ), [ringOuterRadius, ringThickness]);

    const capsuleGeometry = useMemo(() => (
        new THREE.ShapeGeometry(roundedRectShape(capsuleWidth, capsuleHeight, capsuleWidth / 2))
    ), [capsuleWidth, capsuleHeight]);

    return (
        <group position={[centerX, 0, z]}>
            <mesh
                geometry={ringGeometry}
                position={[0, bottomY + height * 0.72, 0]}
                renderOrder={20}
            >
                <OverlayMaterial color={detailColor} />
            </mesh>
            <mesh
                geometry={capsuleGeometry}
                position={[0, bottomY + height * 0.35, 0]}
                renderOrder={21}
            >
                <OverlayMaterial color={detailColor} />
            </mesh>
        </group>
    );
}

export function Powerbank({ config: configProp, ...props }) {
    const store = useConfigurator();
    const { powerbankBodyColor, powerbankLogos } = configProp || store;
    const { nodes, materials } = useGLTF(powerbankModelUrl);
    const matRef = useRef();

    // Собираем все mesh-ноды
    const meshEntries = useMemo(() => {
        return Object.entries(nodes)
            .filter(([, n]) => n.isMesh || n.geometry)
            .map(([name, node]) => {
                const geo = node.geometry;
                geo.computeBoundingBox();
                return { name, geo, bbox: geo.boundingBox };
            });
    }, [nodes]);

    // Сохраняем только легкую фактуру исходной модели, а блеск убираем материалом.
    const mat = materials ? Object.values(materials)[0] : null;
    const normalMap = mat?.normalMap ?? null;

    // Bbox для позиционирования логотипов на передней грани
    const sceneBbox = useMemo(() => {
        const box = new THREE.Box3();
        meshEntries.forEach(e => box.union(e.bbox));
        return box;
    }, [meshEntries]);

    const frontZ = sceneBbox.max.z;
    const backZ = sceneBbox.min.z;
    const centerX = (sceneBbox.min.x + sceneBbox.max.x) / 2;
    const centerY = (sceneBbox.min.y + sceneBbox.max.y) / 2;
    const centerZ = (sceneBbox.min.z + sceneBbox.max.z) / 2;
    const width = sceneBbox.max.x - sceneBbox.min.x;
    const height = sceneBbox.max.y - sceneBbox.min.y;

    useFrame((_, delta) => {
        if (matRef.current) easing.dampC(matRef.current.color, powerbankBodyColor, 0.25, delta);
    });

    return (
        <group {...props} dispose={null}>
            <group position={[-centerX, -centerY, -centerZ]}>
                {meshEntries.map(({ name, geo }, i) => (
                    <mesh key={name} geometry={geo} castShadow receiveShadow>
                        <meshStandardMaterial
                            ref={i === 0 ? matRef : undefined}
                            color={powerbankBodyColor}
                            normalMap={normalMap}
                            normalScale={[0.35, 0.35]}
                            roughness={0.92}
                            metalness={0.02}
                        />
                    </mesh>
                ))}
                <PowerbankFaceDetails
                    bbox={sceneBbox}
                    frontZ={frontZ}
                    bodyColor={powerbankBodyColor}
                />
                {powerbankLogos.map(logo => (
                    <LogoPlane
                        key={logo.id}
                        texture={logo.texture}
                        position={logo.position}
                        frontZ={frontZ}
                        backZ={backZ}
                        centerX={centerX}
                        centerY={centerY}
                        width={width}
                        height={height}
                        side={logo.side ?? 'outer'}
                        rotation={logo.rotation ?? 0}
                        scale={logo.scale ?? 0.6}
                    />
                ))}
            </group>
        </group>
    );
}

useGLTF.preload(powerbankModelUrl);
