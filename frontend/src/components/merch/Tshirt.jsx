import { useMemo } from 'react';
import { Decal, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import tshirtModelUrl from '../../assets/tshirt_test.glb?url';
import { logoSizeFromTexture, useLogoTexture } from '../../utils/threeTextures';

const MODEL_SCALE = 1.18;
const DECAL_DEPTH = 0.34;

function TshirtLogoDecal({
    image,
    areaWidth,
    areaHeight,
    offset = [0, 0, 0],
    rotationFix = [0, 0, 0],
    scaleBase = 0.9,
    depth = DECAL_DEPTH,
}) {
    const map = useLogoTexture(image.texture);
    const size = logoSizeFromTexture(map, Math.max(areaWidth, areaHeight) * scaleBase * (image.scale ?? 0.6));

    const [px = 0, py = 0] = image.position || [];
    const maxX = Math.max(0, areaWidth / 2 - size.width / 2);
    const maxY = Math.max(0, areaHeight / 2 - size.height / 2);
    const x = THREE.MathUtils.clamp(px * maxX, -maxX, maxX);
    const y = THREE.MathUtils.clamp(py * maxY, -maxY, maxY);

    return (
        <Decal
            position={[offset[0] + x, offset[1] + y, offset[2]]}
            rotation={[
                rotationFix[0],
                rotationFix[1],
                (image.rotation ?? 0) + rotationFix[2],
            ]}
            scale={[size.width, size.height, depth]}
            renderOrder={8}
        >
            <meshStandardMaterial
                map={map}
                transparent
                roughness={0.58}
                metalness={0.01}
                polygonOffset
                polygonOffsetFactor={-8}
                polygonOffsetUnits={-8}
                depthWrite={false}
            />
        </Decal>
    );
}

export function Tshirt({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.tshirtColor ?? state.tshirtColor;
    const printSide = config?.tshirtPrintSide ?? state.tshirtPrintSide;
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
    const isLeftSleeve = printSide === 'leftSleeve';
    const isRightSleeve = printSide === 'rightSleeve';
    const sleeveX = size.x * 0.34;
    const logoX = isLeftSleeve ? -sleeveX : isRightSleeve ? sleeveX : 0;
    const logoY = bbox.min.y + size.y * (isLeftSleeve || isRightSleeve ? 0.58 : 0.49);
    const logoZ = isBack ? bbox.min.z - 0.02 : bbox.max.z + 0.02;
    const logoYaw = isBack ? Math.PI : isLeftSleeve ? -0.72 : isRightSleeve ? 0.72 : 0;
    const printAreaWidth = size.x * (isLeftSleeve || isRightSleeve ? 0.22 : 0.48);
    const printAreaHeight = size.y * (isLeftSleeve || isRightSleeve ? 0.22 : 0.42);
    const sleeveTilt = isLeftSleeve ? -0.28 : isRightSleeve ? 0.28 : 0;

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
                        {logos.map((image) => (
                            <TshirtLogoDecal
                                key={image.id}
                                image={image}
                                areaWidth={printAreaWidth}
                                areaHeight={printAreaHeight}
                                offset={[logoX, logoY, logoZ]}
                                rotationFix={[0, logoYaw, sleeveTilt]}
                                scaleBase={isLeftSleeve || isRightSleeve ? 0.55 : 0.9}
                                depth={isLeftSleeve || isRightSleeve ? 0.28 : DECAL_DEPTH}
                            />
                        ))}
                    </mesh>
                ))}
            </group>
        </group>
    );
}

useGLTF.preload(tshirtModelUrl);
