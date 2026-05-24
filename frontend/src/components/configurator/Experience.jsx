import { PresentationControls, Stage, Environment, OrbitControls, useProgress } from '@react-three/drei'
import { Notebook } from '../shared/Notebook'
import { Calendar } from '../shared/Calendar'
import { Thermos } from '../thermos/Thermos'
import { Powerbank } from '../powerbank/Powerbank'
import { useConfigurator, registerWebGLCanvas } from '../../store'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const ORBIT_PRODUCTS = new Set(['thermos', 'powerbank'])
const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
const clampZoom = (value) => Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM)

// Полный 360° по вертикали — без endpoint-стопперов. По горизонтали OrbitControls
// без minAzimuth/maxAzimuth и так крутятся неограниченно.
const FULL_POLAR_MIN = 0
const FULL_POLAR_MAX = Math.PI

const ORBIT_VIEW_CONFIG = {
    thermos: {
        desktop: {
            baseDistance: 10.95,
            minDistance: 2.85,
            maxDistance: 22,
            target: [0, -0.48, 0],
            defaultDirection: [0, 0.03, 1],
            minPolarAngle: FULL_POLAR_MIN,
            maxPolarAngle: FULL_POLAR_MAX,
            rotateSpeed: 0.72,
            zoomSpeed: 0.78,
        },
        mobile: {
            baseDistance: 11.25,
            minDistance: 3.05,
            maxDistance: 25,
            target: [0, -0.34, 0],
            defaultDirection: [0, 0.03, 1],
            minPolarAngle: FULL_POLAR_MIN,
            maxPolarAngle: FULL_POLAR_MAX,
            rotateSpeed: 0.92,
            zoomSpeed: 0.82,
        },
    },
    powerbank: {
        desktop: {
            baseDistance: 5.35,
            minDistance: 2.2,
            maxDistance: 16,
            target: [0, 0, 0],
            defaultDirection: [0, 0.06, 1],
            minPolarAngle: FULL_POLAR_MIN,
            maxPolarAngle: FULL_POLAR_MAX,
            rotateSpeed: 0.76,
            zoomSpeed: 0.8,
        },
        mobile: {
            baseDistance: 6.2,
            minDistance: 2.45,
            maxDistance: 18,
            target: [0, 0, 0],
            defaultDirection: [0, 0.05, 1],
            minPolarAngle: FULL_POLAR_MIN,
            maxPolarAngle: FULL_POLAR_MAX,
            rotateSpeed: 0.95,
            zoomSpeed: 0.84,
        },
    },
}

function getOrbitViewConfig(product, isMobile) {
    const productConfig = ORBIT_VIEW_CONFIG[product] ?? ORBIT_VIEW_CONFIG.thermos
    return productConfig[isMobile ? 'mobile' : 'desktop']
}

function CanvasRegistrar() {
    const { gl } = useThree()
    useEffect(() => {
        registerWebGLCanvas(gl.domElement)
        return () => registerWebGLCanvas(null)
    }, [gl.domElement])
    return null
}

function CameraReset({ activeProduct }) {
    const { camera } = useThree()
    const prevProduct = useRef(activeProduct)

    useEffect(() => {
        if (ORBIT_PRODUCTS.has(prevProduct.current) && !ORBIT_PRODUCTS.has(activeProduct)) {
            // eslint-disable-next-line react-hooks/immutability
            camera.zoom = 1
            camera.position.set(0, 0, 4.5)
            camera.lookAt(0, 0, 0)
            camera.updateProjectionMatrix()
        }
        prevProduct.current = activeProduct
    }, [activeProduct, camera])

    return null
}

function CameraUpdater({ targetZoom }) {
    const { camera } = useThree()

    useFrame(() => {
        if (Math.abs(camera.zoom - targetZoom) < 0.001) return
        // eslint-disable-next-line react-hooks/immutability
        camera.zoom = targetZoom
        camera.updateProjectionMatrix()
    })

    return null
}

function OrbitCameraRig({ activeProduct, controlsRef, isMobile, zoomLevel }) {
    const { camera } = useThree()
    const config = useMemo(() => getOrbitViewConfig(activeProduct, isMobile), [activeProduct, isMobile])
    const target = useMemo(() => new THREE.Vector3(...config.target), [config])
    const defaultDirection = useMemo(() => new THREE.Vector3(...config.defaultDirection).normalize(), [config])
    const desiredDistance = THREE.MathUtils.clamp(
        config.baseDistance / Math.max(zoomLevel, 0.001),
        config.minDistance,
        config.maxDistance
    )

    useEffect(() => {
        if (!ORBIT_PRODUCTS.has(activeProduct)) return

        // eslint-disable-next-line react-hooks/immutability
        camera.zoom = 1
        camera.position.copy(target).addScaledVector(defaultDirection, desiredDistance)
        camera.lookAt(target)
        camera.updateProjectionMatrix()

        const controls = controlsRef.current
        if (controls) {
            controls.target.copy(target)
            controls.minDistance = config.minDistance
            controls.maxDistance = config.maxDistance
            controls.update()
            controls.saveState()
        }
    }, [activeProduct, camera, config.maxDistance, config.minDistance, controlsRef, defaultDirection, desiredDistance, target])

    useEffect(() => {
        const controls = controlsRef.current
        if (!controls) return
        controls.minDistance = config.minDistance
        controls.maxDistance = config.maxDistance
    }, [config, controlsRef])

    useFrame((_, delta) => {
        if (!ORBIT_PRODUCTS.has(activeProduct)) return
        const controls = controlsRef.current
        if (!controls) return

        const targetEase = 1 - Math.exp(-12 * delta)
        controls.target.lerp(target, targetEase)

        const offset = camera.position.clone().sub(controls.target)
        const currentDistance = offset.length()
        const direction = currentDistance > 0.001 ? offset.normalize() : defaultDirection
        const nextDistance = THREE.MathUtils.damp(currentDistance || desiredDistance, desiredDistance, 16, delta)

        camera.position.copy(controls.target).addScaledVector(direction, nextDistance)
        controls.update()
    })

    return null
}

