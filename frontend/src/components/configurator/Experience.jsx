import { PresentationControls, Stage, Environment, OrbitControls, useProgress } from '@react-three/drei'
import { Notebook } from '../shared/Notebook'
import { Calendar } from '../shared/Calendar'
import { Thermos } from '../thermos/Thermos'
import { Powerbank } from '../powerbank/Powerbank'
import { useConfigurator, registerWebGLCanvas } from '../../store'
import { useEffect, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { easing } from 'maath'

const PINCH_ZOOM_PRODUCTS = new Set(['thermos', 'powerbank'])
const clampZoom = (value) => Math.min(Math.max(value, 0.5), 2.5)

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
        if (prevProduct.current === 'thermos' && activeProduct !== 'thermos') {
            camera.position.set(0, 0, 4.5)
            camera.lookAt(0, 0, 0)
            camera.updateProjectionMatrix()
        }
        prevProduct.current = activeProduct
    }, [activeProduct, camera])

    return null
}

function WheelZoom({ controlsRef }) {
    const { camera, gl } = useThree()
    const { setZoom, activeProduct } = useConfigurator()
    const activeProductRef = useRef(activeProduct)
    const lastPinchDistRef = useRef(null)
    const pinchPointersRef = useRef(new Map())
    const isPinchingRef = useRef(false)
    const lockedCameraPoseRef = useRef(null)
    const enableControlsFrameRef = useRef(null)

    useEffect(() => { activeProductRef.current = activeProduct }, [activeProduct])

    useEffect(() => {
        const canvas = gl.domElement
        const previousTouchAction = canvas.style.touchAction
        canvas.style.touchAction = 'none'

        const isPinchProduct = () => PINCH_ZOOM_PRODUCTS.has(activeProductRef.current)

        const stopGesture = (e) => {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
        }

        const getPinchDistance = () => {
            const points = Array.from(pinchPointersRef.current.values())
            if (points.length < 2) return null
            const dx = points[0].x - points[1].x
            const dy = points[0].y - points[1].y
            return Math.sqrt(dx * dx + dy * dy)
        }

        const setControlsEnabled = (enabled) => {
            if (controlsRef?.current) controlsRef.current.enabled = enabled
        }

        const cancelDeferredControlsEnable = () => {
            if (enableControlsFrameRef.current === null) return
            window.cancelAnimationFrame(enableControlsFrameRef.current)
            enableControlsFrameRef.current = null
        }

        const deferControlsEnable = () => {
            cancelDeferredControlsEnable()
            enableControlsFrameRef.current = window.requestAnimationFrame(() => {
                enableControlsFrameRef.current = null
                restoreCameraPose()
                setControlsEnabled(true)
                lockedCameraPoseRef.current = null
            })
        }

        const lockCameraPose = () => {
            if (lockedCameraPoseRef.current) return
            lockedCameraPoseRef.current = {
                position: camera.position.clone(),
                quaternion: camera.quaternion.clone(),
                target: controlsRef?.current?.target?.clone() ?? null,
            }
        }

        const restoreCameraPose = () => {
            const pose = lockedCameraPoseRef.current
            if (!pose) return
            camera.position.copy(pose.position)
            camera.quaternion.copy(pose.quaternion)
            if (pose.target && controlsRef?.current?.target) {
                controlsRef.current.target.copy(pose.target)
                controlsRef.current.update()
            }
            camera.updateProjectionMatrix()
        }

        const finishPinch = () => {
            restoreCameraPose()
            lastPinchDistRef.current = null
            isPinchingRef.current = false
            deferControlsEnable()
        }

        const handleWheel = (e) => {
            if (!isPinchProduct()) return
            e.preventDefault()
            // ctrlKey=true — тачпад pinch (браузер маскирует под ctrl+wheel)
            const sensitivity = e.ctrlKey ? 0.008 : 0.001
            // Читаем актуальный zoom напрямую из store — без stale closure
            const current = useConfigurator.getState().zoomLevel
            const next = clampZoom(current - e.deltaY * sensitivity)
            setZoom(next)
        }

        const handlePointerDown = (e) => {
            if (!isPinchProduct() || e.pointerType !== 'touch') return
            pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (pinchPointersRef.current.size >= 2) {
                stopGesture(e)
                if (!isPinchingRef.current) {
                    cancelDeferredControlsEnable()
                    lockedCameraPoseRef.current = null
                }
                isPinchingRef.current = true
                lockCameraPose()
                restoreCameraPose()
                setControlsEnabled(false)
                lastPinchDistRef.current = getPinchDistance()
            }
        }

        const handlePointerMove = (e) => {
            if (!isPinchProduct() || e.pointerType !== 'touch') return
            if (!pinchPointersRef.current.has(e.pointerId)) return
            pinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (pinchPointersRef.current.size < 2) return

            stopGesture(e)
            isPinchingRef.current = true
            lockCameraPose()
            restoreCameraPose()
            setControlsEnabled(false)

            const dist = getPinchDistance()
            if (!dist || lastPinchDistRef.current === null) {
                lastPinchDistRef.current = dist
                return
            }
            const ratio = dist / lastPinchDistRef.current
            lastPinchDistRef.current = dist
            const current = useConfigurator.getState().zoomLevel
            const next = clampZoom(current * ratio)
            setZoom(next)
            restoreCameraPose()
        }

        const handlePointerEnd = (e) => {
            if (e.pointerType === 'touch') pinchPointersRef.current.delete(e.pointerId)
            if (isPinchingRef.current) stopGesture(e)
            if (pinchPointersRef.current.size < 2) finishPinch()
        }

        canvas.addEventListener('wheel', handleWheel, { passive: false })
        canvas.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: false })
        canvas.addEventListener('pointermove', handlePointerMove, { capture: true, passive: false })
        canvas.addEventListener('pointerup', handlePointerEnd, { capture: true, passive: false })
        canvas.addEventListener('pointercancel', handlePointerEnd, { capture: true, passive: false })

        return () => {
            canvas.style.touchAction = previousTouchAction
            cancelDeferredControlsEnable()
            restoreCameraPose()
            lastPinchDistRef.current = null
            isPinchingRef.current = false
            lockedCameraPoseRef.current = null
            setControlsEnabled(true)
            pinchPointersRef.current.clear()
            canvas.removeEventListener('wheel', handleWheel)
            canvas.removeEventListener('pointerdown', handlePointerDown, { capture: true })
            canvas.removeEventListener('pointermove', handlePointerMove, { capture: true })
            canvas.removeEventListener('pointerup', handlePointerEnd, { capture: true })
            canvas.removeEventListener('pointercancel', handlePointerEnd, { capture: true })
        }
    }, [camera, controlsRef, gl.domElement, setZoom])

    return null
}

