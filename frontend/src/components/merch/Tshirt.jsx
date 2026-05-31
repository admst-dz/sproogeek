import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import tshirtModelUrl from '../../assets/tshirt_test.glb?url';
import { MerchLogoPlane } from './MerchLogoPlane';

const MODEL_SCALE = 1.18;
const LOGO_SURFACE_OFFSET = 0.018;

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
    const logoZ = isBack ? bbox.min.z - LOGO_SURFACE_OFFSET : bbox.max.z + LOGO_SURFACE_OFFSET;
    const logoYaw = isBack ? Math.PI : 0;
    const sleeveX = size.x * 0.34;
    const logoX = isLeftSleeve ? -sleeveX : isRightSleeve ? sleeveX : 0;
    const logoY = bbox.min.y + size.y * (isLeftSleeve || isRightSleeve ? 0.58 : 0.47);
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
                    </mesh>
                ))}

                {logos.map((image) => (
                    <MerchLogoPlane
                        key={image.id}
                        image={image}
                        areaWidth={printAreaWidth}
                        areaHeight={printAreaHeight}
                        offset={[logoX, logoY, logoZ]}
                        rotationFix={[0, logoYaw, sleeveTilt]}
                        scaleBase={isLeftSleeve || isRightSleeve ? 0.55 : 0.9}
                    />
                ))}
            </group>
        </group>
    );
}

useGLTF.preload(tshirtModelUrl);
