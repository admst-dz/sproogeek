import React, { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useConfigurator } from '../store'
import { Decal, useTexture, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import spiralModelUrl from '../assets/spiral.glb?url'

function LogoDecal({ texture, x, y, z, rotation = 0, scale = 0.6 }) {
    const map = useTexture(texture);
    useEffect(() => {
        if (map) {
            map.wrapS = THREE.ClampToEdgeWrapping;
            map.wrapT = THREE.ClampToEdgeWrapping;
            map.anisotropy = 16;
            map.needsUpdate = true;
        }
    }, [map]);
    return (
        <Decal position={[x, y, z]} rotation={[0, 0, rotation]} scale={[scale, scale, 1]}>
            <meshStandardMaterial map={map} transparent alphaTest={0.08} depthWrite={false} roughness={0.6} side={THREE.FrontSide}/>
        </Decal>
    );
}

// --- 1. МОДЕЛЬ НА ПРУЖИНЕ (GLB - БЕЗОПАСНАЯ ЗАГРУЗКА) ---
function SpiralModel({ coverColor, spiralColor, logos, ...props }) {
    // Загрузка
const { nodes } = useGLTF(spiralModelUrl)

    // --- ДЕБАГ ИМЕН ---
    useEffect(() => {
        if (nodes) {
            console.group("🔍 ИМЕНА ВАШЕЙ МОДЕЛИ (ДЛЯ ПРОВЕРКИ):");
            console.log(Object.keys(nodes)); // <-- СМОТРИ СЮДА В КОНСОЛИ
            console.groupEnd();
        }
    }, [nodes]);

    // --- БЕЗОПАСНЫЙ ПОИСК ГЕОМЕТРИИ ---
    // Пытаемся найти по имени Cover, если нет - ищем Cube, если нет - берем первую попавшуюся сетку
    const getGeo = (names) => {
        for (const name of names) {
            if (nodes[name] && nodes[name].geometry) return nodes[name].geometry;
        }
        return null;
    };

    // СПИСОК ВОЗМОЖНЫХ ИМЕН (Добавьте сюда то, что увидите в консоли)
    const coverGeo = getGeo(['Cover', 'cover', 'Cube', 'Book']);
    const spiralGeo = getGeo(['Spiral', 'spiral', 'Circle', 'Spring']);
    const pagesGeo = getGeo(['Pages', 'pages', 'Paper', 'Block']);

    const coverMatRef = useRef()
    const spiralMatRef = useRef()

    useFrame((state, delta) => {
        if (coverMatRef.current) easing.dampC(coverMatRef.current.color, coverColor, 0.25, delta)
        if (spiralMatRef.current) {
            const safeSpiralColor = spiralColor === '#Silver' ? '#C0C0C0' : spiralColor;
            easing.dampC(spiralMatRef.current.color, safeSpiralColor, 0.25, delta)
        }
    })

    return (
        <group {...props} dispose={null}>

            {/* 1. ОБЛОЖКА */}
            {coverGeo && (
                <mesh geometry={coverGeo} castShadow receiveShadow>
                    <meshStandardMaterial ref={coverMatRef} color={coverColor} roughness={0.4} />

                    {logos.map(logo => (
                        <LogoDecal key={logo.id} texture={logo.texture} x={logo.position[0]} y={logo.position[1]} z={0.1} rotation={logo.rotation ?? 0} scale={logo.scale ?? 0.6} />
                    ))}
                </mesh>
            )}

            {/* 2. ПРУЖИНА */}
            {spiralGeo && (
                <mesh geometry={spiralGeo} castShadow>
                    <meshStandardMaterial ref={spiralMatRef} color="#C0C0C0" metalness={0.6} roughness={0.3} />
                </mesh>
            )}

            {/* 3. БУМАГА */}
            {pagesGeo && (
                <mesh geometry={pagesGeo} receiveShadow>
                    <meshStandardMaterial color="#fcfcfc" roughness={0.9} />
                </mesh>
            )}

        </group>
    )
}


// --- 2. ТВЕРДЫЙ ПЕРЕПЛЕТ (ПРОЦЕДУРНЫЙ КОД - БЕЗ ИЗМЕНЕНИЙ) ---
function HardCoverModel({ coverColor, dims, elasticColor, hasElastic, logos, isNotebookOpen }) {
    const group = useRef()
    const frontCoverGroup = useRef()
    const coverMat = useRef()
    const elasticMat = useRef()

    useFrame((state, delta) => {
        if(coverMat.current) easing.dampC(coverMat.current.color, coverColor, 0.25, delta)
        if(elasticMat.current) easing.dampC(elasticMat.current.color, elasticColor, 0.25, delta)

        const targetRotation = isNotebookOpen ? -Math.PI * 0.98 : 0;
        if (frontCoverGroup.current) {
            easing.dampE(frontCoverGroup.current.rotation, [0, targetRotation, 0], 0.35, delta)
        }

        const targetX = isNotebookOpen ? dims.w / 2 : 0;
        easing.damp3(group.current.position, [targetX, 0, 0], 0.35, delta);
    })

    const coverThick = 0.05;
    const paperThick = 0.25;
    const zPaperCenter = (coverThick + paperThick) / 2;

    return (
        <group ref={group}>
            {/* Задняя часть */}
            <group>
                <mesh position={[0, 0, 0]}>
                    <boxGeometry args={[dims.w, dims.h, coverThick]} />
                    <meshStandardMaterial ref={coverMat} color={coverColor} roughness={0.4} />
                </mesh>
                <mesh position={[0, 0, zPaperCenter]}>
                    <boxGeometry args={[dims.w - 0.05, dims.h - 0.05, paperThick]} />
                    <meshStandardMaterial color="#fcfcfc" roughness={0.9} />
                </mesh>
            </group>

            {/* Передняя часть */}
            <group ref={frontCoverGroup} position={[-dims.w/2, 0, paperThick + coverThick]} rotation={[0, 0, 0]}>
                <mesh position={[dims.w/2, 0, 0]}>
                    <boxGeometry args={[dims.w, dims.h, coverThick]} />
                    <meshStandardMaterial color={coverColor} roughness={0.4} />
                    {logos.map(logo => (
                        <LogoDecal key={logo.id} texture={logo.texture} x={logo.position[0]} y={logo.position[1]} z={coverThick/2+0.001} rotation={logo.rotation ?? 0} scale={logo.scale ?? 0.6} />
                    ))}
                </mesh>
                {hasElastic && (
                    <group position={[dims.w * 0.85, 0, 0]}>
                        <mesh position={[0, 0, coverThick + 0.005]}>
                            <boxGeometry args={[0.12, dims.h + 0.02, 0.025]} />
                            <meshStandardMaterial ref={elasticMat} color={elasticColor} roughness={0.9} />
                        </mesh>
                    </group>
                )}
            </group>

            {/* Корешок */}
            <mesh position={[-dims.w/2 - coverThick/2, 0, zPaperCenter]}>
                <boxGeometry args={[coverThick, dims.h, paperThick + coverThick*2]} />
                <meshStandardMaterial color={coverColor} roughness={0.4} />
            </mesh>
        </group>
    )
}


// --- ГЛАВНЫЙ КОМПОНЕНТ ---
export function Notebook({ config: configProp, ...props }) {
    const store = useConfigurator();
    const {
        format, bindingType,
        coverColor, hasElastic, elasticColor, spiralColor,
        logos,
        isNotebookOpen
    } = configProp || store;

    const dims = format === 'A5' ? { w: 1.5, h: 2.1 } : { w: 1.05, h: 1.48 };

    useGLTF.preload(spiralModelUrl)
    
    return (
        <group {...props} dispose={null}>
            {bindingType === 'hard' ? (
                <HardCoverModel
                    coverColor={coverColor}
                    dims={dims}
                    elasticColor={elasticColor}
                    hasElastic={hasElastic}
                    logos={logos}
                    isNotebookOpen={isNotebookOpen}
                />
            ) : (
                <SpiralModel
                    coverColor={coverColor}
                    spiralColor={spiralColor}
                    logos={logos}
                    // МАСШТАБ И ПОВОРОТ ПОДБИРАЙТЕ ТУТ
                    scale={20}
                    rotation={[Math.PI/2, 0, 0]}
                />
            )}
        </group>
    )
}