function CameraUpdater({ targetZoom }) {
    const { camera } = useThree()

    useFrame((_, delta) => {
        // Плавная интерполяция зума (damp)
        // camera.zoom меняется от текущего к targetZoom
        easing.damp(camera, 'zoom', targetZoom, 0.25, delta)

        // Обязательно обновляем матрицу камеры, иначе зум не применится визуально
        camera.updateProjectionMatrix()
    })

    return null
}

export const Experience = () => {
    const { activeProduct, zoomLevel } = useConfigurator()
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

    // Базовый зум (начальный размер)
    // Мобилка требует зум поменьше (камера дальше), десктоп побольше.
    // Notebook побольше, Calendar поменьше.
    const baseZoom = isMobile
        ? (activeProduct === 'calendar' ? 0.6 : (activeProduct === 'thermos' || activeProduct === 'powerbank') ? 0.65 : 0.8)
        : (activeProduct === 'calendar' ? 0.8 : (activeProduct === 'thermos' || activeProduct === 'powerbank') ? 0.85 : 1.0);

    // Итоговый зум = База * То, что накликали кнопками
    const finalZoom = baseZoom * zoomLevel;

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
            <WheelZoom controlsRef={orbitControlsRef} />

            <Environment preset="city" />

            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} />
            <directionalLight position={[-10, 5, 2]} intensity={0.5} />

            {(activeProduct === 'thermos' || activeProduct === 'powerbank') ? (
                <>
                    <OrbitControls
                        ref={orbitControlsRef}
                        enablePan={false}
                        enableZoom={false}
                        enableDamping
                        dampingFactor={0.08}
                        minPolarAngle={Math.PI / 2 - Math.PI / 3}
                        maxPolarAngle={Math.PI / 2 + Math.PI / 3}
                        rotateSpeed={isMobile ? 1.5 : 1.0}
                    />
                    <Stage environment={null} intensity={0} contactShadow={false}>
                        {activeProduct === 'thermos' && <Thermos />}
                        {activeProduct === 'powerbank' && <Powerbank />}
                    </Stage>
                </>
            ) : (
                <PresentationControls
                    speed={isMobile ? 10.0 : 1.8}
                    global
                    azimuth={[-Math.PI, Math.PI]}
                    polar={[-0.1, Math.PI / 4]}
                >
                    <Stage environment={null} intensity={0} contactShadow={false}>
                        {activeProduct === 'notebook' && <Notebook />}
                        {activeProduct === 'calendar' && <Calendar />}
                    </Stage>
                </PresentationControls>
            )}
        </>
    )
}
