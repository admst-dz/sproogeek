import { useEffect, useState, Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Stage } from '@react-three/drei';
import * as THREE from 'three';
import { useConfigurator } from '../../store';
import { t } from '../../i18n';
import { getUserDisplayName } from '../../utils/user';
import { SceneLoadingOverlay } from '../shared/VibeLoader';
import termosModelUrl from '../../assets/termos3.glb?url';
import powerbankModelUrl from '../../assets/poverbank.glb?url';
import { FeedbackPanel } from './FeedbackPanel';

function ThermosPreviewScene() {
    const groupRef = useRef();
    const { nodes } = useGLTF(termosModelUrl);
    const meshes = Object.entries(nodes).filter(([, n]) => n.geometry);

    useFrame((_, delta) => {
        if (groupRef.current) groupRef.current.rotation.y += delta * 0.6;
    });

    return (
        <group ref={groupRef}>
            {meshes.map(([name, node]) => (
                <mesh key={name} geometry={node.geometry} castShadow receiveShadow>
                    <meshStandardMaterial color={'#C0C0C0'} metalness={0.8} roughness={0.2} />
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
                    <Stage environment="city" intensity={0.3} contactShadow={false} adjustCamera>
                        <ThermosPreviewScene />
                    </Stage>
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
}

function PowerbankPreviewScene() {
    const groupRef = useRef();
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

    useFrame((_, delta) => {
        if (groupRef.current) groupRef.current.rotation.y += delta * 0.5;
    });

    return (
        <group ref={groupRef} scale={0.75}>
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
    );
}

function PowerbankPreview() {
    return (
        <div className="relative w-full h-full">
            <Canvas camera={{ position: [0, 0.5, 4], fov: 40 }} gl={{ antialias: true }} style={{ pointerEvents: 'none' }}>
                <ambientLight intensity={0.7} />
                <directionalLight position={[5, 8, 5]} intensity={1.5} />
                <directionalLight position={[-4, 3, 2]} intensity={0.6} />
                <Suspense fallback={null}>
                    <Stage environment="city" intensity={0.3} contactShadow={false} adjustCamera>
                        <PowerbankPreviewScene />
                    </Stage>
                </Suspense>
            </Canvas>
            <SceneLoadingOverlay compact label="3D" />
        </div>
    );
}


// ─── Mac-dock карточки ──────────────────────────────────────────────────────
// Идея как в macOS dock: при наведении мыши соседние карточки увеличиваются
// тем сильнее, чем ближе они к курсору. Реализовано без зависимостей: один
// общий mouseX на грид + индивидуальный transform на каждой карточке через
// gaussian falloff. На тач-устройствах эффект отключён (нет hover).

function DockCard({ children, onClick, mouseX, dockEnabled }) {
    const ref = useRef(null);
    const [{ scale, lift }, setTransform] = useState({ scale: 1, lift: 0 });

    useEffect(() => {
        if (!dockEnabled || mouseX === null || !ref.current) {
            setTransform({ scale: 1, lift: 0 });
            return;
        }
        const el = ref.current;
        const cardCenter = el.offsetLeft + el.offsetWidth / 2;
        const distance = Math.abs(mouseX - cardCenter);
        // sigma подбирается так, чтобы эффект распространялся примерно на
        // ширину одной карточки, но плавно затухал к третьей.
        const sigma = el.offsetWidth * 0.85;
        const proximity = Math.exp(-(distance * distance) / (2 * sigma * sigma));
        setTransform({
            scale: 1 + 0.12 * proximity,
            lift: -14 * proximity,
        });
    }, [mouseX, dockEnabled]);

    return (
        <div
            ref={ref}
            onClick={onClick}
            style={{
                transform: `translate3d(0, ${lift}px, 0) scale(${scale})`,
                transition: 'transform 220ms cubic-bezier(0.22, 0.8, 0.36, 1), box-shadow 220ms ease',
                willChange: 'transform',
            }}
            className="cursor-pointer"
        >
            {children}
        </div>
    );
}

function ProductDock({ children }) {
    const wrapperRef = useRef(null);
    const [mouseX, setMouseX] = useState(null);
    const [dockEnabled, setDockEnabled] = useState(false);

    useEffect(() => {
        // hover-эффект бесполезен на тач — определяем поддержку точного указателя.
        const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
        const apply = () => setDockEnabled(mq.matches);
        apply();
        mq.addEventListener?.('change', apply);
        return () => mq.removeEventListener?.('change', apply);
    }, []);

    const onMouseMove = (e) => {
        if (!wrapperRef.current) return;
        const rect = wrapperRef.current.getBoundingClientRect();
        setMouseX(e.clientX - rect.left);
    };

    return (
        <div
            ref={wrapperRef}
            onMouseMove={dockEnabled ? onMouseMove : undefined}
            onMouseLeave={() => setMouseX(null)}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 w-full max-w-5xl"
        >
            {children({ mouseX, dockEnabled })}
        </div>
    );
}


export const Home = ({ onStart, onAuth, user, logout }) => {
    const {
        setProduct, setFormat, setBindingType, setHasElastic,
        language, setLanguage, theme, toggleTheme
    } = useConfigurator();

    useEffect(() => {
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    }, [theme]);

    const handleSelect = (productType, config = {}) => {
        setProduct(productType);
        setFormat(config.format || 'A5');
        setBindingType(config.bindingType || 'hard');
        setHasElastic(config.bindingType === 'hard' ? false : (config.hasElastic !== undefined ? config.hasElastic : true));
        onStart();
    };

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
                <div className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors">
                    <img src="/SprooGeek.svg" alt="Spruzhuk logo" className="w-4 h-4 object-contain" />
                    <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                </div>

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
                    <button onClick={toggleTheme} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md">
                        {theme === 'light' ? (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>) : (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>)}
                    </button>
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

                <ProductDock>
                    {({ mouseX, dockEnabled }) => (
                        <>
                            {/* Карточка 1: Ежедневник */}
                            <DockCard
                                mouseX={mouseX}
                                dockEnabled={dockEnabled}
                                onClick={() => handleSelect('notebook', { format: 'A5', bindingType: 'hard', hasElastic: false })}
                            >
                                <div className="group relative flex flex-col items-center p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-white border border-gray-200 shadow-xl hover:shadow-2xl dark:bg-white/[0.03] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-none dark:hover:bg-white/[0.06] dark:hover:border-white/20 transition-colors duration-500 overflow-hidden">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-blue-500/10 dark:bg-blue-500/20 blur-[60px] group-hover:bg-blue-500/20 dark:group-hover:bg-blue-400/30 transition-colors duration-500"></div>
                                    <div className="h-40 sm:h-48 lg:h-56 w-full flex items-center justify-center relative z-10">
                                        <svg width="120" height="160" viewBox="0 0 100 130" fill="none" className="drop-shadow-xl dark:drop-shadow-2xl">
                                            <rect x="20" y="10" width="60" height="110" rx="3" fill="#151515" stroke="#333" strokeWidth="1" />
                                            <path d="M76 12 V118 L82 116 V14 Z" fill="#D4AF37" />
                                            <rect x="20" y="10" width="8" height="110" fill="black" fillOpacity="0.4" />
                                        </svg>
                                    </div>
                                    <div className="text-center relative z-10 mt-2">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white transition-colors">{t(language, 'notebook')}</h3>
                                        <button className="mt-5 px-5 py-2 rounded-full bg-gray-100 text-gray-600 border border-gray-200 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white transition-colors dark:border-white/5 text-xs font-bold">
                                            {t(language, 'openBtn')}
                                        </button>
                                    </div>
                                </div>
                            </DockCard>

                            {/* Карточка 2: Термос */}
                            <DockCard
                                mouseX={mouseX}
                                dockEnabled={dockEnabled}
                                onClick={() => handleSelect('thermos', {})}
                            >
                                <div className="group relative flex flex-col items-center p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-white border border-gray-200 shadow-xl hover:shadow-2xl dark:bg-white/[0.03] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-none dark:hover:bg-white/[0.06] dark:hover:border-white/20 transition-colors duration-500 overflow-hidden">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-slate-500/10 dark:bg-slate-400/20 blur-[60px] group-hover:bg-slate-500/20 dark:group-hover:bg-slate-400/30 transition-colors duration-500"></div>
                                    <div className="h-40 sm:h-48 lg:h-56 w-full relative z-10">
                                        <ThermosPreview />
                                    </div>
                                    <div className="text-center relative z-10 mt-2">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white transition-colors">{t(language, 'thermos')}</h3>
                                        <button className="mt-5 px-5 py-2 rounded-full bg-gray-100 text-gray-600 border border-gray-200 group-hover:bg-slate-50 group-hover:text-slate-700 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white transition-colors dark:border-white/5 text-xs font-bold">
                                            {t(language, 'openBtn')}
                                        </button>
                                    </div>
                                </div>
                            </DockCard>

                            {/* Карточка 3: Повербанк */}
                            <DockCard
                                mouseX={mouseX}
                                dockEnabled={dockEnabled}
                                onClick={() => handleSelect('powerbank', {})}
                            >
                                <div className="group relative flex flex-col items-center p-5 md:p-6 rounded-[20px] md:rounded-[24px] bg-white border border-gray-200 shadow-xl hover:shadow-2xl dark:bg-white/[0.03] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-none dark:hover:bg-white/[0.06] dark:hover:border-white/20 transition-colors duration-500 overflow-hidden sm:col-span-2 lg:col-span-1">
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-emerald-500/10 dark:bg-emerald-400/20 blur-[60px] group-hover:bg-emerald-500/20 dark:group-hover:bg-emerald-400/30 transition-colors duration-500"></div>
                                    <div className="h-40 sm:h-48 lg:h-56 w-full relative z-10">
                                        <PowerbankPreview />
                                    </div>
                                    <div className="text-center relative z-10 mt-2">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white transition-colors">{t(language, 'powerbank')}</h3>
                                        <button className="mt-5 px-5 py-2 rounded-full bg-gray-100 text-gray-600 border border-gray-200 group-hover:bg-emerald-50 group-hover:text-emerald-700 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white transition-colors dark:border-white/5 text-xs font-bold">
                                            {t(language, 'openBtn')}
                                        </button>
                                    </div>
                                </div>
                            </DockCard>
                        </>
                    )}
                </ProductDock>

                <FeedbackPanel language={language} />
            </main>
        </div>
    );
};