export const Experience = () => {
    const { activeProduct, bindingType, zoomLevel, setZoom } = useConfigurator()
    const { active: assetsLoading, progress } = useProgress()
    const readyFrames = useRef(0)
    const orbitControlsRef = useRef(null)
    const isRenderMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('render_mode') === 'true'
    const requiredReadyFrames = isRenderMode ? 90 : 12

    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const isOrbitProduct = ORBIT_PRODUCTS.has(activeProduct)
    const orbitConfig = useMemo(() => getOrbitViewConfig(activeProduct, isMobile), [activeProduct, isMobile])

    const handleOrbitChange = useCallback(() => {
        const controls = orbitControlsRef.current
        if (!controls || !ORBIT_PRODUCTS.has(activeProduct)) return

        const distance = controls.getDistance()
        if (!Number.isFinite(distance) || distance <= 0) return

        const nextZoom = clampZoom(orbitConfig.baseDistance / distance)
        const currentZoom = useConfigurator.getState().zoomLevel
        if (Math.abs(nextZoom - currentZoom) > 0.012) {
            setZoom(nextZoom)
        }
    }, [activeProduct, orbitConfig, setZoom])

    // Базовый зум (начальный размер)
    // Мобилка требует зум поменьше (камера дальше), десктоп побольше.
    // Notebook побольше, Calendar поменьше.
    const notebookBaseZoom = 1.0;
    const notebookPositionY = 0.28;
    const baseZoom = isMobile
        ? (activeProduct === 'calendar' ? 0.6 : activeProduct === 'thermos' ? 0.5 : activeProduct === 'powerbank' ? 0.65 : 0.8)
        : (activeProduct === 'calendar' ? 0.8 : activeProduct === 'thermos' ? 0.68 : activeProduct === 'powerbank' ? 0.85 : notebookBaseZoom);

    // Итоговый зум = База * То, что накликали кнопками
    const finalZoom = isOrbitProduct ? 1 : baseZoom * zoomLevel;
    const presentationSpeed = activeProduct === 'notebook' && bindingType === 'spiral'
        ? (isMobile ? 11.5 : 2.15)
        : (isMobile ? 10.0 : 1.8);

    useEffect(() => {
        window.__3D_READY__ = false;
        readyFrames.current = 0;
    }, [activeProduct, zoomLevel]);

    useFrame(() => {
        if (!assetsLoading && progress >= 100) {
            readyFrames.current += 1;
            if (readyFrames.current >= requiredReadyFrames) window.__3D_READY__ = true;
        } else {
            readyFrames.current = 0;
            window.__3D_READY__ = false;
        }
    });

    return (
        <>
            <CanvasRegistrar />
            <CameraReset activeProduct={activeProduct} />
            <CameraUpdater targetZoom={finalZoom} />
            <OrbitCameraRig
                activeProduct={activeProduct}
                controlsRef={orbitControlsRef}
                isMobile={isMobile}
                zoomLevel={zoomLevel}
            />

            <Environment preset="city" />

            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} />
            <directionalLight position={[-10, 5, 2]} intensity={0.5} />

            {(activeProduct === 'thermos' || activeProduct === 'powerbank') ? (
                <>
                    <OrbitControls
                        key={activeProduct}
                        ref={orbitControlsRef}
                        target={orbitConfig.target}
                        enablePan={false}
                        enableZoom
                        enableDamping
                        dampingFactor={0.055}
                        minDistance={orbitConfig.minDistance}
                        maxDistance={orbitConfig.maxDistance}
                        minPolarAngle={orbitConfig.minPolarAngle}
                        maxPolarAngle={orbitConfig.maxPolarAngle}
                        rotateSpeed={orbitConfig.rotateSpeed}
                        zoomSpeed={orbitConfig.zoomSpeed}
                        screenSpacePanning={false}
                        mouseButtons={{
                            LEFT: THREE.MOUSE.ROTATE,
                            MIDDLE: THREE.MOUSE.DOLLY,
                            RIGHT: THREE.MOUSE.ROTATE,
                        }}
                        touches={{
                            ONE: THREE.TOUCH.ROTATE,
                            TWO: THREE.TOUCH.DOLLY_ROTATE,
                        }}
                        onChange={handleOrbitChange}
                    />
                    <group>
                        {activeProduct === 'thermos' && <Thermos />}
                        {activeProduct === 'powerbank' && <Powerbank />}
                    </group>
                </>
            ) : (
                <PresentationControls
                    speed={presentationSpeed}
                    global
                    snap={false}
                    azimuth={[-Infinity, Infinity]}
                    polar={[-Math.PI / 2, Math.PI / 2]}
                >
                    <Stage environment={null} intensity={0} shadows={false} adjustCamera={false}>
                        {activeProduct === 'notebook' && <Notebook position={[0, notebookPositionY, 0]} />}
                        {activeProduct === 'calendar' && <Calendar />}
                    </Stage>
                </PresentationControls>
            )}
        </>
    )
}
