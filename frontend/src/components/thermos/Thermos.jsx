import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { useConfigurator } from '../../store'
import { Decal, useTexture, useGLTF } from '@react-three/drei'
import termosModelUrl from '../../assets/termos3.glb?url'

function LogoDecal({ texture, position, rotation = 0, scale = 0.6, bodyRadius = 0.4 }) {
    const map = useTexture(texture);

    const theta = (position[0] / 0.35) * (Math.PI * 0.45);
    const posX = Math.sin(theta) * bodyRadius;
    const posZ = Math.cos(theta) * bodyRadius;
    const posY = position[1];

    return (
        <Decal
            position={[posX, posY, posZ]}
            rotation={[0, theta, rotation]}
            scale={[scale, scale, scale * 0.6]}
            renderOrder={2}
        >
            <meshStandardMaterial
                map={map}
                transparent
                alphaTest={0.15}
                depthWrite={false}
                polygonOffset
                polygonOffsetFactor={-4}
                polygonOffsetUnits={-4}
                roughness={0.4}
                metalness={0.1}
            />
        </Decal>
    );
}

function ThermosMesh({ geo, matRef, color, metalness = 0.7, roughness = 0.25, logos = [], bodyRadius = 0.4, visible = true }) {
    return (
        <mesh geometry={geo} visible={visible}>
            <meshStandardMaterial ref={matRef} color={color} metalness={metalness} roughness={roughness} />
            {logos.map(logo => (
                <LogoDecal
                    key={logo.id}
                    texture={logo.texture}
                    position={logo.position}
                    rotation={logo.rotation ?? 0}
                    scale={logo.scale ?? 0.6}
                    bodyRadius={bodyRadius}
                />
            ))}
        </mesh>
    );
}

export function Thermos(props) {
    const { thermosBodyColor, thermosCapColor, thermosCapVisible, thermosLogos } = useConfigurator();
    const { nodes } = useGLTF(termosModelUrl);

    const { bodyGeo, capGeo, bodyRadius } = useMemo(() => {
        if (!nodes) return { bodyGeo: null, capGeo: null, bodyRadius: 0.4 };

        const meshEntries = Object.entries(nodes)
            .filter(([, n]) => n.geometry)
            .map(([name, node]) => {
                const geo = node.geometry;
                geo.computeBoundingBox();
                return { name, geo, bbox: geo.boundingBox };
            });

        console.log('[Thermos] meshes found:', meshEntries.map(e => ({
            name: e.name,
            centerY: ((e.bbox.max.y + e.bbox.min.y) / 2).toFixed(3),
            vol: ((e.bbox.max.x - e.bbox.min.x) * (e.bbox.max.y - e.bbox.min.y) * (e.bbox.max.z - e.bbox.min.z)).toFixed(3),
        })));

        if (meshEntries.length === 0) return { bodyGeo: null, capGeo: null, bodyRadius: 0.4 };

        if (meshEntries.length === 1) {
            const b = meshEntries[0].bbox;
            const r = Math.max(Math.abs(b.max.x), Math.abs(b.min.x), Math.abs(b.max.z), Math.abs(b.min.z));
            return { bodyGeo: meshEntries[0].geo, capGeo: null, bodyRadius: r || 0.4 };
        }

        // Name-based detection
        let capIdx = -1, bodyIdx = -1;
        for (let i = 0; i < meshEntries.length; i++) {
            const lower = meshEntries[i].name.toLowerCase();
            if (capIdx === -1 && (lower.includes('cap') || lower.includes('lid') || lower.includes('top') || lower.includes('cover') || lower.includes('крышк'))) {
                capIdx = i;
            } else if (bodyIdx === -1 && (lower.includes('body') || lower.includes('cylinder') || lower.includes('main') || lower.includes('thermos') || lower.includes('корп'))) {
                bodyIdx = i;
            }
        }

        // Geometric fallback: cap = smallest volume mesh that sits in the top 30% by Y
        if (capIdx === -1) {
            const maxY = Math.max(...meshEntries.map(e => e.bbox.max.y));
            const minY = Math.min(...meshEntries.map(e => e.bbox.min.y));
            const threshold = minY + (maxY - minY) * 0.7;
            let minVol = Infinity;
            for (let i = 0; i < meshEntries.length; i++) {
                const centerY = (meshEntries[i].bbox.max.y + meshEntries[i].bbox.min.y) / 2;
                if (centerY >= threshold) {
                    const b = meshEntries[i].bbox;
                    const vol = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
                    if (vol < minVol) { minVol = vol; capIdx = i; }
                }
            }
            // If no mesh in top 30%, fall back to highest center Y
            if (capIdx === -1) {
                let maxCenterY = -Infinity;
                for (let i = 0; i < meshEntries.length; i++) {
                    const centerY = (meshEntries[i].bbox.max.y + meshEntries[i].bbox.min.y) / 2;
                    if (centerY > maxCenterY) { maxCenterY = centerY; capIdx = i; }
                }
            }
        }

        // Body = largest volume mesh excluding cap
        if (bodyIdx === -1) {
            let maxVol = -Infinity;
            for (let i = 0; i < meshEntries.length; i++) {
                if (i === capIdx) continue;
                const b = meshEntries[i].bbox;
                const vol = (b.max.x - b.min.x) * (b.max.y - b.min.y) * (b.max.z - b.min.z);
                if (vol > maxVol) { maxVol = vol; bodyIdx = i; }
            }
            if (bodyIdx === -1) bodyIdx = capIdx === 0 ? 1 : 0;
        }

        const bodyEntry = meshEntries[bodyIdx];
        const bb = bodyEntry.bbox;
        const radius = Math.max(Math.abs(bb.max.x), Math.abs(bb.min.x), Math.abs(bb.max.z), Math.abs(bb.min.z)) || 0.4;

        console.log('[Thermos] body:', meshEntries[bodyIdx]?.name, '| cap:', meshEntries[capIdx]?.name);

        return {
            bodyGeo: bodyEntry.geo,
            capGeo: capIdx >= 0 ? meshEntries[capIdx].geo : null,
            bodyRadius: radius,
        };
    }, [nodes]);

    const bodyMatRef = useRef();
    const capMatRef = useRef();

    useFrame((_, delta) => {
        if (bodyMatRef.current) easing.dampC(bodyMatRef.current.color, thermosBodyColor, 0.25, delta);
        if (capMatRef.current) easing.dampC(capMatRef.current.color, thermosCapColor, 0.25, delta);
    });

    return (
        <group {...props} dispose={null}>
            {bodyGeo && (
                <ThermosMesh
                    geo={bodyGeo}
                    matRef={bodyMatRef}
                    color={thermosBodyColor}
                    logos={thermosLogos}
                    bodyRadius={bodyRadius}
                />
            )}
            {capGeo && (
                <ThermosMesh
                    geo={capGeo}
                    matRef={capMatRef}
                    color={thermosCapColor}
                    metalness={0.5}
                    roughness={0.35}
                    visible={thermosCapVisible}
                />
            )}
        </group>
    );
}

useGLTF.preload(termosModelUrl);