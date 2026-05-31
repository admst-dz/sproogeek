import { useEffect, Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Stage } from '@react-three/drei';
import * as THREE from 'three';
import { THEME_SWITCHING_ENABLED, getNotebookBindingCapabilities, useConfigurator } from '../../store';
import { t } from '../../i18n';
import { getUserDisplayName } from '../../utils/user';
import { SceneLoadingOverlay } from '../shared/VibeLoader';
import termosModelUrl from '../../assets/termos3.glb?url';
import powerbankModelUrl from '../../assets/poverbank.glb?url';
import { FeedbackPanel } from './FeedbackPanel';
import { Notebook } from '../shared/Notebook';
import { Sticker } from '../sticker/Sticker';
import { Shopper } from '../merch/Shopper';
import { Tshirt } from '../merch/Tshirt';
import { Hoodie } from '../merch/Hoodie';
import { Lanyard } from '../merch/Lanyard';
import { SiteFooter } from '../shared/SiteFooter';

const NOTEBOOK_PREVIEW_CONFIG = {
    bindingType: 'spiral',
    coverColor: '#1565C0',
    innerCoverColor: '#1565C0',
    stitchColor: '#ffffff',
    hasCorners: false,
    hasElastic: true,
    elasticColor: '#1a1a1a',
    spiralColor: '#C0C0C0',
    logos: [],
};

const POWERBANK_PREVIEW_POSE = {
    position: [0, 0, 0],
    rotation: [0.14, -0.56, -0.03],
    scale: 0.85,
    cameraPosition: [0, 0.45, 5],
    cameraFov: 36,
};

const NOTEBOOK_PREVIEW_POSE = {
    position: [0, -0.9, 0],
    rotation: [0.18, 3.94, -0.03],
    scale: 0.99,
    cameraPosition: [0, 0.25, 5.2],
    cameraFov: 36,
    sway: 0.1,
};

function ThermosPreviewScene() {
    const groupRef = useRef();
    const { nodes } = useGLTF(termosModelUrl);
    const meshes = Object.entries(nodes).filter(([, n]) => n.geometry);
    const capMeshName = useMemo(() => {
        const namedCap = meshes.find(([name]) => {
            const lower = name.toLowerCase();
            return lower.includes('cap') || lower.includes('lid') || lower.includes('top') || lower.includes('cover') || lower.includes('крышк');
        });
        if (namedCap) return namedCap[0];

        const measured = meshes.map(([name, node]) => {
            node.geometry.computeBoundingBox();
            const box = node.geometry.boundingBox;
            return { name, centerY: (box.max.y + box.min.y) / 2 };
        });
        return measured.sort((a, b) => b.centerY - a.centerY)[0]?.name;
    }, [meshes]);

    useFrame((_, delta) => {
        if (groupRef.current) groupRef.current.rotation.y += delta * 0.6;
    });

    return (
        <group ref={groupRef}>
            {meshes.map(([name, node]) => (
                <mesh key={name} geometry={node.geometry} position={name === capMeshName ? [0, 0.07, 0] : undefined} castShadow receiveShadow>
                    <meshStandardMaterial color="#E65405" metalness={0.35} roughness={0.45} />
                </mesh>
            ))}
        </group>
    );
}

function ThermosPreview() {
    return (
        <div className="relative w-full h-full">
            <Canvas camera={{ position: [0, 0.5, 4], fov: 40 }} gl={{ antialias: true }} style={{ pointerEvents: 'none' }}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 8, 5]} intensity={1.5} />
                <directionalLight position={[-4, 3, 2]} intensity={0.6} />
                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.3} shadows={false} adjustCamera>
                        <ThermosPreviewScene />
                    </Stage>
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
}

