import { useConfigurator } from '../store';

export const SCREEN_TO_PATH = {
    home: '/',
    print_canvas: '/print-canvas',
    configurator: '/configurator',
    order: '/order',
    dealer: '/dealer',
    client_dashboard: '/dashboard',
    cookie_policy: '/cookie-policy',
    admin_auth: '/borodazaebal',
    admin_stub: '/admin',
    admin_dashboard: '/borodaadmin',
};

export const CONFIGURATOR_PRODUCTS = new Set(['notebook', 'calendar', 'thermos', 'powerbank']);

export const PATH_TO_SCREEN = Object.fromEntries(
    Object.entries(SCREEN_TO_PATH).map(([k, v]) => [v, k])
);

export const TAB_TO_PATH = {
    catalog: '/dashboard/catalog',
    cart: '/dashboard/cart',
    orders: '/dashboard/orders',
};

export const PATH_TO_TAB = {
    '/dashboard/catalog': 'catalog',
    '/dashboard/cart': 'cart',
    '/dashboard/orders': 'orders',
};

export const DEALER_TAB_TO_PATH = {
    products: '/dealer/products',
    orders: '/dealer/orders',
    clients: '/dealer/clients',
    orderTypes: '/dealer/order-types',
};

export const PATH_TO_DEALER_TAB = {
    '/dealer/products': 'products',
    '/dealer/orders': 'orders',
    '/dealer/clients': 'clients',
    '/dealer/order-types': 'orderTypes',
};

export const MANUFACTURER_TAB_TO_PATH = {
    queue: '/manufacturer/queue',
    materials: '/manufacturer/materials',
    history: '/manufacturer/history',
};

export const PATH_TO_MANUFACTURER_TAB = {
    '/manufacturer/queue': 'queue',
    '/manufacturer/materials': 'materials',
    '/manufacturer/history': 'history',
};

const emptyTabs = { clientTab: null, dealerTab: null, manufacturerTab: null };

export function getInitialRouteState(path = window.location.pathname) {
    if (path.startsWith('/order/')) {
        const product = path.split('/').filter(Boolean)[1];
        const activeProduct = CONFIGURATOR_PRODUCTS.has(product) ? product : 'notebook';
        useConfigurator.getState().setProduct(activeProduct);
        return { screen: 'order', ...emptyTabs };
    }
    if (path === '/order') {
        return { screen: 'order', ...emptyTabs };
    }
    if (path.startsWith('/configurator/')) {
        const product = path.split('/').filter(Boolean)[1];
        const activeProduct = CONFIGURATOR_PRODUCTS.has(product) ? product : 'notebook';
        useConfigurator.getState().setProduct(activeProduct);
        return { screen: 'configurator', ...emptyTabs };
    }
    if (path === '/configurator') {
        return { screen: 'configurator', ...emptyTabs };
    }
    if (path.startsWith('/dashboard/')) {
        return { screen: 'client_dashboard', clientTab: PATH_TO_TAB[path] ?? null, dealerTab: null, manufacturerTab: null };
    }
    if (path.startsWith('/dealer/')) {
        return { screen: 'dealer', clientTab: null, dealerTab: PATH_TO_DEALER_TAB[path] ?? null, manufacturerTab: null };
    }
    if (path.startsWith('/manufacturer/')) {
        return { screen: 'manufacturer', clientTab: null, dealerTab: null, manufacturerTab: PATH_TO_MANUFACTURER_TAB[path] ?? null };
    }
    return { screen: PATH_TO_SCREEN[path] ?? 'home', ...emptyTabs };
}

export function getPathForRouteState(screen, activeProduct, clientTab, dealerTab, manufacturerTab) {
    if (screen === 'configurator') {
        const product = CONFIGURATOR_PRODUCTS.has(activeProduct) ? activeProduct : 'notebook';
        return `/configurator/${product}`;
    }
    if (screen === 'order') {
        const product = CONFIGURATOR_PRODUCTS.has(activeProduct) ? activeProduct : 'notebook';
        return `/order/${product}`;
    }
    if (screen === 'client_dashboard') {
        return TAB_TO_PATH[clientTab || 'orders'] || SCREEN_TO_PATH.client_dashboard;
    }
    if (screen === 'dealer') {
        return DEALER_TAB_TO_PATH[dealerTab || 'products'] || SCREEN_TO_PATH.dealer;
    }
    if (screen === 'manufacturer') {
        return MANUFACTURER_TAB_TO_PATH[manufacturerTab || 'queue'] || SCREEN_TO_PATH.manufacturer;
    }
    return SCREEN_TO_PATH[screen];
}
