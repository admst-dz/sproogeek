import { Suspense, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Experience } from './Experience'
import { useConfigurator } from '../../store'

export function RenderModeView({ configBase64 }) {
    const { applyRenderConfig } = useConfigurator();
    const isStreamMode = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('stream_mode') === 'true';

    useEffect(() => {
        window.__APPLY_RENDER_CONFIG__ = (config) => {
            if (config && typeof config === 'object') applyRenderConfig(config);
        };
    }, [applyRenderConfig]);

    useEffect(() => {
        const initialConfig = window.__INITIAL_RENDER_CONFIG__;
        if (initialConfig && typeof initialConfig === 'object') {
            applyRenderConfig(initialConfig);
            return;
        }
        if (!configBase64) return;
        try {
            const config = JSON.parse(decodeURIComponent(escape(atob(configBase64))));
            applyRenderConfig(config);
        } catch (e) {
            console.error("Failed to parse render config", e);
        }
    }, [configBase64, applyRenderConfig]);

    return (
        <div
            data-cloud-render-ready="true"
            className="bg-[#E5E5E5] flex items-center justify-center overflow-hidden"
            style={isStreamMode
                ? { width: '100vw', height: '100vh' }
                : { width: 1024, height: 1024 }}
        >
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 0, 4.5], fov: 45 }}
                gl={{ preserveDrawingBuffer: true, antialias: true, alpha: isStreamMode, stencil: true, powerPreference: 'high-performance' }}
            >
                <Suspense fallback={null}>
                    <Experience />
                </Suspense>
            </Canvas>
        </div>
    );
}
