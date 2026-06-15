import { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import tshirtModelUrl from '../../assets/tshirt_test.glb?url';
import { useLogoTexture } from '../../utils/threeTextures';

const MODEL_SCALE = 1.18;
const LOGO_SURFACE_OFFSET = 0.012;
const LOGO_RAY_PADDING = 0.35;
const LOGO_POLYGON_OFFSET = -24;
const TSHIRT_LOGO_MIN_SCALE = 0.08;
const TSHIRT_LOGO_MAX_SCALE = 1;
const TSHIRT_PRINT_AREA_CENTER_Y_RATIO = 0.48;
const TSHIRT_PRINT_AREA_WIDTH_RATIO = 0.68;
const TSHIRT_PRINT_AREA_HEIGHT_RATIO = 0.52;
const TSHIRT_SLEEVE_AREA_CENTER_Y_RATIO = 0.64;
const TSHIRT_SLEEVE_AREA_WIDTH_RATIO = 0.56;
const TSHIRT_SLEEVE_AREA_HEIGHT_RATIO = 0.24;
const LOGO_GRID_BASE_SEGMENTS = 26;
const LOGO_GRID_MIN_X = 14;
const LOGO_GRID_MAX_X = 52;
const LOGO_GRID_MIN_Y = 6;
const LOGO_GRID_MAX_Y = 24;
const LOGO_SIDE_NORMAL_WEIGHT = 0.08;
const LOGO_PROJECTION_IDLE_DELAY_MS = 90;
const LOGO_PROJECTION_THROTTLE_MS = 140;
const LOGO_PROJECTION_MAX_OFFSET_RATIO = 0.28;
const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const TSHIRT_PRINT_SIDES = ['front', 'back', 'leftSleeve', 'rightSleeve'];

const normalizeTshirtPrintSide = (side) => (
    TSHIRT_PRINT_SIDES.includes(side) ? side : 'front'
);

function containedLogoSize(map, areaWidth, areaHeight, scale = 0.6) {
    const imageWidth = map?.image?.width ?? map?.image?.naturalWidth ?? 1;
    const imageHeight = map?.image?.height ?? map?.image?.naturalHeight ?? 1;
    const aspect = imageWidth && imageHeight ? imageWidth / imageHeight : 1;
    const areaAspect = areaWidth / areaHeight;
    const normalizedScale = THREE.MathUtils.clamp(scale, TSHIRT_LOGO_MIN_SCALE, TSHIRT_LOGO_MAX_SCALE);

    if (aspect >= areaAspect) {
        const width = areaWidth * normalizedScale;
        return { width, height: width / aspect };
    }

    const height = areaHeight * normalizedScale;
    return { width: height * aspect, height };
}

function getProjectedLogoSegments(width, height) {
    const aspect = Math.max(width / Math.max(height, 0.001), 0.001);
    const aspectCurveBias = Math.sqrt(aspect);
    const segmentsX = THREE.MathUtils.clamp(
        Math.round(LOGO_GRID_BASE_SEGMENTS * aspectCurveBias),
        LOGO_GRID_MIN_X,
        LOGO_GRID_MAX_X
    );
    const segmentsY = aspect >= 1
        ? THREE.MathUtils.clamp(
            Math.round(segmentsX / aspect),
            LOGO_GRID_MIN_Y,
            LOGO_GRID_MAX_Y
        )
        : THREE.MathUtils.clamp(
            Math.round(LOGO_GRID_BASE_SEGMENTS / aspectCurveBias),
            LOGO_GRID_MIN_Y,
            LOGO_GRID_MAX_Y
        );
    return { segmentsX, segmentsY };
}

function createProjectedLogoGeometry({
    surfaceObjects,
    bbox,
    projection,
    width,
    height,
    rotation = 0,
}) {
    if (!surfaceObjects?.length || !bbox || !projection || !width || !height) return null;

    const { segmentsX, segmentsY } = getProjectedLogoSegments(width, height);
    const {
        rayAxis,
        rayStart,
        rayDirection,
        fallbackOrigin,
        fallbackNormal: fallbackNormalArray,
        targetSurface,
        outwardSign,
        planeHorizontalAxis,
        planeVerticalAxis,
        centerHorizontal,
        centerVertical,
    } = projection;
    const direction = new THREE.Vector3();
    direction[rayAxis] = rayDirection;
    const rayDepth = Math.max(0.001, bbox.max[rayAxis] - bbox.min[rayAxis]) + LOGO_RAY_PADDING * 2;
    const raycaster = new THREE.Raycaster();
    raycaster.near = 0;
    raycaster.far = rayDepth;

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const stride = segmentsX + 1;
    const vertexCount = stride * (segmentsY + 1);
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const valid = new Uint8Array(vertexCount);
    const rayOrigin = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const bestNormal = new THREE.Vector3();
    const fallbackNormal = new THREE.Vector3(...fallbackNormalArray);

    for (let row = 0; row <= segmentsY; row += 1) {
        const v = row / segmentsY;
        for (let col = 0; col <= segmentsX; col += 1) {
            const vertexIndex = row * stride + col;
            const positionIndex = vertexIndex * 3;
            const uvIndex = vertexIndex * 2;
            const u = col / segmentsX;
            const localX = (u - 0.5) * width;
            const localY = (v - 0.5) * height;
            const sampleHorizontal = centerHorizontal + localX * cos - localY * sin;
            const sampleVertical = centerVertical + localX * sin + localY * cos;

            rayOrigin.set(0, 0, 0);
            rayOrigin[planeHorizontalAxis] = sampleHorizontal;
            rayOrigin[planeVerticalAxis] = sampleVertical;
            rayOrigin[rayAxis] = rayStart;
            raycaster.set(rayOrigin, direction);
            const hits = raycaster.intersectObjects(surfaceObjects, false);
            let hit = null;
            let bestScore = -Infinity;

            for (const candidate of hits) {
                normal.copy(candidate.face?.normal ?? fallbackNormal);
                normal.normalize();
                if (normal.dot(direction) > 0) normal.negate();

                const depthScore = -Math.abs(candidate.point[rayAxis] - targetSurface);
                const normalScore = normal[rayAxis] * outwardSign * LOGO_SIDE_NORMAL_WEIGHT;
                const score = depthScore + normalScore;

                if (score > bestScore) {
                    hit = candidate;
                    bestScore = score;
                    bestNormal.copy(normal);
                }
            }

            if (hit) {
                normal.copy(bestNormal);
                positions[positionIndex] = hit.point.x + normal.x * LOGO_SURFACE_OFFSET;
                positions[positionIndex + 1] = hit.point.y + normal.y * LOGO_SURFACE_OFFSET;
                positions[positionIndex + 2] = hit.point.z + normal.z * LOGO_SURFACE_OFFSET;
                valid[vertexIndex] = 1;
            } else {
                normal.copy(fallbackNormal);
                positions[positionIndex] = 0;
                positions[positionIndex + 1] = 0;
                positions[positionIndex + 2] = 0;
                positions[positionIndex + AXIS_INDEX[planeHorizontalAxis]] = sampleHorizontal;
                positions[positionIndex + AXIS_INDEX[planeVerticalAxis]] = sampleVertical;
                positions[positionIndex + AXIS_INDEX[rayAxis]] = fallbackOrigin;
            }
            normals[positionIndex] = normal.x;
            normals[positionIndex + 1] = normal.y;
            normals[positionIndex + 2] = normal.z;
            uvs[uvIndex] = u;
            uvs[uvIndex + 1] = v;
        }
    }

    const indices = [];
    for (let row = 0; row < segmentsY; row += 1) {
        for (let col = 0; col < segmentsX; col += 1) {
            const a = row * (segmentsX + 1) + col;
            const b = a + 1;
            const c = a + (segmentsX + 1);
            const d = c + 1;
            if (!valid[a] || !valid[b] || !valid[c] || !valid[d]) continue;
            indices.push(a, c, b, b, c, d);
        }
    }

    if (indices.length === 0) return null;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
}

function getTshirtPrintArea(side, bbox, size) {
    const normalizedSide = normalizeTshirtPrintSide(side);
    const bodyCenterY = bbox.min.y + size.y * TSHIRT_PRINT_AREA_CENTER_Y_RATIO;

    if (normalizedSide === 'leftSleeve' || normalizedSide === 'rightSleeve') {
        const isLeftSleeve = normalizedSide === 'leftSleeve';
        const outwardSign = isLeftSleeve ? 1 : -1;

        return {
            areaWidth: size.z * TSHIRT_SLEEVE_AREA_WIDTH_RATIO,
            areaHeight: size.y * TSHIRT_SLEEVE_AREA_HEIGHT_RATIO,
            scaleBase: 1,
            projection: {
                rayAxis: 'x',
                rayStart: isLeftSleeve ? bbox.max.x + LOGO_RAY_PADDING : bbox.min.x - LOGO_RAY_PADDING,
                rayDirection: isLeftSleeve ? -1 : 1,
                fallbackOrigin: isLeftSleeve ? bbox.max.x + LOGO_SURFACE_OFFSET : bbox.min.x - LOGO_SURFACE_OFFSET,
                fallbackNormal: [outwardSign, 0, 0],
                targetSurface: isLeftSleeve ? bbox.max.x : bbox.min.x,
                outwardSign,
                planeHorizontalAxis: 'z',
                planeVerticalAxis: 'y',
                centerHorizontal: bbox.min.z + size.z * 0.5,
                centerVertical: bbox.min.y + size.y * TSHIRT_SLEEVE_AREA_CENTER_Y_RATIO,
            },
        };
    }

    const isBack = normalizedSide === 'back';
    const outwardSign = isBack ? -1 : 1;

    return {
        areaWidth: size.x * TSHIRT_PRINT_AREA_WIDTH_RATIO,
        areaHeight: size.y * TSHIRT_PRINT_AREA_HEIGHT_RATIO,
        scaleBase: 1,
        projection: {
            rayAxis: 'z',
            rayStart: isBack ? bbox.min.z - LOGO_RAY_PADDING : bbox.max.z + LOGO_RAY_PADDING,
            rayDirection: isBack ? 1 : -1,
            fallbackOrigin: isBack ? bbox.min.z - LOGO_SURFACE_OFFSET : bbox.max.z + LOGO_SURFACE_OFFSET,
            fallbackNormal: [0, 0, outwardSign],
            targetSurface: isBack ? bbox.min.z : bbox.max.z,
            outwardSign,
            planeHorizontalAxis: 'x',
            planeVerticalAxis: 'y',
            centerHorizontal: 0,
            centerVertical: bodyCenterY,
        },
    };
}

const nowMs = () => (
    typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now()
);

function TshirtLogoSurface({
    image,
    bbox,
    surfaceObjects,
    printArea,
}) {
    const { areaWidth, areaHeight, projection, scaleBase = 1 } = printArea;
    const {
        rayAxis,
        rayStart,
        rayDirection,
        fallbackOrigin,
        fallbackNormal = [0, 0, 1],
        targetSurface,
        outwardSign,
        planeHorizontalAxis,
        planeVerticalAxis,
        centerHorizontal,
        centerVertical,
    } = projection;
    const [fallbackNormalX = 0, fallbackNormalY = 0, fallbackNormalZ = 1] = fallbackNormal;
    const map = useLogoTexture(image.texture);
    const size = containedLogoSize(map, areaWidth * scaleBase, areaHeight, image.scale ?? 0.6);

    const [px = 0, py = 0] = image.position || [];
    const maxX = Math.max(0, areaWidth / 2 - size.width / 2);
    const maxY = Math.max(0, areaHeight / 2 - size.height / 2);
    const x = THREE.MathUtils.clamp(px * maxX, -maxX, maxX);
    const y = THREE.MathUtils.clamp(py * maxY, -maxY, maxY);
    const rotation = image.rotation ?? 0;
    const targetCenterHorizontal = centerHorizontal + x;
    const targetCenterVertical = centerVertical + y;
    const [projectionCenter, setProjectionCenter] = useState(() => ({
        horizontal: targetCenterHorizontal,
        vertical: targetCenterVertical,
    }));
    const projectionCenterRef = useRef(projectionCenter);
    const lastProjectedAtRef = useRef(nowMs());

    useEffect(() => {
        projectionCenterRef.current = projectionCenter;
    }, [projectionCenter]);

    useEffect(() => {
        const current = projectionCenterRef.current;
        const offsetDistance = Math.hypot(
            targetCenterHorizontal - current.horizontal,
            targetCenterVertical - current.vertical
        );
        if (offsetDistance < 0.0005) return undefined;

        let frameId = null;
        let timeoutId = null;
        const commitProjection = () => {
            lastProjectedAtRef.current = nowMs();
            setProjectionCenter((previous) => {
                if (
                    Math.abs(previous.horizontal - targetCenterHorizontal) < 0.0005
                    && Math.abs(previous.vertical - targetCenterVertical) < 0.0005
                ) {
                    return previous;
                }
                return {
                    horizontal: targetCenterHorizontal,
                    vertical: targetCenterVertical,
                };
            });
        };

        const maxLiveOffset = Math.max(size.width, size.height) * LOGO_PROJECTION_MAX_OFFSET_RATIO;
        const shouldRefreshWhileDragging = (
            offsetDistance > maxLiveOffset
            && nowMs() - lastProjectedAtRef.current > LOGO_PROJECTION_THROTTLE_MS
        );

        if (shouldRefreshWhileDragging) {
            frameId = requestAnimationFrame(commitProjection);
        } else {
            timeoutId = setTimeout(commitProjection, LOGO_PROJECTION_IDLE_DELAY_MS);
        }

        return () => {
            if (frameId !== null) cancelAnimationFrame(frameId);
            if (timeoutId !== null) clearTimeout(timeoutId);
        };
    }, [size.height, size.width, targetCenterHorizontal, targetCenterVertical]);

    const geometry = useMemo(() => createProjectedLogoGeometry({
        surfaceObjects,
        bbox,
        projection: {
            rayAxis,
            rayStart,
            rayDirection,
            fallbackOrigin,
            fallbackNormal: [fallbackNormalX, fallbackNormalY, fallbackNormalZ],
            targetSurface,
            outwardSign,
            planeHorizontalAxis,
            planeVerticalAxis,
            centerHorizontal: projectionCenter.horizontal,
            centerVertical: projectionCenter.vertical,
        },
        width: size.width,
        height: size.height,
        rotation,
    }), [
        bbox,
        fallbackNormalX,
        fallbackNormalY,
        fallbackNormalZ,
        fallbackOrigin,
        outwardSign,
        planeHorizontalAxis,
        planeVerticalAxis,
        projectionCenter.horizontal,
        projectionCenter.vertical,
        rayAxis,
        rayDirection,
        rayStart,
        rotation,
        size.height,
        size.width,
        surfaceObjects,
        targetSurface,
    ]);

    useEffect(() => () => geometry?.dispose(), [geometry]);

    if (!geometry) return null;

    const liveOffset = [0, 0, 0];
    liveOffset[AXIS_INDEX[planeHorizontalAxis]] = targetCenterHorizontal - projectionCenter.horizontal;
    liveOffset[AXIS_INDEX[planeVerticalAxis]] = targetCenterVertical - projectionCenter.vertical;

    return (
        <mesh
            geometry={geometry}
            position={liveOffset}
            renderOrder={40}
        >
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
                side={THREE.DoubleSide}
                roughness={0.55}
                metalness={0.02}
            />
        </mesh>
    );
}

export function Tshirt({ config = null, preview = false, position = [0, 0, 0] }) {
    const state = useConfigurator();
    const color = config?.tshirtColor ?? state.tshirtColor;
    const rawPrintSide = config?.tshirtPrintSide ?? state.tshirtPrintSide;
    const printSide = normalizeTshirtPrintSide(rawPrintSide);
    const logos = config?.tshirtLogos ?? state.tshirtLogos;
    const { scene: sourceScene } = useGLTF(tshirtModelUrl);

    const { geometries, bbox, size, center, surfaceObjects } = useMemo(() => {
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
        const raycastMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
        const raycastObjects = entries.map(({ geometry }) => new THREE.Mesh(geometry, raycastMaterial));
        return { geometries: entries, bbox: box, size: modelSize, center: modelCenter, surfaceObjects: raycastObjects };
    }, [sourceScene]);

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
                {logos.map((image) => {
                    const logoSide = normalizeTshirtPrintSide(image.side ?? printSide);
                    const printArea = getTshirtPrintArea(logoSide, bbox, size);
                    return (
                        <TshirtLogoSurface
                            key={`${image.id}-${logoSide}`}
                            image={image}
                            bbox={bbox}
                            surfaceObjects={surfaceObjects}
                            printArea={printArea}
                        />
                    );
                })}
            </group>
        </group>
    );
}
