import { useEffect, Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, Stage } from '@react-three/drei';
import { useConfigurator } from '../store';
import { t } from '../i18n';
import { getUserDisplayName } from '../utils/user';
import termosModelUrl from '../assets/termos3.glb?url';

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
                    <meshStandardMaterial
                        color={'#C0C0C0'}
                        metalness={0.8}
                        roughness={0.2}
                    />
                </mesh>
            ))}
        </group>
    );
}

function ThermosPreview() {
    return (
        <Canvas
            camera={{ position: [0, 0.5, 4], fov: 40 }}
            gl={{ antialias: true }}
            style={{ pointerEvents: 'none' }}
        >
            <ambientLight intensity={0.7} />
            <directionalLight position={[5, 8, 5]} intensity={1.5} />
            <directionalLight position={[-4, 3, 2]} intensity={0.6} />
            <Suspense fallback={null}>
                <Stage environment="city" intensity={0.3} contactShadow={false} adjustCamera>
                    <ThermosPreviewScene />
                </Stage>
            </Suspense>
        </Canvas>
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

    // ОБНОВЛЕННАЯ ФУНКЦИЯ
    const handleSelect = (productType, config = {}) => {
        setProduct(productType);

        // Сброс и применение настроек
        setFormat(config.format || 'A5');
        setBindingType(config.bindingType || 'hard');
        setHasElastic(config.hasElastic !== undefined ? config.hasElastic : true);

        onStart();
    };

    const cycleLanguage = () => {
        if (language === 'ru') setLanguage('en');
        else if (language === 'en') setLanguage('by');
        else setLanguage('ru');
    };

    return (
        <div className="min-h-screen w-full flex flex-col font-sans transition-colors duration-500 bg-gray-50 text-gray-900 dark:bg-[#0B0F19] dark:bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] dark:from-[#1A2642] dark:via-[#0B0F19] dark:to-[#080B13] dark:text-white overflow-x-hidden selection:bg-blue-500/30 md:h-screen">

            {/* ... ШАПКА ОСТАЕТСЯ БЕЗ ИЗМЕНЕНИЙ ... */}
            <header className="w-full px-6 py-5 flex items-center justify-between z-50">
                <div className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors">
                <img src="/SprooGeek.svg" alt="Spruzhuk logo" className="w-4 h-4 object-contain" />
                    <span className="font-bold text-sm tracking-wide">Spruzhuk</span>
                </div>

                <div className="hidden md:flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md w-96 max-w-full text-sm text-gray-400 shadow-sm dark:shadow-none transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span className="flex-1">{t(language, 'search')}</span>
                    <span className="bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-400 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">⌘K</span>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={cycleLanguage} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md text-xs font-bold uppercase">
                        {language}
                    </button>
                    <button onClick={toggleTheme} className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors rounded-full backdrop-blur-md">
                        {theme === 'light' ? (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>) : (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>)}
                    </button>
                    {user ? (
                        <div className="flex items-center gap-3 bg-white border border-gray-200 dark:bg-white/5 dark:border-white/10 px-4 py-2 rounded-full backdrop-blur-md shadow-sm dark:shadow-none transition-colors">
                            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">{getUserDisplayName(user)}</span>
                            <div className="w-px h-4 bg-gray-300 dark:bg-white/20"></div>
                            <button onClick={logout} className="text-xs text-red-500 dark:text-red-400 font-bold hover:text-red-700 dark:hover:text-red-300 transition">{t(language, 'logout')}</button>
                        </div>
                    ) : (
                        <button onClick={onAuth} className="flex items-center gap-2 bg-white border border-gray-200 text-gray-800 dark:bg-white/5 dark:border-white/10 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors px-5 py-2 rounded-full backdrop-blur-md text-sm font-bold shadow-sm dark:shadow-none">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                            {t(language, 'login')}
                        </button>
                    )}
                </div>
            </header>

            <main className="md:flex-1 flex flex-col items-center justify-center pt-10 pb-20 px-4 z-10">
                <h1 className="text-5xl md:text-7xl font-bold text-center leading-tight tracking-tight mb-6 text-gray-900 dark:text-transparent dark:bg-clip-text dark:bg-gradient-to-b dark:from-white dark:to-gray-400 drop-shadow-sm dark:drop-shadow-2xl transition-colors">
                    {t(language, 'title1')}<br/>{t(language, 'title2')}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base text-center max-w-lg mb-16 font-medium leading-relaxed transition-colors">
                    {t(language, 'subtitle')}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">

                    {/* Карточка 1: Ежедневник */}
                    <div onClick={() => handleSelect('notebook', { format: 'A5', bindingType: 'hard', hasElastic: true, isSketchbook: false })} className="group relative flex flex-col items-center p-6 rounded-[24px] bg-white border border-gray-200 shadow-xl hover:shadow-2xl dark:bg-white/[0.03] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-none cursor-pointer dark:hover:bg-white/[0.06] dark:hover:border-white/20 transition-all duration-500 overflow-hidden">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-blue-500/10 dark:bg-blue-500/20 blur-[60px] group-hover:bg-blue-500/20 dark:group-hover:bg-blue-400/30 transition-colors duration-500"></div>
                        <div className="h-64 w-full flex items-center justify-center relative z-10">
                            <svg width="140" height="180" viewBox="0 0 100 130" fill="none" className="drop-shadow-xl dark:drop-shadow-2xl group-hover:scale-105 transition-transform duration-500">
                                <rect x="20" y="10" width="60" height="110" rx="3" fill="#151515" stroke="#333" strokeWidth="1"/>
                                <path d="M76 12 V118 L82 116 V14 Z" fill="#D4AF37" />
                                <rect x="20" y="10" width="8" height="110" fill="black" fillOpacity="0.4" />
                            </svg>
                        </div>
                        <div className="text-center relative z-10 mt-2">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 transition-colors">{t(language, 'notebook')}</h3>
                            <p className="text-xs text-gray-500 font-medium mb-6 transition-colors">{t(language, 'notebookDesc')}</p>
                            <button className="px-5 py-2 rounded-full bg-gray-100 text-gray-600 border border-gray-200 group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white transition-colors dark:border-white/5 text-xs font-bold">
                                {t(language, 'openBtn')}
                            </button>
                        </div>
                    </div>

                    {/* Карточка 2: Термос */}
                    <div onClick={() => handleSelect('thermos', {})} className="group relative flex flex-col items-center p-6 rounded-[24px] bg-white border border-gray-200 shadow-xl hover:shadow-2xl dark:bg-white/[0.03] dark:border-white/10 dark:backdrop-blur-xl dark:shadow-none cursor-pointer dark:hover:bg-white/[0.06] dark:hover:border-white/20 transition-all duration-500 overflow-hidden">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-slate-500/10 dark:bg-slate-400/20 blur-[60px] group-hover:bg-slate-500/20 dark:group-hover:bg-slate-400/30 transition-colors duration-500"></div>
                        <div className="h-64 w-full relative z-10">
                            <ThermosPreview />
                        </div>
                        <div className="text-center relative z-10 mt-2">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 transition-colors">{t(language, 'thermos')}</h3>
                            <p className="text-xs text-gray-500 font-medium mb-6 transition-colors">{t(language, 'thermosDesc')}</p>
                            <button className="px-5 py-2 rounded-full bg-gray-100 text-gray-600 border border-gray-200 group-hover:bg-slate-50 group-hover:text-slate-700 dark:bg-white/10 dark:text-gray-300 dark:group-hover:bg-white/20 dark:group-hover:text-white transition-colors dark:border-white/5 text-xs font-bold">
                                {t(language, 'openBtn')}
                            </button>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};
