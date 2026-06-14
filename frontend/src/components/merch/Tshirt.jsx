import { useEffect, useMemo } from 'react';
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
const LOGO_GRID_BASE_SEGMENTS = 34;
const LOGO_GRID_MIN_X = 18;
const LOGO_GRID_MAX_X = 72;
const LOGO_GRID_MIN_Y = 8;
const LOGO_GRID_MAX_Y = 32;

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
    centerX,
    centerY,
    width,
    height,
    rotation = 0,
    isBack = false,
}) {
    if (!surfaceObjects?.length || !bbox || !width || !height) return null;

    const { segmentsX, segmentsY } = getProjectedLogoSegments(width, height);
    const direction = new THREE.Vector3(0, 0, isBack ? 1 : -1);
    const rayZ = isBack ? bbox.min.z - LOGO_RAY_PADDING : bbox.max.z + LOGO_RAY_PADDING;
    const fallbackZ = isBack ? bbox.min.z - LOGO_SURFACE_OFFSET : bbox.max.z + LOGO_SURFACE_OFFSET;
    const rayDepth = Math.max(0.001, bbox.max.z - bbox.min.z) + LOGO_RAY_PADDING * 2;
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
    const fallbackNormal = new THREE.Vector3(0, 0, isBack ? -1 : 1);

    for (let row = 0; row <= segmentsY; row += 1) {
        const v = row / segmentsY;
        for (let col = 0; col <= segmentsX; col += 1) {
            const vertexIndex = row * stride + col;
            const positionIndex = vertexIndex * 3;
            const uvIndex = vertexIndex * 2;
            const u = col / segmentsX;
            const localX = (u - 0.5) * width;
            const localY = (v - 0.5) * height;
            const sampleX = centerX + localX * cos - localY * sin;
            const sampleY = centerY + localX * sin + localY * cos;

            rayOrigin.set(sampleX, sampleY, rayZ);
            raycaster.set(rayOrigin, direction);
            const hit = raycaster.intersectObjects(surfaceObjects, false)[0];

            if (hit) {
                normal.copy(hit.face?.normal ?? fallbackNormal);
                normal.normalize();
                if (normal.dot(direction) > 0) normal.negate();
                positions[positionIndex] = hit.point.x + normal.x * LOGO_SURFACE_OFFSET;
                positions[positionIndex + 1] = hit.point.y + normal.y * LOGO_SURFACE_OFFSET;
                positions[positionIndex + 2] = hit.point.z + normal.z * LOGO_SURFACE_OFFSET;
                valid[vertexIndex] = 1;
            } else {
                normal.copy(fallbackNormal);
                positions[positionIndex] = sampleX;
                positions[positionIndex + 1] = sampleY;
                positions[positionIndex + 2] = fallbackZ;
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

function TshirtLogoSurface({
    image,
    bbox,
    surfaceObjects,
    areaWidth,
    areaHeight,
    centerX = 0,
    centerY = 0,
    isBack = false,
    scaleBase = 0.9,
}) {
    const map = useLogoTexture(image.texture);
    const size = containedLogoSize(map, areaWidth * scaleBase, areaHeight, image.scale ?? 0.6);

    const [px = 0, py = 0] = image.position || [];
    const maxX = Math.max(0, areaWidth / 2 - size.width / 2);
    const maxY = Math.max(0, areaHeight / 2 - size.height / 2);
    const x = THREE.MathUtils.clamp(px * maxX, -maxX, maxX);
    const y = THREE.MathUtils.clamp(py * maxY, -maxY, maxY);
    const rotation = image.rotation ?? 0;
    const geometry = useMemo(() => createProjectedLogoGeometry({
        surfaceObjects,
        bbox,
        centerX: centerX + x,
        centerY: centerY + y,
        width: size.width,
        height: size.height,
        rotation,
        isBack,
    }), [bbox, centerX, centerY, isBack, rotation, size.height, size.width, surfaceObjects, x, y]);

    useEffect(() => () => geometry?.dispose(), [geometry]);

    if (!geometry) return null;

    return (
        <mesh
            geometry={geometry}
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
    const printSide = rawPrintSide === 'back' ? 'back' : 'front';
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
        const raycastObjects = entries.map(({ geometry }) => new THREE.Mesh(geometry));
        return { geometries: entries, bbox: box, size: modelSize, center: modelCenter, surfaceObjects: raycastObjects };
    }, [sourceScene]);

    const isBack = printSide === 'back';
    const logoX = 0;
    const logoY = bbox.min.y + size.y * TSHIRT_PRINT_AREA_CENTER_Y_RATIO;
    const printAreaWidth = size.x * TSHIRT_PRINT_AREA_WIDTH_RATIO;
    const printAreaHeight = size.y * TSHIRT_PRINT_AREA_HEIGHT_RATIO;

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
                    <TshirtLogoSurface
                        key={image.id}
                        image={image}
                        bbox={bbox}
                        surfaceObjects={surfaceObjects}
                        areaWidth={printAreaWidth}
                        areaHeight={printAreaHeight}
                        centerX={logoX}
                        centerY={logoY}
                        isBack={isBack}
                        scaleBase={1}
                    />
                ))}
            </group>
        </group>
    );
}
