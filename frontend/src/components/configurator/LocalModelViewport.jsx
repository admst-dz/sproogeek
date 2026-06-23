import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Experience } from './Experience';
import { SceneLoadingOverlay } from '../shared/VibeLoader';
import { SceneHints } from '../shared/SceneHints';

export function LocalModelViewport({ containerRef, loadingLabel }) {
    return (
        <>
            <Canvas
                shadows
                dpr={[1, 2]}
                camera={{ position: [0, 0, 4.5], fov: 45 }}
                gl={{
                    antialias: true,
                    preserveDrawingBuffer: true,
                    alpha: true,
                    stencil: true,
                    powerPreference: 'high-performance',
                    logarithmicDepthBuffer: true,
                }}
            >
                <Suspense fallback={null}>
                    <Experience />
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay label={loadingLabel} />
            <SceneHints containerRef={containerRef} />
        </>
    );
}