function PowerbankPreviewScene() {
    const { nodes } = useGLTF(powerbankModelUrl);
    const meshes = useMemo(() => (
        Object.entries(nodes)
            .filter(([, n]) => n.geometry || n.isMesh)
            .map(([name, node]) => {
                const geo = node.geometry;
                geo.computeBoundingBox();
                return { name, geo, bbox: geo.boundingBox };
            })
    ), [nodes]);

    const bbox = useMemo(() => {
        const box = new THREE.Box3();
        meshes.forEach(mesh => box.union(mesh.bbox));
        return box;
    }, [meshes]);

    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;
    const frontZ = bbox.max.z;
    const centerX = (bbox.min.x + bbox.max.x) / 2;
    const ringOuterRadius = Math.min(width * 0.34, height * 0.235);
    const ringThickness = Math.max(width * 0.018, 0.018);
    const capsuleWidth = width * 0.06;
    const capsuleHeight = height * 0.18;
    const centerY = (bbox.min.y + bbox.max.y) / 2;
    const centerZ = (bbox.min.z + bbox.max.z) / 2;

    const ringGeometry = useMemo(() => (
        new THREE.RingGeometry(ringOuterRadius - ringThickness, ringOuterRadius, 96)
    ), [ringOuterRadius, ringThickness]);

    const capsuleGeometry = useMemo(() => {
        const x = -capsuleWidth / 2;
        const y = -capsuleHeight / 2;
        const r = capsuleWidth / 2;
        const shape = new THREE.Shape();

        shape.moveTo(x + r, y);
        shape.lineTo(x + capsuleWidth - r, y);
        shape.quadraticCurveTo(x + capsuleWidth, y, x + capsuleWidth, y + r);
        shape.lineTo(x + capsuleWidth, y + capsuleHeight - r);
        shape.quadraticCurveTo(x + capsuleWidth, y + capsuleHeight, x + capsuleWidth - r, y + capsuleHeight);
        shape.lineTo(x + r, y + capsuleHeight);
        shape.quadraticCurveTo(x, y + capsuleHeight, x, y + capsuleHeight - r);
        shape.lineTo(x, y + r);
        shape.quadraticCurveTo(x, y, x + r, y);

        return new THREE.ShapeGeometry(shape);
    }, [capsuleWidth, capsuleHeight]);

    return (
        <group
            position={POWERBANK_PREVIEW_POSE.position}
            rotation={POWERBANK_PREVIEW_POSE.rotation}
            scale={POWERBANK_PREVIEW_POSE.scale}
        >
            <group position={[-centerX, -centerY, -centerZ]}>
                {meshes.map(({ name, geo }) => (
                    <mesh key={name} geometry={geo} castShadow receiveShadow>
                        <meshStandardMaterial color="#6b6f73" metalness={0.02} roughness={0.92} />
                    </mesh>
                ))}
                <group position={[centerX, 0, frontZ + 0.006]}>
                    <mesh
                        geometry={ringGeometry}
                        position={[0, bbox.min.y + height * 0.72, 0]}
                        renderOrder={5}
                    >
                        <meshStandardMaterial color="#2f3235" roughness={0.88} metalness={0.02} depthWrite={false} />
                    </mesh>
                    <mesh
                        geometry={capsuleGeometry}
                        position={[0, bbox.min.y + height * 0.35, 0]}
                        renderOrder={6}
                    >
                        <meshStandardMaterial color="#2f3235" roughness={0.88} metalness={0.02} depthWrite={false} />
                    </mesh>
                </group>
            </group>
        </group>
    );
}

function PowerbankPreview() {
    return (
        <div className="relative w-full h-full">
            <Canvas
                camera={{ position: POWERBANK_PREVIEW_POSE.cameraPosition, fov: POWERBANK_PREVIEW_POSE.cameraFov }}
                gl={{ antialias: true }}
                style={{ pointerEvents: 'none' }}
            >
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 8, 5]} intensity={1.5} />
                <directionalLight position={[-4, 3, 2]} intensity={0.6} />
                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.3} shadows={false} adjustCamera={false}>
                        <PowerbankPreviewScene />
                    </Stage>
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
}

function NotebookPreviewScene() {
    const groupRef = useRef();

    useFrame(({ clock }) => {
        if (groupRef.current) {
            groupRef.current.rotation.y = NOTEBOOK_PREVIEW_POSE.rotation[1]
                + Math.sin(clock.elapsedTime * 0.7) * NOTEBOOK_PREVIEW_POSE.sway;
        }
    });

    return (
        <group
            ref={groupRef}
            position={NOTEBOOK_PREVIEW_POSE.position}
            rotation={NOTEBOOK_PREVIEW_POSE.rotation}
            scale={NOTEBOOK_PREVIEW_POSE.scale}
        >
            <Notebook config={NOTEBOOK_PREVIEW_CONFIG} />
        </group>
    );
}

