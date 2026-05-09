import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useConfigurator } from '../../store'
import { useGLTF } from '@react-three/drei'
import termosModelUrl from '../../assets/termos3.glb?url'
import * as THREE from 'three'
import { useLogoTexture } from '../../utils/threeTextures'

const THERMOS_NECK_RATIO = 0.1;
const CAP_SIDE_DISTANCE = 2.75;
const CAP_ARC_FORWARD_DISTANCE = 1.55;
const CAP_FINAL_FORWARD_DISTANCE = 0.35;
const LOGO_SURFACE_OFFSET = 0.006;
const LOGO_POLYGON_OFFSET = -18;

// ─── Bezier arc for cap animation ─────────────────────────────────────────────
function quadBezier(t, p0, p1, p2) {
    const mt = 1 - t;
    return [
        mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
        mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1],
        mt * mt * p0[2] + 2 * mt * t * p1[2] + t * t * p2[2],
    ];
}

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function LogoMaterial({ map, roughness = 0.42, metalness = 0.05 }) {
    return (
        <meshStandardMaterial
            map={map}
            transparent={false}
            alphaTest={0.08}
            alphaToCoverage
            depthTest
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={LOGO_POLYGON_OFFSET}
            polygonOffsetUnits={LOGO_POLYGON_OFFSET}
            side={THREE.DoubleSide}
            roughness={roughness}
            metalness={metalness}
        />
    );
}

function createCurvedLogoGeometry({ radius, centerTheta, centerY, width, height, rotation, segmentsX = 36, segmentsY = 14 }) {
    const surfaceRadius = radius + LOGO_SURFACE_OFFSET;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const positions = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let y = 0; y <= segmentsY; y++) {
        const v = y / segmentsY;
        for (let x = 0; x <= segmentsX; x++) {
            const u = x / segmentsX;
            const localX = (u - 0.5) * width;
            const localY = (v - 0.5) * height;
            const curvedX = localX * cos - localY * sin;
            const curvedY = localX * sin + localY * cos;
            const theta = centerTheta + curvedX / Math.max(radius, 0.001);
            const nx = Math.sin(theta);
            const nz = Math.cos(theta);

            positions.push(nx * surfaceRadius, centerY + curvedY, nz * surfaceRadius);
            normals.push(nx, 0, nz);
            uvs.push(u, v);
        }
    }

    for (let y = 0; y < segmentsY; y++) {
        for (let x = 0; x < segmentsX; x++) {
            const a = y * (segmentsX + 1) + x;
            const b = a + 1;
            const c = a + (segmentsX + 1);
            const d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}

// ─── Logo planes ───────────────────────────────────────────────────────────────
function LogoPlane({ logo, texture, position, rotation = 0, scale = 0.6, bodyRadius = 0.4, bodyCenterY = 0, bodyMinY = -1, bodyTopY = 999, bodyNeckStartY = 999 }) {
    const map = useLogoTexture(texture);
    const isWrap = logo?.mode === 'wrap';
    const theta = (position[0] / 0.35) * Math.PI;
    const cylinderTop = bodyCenterY + (bodyTopY - bodyCenterY) * 0.4;
    const printTopY = Math.min(bodyNeckStartY, bodyTopY);
    const printBottomY = bodyMinY + Math.max(0.03, bodyRadius * 0.04);
    const wrapHeight = Math.max(0.1, printTopY - printBottomY);
    const wrapWidth = Math.max(0.1, bodyRadius * Math.PI * 2 * 0.995);
    const posY = isWrap ? printBottomY + wrapHeight / 2 : Math.min(cylinderTop, position[1] + bodyCenterY);
    const geometry = useMemo(() => createCurvedLogoGeometry({
        radius: bodyRadius,
        centerTheta: isWrap ? (rotation ?? 0) : theta,
        centerY: posY,
        width: isWrap ? wrapWidth : scale,
        height: isWrap ? wrapHeight : scale,
        rotation: isWrap ? 0 : rotation,
        segmentsX: isWrap ? 128 : 36,
        segmentsY: isWrap ? 48 : 14,
    }), [bodyRadius, isWrap, theta, posY, scale, rotation, wrapWidth, wrapHeight]);

    return (
        <mesh geometry={geometry} renderOrder={isWrap ? 18 : 20}>
            <LogoMaterial map={map} roughness={isWrap ? 0.72 : 0.4} metalness={0.05} />
        </mesh>
    );
}

function CapLogoPlane({ texture, target = 'capTop', position, rotation = 0, scale = 0.32, capRadius = 0.4, capMinY = 0, capMaxY = 1 }) {
    const map = useLogoTexture(texture);
    const capHeight = capMaxY - capMinY;
    const capCenterY = (capMaxY + capMinY) / 2;
    const sideTheta = (position[0] / 0.35) * Math.PI;
    const sideY = capCenterY + position[1] * capHeight * 0.35;
    const sideGeometry = useMemo(() => createCurvedLogoGeometry({
        radius: capRadius,
        centerTheta: sideTheta,
        centerY: sideY,
        width: scale,
        height: scale,
        rotation,
    }), [capRadius, sideTheta, sideY, scale, rotation]);

    if (target === 'capSide') {
        return (
            <mesh geometry={sideGeometry} renderOrder={22}>
                <LogoMaterial map={map} />
            </mesh>
        );
    }

    const posX = position[0] * capRadius * 1.4;
    const posZ = position[1] * capRadius * 1.4;

    return (
        <group
            position={[posX, capMaxY + LOGO_SURFACE_OFFSET, posZ]}
            rotation={[-Math.PI / 2, 0, 0]}
        >
            <mesh rotation={[0, 0, rotation]} renderOrder={22}>
                <planeGeometry args={[scale, scale]} />
                <LogoMaterial map={map} />
            </mesh>
        </group>
    );
}

function CapInnerSeal({ capInner, capRadius }) {
    if (!capInner) return null;

    const sealRadius = capInner.sealRadius ?? Math.max(capInner.rimEndRadius * 0.88, capRadius * 0.46);
    const tubeRadius = Math.max(capRadius * 0.045, 0.012);
    const y = capInner.sealY ?? capInner.bottomLimitY;

    return (
        <mesh position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} renderOrder={28}>
            <torusGeometry args={[sealRadius, tubeRadius, 24, 128]} />
            <meshStandardMaterial
                color="#cfd5da"
                transparent
                opacity={0.68}
                roughness={0.28}
                metalness={0.02}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-10}
                polygonOffsetUnits={-10}
            />
        </mesh>
    );
}

