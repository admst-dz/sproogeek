import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useConfigurator } from '../store'
import { Decal, useTexture } from '@react-three/drei'
import * as THREE from 'three'

function LogoDecal({ texture, x, y, z, rotation = 0, scale = 0.6 }) {
    const map = useTexture(texture);
    return (
        <Decal position={[x, y, z]} rotation={[0, 0, rotation]} scale={[scale, scale, 1]}>
            <meshStandardMaterial map={map} transparent alphaTest={0.01} depthWrite={false} polygonOffset polygonOffsetFactor={-20} polygonOffsetUnits={-20} roughness={0.8}/>
        </Decal>
    );
}

// --- ГЕНЕРАТОР УЗОРОВ ---
function createPatternTexture(type) {
    if (type === 'blank') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#000000'; ctx.fillStyle = '#000000';
    ctx.lineWidth = 4; ctx.lineCap = 'square';
    if (type === 'lined') { ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, size); ctx.stroke(); }
    else if (type === 'grid') { ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, size); ctx.lineTo(size, 0); ctx.stroke(); }
    else if (type === 'dotted') { ctx.beginPath(); ctx.arc(size/2, size/2, 5, 0, 2 * Math.PI); ctx.fill(); }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 16;
    return texture;
}

export function Sketchbook(props) {
    const {
        format, coverColor, spiralColor,
        logos,
        isNotebookOpen, paperPattern
    } = useConfigurator()

    const group = useRef()
    const frontCoverGroup = useRef()
    const coverMat = useRef()
    const spiralMat = useRef()

    const dims = format === 'A5' ? { w: 1.5, h: 2.1 } : { w: 1.05, h: 1.48 };

    // Для блокнота обложка тонкая (картон)
    const coverThick = 0.015;
    const paperThick = 0.25;

    // Пружина
    const spiralCount = format === 'A5' ? 32 : 22; // Частая пружина
    const spiralPitch = dims.h / (spiralCount + 1);
    const holeOffset = 0.1;
    const holeDiameter = 0.015;
    const spiralRingRadius = (paperThick + coverThick * 2) / 2 + 0.03;

    const generatedTexture = useMemo(() => {
        const tex = createPatternTexture(paperPattern);
        if (tex) {
            const scale = format === 'A5' ? 1 : 0.7;
            tex.repeat.set(16 * scale, 24 * scale);
            tex.needsUpdate = true;
        }
        return tex;
    }, [paperPattern, format]);


    useFrame((state, delta) => {
        if(coverMat.current) easing.dampC(coverMat.current.color, coverColor, 0.25, delta)
        if(spiralMat.current) easing.dampC(spiralMat.current.color, spiralColor === '#Silver' ? '#CCCCCC' : spiralColor, 0.25, delta)

        const targetRotation = isNotebookOpen ? -Math.PI * 0.98 : 0;
        if (frontCoverGroup.current) {
            easing.dampE(frontCoverGroup.current.rotation, [0, targetRotation, 0], 0.35, delta)
        }

        const targetX = isNotebookOpen ? dims.w / 2 + 0.15 : 0;
        easing.damp3(group.current.position, [targetX, 0, 0], 0.35, delta);
    })

    const zPaperCenter = (coverThick + paperThick) / 2;
    const zPattern = zPaperCenter + (paperThick/2) + 0.005;

    return (
        <group ref={group} {...props} dispose={null}>

            {/* 1. ЗАДНЯЯ ЧАСТЬ */}
            <group>
                <mesh position={[0, 0, 0]} castShadow receiveShadow>
                    <boxGeometry args={[dims.w, dims.h, coverThick]} />
                    <meshStandardMaterial ref={coverMat} color={coverColor} roughness={0.8} />
                </mesh>

                <mesh position={[holeOffset/1.2, 0, zPaperCenter + 0.001]} receiveShadow>
                    <boxGeometry args={[dims.w - holeOffset, dims.h - 0.05, paperThick]} />
                    <meshStandardMaterial color="#fcfcfc" roughness={0.9} />
                </mesh>

                {generatedTexture && (
                    <mesh position={[holeOffset/1.2, 0, zPattern]} rotation={[0, 0, 0]}>
                        <planeGeometry args={[dims.w - 0.25, dims.h - 0.15]} />
                        <meshBasicMaterial map={generatedTexture} transparent opacity={0.4} polygonOffset polygonOffsetFactor={-4} />
                    </mesh>
                )}

                {/* Дырки */}
                {Array.from({ length: spiralCount }).map((_, i) => (
                    <mesh key={`hole-back-${i}`} position={[-dims.w/2 + holeOffset/2, (i - (spiralCount-1)/2) * spiralPitch, zPaperCenter]} rotation={[Math.PI/2, 0, 0]}>
                        <cylinderGeometry args={[holeDiameter, holeDiameter, paperThick + coverThick*2 + 0.05, 16]} />
                        <meshBasicMaterial color="#111111" />
                    </mesh>
                ))}
            </group>


            {/* 2. ПЕРЕДНЯЯ ЧАСТЬ (ОБЛОЖКА) */}
            <group
                ref={frontCoverGroup}
                position={[-dims.w/2 + holeOffset/2, 0, zPaperCenter + paperThick/2]}
                rotation={[0, 0, 0]}
            >
                <group position={[dims.w/2 - holeOffset/2, 0, coverThick/2 + 0.01]}>

                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[dims.w, dims.h, coverThick]} />
                        <meshStandardMaterial color={coverColor} roughness={0.8} />

                        {logos.map(logo => (
                            <LogoDecal key={logo.id} texture={logo.texture} x={logo.position[0]} y={logo.position[1]} z={coverThick/2+0.001} rotation={logo.rotation ?? 0} scale={logo.scale ?? 0.6} />
                        ))}
                    </mesh>

                    {Array.from({ length: spiralCount }).map((_, i) => (
                        <mesh key={`hole-front-${i}`} position={[-dims.w/2 + holeOffset/2, (i - (spiralCount-1)/2) * spiralPitch, 0]} rotation={[Math.PI/2, 0, 0]}>
                            <cylinderGeometry args={[holeDiameter, holeDiameter, coverThick + 0.02, 16]} />
                            <meshBasicMaterial color="#111111" />
                        </mesh>
                    ))}
                </group>
            </group>


            {/* 3. ПРУЖИНА */}
            <group position={[-dims.w/2 + holeOffset/2, 0, zPaperCenter]}>
                {Array.from({ length: spiralCount }).map((_, i) => (
                    <mesh
                        key={`spiral-${i}`}
                        position={[0, (i - (spiralCount-1)/2) * spiralPitch, 0]}
                        rotation={[Math.PI/2, 0, 0]}
                        castShadow
                    >
                        <torusGeometry args={[spiralRingRadius, 0.015, 12, 32]} />
                        <meshStandardMaterial
                            ref={spiralMat}
                            color={spiralColor === '#Silver' ? '#CCCCCC' : spiralColor}
                            metalness={0.4}
                            roughness={0.5}
                        />
                    </mesh>
                ))}
            </group>

        </group>
    )
}