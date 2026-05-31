import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import lanyardModelUrl from '../../assets/lanyard_test.glb?url';
import { MerchLogoPlane } from './MerchLogoPlane';

const MODEL_SCALE = 0.72;
const LOGO_SURFACE_OFFSET = 0.018;
const BADGE_COLOR = '#ffffff';
const BADGE_METALNESS = 0.04;
const BADGE_ROUGHNESS = 0.56;
const ATTACHMENT_METALNESS = 0.02;
const ATTACHMENT_ROUGHNESS = 0.78;

export function Lanyard({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.lanyardColor ?? state.lanyardColor;
    const lengthMm = config?.lanyardLengthMm ?? state.lanyardLengthMm;
    const widthMm = config?.lanyardWidthMm ?? state.lanyardWidthMm;
    const logos = config?.lanyardLogos ?? state.lanyardLogos;
    const { scene: sourceScene } = useGLTF(lanyardModelUrl);

    const { meshes, bbox, size, center } = useMemo(() => {
        sourceScene.updateMatrixWorld(true);
        const meshEntries = [];
        const box = new THREE.Box3();

        sourceScene.traverse((node) => {
            if (!node.isMesh || !node.geometry) return;
            const geometry = node.geometry.clone();
            geometry.applyMatrix4(node.matrixWorld);
            geometry.computeBoundingBox();
            box.union(geometry.boundingBox);
            meshEntries.push({ name: node.name, geometry });
        });

        const modelSize = new THREE.Vector3();
        const modelCenter = new THREE.Vector3();
        box.getSize(modelSize);
        box.getCenter(modelCenter);
        return { meshes: meshEntries, bbox: box, size: modelSize, center: modelCenter };
    }, [sourceScene]);

    const widthScale = widthMm / 15;
    const lengthScale = lengthMm / 450;
    const scaled = [MODEL_SCALE * widthScale, MODEL_SCALE * lengthScale, MODEL_SCALE * widthScale];
    const logoZ = bbox.max.z + LOGO_SURFACE_OFFSET;
    const printAreaWidth = size.x * 0.22;
    const printAreaHeight = Math.max(size.y * 0.16, 0.16);
    const baseY = bbox.min.y + size.y * 0.54;

    return (
        <group position={position} rotation={preview ? [0.1, -0.28, 0] : [0.04, -0.14, 0]}>
            <group scale={scaled} position={[-center.x * scaled[0], -center.y * scaled[1], -center.z * scaled[2]]}>
                {meshes.map(({ name, geometry }) => {
                    const isBadge = name.toLowerCase().includes('badge');
                    const materialColor = isBadge ? BADGE_COLOR : color;
                    return (
                        <mesh
                            key={name}
                            geometry={geometry}
                            castShadow
                            receiveShadow
                        >
                            <meshStandardMaterial
                                key={`lanyard-${name}-${materialColor}`}
                                color={materialColor}
                                roughness={isBadge ? BADGE_ROUGHNESS : ATTACHMENT_ROUGHNESS}
                                metalness={isBadge ? BADGE_METALNESS : ATTACHMENT_METALNESS}
                                side={THREE.DoubleSide}
                            />
                        </mesh>
                    );
                })}

                {logos.map((image, idx) => (
                    <MerchLogoPlane
                        key={image.id}
                        image={image}
                        areaWidth={printAreaWidth}
                        areaHeight={printAreaHeight}
                        offset={[
                            center.x + (idx % 2 === 0 ? -size.x * 0.18 : size.x * 0.18),
                            baseY,
                            logoZ,
                        ]}
                        rotationFix={[0, 0, 0]}
                        scaleBase={0.72}
                    />
                ))}
            </group>
        </group>
    );
}

useGLTF.preload(lanyardModelUrl);
