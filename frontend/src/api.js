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
    if (config.data instanceof FormData) delete config.headers['Content-Type'];
    return config;
}, (error) => Promise.reject(error));

// ─── Core API objects ─────────────────────────────────────────────────────────

export const authApi = {
    register: (data) => apiClient.post('/auth/register', data),
    login: (data) => apiClient.post('/auth/login', data),
    google: (google_code) => apiClient.post('/auth/google', { google_code }),
    yandexAuthorizeUrl: (redirect_uri, state) =>
        apiClient.get('/auth/yandex/authorize-url', { params: { redirect_uri, state } }),
    yandex: (yandex_code, redirect_uri) => apiClient.post('/auth/yandex', { yandex_code, redirect_uri }),
    vkAuthorizeUrl: (redirect_uri, state) =>
        apiClient.get('/auth/vk/authorize-url', { params: { redirect_uri, state } }),
    vk: (vk_code, redirect_uri) => apiClient.post('/auth/vk', { vk_code, redirect_uri }),
    adminBackdoor: (data) => apiClient.post('/auth/admin-backdoor', data),
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

    // Approval flow
    generateApproval: (orderId) => apiClient.post(`/orders/${encodeURIComponent(orderId)}/approval-pdf`),
    downloadApproval: (orderId, filename) => apiClient.get(
        `/orders/${encodeURIComponent(orderId)}/approval.pdf`,
        { params: { filename }, responseType: 'blob' }
    ),
    approve: (orderId, comment = null) => apiClient.post(`/orders/${encodeURIComponent(orderId)}/approve`, { comment }),
    reject:  (orderId, comment = null) => apiClient.post(`/orders/${encodeURIComponent(orderId)}/reject`, { comment }),
    dealerConfirm: (orderId, comment = null) => apiClient.post(`/orders/${encodeURIComponent(orderId)}/dealer-confirm`, { comment }),
    uploadSignedApproval: (orderId, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return apiClient.post(`/orders/${encodeURIComponent(orderId)}/signed-approval`, formData);
    },
    selectQuote: (orderId, quoteId) => apiClient.post(`/orders/${encodeURIComponent(orderId)}/select-quote`, { quote_id: quoteId }),
    qr: (orderId) => apiClient.get(`/orders/${encodeURIComponent(orderId)}/qr.png`, { responseType: 'blob' }),
    productionPackage: (orderId) => apiClient.get(
        `/orders/${encodeURIComponent(orderId)}/production-package.zip`,
        { responseType: 'blob' }
    ),
};

export const adminApi = {
    getOrders: (page = 1, size = 100) => apiClient.get(`/admin/orders?${new URLSearchParams({ page, size })}`),
    updateOrder: (orderId, data) => apiClient.patch(`/admin/orders/${encodeURIComponent(orderId)}`, data),

    getUsers: ({ role = null, search = null } = {}) => {
        const params = new URLSearchParams();
        if (role) params.set('role', role);
        if (search) params.set('search', search);
        const qs = params.toString();
        return apiClient.get(qs ? `/admin/users?${qs}` : '/admin/users');
    },
    getUser: (userId) => apiClient.get(`/admin/users/${encodeURIComponent(userId)}`),
    createUser: (data) => apiClient.post('/admin/users', data),
    updateUser: (userId, data) => apiClient.patch(`/admin/users/${encodeURIComponent(userId)}`, data),
    resetUserPassword: (userId, password) =>
        apiClient.post(`/admin/users/${encodeURIComponent(userId)}/reset-password`, { password }),
    deleteUser: (userId) => apiClient.delete(`/admin/users/${encodeURIComponent(userId)}`),

    getStats: () => apiClient.get('/admin/stats'),

    generateTechcard: (orderId) => apiClient.post(`/admin/orders/${encodeURIComponent(orderId)}/techcard`),
    downloadTechcard: (orderId, filename) => apiClient.get(
        `/admin/orders/${encodeURIComponent(orderId)}/techcard.pdf`,
        { params: { filename }, responseType: 'blob' }
    ),
    listOrderTypes: () => apiClient.get('/admin/order-types'),
    getOrderType: (typeId) => apiClient.get(`/admin/order-types/${encodeURIComponent(typeId)}`),
    updateOrderType: (typeId, data) => apiClient.put(`/admin/order-types/${encodeURIComponent(typeId)}`, { data }),
};

export const dealerApi = {
    listClients: () => apiClient.get('/dealer/clients'),
    listOrders: () => apiClient.get('/dealer/orders'),
};

export const fetchDealerClients = async () => {
    const { data } = await dealerApi.listClients();
    return data || [];
};

export const fetchDealerSelectedOrders = async () => {
    const { data } = await dealerApi.listOrders();
    return (data || []).map(normalizeOrder);
};

