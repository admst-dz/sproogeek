import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useConfigurator } from '../../store'
import { Decal, useTexture, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import tverdiyPerepletUrl from '../../assets/tverdiy_pereplet.glb?url'
import naPruzhineUrl from '../../assets/na_pruzhine.glb?url'
import tonkiyPerepletUrl from '../../assets/tonkiy_pereplet.glb?url'

function LogoDecal({ texture, x, y, z, rotation = 0, scale = 0.6 }) {
    const map = useTexture(texture);
    return (
        <Decal position={[x, y, z]} rotation={[0, 0, rotation]} scale={[scale, scale, 1]}>
            <meshStandardMaterial map={map} transparent alphaTest={0.08} depthWrite={false} roughness={0.6} side={THREE.FrontSide} />
        </Decal>
    );
}

function bboxSize(bbox) {
    return {
        x: bbox.max.x - bbox.min.x,
        y: bbox.max.y - bbox.min.y,
        z: bbox.max.z - bbox.min.z,
    };
}

function bboxArea(bbox) {
    const size = bboxSize(bbox);
    return size.x * size.y;
}

function splitCoverAndDecorEntries(meshEntries) {
    if (meshEntries.length === 0) return { coverEntry: null, decorEntries: [] };

    let coverEntry = meshEntries[0];
    for (const entry of meshEntries) {
        const size = bboxSize(entry.bbox);
        const coverSize = bboxSize(coverEntry.bbox);
        if (size.x > coverSize.x || (size.x === coverSize.x && bboxArea(entry.bbox) > bboxArea(coverEntry.bbox))) {
            coverEntry = entry;
        }
    }

    return {
        coverEntry,
        decorEntries: meshEntries.filter(entry => entry !== coverEntry),
    };
}

// ─── ТВЁРДЫЙ ПЕРЕПЛЁТ (GLB) ───────────────────────────────────────────────────
function HardCoverGLBModel({ coverColor, hasCorners, logos, isNotebookOpen }) {
    const { nodes, materials } = useGLTF(tverdiyPerepletUrl);
    const coverMatRef = useRef();
    const frontGroupRef = useRef();

    // Собираем все mesh-ноды
    const meshEntries = useMemo(() => {
        return Object.entries(nodes)
            .filter(([, n]) => n.isMesh || n.geometry)
            .map(([name, node]) => {
                const geo = node.geometry;
                geo.computeBoundingBox();
                return { name, node, geo, bbox: geo.boundingBox, vertCount: geo.attributes.position?.count ?? 0 };
            })
            .sort((a, b) => b.vertCount - a.vertCount);
    }, [nodes]);

    const { coverEntry, decorEntries: cornerEntries } = useMemo(() => (
        splitCoverAndDecorEntries(meshEntries)
    ), [meshEntries]);

    // Общий bbox для позиционирования уголков и резинки
    const sceneBbox = useMemo(() => {
        const box = new THREE.Box3();
        meshEntries.forEach(e => box.union(e.bbox));
        return box;
    }, [meshEntries]);

    // Нормальная карта из оригинального материала
    const mat = materials ? Object.values(materials)[0] : null;
    const normalMap = mat?.normalMap ?? null;

    const frontZ = sceneBbox.max.z;

    useFrame((_, delta) => {
        if (coverMatRef.current) easing.dampC(coverMatRef.current.color, coverColor, 0.25, delta);
        const target = isNotebookOpen ? -Math.PI * 0.98 : 0;
        if (frontGroupRef.current) easing.dampE(frontGroupRef.current.rotation, [0, target, 0], 0.35, delta);
    });

    return (
        <group>
            {/* Обложка */}
            {coverEntry && (
                <group
                    ref={frontGroupRef}
                    position={[sceneBbox.min.x, 0, 0]}
                    rotation={[0, 0, 0]}
                >
                    <group position={[-sceneBbox.min.x, 0, 0]}>
                        <mesh geometry={coverEntry.geo} castShadow receiveShadow>
                            <meshStandardMaterial
                                key="hard-cover-color-material"
                                ref={coverMatRef}
                                color={coverColor}
                                roughness={0.5}
                                metalness={0.05}
                            />
                            {logos.map(logo => (
                                <LogoDecal
                                    key={logo.id}
                                    texture={logo.texture}
                                    x={logo.position[0]}
                                    y={logo.position[1]}
                                    z={frontZ + 0.001}
                                    rotation={logo.rotation ?? 0}
                                    scale={logo.scale ?? 0.6}
                                />
                            ))}
                        </mesh>
                    </group>
                </group>
            )}

            {/* Золотистые уголки из самой GLB-модели */}
            {hasCorners && cornerEntries.map(e => (
                <mesh key={e.name} geometry={e.geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        key={`hard-corner-material-${e.name}`}
                        map={mat?.map}
                        normalMap={normalMap}
                        roughnessMap={mat?.roughnessMap}
                        roughness={mat?.roughness ?? 0.35}
                        metalness={mat?.metalness ?? 0.65}
                    />
                </mesh>
            ))}
        </group>
    );
}

// ─── НА ПРУЖИНЕ (GLB) ─────────────────────────────────────────────────────────
function NaPruzhineModel({ coverColor, logos }) {
    const { nodes, materials } = useGLTF(naPruzhineUrl);
    const coverMatRef = useRef();

    const meshEntries = useMemo(() => {
        return Object.entries(nodes)
            .filter(([, n]) => n.isMesh || n.geometry)
            .map(([name, node]) => ({ name, node, geo: node.geometry }));
    }, [nodes]);

    const mat = materials ? Object.values(materials)[0] : null;

    // Вычисляем bbox для позиционирования лого
    const sceneBbox = useMemo(() => {
        const box = new THREE.Box3();
        meshEntries.forEach(e => {
            e.geo.computeBoundingBox();
            box.union(e.geo.boundingBox);
        });
        return box;
    }, [meshEntries]);

    const frontZ = sceneBbox.max.z;

    useFrame((_, delta) => {
        if (coverMatRef.current) easing.dampC(coverMatRef.current.color, coverColor, 0.25, delta);
    });

    return (
        <group>
            {meshEntries.map(({ name, geo }, i) => (
                <mesh key={name} geometry={geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        ref={i === 0 ? coverMatRef : undefined}
                        color={i === 0 ? coverColor : undefined}
                        map={i === 0 ? null : mat?.map}
                        normalMap={mat?.normalMap}
                        roughnessMap={mat?.roughnessMap}
                        roughness={mat?.roughness ?? 0.6}
                        metalness={mat?.metalness ?? 0.1}
                    />
                    {i === 0 && logos.map(logo => (
                        <LogoDecal
                            key={logo.id}
                            texture={logo.texture}
                            x={logo.position[0]}
                            y={logo.position[1]}
                            z={frontZ + 0.001}
                            rotation={logo.rotation ?? 0}
                            scale={logo.scale ?? 0.6}
                        />
                    ))}
                </mesh>
            ))}
        </group>
    );
}

// ─── МЯГКИЙ ПЕРЕПЛЁТ (GLB) ────────────────────────────────────────────────────
function SoftCoverModel({ coverColor, elasticColor, hasElastic, hasCorners, logos }) {
    const { nodes, materials } = useGLTF(tonkiyPerepletUrl);
    const coverMatRef = useRef();

    const meshEntries = useMemo(() => {
        return Object.entries(nodes)
            .filter(([, n]) => n.isMesh || n.geometry)
            .map(([name, node]) => {
                const geo = node.geometry;
                geo.computeBoundingBox();
                return { name, node, geo, bbox: geo.boundingBox, vertCount: geo.attributes.position?.count ?? 0 };
            })
            .sort((a, b) => b.vertCount - a.vertCount);
    }, [nodes]);

    const { coverEntry, decorEntries: cornerEntries } = useMemo(() => (
        splitCoverAndDecorEntries(meshEntries)
    ), [meshEntries]);

    const sceneBbox = useMemo(() => {
        const box = new THREE.Box3();
        meshEntries.forEach(e => box.union(e.bbox));
        return box;
    }, [meshEntries]);

    const mat = materials ? Object.values(materials)[0] : null;
    const normalMap = mat?.normalMap ?? null;
    const frontZ = sceneBbox.max.z;
    const height = sceneBbox.max.y - sceneBbox.min.y;

    useFrame((_, delta) => {
        if (coverMatRef.current) easing.dampC(coverMatRef.current.color, coverColor, 0.25, delta);
    });

    return (
        <group>
            {coverEntry && (
                <mesh geometry={coverEntry.geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        key="soft-cover-color-material"
                        ref={coverMatRef}
                        color={coverColor}
                        roughness={0.6}
                        metalness={0}
                    />
                    {logos.map(logo => (
                        <LogoDecal
                            key={logo.id}
                            texture={logo.texture}
                            x={logo.position[0]}
                            y={logo.position[1]}
                            z={frontZ + 0.001}
                            rotation={logo.rotation ?? 0}
                            scale={logo.scale ?? 0.6}
                        />
                    ))}
                </mesh>
            )}

            {hasCorners && cornerEntries.map(e => (
                <mesh key={e.name} geometry={e.geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        key={`soft-corner-material-${e.name}`}
                        map={mat?.map}
                        normalMap={normalMap}
                        roughnessMap={mat?.roughnessMap}
                        roughness={mat?.roughness ?? 0.35}
                        metalness={mat?.metalness ?? 0.65}
                    />
                </mesh>
            ))}

            {hasElastic && (
                <mesh position={[sceneBbox.max.x * 0.82, (sceneBbox.max.y + sceneBbox.min.y) / 2, (sceneBbox.max.z + sceneBbox.min.z) / 2]}>
                    <boxGeometry args={[0.04, height + 0.02, (sceneBbox.max.z - sceneBbox.min.z) + 0.01]} />
                    <meshStandardMaterial color={elasticColor} roughness={0.9} metalness={0} />
                </mesh>
            )}
        </group>
    );
}

// ─── ГЛАВНЫЙ КОМПОНЕНТ ─────────────────────────────────────────────────────────
export function Notebook({ config: configProp, ...props }) {
    const store = useConfigurator();
    const {
        bindingType,
        coverColor, hasElastic, elasticColor,
        logos,
        isNotebookOpen,
        hasCorners,
    } = configProp || store;

    useGLTF.preload(tverdiyPerepletUrl);
    useGLTF.preload(naPruzhineUrl);
    useGLTF.preload(tonkiyPerepletUrl);

    return (
        <group {...props} dispose={null}>
            {bindingType === 'hard' && (
                <HardCoverGLBModel
                    coverColor={coverColor}
                    hasCorners={hasCorners}
                    logos={logos}
                    isNotebookOpen={isNotebookOpen}
                />
            )}
            {bindingType === 'spiral' && (
                <NaPruzhineModel
                    coverColor={coverColor}
                    logos={logos}
                />
            )}
            {bindingType === 'soft' && (
                <SoftCoverModel
                    coverColor={coverColor}
                    elasticColor={elasticColor}
                    hasElastic={hasElastic}
                    hasCorners={hasCorners}
                    logos={logos}
                />
            )}
        </group>
    );
}
