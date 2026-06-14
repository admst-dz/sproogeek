import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import tshirtModelUrl from '../../assets/tshirt_test.glb?url';
import { useLogoTexture } from '../../utils/threeTextures';

const MODEL_SCALE = 1.18;
const LOGO_SURFACE_OFFSET = 0.08;
const LOGO_POLYGON_OFFSET = -24;
const TSHIRT_LOGO_MIN_SCALE = 0.08;
const TSHIRT_LOGO_MAX_SCALE = 1;
const TSHIRT_PRINT_AREA_CENTER_Y_RATIO = 0.48;
const TSHIRT_PRINT_AREA_WIDTH_RATIO = 0.68;
const TSHIRT_PRINT_AREA_HEIGHT_RATIO = 0.52;

function containedLogoSize(map, areaWidth, areaHeight, scale = 0.6) {
    const imageWidth = map?.image?.width ?? map?.image?.naturalWidth ?? 1;
    const imageHeight = map?.image?.height ?? map?.image?.naturalHeight ?? 1;
    const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
    const areaAspect = areaWidth / areaHeight;
    const normalizedScale = THREE.MathUtils.clamp(scale, TSHIRT_LOGO_MIN_SCALE, TSHIRT_LOGO_MAX_SCALE);

    if (aspect >= areaAspect) {
        const width = areaWidth * normalizedScale;
        return { width, height: width / aspect };
    }

    const height = areaHeight * normalizedScale;
    return { width: height * aspect, height };
}

function TshirtLogoPlane({
    image,
    areaWidth,
    areaHeight,
    offset = [0, 0, 0],
    rotationFix = [0, 0, 0],
    scaleBase = 0.9,
}) {
    const map = useLogoTexture(image.texture);
    const size = containedLogoSize(map, areaWidth * scaleBase, areaHeight, image.scale ?? 0.6);

    const [px = 0, py = 0] = image.position || [];
    const maxX = Math.max(0, areaWidth / 2 - size.width / 2);
    const maxY = Math.max(0, areaHeight / 2 - size.height / 2);
    const x = THREE.MathUtils.clamp(px * maxX, -maxX, maxX);
    const y = THREE.MathUtils.clamp(py * maxY, -maxY, maxY);

    return (
        <mesh
            position={[offset[0] + x, offset[1] + y, offset[2]]}
            rotation={[
                rotationFix[0],
                rotationFix[1],
                (image.rotation ?? 0) + rotationFix[2],
            ]}
            renderOrder={40}
        >
            <planeGeometry args={[size.width, size.height]} />
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
                side={THREE.FrontSide}
                roughness={0.55}
                metalness={0.02}
            />
        </mesh>
    );
}

export function Tshirt({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.tshirtColor ?? state.tshirtColor;
    const rawPrintSide = config?.tshirtPrintSide ?? state.tshirtPrintSide;
    const printSide = rawPrintSide === 'back' ? 'back' : 'front';
    const logos = config?.tshirtLogos ?? state.tshirtLogos;
    const { scene: sourceScene } = useGLTF(tshirtModelUrl);

    const { geometries, bbox, size, center } = useMemo(() => {
        sourceScene.updateMatrixWorld(true);
        const entries = [];
        const box = new THREE.Box3();

        sourceScene.traverse((node) => {
            if (!node.isMesh || !node.geometry) return;
            const geometry = node.geometry.clone();
            geometry.applyMatrix4(node.matrixWorld);
            geometry.computeBoundingBox();
            box.union(geometry.boundingBox);
            entries.push({ name: node.name, geometry });
        });

        const modelSize = new THREE.Vector3();
        const modelCenter = new THREE.Vector3();
        box.getSize(modelSize);
        box.getCenter(modelCenter);
        return { geometries: entries, bbox: box, size: modelSize, center: modelCenter };
    }, [sourceScene]);

    const isBack = printSide === 'back';
    const logoX = 0;
    const logoY = bbox.min.y + size.y * TSHIRT_PRINT_AREA_CENTER_Y_RATIO;
    const logoZ = isBack ? bbox.min.z - LOGO_SURFACE_OFFSET : bbox.max.z + LOGO_SURFACE_OFFSET;
    const logoYaw = isBack ? Math.PI : 0;
    const printAreaWidth = size.x * TSHIRT_PRINT_AREA_WIDTH_RATIO;
    const printAreaHeight = size.y * TSHIRT_PRINT_AREA_HEIGHT_RATIO;

    return (
        <group position={position} rotation={preview ? [0.16, -0.38, 0] : [0.04, -0.16, 0]}>
            <group scale={MODEL_SCALE} position={[-center.x * MODEL_SCALE, -center.y * MODEL_SCALE, -center.z * MODEL_SCALE]}>
                {geometries.map(({ name, geometry }) => (
                    <mesh key={name} geometry={geometry} castShadow receiveShadow>
                        <meshStandardMaterial
                            key={`tshirt-material-${color}`}
                            color={color}
                            roughness={0.82}
                            metalness={0.02}
                            side={THREE.DoubleSide}
                        />
                    </mesh>
                ))}
                {logos.map((image) => (
                    <TshirtLogoPlane
                        key={image.id}
                        image={image}
                        areaWidth={printAreaWidth}
                        areaHeight={printAreaHeight}
                        offset={[logoX, logoY, logoZ]}
                        rotationFix={[0, logoYaw, 0]}
                        scaleBase={1}
                    />
                ))}
            </group>
        </group>
    );
}

useGLTF.preload(tshirtModelUrl);