// ─── Generic mesh component ────────────────────────────────────────────────────
function ThermosMesh({ geo, matRef, color, neckStartY = null, capInner = null, capLogos = [], capRadius = 0.4, capMinY = 0, capMaxY = 1, metalness = 0.05, roughness = 0.82, logos = [], bodyRadius = 0.4, bodyCenterY = 0, bodyMinY = -1, bodyTopY = 999, bodyNeckStartY = 999 }) {
    const materialShader = useMemo(() => {
        if (neckStartY === null && !capInner) return {};

        const neckThreshold = neckStartY?.toFixed(4);
        const capBottomLimit = capInner?.bottomLimitY.toFixed(4);
        const capRimStart = capInner?.rimStartRadius.toFixed(4);
        const capRimEnd = capInner?.rimEndRadius.toFixed(4);
        return {
            onBeforeCompile: (shader) => {
                shader.vertexShader = shader.vertexShader
                    .replace('#include <common>', '#include <common>\nvarying float vThermosLocalY;\nvarying float vThermosLocalRadius;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvThermosLocalY = position.y;\nvThermosLocalRadius = length(position.xz);');

                shader.fragmentShader = shader.fragmentShader
                    .replace('#include <common>', '#include <common>\nvarying float vThermosLocalY;\nvarying float vThermosLocalRadius;')
                    .replace(
                        '#include <color_fragment>',
                        `#include <color_fragment>
                        float thermosNeckMask = ${neckThreshold ? `step(${neckThreshold}, vThermosLocalY)` : '0.0'};
                        float thermosCapBottomMask = ${capBottomLimit ? `(1.0 - smoothstep(${capBottomLimit}, ${capBottomLimit} + 0.04, vThermosLocalY))` : '0.0'};
                        float thermosCapRimMask = ${capRimStart && capRimEnd ? `smoothstep(${capRimStart}, ${capRimStart} + 0.03, vThermosLocalRadius) * (1.0 - smoothstep(${capRimEnd} - 0.03, ${capRimEnd}, vThermosLocalRadius))` : '0.0'};
                        float thermosCapInsideMask = ${capRimEnd ? `(1.0 - smoothstep(${capRimEnd}, ${capRimEnd} + 0.03, vThermosLocalRadius))` : '0.0'};
                        float thermosCapInnerMask = thermosCapBottomMask * max(thermosCapInsideMask, thermosCapRimMask);
                        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.85, 0.82), thermosNeckMask);
                        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.055, 0.055, 0.052), thermosCapInnerMask);`
                    )
                    .replace(
                        '#include <roughnessmap_fragment>',
                        `#include <roughnessmap_fragment>
                        roughnessFactor = mix(roughnessFactor, 0.16, thermosNeckMask);
                        roughnessFactor = mix(roughnessFactor, 0.72, thermosCapInnerMask);`
                    )
                    .replace(
                        '#include <metalnessmap_fragment>',
                        `#include <metalnessmap_fragment>
                        metalnessFactor = mix(metalnessFactor, 0.88, thermosNeckMask);
                        metalnessFactor = mix(metalnessFactor, 0.08, thermosCapInnerMask);`
                    );
            },
            customProgramCacheKey: () => `thermos-material-${neckThreshold ?? 'none'}-${capBottomLimit ?? 'none'}-${capRimStart ?? 'none'}-${capRimEnd ?? 'none'}`,
        };
    }, [neckStartY, capInner]);

    return (
        <mesh geometry={geo}>
            <meshStandardMaterial
                ref={matRef}
                color={color}
                metalness={metalness}
                roughness={roughness}
                {...materialShader}
            />
            {logos.map(logo => (
                <LogoPlane key={logo.id} logo={logo} texture={logo.texture} position={logo.position}
                    rotation={logo.rotation ?? 0} scale={logo.scale ?? 0.6}
                    bodyRadius={bodyRadius} bodyCenterY={bodyCenterY} bodyMinY={bodyMinY} bodyTopY={bodyTopY} bodyNeckStartY={bodyNeckStartY} />
            ))}
            {capLogos.map(logo => (
                <CapLogoPlane key={logo.id} texture={logo.texture} target={logo.target}
                    position={logo.position} rotation={logo.rotation ?? 0} scale={logo.scale ?? 0.32}
                    capRadius={capRadius} capMinY={capMinY} capMaxY={capMaxY} />
            ))}
            <CapInnerSeal capInner={capInner} capRadius={capRadius} />
        </mesh>
    );
}

