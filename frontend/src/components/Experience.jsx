import { PresentationControls, Stage, Environment, OrbitControls } from '@react-three/drei'
import { Notebook } from './Notebook'
import { Calendar } from './Calendar'
import { Thermos } from './thermos/Thermos'
import { useConfigurator, registerWebGLCanvas } from '../store'
import { useEffect, useRef, useState } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { easing } from 'maath'
import { Sketchbook } from './Sketchbook'

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

function WheelZoom() {
    const { gl } = useThree()
    const { setZoom } = useConfigurator()
    const zoomRef = useRef(1)

    // Держим актуальный zoom в ref чтобы избежать stale closure
    const { zoomLevel } = useConfigurator()
    useEffect(() => { zoomRef.current = zoomLevel }, [zoomLevel])

    useEffect(() => {
        const canvas = gl.domElement
        const handleWheel = (e) => {
            e.preventDefault()
            // ctrlKey=true — тачпад pinch (браузер маскирует под ctrl+wheel)
            const sensitivity = e.ctrlKey ? 0.008 : 0.001
            const next = Math.min(Math.max(zoomRef.current - e.deltaY * sensitivity, 0.5), 2.5)
            setZoom(next)
        }
        canvas.addEventListener('wheel', handleWheel, { passive: false })
        return () => canvas.removeEventListener('wheel', handleWheel)
    }, [gl.domElement, setZoom])

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
        ? (activeProduct === 'calendar' ? 0.6 : activeProduct === 'thermos' ? 0.65 : 0.8)
        : (activeProduct === 'calendar' ? 0.8 : activeProduct === 'thermos' ? 0.85 : 1.0);

    // Итоговый зум = База * То, что накликали кнопками
    const finalZoom = baseZoom * zoomLevel;

    useFrame(() => {
        if (!window.__3D_READY__) {
            // Даем 10 кадров на то, чтобы easing.damp применил цвета
            setTimeout(() => {
                window.__3D_READY__ = true;
            }, 300);
        }
    });

    return (
        <>
            <CanvasRegistrar />
            <CameraReset activeProduct={activeProduct} />
            <CameraUpdater targetZoom={finalZoom} />
            <WheelZoom />

            <Environment preset="city" />

            <ambientLight intensity={0.6} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} />
            <directionalLight position={[-10, 5, 2]} intensity={0.5} />

            {activeProduct === 'thermos' ? (
                <>
                    <OrbitControls
                        enablePan={false}
                        enableZoom={false}
                        minPolarAngle={Math.PI / 2 - Math.PI / 3}
                        maxPolarAngle={Math.PI / 2 + Math.PI / 3}
                        rotateSpeed={isMobile ? 3.0 : 1.0}
                    />
                    <Stage environment={null} intensity={0} contactShadow={false}>
                        <Thermos />
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
                        {activeProduct === 'sketchbook' && <Sketchbook />}
                    </Stage>
                </PresentationControls>
            )}
        </>
    )
}