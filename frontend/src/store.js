import { create } from 'zustand'
import { temporal } from 'zundo'
import { getCookie, setCookie, deleteCookie, hasCookieConsent } from './utils/cookies'
import { canvasToDataURL, normalizeImageFile } from './utils/images'

const CART_COOKIE = 'spruzhuk_cart';
const AUTH_COOKIE = 'spruzhuk_auth';
export const THEME_SWITCHING_ENABLED = false;

const _makeCartId = () => (
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `cart_${Date.now()}_${Math.random().toString(36).slice(2)}`
);

// Важно: id/quantity ставим в конце, чтобы spread рассыпки `item` не затирал
// сгенерированный id значением `undefined` из исходного объекта (это уже
// один раз сломало удаление по id — все айтемы получали id=undefined).
const _decorateCartEntry = (item) => {
    const { id, quantity, ...rest } = item;
    return {
        ...rest,
        id: id || _makeCartId(),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    };
};

// Cookie может хранить либо новый формат (массив объектов), либо старый
// (один объект с productName на верхнем уровне). Поддерживаем обе схемы,
// чтобы клиенты с уже сохранённой корзиной не потеряли её при обновлении.
const _initialCartItems = (() => {
    try {
        const raw = getCookie(CART_COOKIE);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(_decorateCartEntry);
        if (parsed && typeof parsed === 'object') return [_decorateCartEntry(parsed)];
        return [];
    } catch {
        return [];
    }
})();

const _persistCart = (items) => {
    try {
        if (!hasCookieConsent()) return;
        if (!items || items.length === 0) {
            deleteCookie(CART_COOKIE);
            return;
        }
        setCookie(CART_COOKIE, JSON.stringify(items), 7);
    } catch {
        /* noop */
    }
};

let _webglCanvas = null
export const registerWebGLCanvas = (el) => { _webglCanvas = el }
export const captureRender = (options) => {
    if (!_webglCanvas) return null
    try { return canvasToDataURL(_webglCanvas, options) } catch { return null }
}

export const NOTEBOOK_BINDING_CAPABILITIES = {
    hard: { hasCoverColor: true, hasInnerCoverColor: false, hasCorners: true, hasElastic: false, hasSpiralColor: false, hasStitch: false, hasStitchColor: false },
    soft: { hasCoverColor: true, hasInnerCoverColor: false, hasCorners: true, hasElastic: false, hasSpiralColor: false, hasStitch: false, hasStitchColor: false },
    spiral: { hasCoverColor: true, hasInnerCoverColor: true, hasCorners: false, hasElastic: true, hasSpiralColor: true, hasStitch: true, hasStitchColor: true },
};

export const getNotebookBindingCapabilities = (bindingType) => (
    NOTEBOOK_BINDING_CAPABILITIES[bindingType] ?? NOTEBOOK_BINDING_CAPABILITIES.hard
);