// ─── Main component ────────────────────────────────────────────────────────────
export function Thermos(props) {
    const { thermosBodyColor, thermosCapVisible, thermosLogos } = useConfigurator();
    const { nodes } = useGLTF(termosModelUrl);

    const bodyLogos = thermosLogos.filter(logo => (logo.target ?? 'body') === 'body');
    const capLogos = thermosLogos.filter(logo => ['capTop', 'capSide'].includes(logo.target));

    const { bodyGeo, capGeo, capInner, capLogoRadius, capMinY, capMaxY, bodyRadius, bodyCenterY, bodyMinY, bodyTopY, bodyNeckStartY, capFloatX, capFloatY } = useMemo(() => {
        const fallback = { bodyGeo: null, capGeo: null, capInner: null, capLogoRadius: 0.4, capMinY: 0, capMaxY: 1, bodyRadius: 0.4, bodyCenterY: 0, bodyMinY: -2.5, bodyTopY: 5, bodyNeckStartY: 4.25, capFloatX: 1.8, capFloatY: -2 };
        if (!nodes) return fallback;

        const entries = Object.entries(nodes)
            .filter(([, n]) => n.geometry)
            .map(([name, node]) => {
                const geo = node.geometry;
                geo.computeBoundingBox();
                return { name, geo, bbox: geo.boundingBox };
            });

        if (entries.length === 0) return fallback;

        if (entries.length === 1) {
            const b = entries[0].bbox;
            const r = Math.max(Math.abs(b.max.x), Math.abs(b.min.x), Math.abs(b.max.z), Math.abs(b.min.z));
            const cy = (b.max.y + b.min.y) / 2;
            const neckStart = b.max.y - (b.max.y - b.min.y) * THERMOS_NECK_RATIO;
            return {
                bodyGeo: entries[0].geo,
                capGeo: null,
                capInner: null,
                capLogoRadius: r || 0.4,
                capMinY: b.min.y,
                capMaxY: b.max.y,
                bodyRadius: r || 0.4,
                bodyCenterY: cy,
                bodyMinY: b.min.y,
                bodyTopY: b.max.y,
                bodyNeckStartY: neckStart,
                capFloatX: r * CAP_SIDE_DISTANCE,
                capFloatY: cy - b.max.y,
            };
        }

        // Name-based detection
        let capIdx = -1, bodyIdx = -1;
        for (let i = 0; i < entries.length; i++) {
            const lo = entries[i].name.toLowerCase();
            if (capIdx === -1 && (lo.includes('cap') || lo.includes('lid') || lo.includes('top') || lo.includes('cover') || lo.includes('крышк'))) {
                capIdx = i;
            } else if (bodyIdx === -1 && (lo.includes('body') || lo.includes('cylinder') || lo.includes('main') || lo.includes('thermos') || lo.includes('корп'))) {
                bodyIdx = i;
            }
        }

        // Geometric fallback: smallest-volume mesh in the top 30% Y = cap
        if (capIdx === -1) {
            const maxY = Math.max(...entries.map(e => e.bbox.max.y));
            const minY = Math.min(...entries.map(e => e.bbox.min.y));
            const threshold = minY + (maxY - minY) * 0.7;
            let minVol = Infinity;
            for (let i = 0; i < entries.length; i++) {
                const cy = (entries[i].bbox.max.y + entries[i].bbox.min.y) / 2;
                if (cy >= threshold) {
                    const bx = entries[i].bbox;
                    const vol = (bx.max.x - bx.min.x) * (bx.max.y - bx.min.y) * (bx.max.z - bx.min.z);
                    if (vol < minVol) { minVol = vol; capIdx = i; }
                }
            }
            if (capIdx === -1) {
                let maxCY = -Infinity;
                for (let i = 0; i < entries.length; i++) {
                    const cy = (entries[i].bbox.max.y + entries[i].bbox.min.y) / 2;
                    if (cy > maxCY) { maxCY = cy; capIdx = i; }
                }
            }
        }

        // Body = largest-volume mesh excluding cap
        if (bodyIdx === -1) {
            let maxVol = -Infinity;
            for (let i = 0; i < entries.length; i++) {
                if (i === capIdx) continue;
                const bx = entries[i].bbox;
                const vol = (bx.max.x - bx.min.x) * (bx.max.y - bx.min.y) * (bx.max.z - bx.min.z);
                if (vol > maxVol) { maxVol = vol; bodyIdx = i; }
            }
            if (bodyIdx === -1) bodyIdx = capIdx === 0 ? 1 : 0;
        }

        const bodyEntry = entries[bodyIdx];
        const capEntry = capIdx >= 0 ? entries[capIdx] : null;
        const bb = bodyEntry.bbox;
        const radius = Math.max(Math.abs(bb.max.x), Math.abs(bb.min.x), Math.abs(bb.max.z), Math.abs(bb.min.z)) || 0.4;
        const centerY = (bb.max.y + bb.min.y) / 2;
        const neckStartY = bb.max.y - (bb.max.y - bb.min.y) * THERMOS_NECK_RATIO;
        const capConfig = capEntry ? (() => {
            const cb = capEntry.bbox;
            const capRadius = Math.max(Math.abs(cb.max.x), Math.abs(cb.min.x), Math.abs(cb.max.z), Math.abs(cb.min.z)) || radius * 0.6;
            return {
                inner: {
                    bottomLimitY: cb.min.y + (cb.max.y - cb.min.y) * 0.34,
                    rimStartRadius: capRadius * 0.48,
                    rimEndRadius: capRadius * 0.84,
                    sealY: cb.min.y + (cb.max.y - cb.min.y) * 0.055,
                    sealRadius: capRadius * 0.60,
                },
                radius: capRadius,
                minY: cb.min.y,
                maxY: cb.max.y,
            };
        })() : null;

        return {
            bodyGeo: bodyEntry.geo,
            capGeo: capEntry ? capEntry.geo : null,
            capInner: capConfig?.inner ?? null,
            capLogoRadius: capConfig?.radius ?? radius * 0.6,
            capMinY: capConfig?.minY ?? 0,
            capMaxY: capConfig?.maxY ?? 1,
            bodyRadius: radius,
            bodyCenterY: centerY,
            bodyMinY: bb.min.y,
            bodyTopY: bb.max.y,
            bodyNeckStartY: neckStartY,
            capFloatX: radius * CAP_SIDE_DISTANCE + (capConfig?.radius ?? radius * 0.58) * 0.35,
            capFloatY: centerY - ((capConfig?.minY ?? 0) + (capConfig?.maxY ?? 1)) / 2,
        };
    }, [nodes]);

    const capMatRef = useRef();
    const capGroupRef = useRef();
    const capProgress = useRef(0); // 0 = on bottle, 1 = floating

    useFrame((_, delta) => {
        // Cap color smoothly follows body color
        if (capMatRef.current) easing.dampC(capMatRef.current.color, thermosBodyColor, 0.25, delta);

        if (capGroupRef.current) {
            const target = thermosCapVisible ? 1 : 0;
            capProgress.current += (target - capProgress.current) * (1 - Math.exp(-2.8 * delta));

            const t = easeInOut(Math.max(0, Math.min(1, capProgress.current)));

            const liftT = Math.min(t / 0.42, 1);
            const moveT = Math.max((t - 0.42) / 0.58, 0);
            const liftEase = easeInOut(liftT);
            const moveEase = easeInOut(moveT);
            const liftY = bodyRadius * 1.35;
            const lifted = [0, liftY * liftEase, 0];
            const side = [capFloatX, capFloatY, bodyRadius * CAP_FINAL_FORWARD_DISTANCE];

            let px = lifted[0];
            let py = lifted[1];
            let pz = lifted[2];

            if (moveT > 0) {
                const clearPoint = [
                    capFloatX * 0.42,
                    liftY * 1.08,
                    bodyRadius * CAP_ARC_FORWARD_DISTANCE,
                ];
                [px, py, pz] = quadBezier(moveEase, [0, liftY, 0], clearPoint, side);
            }

            capGroupRef.current.position.set(px, py, pz);
            // First unscrew vertically, then keep a small settling spin while moving aside.
            capGroupRef.current.rotation.y = (liftEase * 4.5 + moveEase * 1.5) * Math.PI;
        }
    });

    return (
        <group {...props} dispose={null}>
            <group position={[0, -bodyCenterY, 0]}>
                {bodyGeo && (
                    <>
                        <ThermosMesh
                            geo={bodyGeo}
                            color={thermosBodyColor}
                            neckStartY={bodyNeckStartY}
                            metalness={0}
                            roughness={0.9}
                            logos={bodyLogos}
                            bodyRadius={bodyRadius}
                            bodyCenterY={bodyCenterY}
                            bodyMinY={bodyMinY}
                            bodyTopY={bodyTopY}
                            bodyNeckStartY={bodyNeckStartY}
                        />
                    </>
                )}
                {capGeo && (
                    <group ref={capGroupRef}>
                        <ThermosMesh
                            geo={capGeo}
                            matRef={capMatRef}
                            color={thermosBodyColor}
                            capInner={capInner}
                            capLogos={capLogos}
                            capRadius={capLogoRadius}
                            capMinY={capMinY}
                            capMaxY={capMaxY}
                            metalness={0}
                            roughness={0.9}
                        />
                    </group>
                )}
            </group>
        </group>
    );
}

useGLTF.preload(termosModelUrl);