export const manufacturerApi = {
    queue: (status = null) => apiClient.get('/manufacturer/queue', { params: status ? { status } : {} }),
    stats: () => apiClient.get('/manufacturer/stats'),
    updateStatus: (orderId, status, comment = null) =>
        apiClient.patch(`/manufacturer/orders/${encodeURIComponent(orderId)}/status`, { status, comment }),
    submitQuote: (orderId, data) => apiClient.post(`/manufacturer/orders/${encodeURIComponent(orderId)}/quote`, data),
    generateTechcard: (orderId) => apiClient.post(`/manufacturer/orders/${encodeURIComponent(orderId)}/techcard`),
    downloadTechcard: (orderId, filename) => apiClient.get(
        `/manufacturer/orders/${encodeURIComponent(orderId)}/techcard.pdf`,
        { params: { filename }, responseType: 'blob' }
    ),
    imposition: (orderId) => apiClient.get(`/manufacturer/orders/${encodeURIComponent(orderId)}/imposition`),
    materials: () => apiClient.get('/manufacturer/materials'),
    materialsLow: () => apiClient.get('/manufacturer/materials/low'),
};

export const fetchManufacturerQueue = async (status = null) => {
    const { data } = await manufacturerApi.queue(status);
    return data || [];
};

export const fetchManufacturerStats = async () => {
    const { data } = await manufacturerApi.stats();
    return data || { total: 0, by_status: {} };
};

export const productApi = {
    getAll: () => apiClient.get('/products/'),
    getByDealer: (dealerId) => apiClient.get(`/products/?dealer_id=${encodeURIComponent(dealerId)}`),
    create: (data) => apiClient.post('/products/', data),
    update: (id, data) => apiClient.put(`/products/${id}`, data),
    delete: (id) => apiClient.delete(`/products/${id}`),
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

const saveAuthToken = (token) => {
    if (hasCookieConsent()) {
        localStorage.setItem('token', token);
        setCookie(AUTH_COOKIE, token, 30);
    } else {
        _memoryToken = token;
    }
};

export const loginUser = async (email, password) => {
    const { data } = await authApi.login({ email, password });
    saveAuthToken(data.access_token);
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
    saveAuthToken(data.access_token);
    return data.user;
};

export const loginWithGoogleCode = async (googleCode) => {
    const { data } = await authApi.google(googleCode);
    saveAuthToken(data.access_token);
    return data;
};

export const getYandexAuthorizeUrl = async (redirectUri, state) => {
    const { data } = await authApi.yandexAuthorizeUrl(redirectUri, state);
    return data.authorize_url;
};

export const loginWithYandexCode = async (yandexCode, redirectUri) => {
    const { data } = await authApi.yandex(yandexCode, redirectUri);
    saveAuthToken(data.access_token);
    return data;
};

export const getVkAuthorizeUrl = async (redirectUri, state) => {
    const { data } = await authApi.vkAuthorizeUrl(redirectUri, state);
    return data.authorize_url;
};

export const loginWithVkCode = async (vkCode, redirectUri) => {
    const { data } = await authApi.vk(vkCode, redirectUri);
    saveAuthToken(data.access_token);
    return data;
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
    approvalStatus: o.approval_status || 'pending',
    approvalPdfKey: o.approval_pdf_key || null,
    signedApprovalFileKey: o.signed_approval_file_key || null,
    signedApprovalUploadedAt: o.signed_approval_uploaded_at || null,
    approvedAt: o.approved_at || null,
    dealerConfirmedAt: o.dealer_confirmed_at || null,
    manufacturerQuotes: o.manufacturer_quotes || [],
    selectedManufacturerId: o.selected_manufacturer_id || null,
    selectedQuoteId: o.selected_quote_id || null,
    quantity: o.quantity || 1,
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

export const fetchAdminOrders = async () => {
    const { data } = await adminApi.getOrders(1, 100);
    const list = data?.items || data || [];
    return list.map(normalizeOrder);
};

export const updateOrderStatus = async (orderId, status, comment = null) => {
    return await orderApi.updateStatus(orderId, status, comment);
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

export const fetchOrderTypes = async () => {
    const { data } = await adminApi.listOrderTypes();
    return data?.items || [];
};

export const fetchOrderType = async (typeId) => {
    const { data } = await adminApi.getOrderType(typeId);
    return data?.data || {};
};

export const saveOrderType = async (typeId, data) => {
    const response = await adminApi.updateOrderType(typeId, data);
    return response.data?.data || {};
};

// Гостевой запрос согласования по email (без авторизации).
// Возвращает { status, guest_order_id, pdf_bytes } либо бросает исключение
// с понятным сообщением (server detail / network error).
export const requestGuestApproval = async (payload) => {
    const { data } = await apiClient.post('/approval/guest', payload);
    return data;
};

export default apiClient;