function NotebookPreview() {
    return (
        <div className="relative w-full h-full">
            <Canvas
                camera={{ position: NOTEBOOK_PREVIEW_POSE.cameraPosition, fov: NOTEBOOK_PREVIEW_POSE.cameraFov }}
                gl={{ antialias: true }}
                style={{ pointerEvents: 'none' }}
            >
                <ambientLight intensity={0.75} />
                <directionalLight position={[5, 8, 5]} intensity={1.5} />
                <directionalLight position={[-4, 3, 2]} intensity={0.7} />
                <Suspense fallback={null}>
                    <NotebookPreviewScene />
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
}

function MerchPreview({ model: Model, previewConfig }) {
    return (
        <div className="relative h-full w-full">
            <Canvas camera={{ position: [0, 0.2, 5.4], fov: 36 }} gl={{ antialias: true }} style={{ pointerEvents: 'none' }}>
                <ambientLight intensity={0.78} />
                <directionalLight position={[4, 6, 5]} intensity={1.4} />
                <directionalLight position={[-4, 3, 2]} intensity={0.55} />
                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.22} shadows={false} adjustCamera>
                        <Model config={previewConfig} preview />
                    </Stage>
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
}

const SHOPPER_PREVIEW_CONFIG = {
    shopperColor: '#F5F0E1',
    shopperMaterial: 'canvas_220',
    shopperHandleType: 'long',
    shopperPrintSide: 'front',
    shopperLogos: [],
};
const TSHIRT_PREVIEW_CONFIG = {
    tshirtColor: '#FFFFFF',
    tshirtMaterial: 'cotton_180',
    tshirtSize: 'M',
    tshirtPrintSide: 'front',
    tshirtLogos: [],
};
const HOODIE_PREVIEW_CONFIG = {
    hoodieColor: '#1A1A1A',
    hoodieMaterial: 'fleece_280',
    hoodieSize: 'M',
    hoodiePrintSide: 'front',
    hoodieLogos: [],
};
const LANYARD_PREVIEW_CONFIG = {
    lanyardColor: '#1565C0',
    lanyardMaterial: 'polyester_15',
    lanyardLengthMm: 450,
    lanyardWidthMm: 15,
    lanyardCarabiner: 'carabiner',
    lanyardLogos: [],
};
const makeStickerPreviewLogo = (label, color) => (
    `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
            <rect width="256" height="256" rx="48" fill="${color}"/>
            <circle cx="128" cy="90" r="38" fill="white" opacity="0.92"/>
            <text x="128" y="176" text-anchor="middle" font-family="Arial, sans-serif" font-size="58" font-weight="900" fill="white">${label}</text>
        </svg>
    `)}`
);
const STICKER_PREVIEW_CONFIG = {
    stickerSheetColor: '#FDD835',
    stickerImages: [
        { id: 'preview-sticker-1', texture: makeStickerPreviewLogo('S', '#1565C0'), filename: 'S', slot: 0, shape: 'circle', position: [0, 0], rotation: 0, scale: 0.86 },
        { id: 'preview-sticker-2', texture: makeStickerPreviewLogo('P', '#EC407A'), filename: 'P', slot: 1, shape: 'square', position: [0, 0], rotation: 0, scale: 0.86 },
        { id: 'preview-sticker-3', texture: makeStickerPreviewLogo('3D', '#43A047'), filename: '3D', slot: 2, shape: 'circle', position: [0, 0], rotation: 0, scale: 0.82 },
        { id: 'preview-sticker-4', texture: makeStickerPreviewLogo('GO', '#111827'), filename: 'GO', slot: 3, shape: 'square', position: [0, 0], rotation: 0, scale: 0.82 },
        { id: 'preview-sticker-5', texture: makeStickerPreviewLogo('★', '#F97316'), filename: 'Star', slot: 4, shape: 'square', position: [0, 0], rotation: 0, scale: 0.84 },
        { id: 'preview-sticker-6', texture: makeStickerPreviewLogo('OK', '#5E366E'), filename: 'OK', slot: 5, shape: 'circle', position: [0, 0], rotation: 0, scale: 0.84 },
    ],
};

function StickerPreview() {
    return (
        <div className="relative mx-auto h-full w-full max-w-[min(100%,220px)] overflow-hidden rounded-[8px] bg-[radial-gradient(circle_at_50%_22%,rgba(253,216,53,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.5),rgba(255,255,255,0.08))] dark:bg-[radial-gradient(circle_at_50%_22%,rgba(253,216,53,0.16),transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]">
            <Canvas camera={{ position: [0, 0.03, 8.1], fov: 30 }} gl={{ antialias: true }} style={{ pointerEvents: 'none' }}>
                <ambientLight intensity={0.78} />
                <directionalLight position={[4, 6, 5]} intensity={1.4} />
                <directionalLight position={[-4, 3, 2]} intensity={0.55} />
                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.22} shadows={false} adjustCamera={false}>
                        <Sticker config={STICKER_PREVIEW_CONFIG} preview position={[0, -0.05, 0]} />
                    </Stage>
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
}


// Карточки реагируют только на собственное наведение: лёгкий подъём плюс
// локальный блик под курсором без движения соседних элементов.
function ProductCard({ children, onClick, glowColor, className = '' }) {
    const cardRef = useRef(null);

    const updateSpotlight = (event) => {
        const el = cardRef.current;
        if (!el) return;

        const rect = el.getBoundingClientRect();
        el.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`);
        el.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`);
    };

    const resetSpotlight = () => {
        const el = cardRef.current;
        if (!el) return;

        el.style.setProperty('--spotlight-x', '50%');
        el.style.setProperty('--spotlight-y', '18%');
    };

    return (
        <button
            ref={cardRef}
            type="button"
            onClick={onClick}
            onPointerMove={updateSpotlight}
            onPointerLeave={resetSpotlight}
            style={{
                '--spotlight-x': '50%',
                '--spotlight-y': '18%',
                '--spotlight-color': glowColor,
            }}
            className={`home-product-card group relative isolate flex min-h-[17.5rem] flex-col items-center justify-between overflow-hidden rounded-[20px] border border-gray-200 bg-white p-4 text-left shadow-xl transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out hover:-translate-y-1 hover:border-gray-300 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:translate-y-0 active:scale-[0.99] sm:min-h-[18.5rem] sm:p-5 md:rounded-[22px] xl:min-h-[19.5rem] xl:rounded-[24px] xl:p-6 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none dark:backdrop-blur-xl dark:hover:border-white/20 dark:hover:bg-white/[0.06] ${className}`}
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: 'radial-gradient(280px circle at var(--spotlight-x) var(--spotlight-y), var(--spotlight-color), transparent 68%)' }}
            />
            {children}
        </button>
    );
}

function ProductGrid({ children }) {
    return (
        <div className="home-product-grid grid w-full grid-cols-[repeat(auto-fit,minmax(min(18rem,100%),1fr))] gap-4 md:gap-5 xl:gap-6">
            {children}
        </div>
    );
}

function PrintCanvasPreview() {
    const dots = [
        [9, 18], [27, 18], [45, 18], [63, 18],
        [18, 37], [36, 37], [54, 37], [72, 37],
        [9, 58], [27, 58], [45, 58], [63, 58],
    ];

    return (
        <div className="relative h-full w-full overflow-hidden rounded-[14px] border border-gray-200/80 bg-[#fffdf8] shadow-inner dark:border-white/10">
            <div
                className="absolute inset-0 opacity-90"
                style={{
                    backgroundImage: 'linear-gradient(rgba(17,24,39,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(17,24,39,0.07) 1px, transparent 1px)',
                    backgroundSize: '18px 18px',
                }}
            />
            <div className="absolute left-5 right-5 top-8 h-[68%] rounded-[10px] border border-dashed border-gray-300 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.10)]">
                {dots.map(([left, top], index) => (
                    <span
                        key={`${left}-${top}`}
                        className="absolute grid h-8 w-8 place-items-center rounded-full border border-blue-100 bg-blue-600 text-[11px] font-black text-white shadow-sm sm:h-9 sm:w-9"
                        style={{ left: `${left}%`, top: `${top}%` }}
                    >
                        {index % 3 === 0 ? 'S' : ''}
                    </span>
                ))}
                <span className="absolute bottom-[14%] right-[13%] rounded-[6px] border-2 border-slate-800 bg-white px-3 py-1 text-[9px] font-black text-slate-800">
                    LOGO
                </span>
            </div>
            <div className="absolute bottom-4 left-6 right-6 grid grid-cols-3 gap-2">
                <span className="h-2 rounded-full bg-blue-600/90" />
                <span className="h-2 rounded-full bg-slate-800/80" />
                <span className="h-2 rounded-full bg-emerald-500/90" />
            </div>
        </div>
    );
}

const DEFAULT_SECTION_VISIBILITY = {
    notebook: true,
    thermos: true,
    powerbank: true,
    sticker: true,
    shopper: true,
    tshirt: true,
    hoodie: true,
    lanyard: true,
    print_canvas: false,
};

export function ConfiguratorProductMenu({ onStart, onPrintCanvas, visibility = DEFAULT_SECTION_VISIBILITY }) {
    const {
        setProduct, setFormat, setBindingType, setHasElastic,
        setColor,
        language,
    } = useConfigurator();

    const handleSelect = (productType, config = {}) => {
        setProduct(productType);
        setFormat(config.format || 'A5');
        const nextBindingType = config.bindingType || 'hard';
        const nextBindingCaps = getNotebookBindingCapabilities(nextBindingType);
        setBindingType(nextBindingType);
        if (config.coverColor) setColor('cover', config.coverColor);
        if (config.innerCoverColor) setColor('innerCover', config.innerCoverColor);
        if (config.stitchColor) setColor('stitch', config.stitchColor);
        if (config.elasticColor) setColor('elastic', config.elasticColor);
        if (config.spiralColor) setColor('spiral', config.spiralColor);
        setHasElastic(nextBindingCaps.hasElastic && (config.hasElastic !== undefined ? config.hasElastic : true));
        onStart();
    };

    return (
        <ProductGrid>
            {visibility.notebook !== false && (
                <ProductCard
                    glowColor="rgba(59, 130, 246, 0.22)"
                    onClick={() => handleSelect('notebook', {
                        format: 'A5',
                        bindingType: 'spiral',
                        hasElastic: true,
                        coverColor: '#1565C0',
                        innerCoverColor: '#1565C0',
                        stitchColor: '#ffffff',
                        spiralColor: '#C0C0C0',
                        elasticColor: '#1a1a1a',
                    })}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <NotebookPreview />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'notebook')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-blue-50 group-hover:text-blue-600 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.thermos !== false && (
                <ProductCard glowColor="rgba(100, 116, 139, 0.22)" onClick={() => handleSelect('thermos', {})}>
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <ThermosPreview />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'thermos')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-slate-50 group-hover:text-slate-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.powerbank !== false && (
                <ProductCard
                    glowColor="rgba(16, 185, 129, 0.2)"
                    onClick={() => handleSelect('powerbank', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <PowerbankPreview />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'powerbank')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-emerald-50 group-hover:text-emerald-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.sticker !== false && (
                <ProductCard
                    glowColor="rgba(236, 72, 153, 0.18)"
                    onClick={() => handleSelect('sticker', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <StickerPreview />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'sticker3d')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-pink-50 group-hover:text-pink-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.shopper !== false && (
                <ProductCard
                    glowColor="rgba(202, 138, 4, 0.18)"
                    onClick={() => handleSelect('shopper', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <MerchPreview model={Shopper} previewConfig={SHOPPER_PREVIEW_CONFIG} />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'shopper')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-amber-50 group-hover:text-amber-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.tshirt !== false && (
                <ProductCard
                    glowColor="rgba(14, 165, 233, 0.18)"
                    onClick={() => handleSelect('tshirt', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <MerchPreview model={Tshirt} previewConfig={TSHIRT_PREVIEW_CONFIG} />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'tshirt')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-sky-50 group-hover:text-sky-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.hoodie !== false && (
                <ProductCard
                    glowColor="rgba(124, 58, 237, 0.18)"
                    onClick={() => handleSelect('hoodie', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <MerchPreview model={Hoodie} previewConfig={HOODIE_PREVIEW_CONFIG} />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'hoodie')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-violet-50 group-hover:text-violet-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.lanyard !== false && (
                <ProductCard
                    glowColor="rgba(20, 184, 166, 0.18)"
                    onClick={() => handleSelect('lanyard', {})}
                >
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <MerchPreview model={Lanyard} previewConfig={LANYARD_PREVIEW_CONFIG} />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'lanyard')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-teal-50 group-hover:text-teal-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'openBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}

            {visibility.print_canvas !== false && onPrintCanvas && (
                <ProductCard glowColor="rgba(245, 158, 11, 0.2)" onClick={onPrintCanvas}>
                    <div className="home-product-preview relative z-10 h-36 w-full sm:h-40 md:h-44 xl:h-52 2xl:h-56">
                        <PrintCanvasPreview />
                    </div>
                    <div className="relative z-10 mt-2 text-center">
                        <h3 className="text-base font-bold text-gray-900 transition-colors sm:text-lg dark:text-white">{t(language, 'printCanvasHomeButton')}</h3>
                        <span className="mt-4 inline-flex max-w-full rounded-full border border-gray-200 bg-gray-100 px-4 py-2 text-center text-[11px] font-bold text-gray-600 transition-colors sm:mt-5 sm:px-5 sm:text-xs group-hover:bg-amber-50 group-hover:text-amber-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                            {t(language, 'printCanvasOpenBtn')}
                        </span>
                    </div>
                </ProductCard>
            )}
        </ProductGrid>
    );
}

export const Home = ({ onStart, onAuth, user, logout, sectionVisibility, onPrintCanvas }) => {
    const {
        language, setLanguage, theme, toggleTheme
    } = useConfigurator();

    useEffect(() => {
        if (!THEME_SWITCHING_ENABLED) {
            document.documentElement.classList.add('dark');
            if (theme !== 'dark') useConfigurator.setState({ theme: 'dark' });
            return;
        }
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [theme]);

    const cycleLanguage = () => {
        if (language === 'ru') setLanguage('en');
        else if (language === 'en') setLanguage('by');
        else setLanguage('ru');
    };

    const openCommandPalette = () => {
        window.dispatchEvent(new Event('spruzhuk:open-command-palette'));
    };

    return (
        // h-full + overflow-y-auto делают саму главную скроллящимся контейнером.
        // Глобально html/body имеют overflow:hidden (нужно конструктору с 3D-канвасом),
        // поэтому скролл вешаем здесь, а не на body.
        <div className="home-route app-bg h-full w-full flex flex-col font-sans transition-colors duration-500 text-gray-900 dark:text-white overflow-y-auto overflow-x-hidden selection:bg-blue-500/30">

            <header className="home-header relative w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 z-50 shrink-0">
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 active:scale-95"
                >
                    <img src="/SprooGeek.svg" alt="Spruzhuk logo" className="w-4 h-4 object-contain" />
                    <span className="font-bold text-sm tracking-wide">Sproogeek 3D</span>
                </button>

                {/* Поисковое окно — абсолютным центрированием, чтобы не зависеть
                    от ширины левого/правого блоков и стоять строго посередине вьюпорта. */}
                <button
                    type="button"
                    onClick={openCommandPalette}
                    className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md w-80 xl:w-96 text-sm text-gray-400 shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-left"
                    aria-label={t(language, 'search')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span className="flex-1">{t(language, 'search')}</span>
                    <span className="bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">⌘K</span>
                </button>

                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    <button
                        type="button"
                        onClick={openCommandPalette}
                        className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md shadow-sm dark:shadow-none focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        aria-label={t(language, 'search')}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </button>
                    <button onClick={cycleLanguage} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md text-xs font-bold uppercase">
                        {language}
                    </button>
                    {THEME_SWITCHING_ENABLED && (
                        <button onClick={toggleTheme} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md">
                            {theme === 'light' ? (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>) : (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>)}
                        </button>
                    )}
                    {user ? (
                        <div className="flex items-center gap-2 sm:gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-3 sm:px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors min-w-0 max-w-[52vw] sm:max-w-none">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 truncate">{getUserDisplayName(user)}</span>
                            <div className="w-px h-4 bg-gray-300 dark:bg-white/20"></div>
                            <button onClick={logout} className="text-xs text-red-500 dark:text-red-400 font-bold hover:text-red-700 dark:hover:text-red-300 transition">{t(language, 'logout')}</button>
                        </div>
                    ) : (
                        <button onClick={onAuth} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 dark:bg-white/5 dark:border-white/10 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors px-4 sm:px-5 py-2 rounded-full backdrop-blur-md text-sm font-bold shadow-sm dark:shadow-none">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            {t(language, 'login')}
                        </button>
                    )}
                </div>
            </header>

            <main className="home-main flex-1 flex w-full flex-col items-center pt-6 sm:pt-10 lg:pt-12 2xl:pt-16 pb-20 sm:pb-24 px-4 sm:px-6 lg:px-8 z-10">
                <h1 className="home-title max-w-[72rem] break-words px-2 pb-2 text-[2.35rem] font-bold text-center leading-[1.16] tracking-normal mb-3 sm:text-5xl md:text-6xl xl:text-7xl sm:mb-4 text-gray-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-b dark:from-white dark:to-gray-400 drop-shadow-sm dark:drop-shadow-2xl transition-colors">
                    {t(language, 'title1')}<br />{t(language, 'title2')}
                </h1>
                <p className="home-subtitle text-gray-500 dark:text-gray-400 text-sm md:text-base text-center max-w-xl mb-8 sm:mb-10 lg:mb-12 xl:mb-14 font-medium leading-relaxed transition-colors">
                    {t(language, 'subtitle')}
                </p>

                <ConfiguratorProductMenu
                    onStart={onStart}
                    onPrintCanvas={onPrintCanvas}
                    visibility={sectionVisibility}
                />

                <FeedbackPanel language={language} />
            </main>
            <SiteFooter className="shrink-0" />
        </div>
    );
};
