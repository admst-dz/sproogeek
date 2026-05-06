import { create } from 'zustand'
import { getCookie, setCookie, deleteCookie, hasCookieConsent } from './utils/cookies'
import { clearMemoryToken } from './api'

const CART_COOKIE = 'spruzhuk_cart';
const AUTH_COOKIE = 'spruzhuk_auth';

const _initialCart = (() => {
    try {
        const raw = getCookie(CART_COOKIE);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
})();

let _webglCanvas = null
export const registerWebGLCanvas = (el) => { _webglCanvas = el }
export const captureRender = () => {
    if (!_webglCanvas) return null
    try { return _webglCanvas.toDataURL('image/png') } catch (e) { return null }
}

export const useConfigurator = create((set) => ({
    activeProduct: 'notebook', // 'notebook' | 'calendar' | 'sketchbook' | 'thermos'
    applyRenderConfig: (config) => set((state) => ({ ...state, ...config })),

    // --- Параметры 3D модели ---
    bindingType: 'hard',
    format: 'A5',
    isNotebookOpen: false,
    paperPattern: 'blank',
    coverColor: '#D2B48C', // Крафтовый по умолчанию для скетчбука
    hasElastic: true,
    elasticColor: '#1a1a1a',
    spiralColor: '#1a1a1a', // Черная пружина по умолчанию для скетчбука
    logos: [],
    selectedLogoId: null,
    zoomLevel: 1,

    // --- Параметры термоса ---
    thermosBodyColor: '#E65405',
    thermosCapColor: '#E65405',
    thermosCapVisible: false,
    thermosLogos: [],
    selectedThermosLogoId: null,

    // --- AUTH И РОЛИ ---
    currentUser: null,
    userRole: null,
    clientSubRole: 'PL',
    authLoading: true,

    language: 'ru',
    theme: 'dark',

    cartItem: _initialCart,
    cartRestoredFromCookie: !!_initialCart,
    renderSnapshot: null,

    // --- ACTIONS ---
    setCurrentUser: (user) => set({ currentUser: user }),
    setUserRole: (role) => set({ userRole: role }),
    setClientSubRole: (subRole) => set({ clientSubRole: subRole }),
    setAuthLoading: (isLoading) => set({ authLoading: isLoading }),
    logout: () => {
        localStorage.removeItem('token');
        deleteCookie(AUTH_COOKIE);
        deleteCookie(CART_COOKIE);
        clearMemoryToken();
        set({ currentUser: null, userRole: null, clientSubRole: 'PL', cartItem: null, cartRestoredFromCookie: false });
    },

    setLanguage: (lang) => set({ language: lang }),
    toggleTheme: () => set((state) => {
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        if (newTheme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return { theme: newTheme };
    }),

    addToCart: (itemData) => {
        if (hasCookieConsent()) setCookie(CART_COOKIE, JSON.stringify(itemData), 7);
        set({ cartItem: itemData, cartRestoredFromCookie: false });
    },
    clearCart: () => {
        deleteCookie(CART_COOKIE);
        set({ cartItem: null, cartRestoredFromCookie: false });
    },
    setRenderSnapshot: (url) => set({ renderSnapshot: url }),

    setProduct: (type) => set({ activeProduct: type }),
    setBindingType: (type) => set({ bindingType: type }),
    setFormat: (fmt) => set({ format: fmt }),
    setColor: (part, color) => set((state) => ({ ...state, [`${part}Color`]: color })),
    setHasElastic: (has) => set({ hasElastic: has }),
    setNotebookOpen: (isOpen) => set({ isNotebookOpen: isOpen }),
    setPaperPattern: (pattern) => set({ paperPattern: pattern, isNotebookOpen: true }),
    addLogo: (file) => {
        if (file instanceof File) {
            const reader = new FileReader();
            const id = Date.now();
            reader.onload = (e) => set((state) => ({
                logos: [...state.logos, { id, texture: e.target.result, filename: file.name, position: [0, 0], rotation: 0, scale: 0.6 }],
                selectedLogoId: id
            }));
            reader.readAsDataURL(file);
        }
    },
    selectLogo: (id) => set({ selectedLogoId: id }),
    setLogoPosition: (x, y) => set((state) => ({
        logos: state.logos.map(l => l.id === state.selectedLogoId ? { ...l, position: [x, y] } : l)
    })),
    setLogoRotation: (rotation) => set((state) => ({
        logos: state.logos.map(l => l.id === state.selectedLogoId ? { ...l, rotation } : l)
    })),
    setLogoScale: (scale) => set((state) => ({
        logos: state.logos.map(l => l.id === state.selectedLogoId ? { ...l, scale } : l)
    })),
    resetLogoTransform: () => set((state) => ({
        logos: state.logos.map(l => l.id === state.selectedLogoId ? { ...l, position: [0, 0], rotation: 0, scale: 0.6 } : l)
    })),
    removeLogo: (id) => set((state) => {
        const remaining = state.logos.filter(l => l.id !== id);
        return {
            logos: remaining,
            selectedLogoId: state.selectedLogoId === id
                ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
                : state.selectedLogoId
        };
    }),
    setZoom: (val) => set({ zoomLevel: val }),

    // --- ACTIONS: ТЕРМОС ---
    addThermosLogo: (file, target = 'body') => {
        if (file instanceof File) {
            const reader = new FileReader();
            const id = Date.now();
            const scale = target === 'body' ? 0.6 : 0.32;
            reader.onload = (e) => set((state) => ({
                thermosLogos: [...state.thermosLogos, { id, target, texture: e.target.result, filename: file.name, position: [0, 0], rotation: 0, scale }],
                selectedThermosLogoId: id
            }));
            reader.readAsDataURL(file);
        }
    },
    selectThermosLogo: (id) => set({ selectedThermosLogoId: id }),
    setThermosLogoPosition: (x, y) => set((state) => ({
        thermosLogos: state.thermosLogos.map(l => l.id === state.selectedThermosLogoId ? { ...l, position: [x, y] } : l)
    })),
    setThermosLogoRotation: (rotation) => set((state) => ({
        thermosLogos: state.thermosLogos.map(l => l.id === state.selectedThermosLogoId ? { ...l, rotation } : l)
    })),
    setThermosLogoScale: (scale) => set((state) => ({
        thermosLogos: state.thermosLogos.map(l => l.id === state.selectedThermosLogoId ? { ...l, scale } : l)
    })),
    resetThermosLogoTransform: () => set((state) => ({
        thermosLogos: state.thermosLogos.map(l => l.id === state.selectedThermosLogoId ? { ...l, position: [0, 0], rotation: 0, scale: (l.target ?? 'body') === 'body' ? 0.6 : 0.32 } : l)
    })),
    removeThermosLogo: (id) => set((state) => {
        const remaining = state.thermosLogos.filter(l => l.id !== id);
        return {
            thermosLogos: remaining,
            selectedThermosLogoId: state.selectedThermosLogoId === id
                ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
                : state.selectedThermosLogoId
        };
    }),
    toggleThermosCap: () => set((state) => ({ thermosCapVisible: !state.thermosCapVisible })),
}))
