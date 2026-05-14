import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { getNotebookBindingCapabilities, useConfigurator } from '../../store'
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

function getSafeLogoOffset(position = 0, axisSize = 1, logoSize = 0.6) {
    const safeHalfRange = Math.max(0, (axisSize - logoSize) / 2);
    return THREE.MathUtils.clamp(position, -1, 1) * safeHalfRange;
}

function getLogoAxisSize(logo) {
    const logoSize = logo.scale ?? 0.6;
    const rotation = logo.rotation ?? 0;
    return logoSize * (Math.abs(Math.cos(rotation)) + Math.abs(Math.sin(rotation)));
}

function getLogoSurfaceProps(logo, bbox, frontZ, backZ) {
    const size = bboxSize(bbox);
    const logoSize = getLogoAxisSize(logo);
    const x = (bbox.min.x + bbox.max.x) / 2 + getSafeLogoOffset(logo.position?.[0], size.x, logoSize);
    const y = (bbox.min.y + bbox.max.y) / 2 + getSafeLogoOffset(logo.position?.[1], size.y, logoSize);
    const side = logo.side ?? 'front';
    return {
        x,
        y,
        z: side === 'back' ? backZ - LOGO_SURFACE_OFFSET : frontZ + LOGO_SURFACE_OFFSET,
        side,
    };
}

function getHardCoverLogoSurfaceProps(logo, bbox) {
    const size = bboxSize(bbox);
    const logoSize = getLogoAxisSize(logo);
    const side = logo.side ?? 'front';
    return {
        x: (bbox.min.x + bbox.max.x) / 2 + getSafeLogoOffset(logo.position?.[0], size.x, logoSize),
        y: side === 'back' ? bbox.max.y + LOGO_SURFACE_OFFSET : bbox.min.y - LOGO_SURFACE_OFFSET,
        z: (bbox.min.z + bbox.max.z) / 2 + getSafeLogoOffset(logo.position?.[1], size.z, logoSize),
        side,
    };
}

function HardCoverLogoPlane({ texture, x, y, z, side = 'front', rotation = 0, scale = 0.6 }) {
    const map = useLogoTexture(texture);
    const isBack = side === 'back';
    return (
        <group
            position={[x, y, z]}
            rotation={[isBack ? -Math.PI / 2 : Math.PI / 2, 0, 0]}
        >
            <mesh rotation={[0, 0, isBack ? -rotation : rotation]} renderOrder={40}>
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
        </group>
    );
}

