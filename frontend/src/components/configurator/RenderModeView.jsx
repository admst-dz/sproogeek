import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Experience } from './Experience'
import { useConfigurator } from '../../store'

export function RenderModeView({ configBase64 }) {
    const { applyRenderConfig } = useConfigurator();

    useEffect(() => {
        if (!configBase64) return;
        try {
            const config = JSON.parse(decodeURIComponent(escape(atob(configBase64))));
            applyRenderConfig(config);
        } catch (e) {
            console.error("Failed to parse render config", e);
        }
    }, [configBase64, applyRenderConfig]);

    return (
        <div className="w-[1024px] h-[1024px] bg-[#E5E5E5] flex items-center justify-center">
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 0, 4.5], fov: 45 }}
                gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false, stencil: true, powerPreference: 'high-performance' }}
            >
                <Experience />
            </Canvas>
        </div>
    );
}
