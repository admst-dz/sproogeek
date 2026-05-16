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
            className={`group relative isolate flex flex-col items-center overflow-hidden rounded-[20px] border border-gray-200 bg-white p-5 text-left shadow-xl transition-[transform,box-shadow,border-color,background-color] duration-300 ease-out hover:-translate-y-1 hover:border-gray-300 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 active:translate-y-0 active:scale-[0.99] md:rounded-[24px] md:p-6 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none dark:backdrop-blur-xl dark:hover:border-white/20 dark:hover:bg-white/[0.06] ${className}`}
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
        <div className="grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
            {children}
        </div>
    );
}


export function ConfiguratorProductMenu({ onStart }) {
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
            {/* Карточка 1: Ежедневник */}
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
                <div className="relative z-10 h-40 w-full sm:h-48 lg:h-56">
                    <NotebookPreview />
                </div>
                <div className="relative z-10 mt-2 text-center">
                    <h3 className="text-lg font-bold text-gray-900 transition-colors dark:text-white">{t(language, 'notebook')}</h3>
                    <span className="mt-5 inline-flex rounded-full border border-gray-200 bg-gray-100 px-5 py-2 text-xs font-bold text-gray-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                        {t(language, 'openBtn')}
                    </span>
                </div>
            </ProductCard>

            {/* Карточка 2: Термос */}
            <ProductCard glowColor="rgba(100, 116, 139, 0.22)" onClick={() => handleSelect('thermos', {})}>
                <div className="relative z-10 h-40 w-full sm:h-48 lg:h-56">
                    <ThermosPreview />
                </div>
                <div className="relative z-10 mt-2 text-center">
                    <h3 className="text-lg font-bold text-gray-900 transition-colors dark:text-white">{t(language, 'thermos')}</h3>
                    <span className="mt-5 inline-flex rounded-full border border-gray-200 bg-gray-100 px-5 py-2 text-xs font-bold text-gray-600 transition-colors group-hover:bg-slate-50 group-hover:text-slate-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                        {t(language, 'openBtn')}
                    </span>
                </div>
            </ProductCard>

            {/* Карточка 3: Повербанк */}
            <ProductCard
                glowColor="rgba(16, 185, 129, 0.2)"
                className="sm:col-span-2 lg:col-span-1"
                onClick={() => handleSelect('powerbank', {})}
            >
                <div className="relative z-10 h-40 w-full sm:h-48 lg:h-56">
                    <PowerbankPreview />
                </div>
                <div className="relative z-10 mt-2 text-center">
                    <h3 className="text-lg font-bold text-gray-900 transition-colors dark:text-white">{t(language, 'powerbank')}</h3>
                    <span className="mt-5 inline-flex rounded-full border border-gray-200 bg-gray-100 px-5 py-2 text-xs font-bold text-gray-600 transition-colors group-hover:bg-emerald-50 group-hover:text-emerald-700 dark:border-white/5 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white">
                        {t(language, 'openBtn')}
                    </span>
                </div>
            </ProductCard>
        </ProductGrid>
    );
}

export const Home = ({ onStart, onAuth, user, logout }) => {
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
        <div className="app-bg h-full w-full flex flex-col font-sans transition-colors duration-500 text-gray-900 dark:text-white overflow-y-auto overflow-x-hidden selection:bg-blue-500/30">

            <header className="w-full px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-3 z-50 shrink-0">
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 active:scale-95"
                >
                    <img src="/SprooGeek.svg" alt="Spruzhuk logo" className="w-4 h-4 object-contain" />
                    <span className="font-bold text-sm tracking-wide">Sproogeek 3D</span>
                </button>

                <button
                    type="button"
                    onClick={openCommandPalette}
                    className="hidden md:flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md w-96 max-w-full text-sm text-gray-400 shadow-sm dark:shadow-none transition-colors hover:bg-gray-50 dark:hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-left"
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

            <main className="flex-1 flex flex-col items-center pt-6 sm:pt-12 pb-16 sm:pb-24 px-4 z-10">
                <h1 className="text-[clamp(2.35rem,11vw,4.5rem)] md:text-7xl font-bold text-center leading-[1.05] tracking-tight mb-4 sm:mb-6 text-gray-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-b dark:from-white dark:to-gray-400 drop-shadow-sm dark:drop-shadow-2xl transition-colors">
                    {t(language, 'title1')}<br />{t(language, 'title2')}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base text-center max-w-lg mb-8 sm:mb-12 lg:mb-16 font-medium leading-relaxed transition-colors">
                    {t(language, 'subtitle')}
                </p>

                <ConfiguratorProductMenu onStart={onStart} />

                <FeedbackPanel language={language} />
            </main>
        </div>
    );
};