function classifyMeshEntries(meshEntries) {
    if (meshEntries.length === 0) return { coverEntry: null, blockEntry: null, cornerEntries: [] };

    let coverEntry = meshEntries[0];
    for (const entry of meshEntries) {
        const size = bboxSize(entry.bbox);
        const coverSize = bboxSize(coverEntry.bbox);
        if (size.x > coverSize.x || (size.x === coverSize.x && bboxArea(entry.bbox) > bboxArea(coverEntry.bbox))) {
            coverEntry = entry;
        }
    }

    const rest = meshEntries.filter(e => e !== coverEntry);
    const coverArea = bboxArea(coverEntry.bbox);
    const sorted = [...rest].sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox));

    // Блок страниц — вторая по площади геометрия >= 15% обложки; уголки — мелкие детали
    let blockEntry = null;
    const cornerEntries = [];
    for (const entry of sorted) {
        if (!blockEntry && bboxArea(entry.bbox) >= coverArea * 0.15) {
            blockEntry = entry;
        } else {
            cornerEntries.push(entry);
        }
    }

    return { coverEntry, blockEntry, cornerEntries };
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
function HardCoverGLBModel({ coverColor, hasCorners, logos }) {
    const { nodes, materials } = useGLTF(tverdiyPerepletUrl);
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

    const { coverEntry, blockEntry: separateBlockEntry, cornerEntries } = useMemo(() => (
        classifyMeshEntries(meshEntries)
    ), [meshEntries]);

    const mat = materials ? Object.values(materials)[0] : null;
    const normalMap = mat?.normalMap ?? null;

    const { coverGeometry, blockGeometry: splitBlockGeometry } = useMemo(() => (
        coverEntry ? splitInsetBlockGeometry(coverEntry.geo) : { coverGeometry: null, blockGeometry: null }
    ), [coverEntry]);

    const blockGeometry = separateBlockEntry?.geo ?? splitBlockGeometry;

    useFrame((_, delta) => {
        if (coverMatRef.current) easing.dampC(coverMatRef.current.color, coverColor, 0.25, delta);
    });

    return (
        <group rotation={[-Math.PI / 2, 0, 0]}>
            {coverEntry && coverGeometry && (
                <mesh geometry={coverGeometry} castShadow receiveShadow>
                    <meshStandardMaterial
                        key="hard-cover-color-material"
                        ref={coverMatRef}
                        color={coverColor}
                        roughness={0.5}
                        metalness={0.05}
                    />
                </mesh>
            )}
            {coverEntry && logos.map(logo => {
                const surface = getHardCoverLogoSurfaceProps(logo, coverEntry.bbox);
                return (
                    <HardCoverLogoPlane
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
function NaPruzhineModel({ coverColor, spiralColor, elasticColor, hasElastic, logos }) {
    const { scene, nodes, materials } = useGLTF(naPruzhineUrl);
    const coverMatRef = useRef();
    const spiralMatRef = useRef();

    const meshEntries = useMemo(() => {
        scene.updateMatrixWorld(true);
        return Object.entries(nodes)
            .filter(([, n]) => n.isMesh || n.geometry)
            .map(([name, node]) => {
                const geo = node.geometry.clone();
                geo.applyMatrix4(node.matrixWorld);
                geo.computeBoundingBox();
                return { name, node, geo, bbox: geo.boundingBox, vertCount: geo.attributes.position?.count ?? 0 };
            });
    }, [nodes, scene]);

    const mat = materials ? Object.values(materials)[0] : null;

    const sceneBbox = useMemo(() => {
        const box = new THREE.Box3();
        meshEntries.forEach(e => {
            box.union(e.bbox);
        });
        return box;
    }, [meshEntries]);

    const { spiralEntry, coverEntry, blockEntry, detailEntries } = useMemo(() => {
        if (meshEntries.length === 0) {
            return { spiralEntry: null, coverEntry: null, blockEntry: null, detailEntries: [] };
        }

        const spiral = [...meshEntries].sort((a, b) => b.vertCount - a.vertCount)[0];
        const withoutSpiral = meshEntries.filter(e => e !== spiral);
        const byArea = [...withoutSpiral].sort((a, b) => bboxArea(b.bbox) - bboxArea(a.bbox));
        const cover = byArea[0] ?? null;
        const block = byArea[1] ?? null;
        const details = withoutSpiral.filter(e => e !== cover && e !== block);

        return { spiralEntry: spiral, coverEntry: cover, blockEntry: block, detailEntries: details };
    }, [meshEntries]);

    const frontZ = coverEntry?.bbox.max.z ?? sceneBbox.max.z;
    const backZ = coverEntry?.bbox.min.z ?? sceneBbox.min.z;
    const height = sceneBbox.max.y - sceneBbox.min.y;
    const safeLogos = logos ?? [];

    useFrame((_, delta) => {
        if (coverMatRef.current) easing.dampC(coverMatRef.current.color, coverColor, 0.25, delta);
        if (spiralMatRef.current) easing.dampC(spiralMatRef.current.color, spiralColor, 0.25, delta);
    });

    return (
        <group>
            {coverEntry && (
                <mesh geometry={coverEntry.geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        key="spiral-cover-color-material"
                        ref={coverMatRef}
                        color={coverColor}
                        roughness={0.62}
                        metalness={0.02}
                    />
                </mesh>
            )}
            {coverEntry && safeLogos.map(logo => {
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

            {blockEntry && (
                <mesh geometry={blockEntry.geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        key="spiral-page-block-material"
                        color="#f7f5ef"
                        roughness={0.95}
                        metalness={0}
                    />
                </mesh>
            )}

            {spiralEntry && (
                <mesh geometry={spiralEntry.geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        key="spiral-wire-color-material"
                        ref={spiralMatRef}
                        color={spiralColor}
                        metalness={0.7}
                        roughness={0.24}
                    />
                </mesh>
            )}

            {detailEntries.map(({ name, geo }) => (
                <mesh key={name} geometry={geo} castShadow receiveShadow>
                    <meshStandardMaterial
                        key={`spiral-detail-material-${name}`}
                        map={mat?.map}
                        normalMap={mat?.normalMap}
                        roughnessMap={mat?.roughnessMap}
                        roughness={mat?.roughness ?? 0.6}
                        metalness={mat?.metalness ?? 0.1}
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

    const { coverEntry, blockEntry: separateBlockEntry, cornerEntries } = useMemo(() => (
        classifyMeshEntries(meshEntries)
    ), [meshEntries]);

    const { coverGeometry, blockGeometry: splitBlockGeometry } = useMemo(() => (
        coverEntry ? splitInsetBlockGeometry(coverEntry.geo) : { coverGeometry: null, blockGeometry: null }
    ), [coverEntry]);

    const blockGeometry = separateBlockEntry?.geo ?? splitBlockGeometry;

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
            {/* Обложка — только цветная часть */}
            {coverEntry && coverGeometry && (
                <mesh geometry={coverGeometry} castShadow receiveShadow>
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

            {/* Блок страниц — всегда белый */}
            {blockGeometry && (
                <mesh geometry={blockGeometry} castShadow receiveShadow>
                    <meshStandardMaterial
                        key="soft-page-block-material"
                        color="#f7f5ef"
                        roughness={0.95}
                        metalness={0}
                    />
                </mesh>
            )}

            {/* Уголки */}
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
        coverColor = '#D2B48C', hasElastic, elasticColor = '#1a1a1a',
        spiralColor = '#1a1a1a',
        logos = [],
        hasCorners,
    } = configProp || store;
    const resolvedBindingType = bindingType || 'hard';
    const bindingCaps = getNotebookBindingCapabilities(resolvedBindingType);
    const resolvedCoverColor = coverColor || '#D2B48C';
    const resolvedElasticColor = elasticColor || '#1a1a1a';
    const resolvedSpiralColor = spiralColor || '#1a1a1a';
    const safeLogos = Array.isArray(logos) ? logos : [];

    useGLTF.preload(tverdiyPerepletUrl);
    useGLTF.preload(naPruzhineUrl);
    useGLTF.preload(tonkiyPerepletUrl);

    return (
        <group {...props} dispose={null}>
            {resolvedBindingType === 'hard' && (
                <HardCoverGLBModel
                    coverColor={resolvedCoverColor}
                    hasCorners={bindingCaps.hasCorners && hasCorners}
                    logos={safeLogos}
                />
            )}
            {resolvedBindingType === 'spiral' && (
                <NaPruzhineModel
                    coverColor={resolvedCoverColor}
                    spiralColor={resolvedSpiralColor}
                    elasticColor={resolvedElasticColor}
                    hasElastic={bindingCaps.hasElastic && hasElastic}
                    logos={safeLogos}
                />
            )}
            {resolvedBindingType === 'soft' && (
                <SoftCoverModel
                    coverColor={resolvedCoverColor}
                    elasticColor={resolvedElasticColor}
                    hasElastic={bindingCaps.hasElastic && hasElastic}
                    hasCorners={bindingCaps.hasCorners && hasCorners}
                    logos={safeLogos}
                />
            )}
        </group>
    );
}
