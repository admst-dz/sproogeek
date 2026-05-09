import { create } from 'zustand'
import { temporal } from 'zundo'
import { getCookie, setCookie, deleteCookie, hasCookieConsent } from './utils/cookies'
import { clearMemoryToken } from './api'
import { normalizeImageFile } from './utils/images'

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
    try { return _webglCanvas.toDataURL('image/png') } catch { return null }
}

// Поля, которые откатываются по Undo/Redo и сравниваются с defaults для "грязного" состояния.
// Сюда НЕ попадают auth/UI-state/корзина/тема/zoom — они не должны влиять на историю конструктора.
export const NOTEBOOK_DEFAULTS = {
    bindingType: 'hard',
    format: 'A5',
    paperPattern: 'blank',
    coverColor: '#D2B48C',
    hasElastic: true,
    elasticColor: '#1a1a1a',
    spiralColor: '#1a1a1a',
    hasCorners: true,
    logos: [],
    selectedLogoId: null,
};
export const THERMOS_DEFAULTS = {
    thermosBodyColor: '#E65405',
    thermosCapColor: '#E65405',
    thermosCapVisible: false,
    thermosLogos: [],
    selectedThermosLogoId: null,
};
export const POWERBANK_DEFAULTS = {
    powerbankBodyColor: '#75787B',
    powerbankLogos: [],
    selectedPowerbankLogoId: null,
};
export const ALL_PRODUCT_DEFAULTS = { ...NOTEBOOK_DEFAULTS, ...THERMOS_DEFAULTS, ...POWERBANK_DEFAULTS };
const TRACKED_KEYS = Object.keys(ALL_PRODUCT_DEFAULTS);

const pickTracked = (state) => {
    const out = {};
    for (const k of TRACKED_KEYS) out[k] = state[k];
    return out;
};

export const getDefaultsForProduct = (product) => {
    if (product === 'thermos') return THERMOS_DEFAULTS;
    if (product === 'powerbank') return POWERBANK_DEFAULTS;
    return NOTEBOOK_DEFAULTS;
};

const normalizeProduct = (type) => (
    ['notebook', 'calendar', 'thermos', 'powerbank'].includes(type) ? type : 'notebook'
);

