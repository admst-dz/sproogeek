import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useConfigurator } from '../../store'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useLogoTexture } from '../../utils/threeTextures'
import tverdiyPerepletUrl from '../../assets/tverdiy_pereplet.glb?url'
import naPruzhineUrl from '../../assets/na_pruzhine.glb?url'
import tonkiyPerepletUrl from '../../assets/tonkiy_pereplet.glb?url'

const LOGO_SURFACE_OFFSET = 0.01;
const LOGO_POLYGON_OFFSET = -24;

function LogoPlane({ texture, x, y, z, side = 'front', rotation = 0, scale = 0.6 }) {
    const map = useLogoTexture(texture);
    const isBack = side === 'back';
    return (
        <mesh
            position={[x, y, z]}
            rotation={[0, isBack ? Math.PI : 0, isBack ? -rotation : rotation]}
            renderOrder={40}
        >
            <planeGeometry args={[scale, scale]} />
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

function getLogoSurfaceProps(logo, bbox, frontZ, backZ) {
    const size = bboxSize(bbox);
    const x = (bbox.min.x + bbox.max.x) / 2 + THREE.MathUtils.clamp(logo.position?.[0] ?? 0, -1, 1) * size.x * 0.43;
    const y = (bbox.min.y + bbox.max.y) / 2 + THREE.MathUtils.clamp(logo.position?.[1] ?? 0, -1, 1) * size.y * 0.43;
    const side = logo.side ?? 'front';
    return {
        x,
        y,
        z: side === 'back' ? backZ - LOGO_SURFACE_OFFSET : frontZ + LOGO_SURFACE_OFFSET,
        side,
    };
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

function cloneSubsetGeometry(sourceGeo, triangles) {
    const index = sourceGeo.index;
    const attributes = ['position', 'normal', 'uv'].filter(name => sourceGeo.attributes[name]);
    const buffers = Object.fromEntries(attributes.map(name => [name, []]));

    const pushAttributeVertex = (name, vertexIndex) => {
        const attr = sourceGeo.attributes[name];
        const target = buffers[name];
        target.push(attr.getX(vertexIndex));
        if (attr.itemSize > 1) target.push(attr.getY(vertexIndex));
        if (attr.itemSize > 2) target.push(attr.getZ(vertexIndex));
        if (attr.itemSize > 3) target.push(attr.getW(vertexIndex));
    };

    for (const tri of triangles) {
        for (let corner = 0; corner < 3; corner += 1) {
            const vertexIndex = index ? index.getX(tri * 3 + corner) : tri * 3 + corner;
            attributes.forEach(name => pushAttributeVertex(name, vertexIndex));
        }
    }

    const geometry = new THREE.BufferGeometry();
    attributes.forEach(name => {
        const sourceAttr = sourceGeo.attributes[name];
        geometry.setAttribute(
            name,
            new THREE.BufferAttribute(new Float32Array(buffers[name]), sourceAttr.itemSize, sourceAttr.normalized)
        );
    });
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
}

function splitInsetBlockGeometry(geo) {
    if (!geo?.attributes?.position) {
        return { coverGeometry: geo, blockGeometry: null };
    }

    geo.computeBoundingBox();
    const pos = geo.attributes.position;
    const index = geo.index;
    const vertexCount = pos.count;
    const triCount = index ? Math.floor(index.count / 3) : Math.floor(vertexCount / 3);
    const parent = Array.from({ length: vertexCount }, (_, i) => i);

    const find = (value) => {
        if (parent[value] !== value) parent[value] = find(parent[value]);
        return parent[value];
    };
    const union = (a, b) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent[rootB] = rootA;
    };
    const vertexKey = (i) => (
        `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`
    );

    const seenVertices = new Map();
    for (let i = 0; i < vertexCount; i += 1) {
        const key = vertexKey(i);
        const existing = seenVertices.get(key);
        if (existing === undefined) seenVertices.set(key, i);
        else union(existing, i);
    }

    for (let tri = 0; tri < triCount; tri += 1) {
        const a = index ? index.getX(tri * 3) : tri * 3;
        const b = index ? index.getX(tri * 3 + 1) : tri * 3 + 1;
        const c = index ? index.getX(tri * 3 + 2) : tri * 3 + 2;
        union(a, b);
        union(a, c);
    }

    const components = new Map();
    for (let i = 0; i < vertexCount; i += 1) {
        const root = find(i);
        if (!components.has(root)) {
            components.set(root, {
                root,
                count: 0,
                bbox: new THREE.Box3(),
            });
        }
        components.get(root).count += 1;
        components.get(root).bbox.expandByPoint(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
    }

    const whole = geo.boundingBox;
    const wholeSize = bboxSize(whole);
    const insetX = wholeSize.x * 0.015;
    const insetY = wholeSize.y * 0.015;
    const paperCandidate = [...components.values()]
        .map(component => ({ ...component, size: bboxSize(component.bbox) }))
        .filter(component => (
            component.size.x > wholeSize.x * 0.65 &&
            component.size.y > wholeSize.y * 0.65 &&
            component.bbox.min.x > whole.min.x + insetX &&
            component.bbox.max.x < whole.max.x - insetX &&
            component.bbox.min.y > whole.min.y + insetY &&
            component.bbox.max.y < whole.max.y - insetY
        ))
        .sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox))[0];

    if (!paperCandidate) {
        return { coverGeometry: geo, blockGeometry: null };
    }

    const rootByVertex = Array.from({ length: vertexCount }, (_, i) => find(i));
    const coverTriangles = [];
    const blockTriangles = [];
    for (let tri = 0; tri < triCount; tri += 1) {
        const firstVertex = index ? index.getX(tri * 3) : tri * 3;
        if (rootByVertex[firstVertex] === paperCandidate.root) blockTriangles.push(tri);
        else coverTriangles.push(tri);
    }

    if (blockTriangles.length === 0 || coverTriangles.length === 0) {
        return { coverGeometry: geo, blockGeometry: null };
    }

    return {
        coverGeometry: cloneSubsetGeometry(geo, coverTriangles),
        blockGeometry: cloneSubsetGeometry(geo, blockTriangles),
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

    const { coverGeometry, blockGeometry } = useMemo(() => (
        coverEntry ? splitInsetBlockGeometry(coverEntry.geo) : { coverGeometry: null, blockGeometry: null }
    ), [coverEntry]);

    const frontZ = coverEntry?.bbox.max.z ?? sceneBbox.max.z;
    const backZ = coverEntry?.bbox.min.z ?? sceneBbox.min.z;

    useFrame((_, delta) => {
        if (coverMatRef.current) easing.dampC(coverMatRef.current.color, coverColor, 0.25, delta);
        const target = isNotebookOpen ? -Math.PI * 0.98 : 0;
        if (frontGroupRef.current) easing.dampE(frontGroupRef.current.rotation, [0, target, 0], 0.35, delta);
    });

    return (
        <group>
            {/* Обложка */}
            {coverEntry && coverGeometry && (
                <group
                    ref={frontGroupRef}
                    position={[sceneBbox.min.x, 0, 0]}
                    rotation={[0, 0, 0]}
                >
                    <group position={[-sceneBbox.min.x, 0, 0]}>
                        <mesh geometry={coverGeometry} castShadow receiveShadow>
                            <meshStandardMaterial
                                key="hard-cover-color-material"
                                ref={coverMatRef}
                                color={coverColor}
                                roughness={0.5}
                                metalness={0.05}
                            />
                        </mesh>
                        {logos.map(logo => {
                            const surface = getLogoSurfaceProps(logo, coverEntry.bbox, frontZ, backZ);
                            return (
                                <LogoPlane
                                    key={logo.id}
                                    texture={logo.texture}
                                    x={surface.x}
                                    y={surface.y}
                                    z={surface.z}
                                    side={surface.side}
                                    rotation={logo.rotation ?? 0}
                                    scale={logo.scale ?? 0.6}
                                />
                            );
                        })}
                    </group>
                </group>
            )}

            {blockGeometry && (
                <mesh geometry={blockGeometry} castShadow receiveShadow>
                    <meshStandardMaterial
                        key="hard-page-block-material"
                        color="#f7f5ef"
                        roughness={0.95}
                        metalness={0}
                    />
                </mesh>
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
    const { scene, nodes, materials } = useGLTF(naPruzhineUrl);
    const coverMatRef = useRef();

    const meshEntries = useMemo(() => {
        scene.updateMatrixWorld(true);
        return Object.entries(nodes)
            .filter(([, n]) => n.isMesh || n.geometry)
            .map(([name, node]) => {
                const geo = node.geometry.clone();
                geo.applyMatrix4(node.matrixWorld);
                geo.computeBoundingBox();
                return { name, node, geo, bbox: geo.boundingBox };
            });
    }, [nodes, scene]);

    const mat = materials ? Object.values(materials)[0] : null;

    // Вычисляем bbox для позиционирования лого
    const sceneBbox = useMemo(() => {
        const box = new THREE.Box3();
        meshEntries.forEach(e => {
            box.union(e.bbox);
        });
        return box;
    }, [meshEntries]);

    const frontZ = sceneBbox.max.z;
    const backZ = sceneBbox.min.z;

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
                </mesh>
            ))}
            {logos.map(logo => {
                const surface = getLogoSurfaceProps(logo, sceneBbox, frontZ, backZ);
                return (
                    <LogoPlane
                        key={logo.id}
                        texture={logo.texture}
                        x={surface.x}
                        y={surface.y}
                        z={surface.z}
                        side={surface.side}
                        rotation={logo.rotation ?? 0}
                        scale={logo.scale ?? 0.6}
                    />
                );
            })}
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
    const frontZ = coverEntry?.bbox.max.z ?? sceneBbox.max.z;
    const backZ = coverEntry?.bbox.min.z ?? sceneBbox.min.z;
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
                </mesh>
            )}
            {coverEntry && logos.map(logo => {
                const surface = getLogoSurfaceProps(logo, coverEntry.bbox, frontZ, backZ);
                return (
                    <LogoPlane
                        key={logo.id}
                        texture={logo.texture}
                        x={surface.x}
                        y={surface.y}
                        z={surface.z}
                        side={surface.side}
                        rotation={logo.rotation ?? 0}
                        scale={logo.scale ?? 0.6}
                    />
                );
            })}

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