// Поля, которые откатываются по Undo/Redo и сравниваются с defaults для "грязного" состояния.
// Сюда НЕ попадают auth/UI-state/корзина/тема/zoom — они не должны влиять на историю конструктора.
export const NOTEBOOK_DEFAULTS = {
    bindingType: 'hard',
    format: 'A5',
    paperPattern: 'blank',
    coverColor: '#D2B48C',
    innerCoverColor: '#D2B48C',
    stitchColor: '#ffffff',
    hasElastic: false,
    elasticColor: '#1a1a1a',
    spiralColor: '#1a1a1a',
    hasCorners: true,
    logos: [],
    selectedLogoId: null,
    blockPages: [],
    paperType: 'offset_100',
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

const makeLogoId = () => (
    typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const THERMOS_LOGO_START_POSITIONS = {
    body: [[0, 0], [0.08, 0.46], [-0.08, -0.46], [0.16, -0.92], [-0.16, 0.92]],
    capTop: [[0, 0], [0.16, 0.16], [-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16]],
    capSide: [[0, 0], [0.08, 0.28], [-0.08, -0.28], [0.16, -0.42], [-0.16, 0.42]],
};

const getThermosLogoStartPosition = (logos, target) => {
    const sameTargetCount = logos.filter((logo) => (logo.target ?? 'body') === target).length;
    const positions = THERMOS_LOGO_START_POSITIONS[target] ?? THERMOS_LOGO_START_POSITIONS.body;
    return positions[sameTargetCount % positions.length];
};

export const useConfigurator = create(temporal((set, get) => ({
    activeProduct: 'notebook', // 'notebook' | 'calendar' | 'thermos' | 'powerbank'
    applyRenderConfig: (config) => set((state) => ({
        ...state,
        ...config,
        innerCoverColor: config.innerCoverColor ?? config.coverColor ?? state.innerCoverColor,
    })),

    // --- Параметры 3D модели ---
    bindingType: 'hard',
    format: 'A5',
    isNotebookOpen: false,
    paperPattern: 'blank',
    coverColor: '#D2B48C',
    innerCoverColor: '#D2B48C',
    stitchColor: '#ffffff',
    hasElastic: false,
    elasticColor: '#1a1a1a',
    spiralColor: '#1a1a1a',
    logos: [],
    selectedLogoId: null,
    zoomLevel: 1,
    blockPages: [],
    paperType: 'offset_100',

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

    cartItems: _initialCartItems,
    cartRestoredFromCookie: _initialCartItems.length > 0,
    editingCartId: null,
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
        import('./api').then(({ clearMemoryToken }) => clearMemoryToken()).catch(() => {});
        set({ currentUser: null, userRole: null, clientSubRole: 'PL', cartItems: [], cartRestoredFromCookie: false, editingCartId: null });
    },

    setLanguage: (lang) => set({ language: lang }),
    toggleTheme: () => set((state) => {
        if (!THEME_SWITCHING_ENABLED) {
            document.documentElement.classList.add('dark');
            return { theme: 'dark' };
        }
        const newTheme = state.theme === 'light' ? 'dark' : 'light';
        if (newTheme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return { theme: newTheme };
    }),

    // Корзина — массив энтри. Каждый вызов конфигуратора добавляет новый
    // дизайн. Если редактируется существующий (editingCartId), он
    // обновляется по месту, чтобы UX правки не плодил дубли.
    addToCart: (itemData) => set((state) => {
        const editingId = state.editingCartId;
        const targetId = editingId || itemData.id || _makeCartId();
        const decorated = _decorateCartEntry({
            ...itemData,
            id: targetId,
            createdAt: itemData.createdAt || Date.now(),
        });
        let nextItems;
        if (editingId && state.cartItems.some(i => i.id === editingId)) {
            nextItems = state.cartItems.map(i => i.id === editingId ? decorated : i);
        } else {
            nextItems = [...state.cartItems, decorated];
        }
        _persistCart(nextItems);
        return {
            cartItems: nextItems,
            cartRestoredFromCookie: false,
            editingCartId: null,
        };
    }),
    removeFromCart: (id) => set((state) => {
        if (!id) return state;
        const nextItems = state.cartItems.filter(i => i.id !== id);
        _persistCart(nextItems);
        return {
            cartItems: nextItems,
            cartRestoredFromCookie: false,
            editingCartId: state.editingCartId === id ? null : state.editingCartId,
        };
    }),
    updateCartItem: (id, patch) => set((state) => {
        const nextItems = state.cartItems.map(i => (
            i.id === id ? _decorateCartEntry({ ...i, ...patch }) : i
        ));
        _persistCart(nextItems);
        return { cartItems: nextItems };
    }),
    clearCart: () => {
        _persistCart([]);
        deleteCookie(CART_COOKIE);
        set({ cartItems: [], cartRestoredFromCookie: false, editingCartId: null });
    },
    startEditingCartItem: (id) => set((state) => {
        const item = state.cartItems.find(i => i.id === id);
        if (!item) return state;
        // Грузим конфиг товара в активные поля конструктора — applyRenderConfig
        // мёрджит верхнеуровневые ключи; activeProduct/colors/logos сами лягут.
        const { id: _id, createdAt: _ca, ...rest } = item;
        return {
            ...state,
            ...rest,
            innerCoverColor: rest.innerCoverColor ?? rest.coverColor ?? state.innerCoverColor,
            editingCartId: id,
        };
    }),
    cancelEditingCartItem: () => set({ editingCartId: null }),
    setRenderSnapshot: (url) => set({ renderSnapshot: url }),

    setProduct: (type) => set({ activeProduct: normalizeProduct(type) }),
    setBindingType: (type) => set((state) => {
        const currentCaps = getNotebookBindingCapabilities(state.bindingType);
        const nextCaps = getNotebookBindingCapabilities(type);
        return {
            bindingType: type,
            hasElastic: nextCaps.hasElastic ? (currentCaps.hasElastic ? state.hasElastic : true) : false,
            hasCorners: nextCaps.hasCorners ? state.hasCorners : false,
        };
    }),
    setFormat: (fmt) => set({ format: fmt }),
    setColor: (part, color) => set((state) => {
        if (part === 'thermosBody') {
            return { ...state, thermosBodyColor: color, thermosCapColor: color };
        }
        if (part === 'cover' && !getNotebookBindingCapabilities(state.bindingType).hasInnerCoverColor) {
            return { ...state, coverColor: color, innerCoverColor: color };
        }
        return { ...state, [`${part}Color`]: color };
    }),
    setHasElastic: (has) => set((state) => ({
        hasElastic: getNotebookBindingCapabilities(state.bindingType).hasElastic && has,
    })),
    setNotebookOpen: (isOpen) => set({ isNotebookOpen: isOpen }),
    setPaperPattern: (pattern) => set({ paperPattern: pattern, isNotebookOpen: true }),
    setPaperType: (type) => set({ paperType: type }),
    addBlockPage: (templateId) => set((state) => ({
        blockPages: [...state.blockPages, Number(templateId)],
        isNotebookOpen: true,
    })),
    removeBlockPageAt: (index) => set((state) => ({
        blockPages: state.blockPages.filter((_, i) => i !== index),
    })),
    moveBlockPage: (fromIndex, toIndex) => set((state) => {
        const next = state.blockPages.slice();
        if (fromIndex < 0 || fromIndex >= next.length) return state;
        const [item] = next.splice(fromIndex, 1);
        const target = Math.max(0, Math.min(next.length, toIndex));
        next.splice(target, 0, item);
        return { blockPages: next };
    }),
    clearBlockPages: () => set({ blockPages: [] }),
    addLogo: async (file, side = 'front') => {
        if (file instanceof File) {
            const id = makeLogoId();
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
            const id = makeLogoId();
            const scale = target === 'body' ? 0.6 : 0.32;
            try {
                const texture = await normalizeImageFile(file);
                set((state) => ({
                    thermosLogos: [...state.thermosLogos, { id, target, texture, filename: file.name, position: getThermosLogoStartPosition(state.thermosLogos, target), rotation: 0, scale }],
                    selectedThermosLogoId: id
                }));
            } catch (error) {
                console.error('Failed to prepare thermos logo image', error);
            }
        }
    },
    addGeneratedThermosLogo: (texture, filename = 'AI дизайн.png', target = 'body') => {
        if (!texture) return;
        const id = makeLogoId();
        const isBodyWrap = target === 'body';
        const scale = isBodyWrap ? 1 : 0.38;
        set((state) => ({
            thermosLogos: [...state.thermosLogos, { id, target, texture, filename, position: getThermosLogoStartPosition(state.thermosLogos, target), rotation: 0, scale, mode: isBodyWrap ? 'wrap' : 'decal' }],
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
            const id = makeLogoId();
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