export const useConfigurator = create(temporal((set, get) => ({
    activeProduct: 'notebook', // 'notebook' | 'calendar' | 'thermos' | 'powerbank'
    applyRenderConfig: (config) => set((state) => ({ ...state, ...config })),

    // --- Параметры 3D модели ---
    bindingType: 'hard',
    format: 'A5',
    isNotebookOpen: false,
    paperPattern: 'blank',
    coverColor: '#D2B48C',
    hasElastic: true,
    elasticColor: '#1a1a1a',
    spiralColor: '#1a1a1a',
    logos: [],
    selectedLogoId: null,
    zoomLevel: 1,

    // --- Параметры термоса ---
    thermosBodyColor: '#E65405',
    thermosCapColor: '#E65405',
    thermosCapVisible: false,
    thermosLogos: [],
    selectedThermosLogoId: null,

    // --- Параметры ежедневника (уголки) ---
    hasCorners: true,

    // --- Параметры повербанка ---
    powerbankBodyColor: '#75787B',
    powerbankLogos: [],
    selectedPowerbankLogoId: null,

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

    setProduct: (type) => set({ activeProduct: normalizeProduct(type) }),
    setBindingType: (type) => set((state) => ({
        bindingType: type,
        hasElastic: type === 'hard' ? false : state.hasElastic,
    })),
    setFormat: (fmt) => set({ format: fmt }),
    setColor: (part, color) => set((state) => {
        if (part === 'thermosBody') {
            return { ...state, thermosBodyColor: color, thermosCapColor: color };
        }
        return { ...state, [`${part}Color`]: color };
    }),
    setHasElastic: (has) => set({ hasElastic: has }),
    setNotebookOpen: (isOpen) => set({ isNotebookOpen: isOpen }),
    setPaperPattern: (pattern) => set({ paperPattern: pattern, isNotebookOpen: true }),
    addLogo: async (file, side = 'front') => {
        if (file instanceof File) {
            const id = Date.now();
            try {
                const texture = await normalizeImageFile(file);
                set((state) => ({
                    logos: [...state.logos, { id, side, texture, filename: file.name, position: [0, 0], rotation: 0, scale: 0.6 }],
                    selectedLogoId: id
                }));
            } catch (error) {
                console.error('Failed to prepare logo image', error);
            }
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
    setLogoSide: (side) => set((state) => ({
        logos: state.logos.map(l => l.id === state.selectedLogoId ? { ...l, side, position: [0, 0] } : l)
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
    addThermosLogo: async (file, target = 'body') => {
        if (file instanceof File) {
            const id = Date.now();
            const scale = target === 'body' ? 0.6 : 0.32;
            try {
                const texture = await normalizeImageFile(file);
                set((state) => ({
                    thermosLogos: [...state.thermosLogos, { id, target, texture, filename: file.name, position: [0, 0], rotation: 0, scale }],
                    selectedThermosLogoId: id
                }));
            } catch (error) {
                console.error('Failed to prepare thermos logo image', error);
            }
        }
    },
    addGeneratedThermosLogo: (texture, filename = 'AI дизайн.png', target = 'body') => {
        if (!texture) return;
        const id = Date.now();
        const isBodyWrap = target === 'body';
        const scale = isBodyWrap ? 1 : 0.38;
        set((state) => ({
            thermosLogos: [...state.thermosLogos, { id, target, texture, filename, position: [0, 0], rotation: 0, scale, mode: isBodyWrap ? 'wrap' : 'decal' }],
            selectedThermosLogoId: id
        }));
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

    // --- ACTIONS: УГОЛКИ ---
    toggleCorners: () => set((state) => ({ hasCorners: !state.hasCorners })),

    // --- ACTIONS: ПОВЕРБАНК ---
    addPowerbankLogo: async (file) => {
        if (file instanceof File) {
            const id = Date.now();
            try {
                const texture = await normalizeImageFile(file);
                set((state) => ({
                    powerbankLogos: [...state.powerbankLogos, { id, texture, filename: file.name, position: [0, 0], rotation: 0, scale: 0.6, side: 'outer' }],
                    selectedPowerbankLogoId: id
                }));
            } catch (error) {
                console.error('Failed to prepare powerbank logo image', error);
            }
        }
    },
    selectPowerbankLogo: (id) => set({ selectedPowerbankLogoId: id }),
    setPowerbankLogoPosition: (x, y) => set((state) => ({
        powerbankLogos: state.powerbankLogos.map(l => l.id === state.selectedPowerbankLogoId ? { ...l, position: [x, y] } : l)
    })),
    setPowerbankLogoRotation: (rotation) => set((state) => ({
        powerbankLogos: state.powerbankLogos.map(l => l.id === state.selectedPowerbankLogoId ? { ...l, rotation } : l)
    })),
    setPowerbankLogoScale: (scale) => set((state) => ({
        powerbankLogos: state.powerbankLogos.map(l => l.id === state.selectedPowerbankLogoId ? { ...l, scale } : l)
    })),
    setPowerbankLogoSide: (side) => set((state) => ({
        powerbankLogos: state.powerbankLogos.map(l => l.id === state.selectedPowerbankLogoId ? { ...l, side, position: [0, 0] } : l)
    })),
    resetPowerbankLogoTransform: () => set((state) => ({
        powerbankLogos: state.powerbankLogos.map(l => l.id === state.selectedPowerbankLogoId ? { ...l, position: [0, 0], rotation: 0, scale: 0.6 } : l)
    })),
    removePowerbankLogo: (id) => set((state) => {
        const remaining = state.powerbankLogos.filter(l => l.id !== id);
        return {
            powerbankLogos: remaining,
            selectedPowerbankLogoId: state.selectedPowerbankLogoId === id
                ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
                : state.selectedPowerbankLogoId
        };
    }),

    // --- RESET ---
    resetConfigurator: (product) => {
        const target = product ?? get().activeProduct;
        const defaults = getDefaultsForProduct(target);
        set(defaults);
        try { useConfigurator.temporal.getState().clear(); } catch { /* noop */ }
    },
    resetAllConfigurators: () => {
        set(ALL_PRODUCT_DEFAULTS);
        try { useConfigurator.temporal.getState().clear(); } catch { /* noop */ }
    },
}), {
    // zundo: трекаем только конфигурационные поля, не auth/тему/зум/корзину
    partialize: (state) => pickTracked(state),
    limit: 50,
    equality: (a, b) => {
        for (const k of TRACKED_KEYS) {
            if (a[k] !== b[k]) return false;
        }
        return true;
    },
}))
