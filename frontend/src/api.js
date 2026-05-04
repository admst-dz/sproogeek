import axios from 'axios';
import { getCookie, setCookie, deleteCookie, hasCookieConsent } from './utils/cookies';

const AUTH_COOKIE = 'spruzhuk_auth';

// Хранит токен в памяти, когда пользователь отказался от куки
let _memoryToken = null;
export const clearMemoryToken = () => { _memoryToken = null; };

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api/v1',
    headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use((config) => {
    const token = _memoryToken || localStorage.getItem('token') || getCookie(AUTH_COOKIE);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
}, (error) => Promise.reject(error));

// ─── Core API objects ─────────────────────────────────────────────────────────

export const authApi = {
    register: (data) => apiClient.post('/auth/register', data),
    login: (data) => apiClient.post('/auth/login', data),
    me: () => apiClient.get('/auth/me'),
    updateRole: (role, sub_role) => apiClient.patch('/auth/me/role', { role, sub_role }),
};

export const orderApi = {
    createOrder: (orderData) => apiClient.post('/orders/', orderData),
    getAllOrders: (page = 1, size = 100, dealerId = null) => {
        const params = new URLSearchParams({ page, size });
        if (dealerId) params.set('dealer_id', dealerId);
        return apiClient.get(`/orders/all?${params}`);
    },
    getUserOrders: (userId) => apiClient.get(`/orders/user/${userId}`),
    updateStatus: (orderId, status, comment = null) => apiClient.patch(`/orders/${orderId}/status`, { status, comment }),
    updatePrice: (orderId, dealerPrice, dealerComment = null) => apiClient.patch(`/orders/${orderId}/price`, { dealer_price: dealerPrice, dealer_comment: dealerComment }),
};

export const productApi = {
    getAll: () => apiClient.get('/products/'),
    getByDealer: (dealerId) => apiClient.get(`/products/?dealer_id=${dealerId}`),
    create: (data) => apiClient.post('/products/', data),
    update: (id, data) => apiClient.put(`/products/${id}`, data),
    delete: (id) => apiClient.delete(`/products/${id}`),
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export const loginUser = async (email, password) => {
    const { data } = await authApi.login({ email, password });
    if (hasCookieConsent()) {
        localStorage.setItem('token', data.access_token);
        setCookie(AUTH_COOKIE, data.access_token, 30);
    } else {
        _memoryToken = data.access_token;
    }
    return data.user;
};

export const registerUser = async (email, password, displayName, role, subRole) => {
    const { data } = await authApi.register({
        email,
        password,
        display_name: displayName || '',
        role,
        sub_role: subRole || null,
    });
    if (hasCookieConsent()) {
        localStorage.setItem('token', data.access_token);
        setCookie(AUTH_COOKIE, data.access_token, 30);
    } else {
        _memoryToken = data.access_token;
    }
    return data.user;
};

export const updateUserRole = async (role, subRole) => {
    const { data } = await authApi.updateRole(role, subRole || null);
    return data;
};

export const restoreSession = async () => {
    const token = localStorage.getItem('token') || getCookie(AUTH_COOKIE);
    if (!token) return null;
    if (!localStorage.getItem('token')) localStorage.setItem('token', token);
    try {
        const { data } = await authApi.me();
        return data;
    } catch {
        localStorage.removeItem('token');
        deleteCookie(AUTH_COOKIE);
        return null;
    }
};

// ─── Order helpers ────────────────────────────────────────────────────────────

const normalizeOrder = (o) => ({
    id: String(o.id),
    product: o.product_name || '',
    design: o.configuration?.productConfig?.coverColor || '',
    price: o.total_price || 0,
    status: o.status || 'new',
    stageHistory: o.stage_history || [],
    date: o.created_at ? new Date(o.created_at).toLocaleDateString('ru-RU') : '',
    userEmail: o.user_email || '',
    role: o.configuration?.clientType || '',
    createdAt: o.created_at ? { seconds: new Date(o.created_at).getTime() / 1000 } : null,
    quantity: o.quantity || null,
    configuration: o.configuration || null,
});

export const createOrderInDB = async (orderData) => {
    const { data } = await orderApi.createOrder(orderData);
    return String(data?.id || data);
};

export const fetchUserOrders = async (userId) => {
    const { data } = await orderApi.getUserOrders(userId);
    return (data || []).map(normalizeOrder);
};

export const fetchAllOrders = async (dealerId = null) => {
    const { data } = await orderApi.getAllOrders(1, 100, dealerId);
    const list = data?.items || data || [];
    return list.map(normalizeOrder);
};

export const updateOrderStatus = async (orderId, status, comment = null) => {
    return await orderApi.updateStatus(orderId, status, comment);
};

export const updateOrderPrice = async (orderId, dealerPrice, dealerComment = null) => {
    const { data } = await orderApi.updatePrice(orderId, dealerPrice, dealerComment);
    return data;
};

// ─── Product helpers ──────────────────────────────────────────────────────────

export const fetchAllProducts = async () => {
    const { data } = await productApi.getAll();
    return data || [];
};

export const fetchDealerProducts = async (dealerId) => {
    const { data } = await productApi.getByDealer(dealerId);
    return data || [];
};

export const saveProduct = async (productData) => {
    const { data } = await productApi.create(productData);
    return data;
};

export const updateProduct = async (id, productData) => {
    const { data } = await productApi.update(id, productData);
    return data;
};

export const deleteProduct = async (id) => {
    await productApi.delete(id);
};

export default apiClient;
