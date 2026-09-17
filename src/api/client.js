/**
 * API Client — all data goes through the Cloudflare Pages Function / TiDB backend.
 * Supabase has been fully removed. This file is the single source of truth for
 * auth, database queries, and storage — imported everywhere via supabaseClient.js.
 */

// Smart API URL: Relative in production, explicit in local dev/Node.js
// Normalize "/" or quoted/spaced values to "" so media URLs stay same-origin
// (avoids broken "//api/..." protocol-relative hosts).
function resolveApiUrl() {
    if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) return '';
    const raw = (typeof process !== 'undefined' && process.env?.VITE_API_URL)
        ? process.env.VITE_API_URL
        : (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
            ? import.meta.env.VITE_API_URL
            : '');
    const cleaned = String(raw || '').trim().replace(/^['"]|['"]$/g, '').replace(/\/$/, '');
    if (!cleaned || cleaned === '/' || cleaned === '.') return '';
    return cleaned;
}

export const API_URL = resolveApiUrl();

const API_BASE = API_URL;

// ============================================
// Token Management
// Admin and Google customer sessions must NOT share one key —
// Google login was overwriting the admin JWT (403 Admin access required).
// ============================================
const ADMIN_TOKEN_KEY = 'bb_admin_token';
const CUSTOMER_TOKEN_KEY = 'bb_auth_token';

function readStore(key) {
    try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

function writeStore(key, value) {
    try {
        if (typeof localStorage === 'undefined') return;
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch (_) {}
}

function peekTokenType(token) {
    if (!token) return null;
    try {
        return JSON.parse(atob(token.split('.')[1])).type || null;
    } catch {
        return null;
    }
}

function isAdminPath() {
    return typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');
}

// One-time migrate: admin JWT left in the old shared key after Google login rollout
(() => {
    const legacy = readStore(CUSTOMER_TOKEN_KEY);
    if (legacy && peekTokenType(legacy) === 'admin') {
        writeStore(ADMIN_TOKEN_KEY, legacy);
        writeStore(CUSTOMER_TOKEN_KEY, null);
    }
})();

let _adminToken = readStore(ADMIN_TOKEN_KEY);
let _customerToken = readStore(CUSTOMER_TOKEN_KEY);
let _authListeners = [];
let _cachedTokenType = null;

/** Store a JWT in the correct bucket by its `type` claim. */
export function setToken(token) {
    _cachedTokenType = null;
    if (!token) {
        if (isAdminPath()) {
            _adminToken = null;
            writeStore(ADMIN_TOKEN_KEY, null);
        } else {
            _customerToken = null;
            writeStore(CUSTOMER_TOKEN_KEY, null);
        }
        return;
    }
    if (peekTokenType(token) === 'admin') {
        _adminToken = token;
        writeStore(ADMIN_TOKEN_KEY, token);
    } else {
        _customerToken = token;
        writeStore(CUSTOMER_TOKEN_KEY, token);
    }
}

export function clearAdminToken() {
    _adminToken = null;
    _cachedTokenType = null;
    writeStore(ADMIN_TOKEN_KEY, null);
}

export function clearCustomerToken() {
    _customerToken = null;
    _cachedTokenType = null;
    writeStore(CUSTOMER_TOKEN_KEY, null);
}

/** Path-aware: /admin uses admin JWT; storefront uses customer JWT. */
export function getToken() {
    return isAdminPath() ? _adminToken : _customerToken;
}

export function getCustomerToken() {
    return _customerToken;
}

export function getAdminToken() {
    return _adminToken;
}

/**
 * Decode JWT token type (cached). Returns 'admin', 'customer', or null.
 */
function getTokenType() {
    if (_cachedTokenType !== undefined && _cachedTokenType !== null) return _cachedTokenType;
    const token = getToken();
    if (!token) {
        _cachedTokenType = null;
        return null;
    }
    _cachedTokenType = peekTokenType(token);
    return _cachedTokenType;
}

/**
 * Returns true ONLY when the user is actually an admin.
 * Previously, this returned true for ANY token (including customer tokens),
 * which caused all logged-in customers to bypass every cache layer —
 * the root cause of TiDB RU exhaustion.
 */
export function isAdminRequest() {
    // Only treat as admin if on /admin path AND token is actually admin type
    if (isAdminPath()) {
        return getTokenType() === 'admin';
    }
    return false;
}

function headers() {
    const h = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    // Only add cache-busting headers for actual admin requests
    if (isAdminRequest()) {
        h['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        h['Pragma'] = 'no-cache';
        h['Expires'] = '0';
    }
    return h;
}

// In-memory Client Cache & Request Deduplication (prevents parallel identical queries across components)
const _inMemoryCache = new Map();
const _inFlightRequests = new Map();

function getCachedOrFetch(cacheKey, ttlMs, fetchFn) {
    // Admin requests NEVER use cache — always fresh, real-time data
    if (isAdminRequest()) {
        return fetchFn();
    }
    const now = Date.now();
    const cached = _inMemoryCache.get(cacheKey);
    if (cached && (now - cached.time < ttlMs)) {
        return Promise.resolve(cached.data);
    }
    if (_inFlightRequests.has(cacheKey)) {
        return _inFlightRequests.get(cacheKey);
    }
    const promise = fetchFn().then(result => {
        _inFlightRequests.delete(cacheKey);
        if (result && !result.error) {
            _inMemoryCache.set(cacheKey, { data: result, time: Date.now() });
        }
        return result;
    }).catch(err => {
        _inFlightRequests.delete(cacheKey);
        throw err;
    });
    _inFlightRequests.set(cacheKey, promise);
    return promise;
}

export function invalidateClientCache(prefix) {
    if (!prefix) {
        _inMemoryCache.clear();
        return;
    }
    for (const key of _inMemoryCache.keys()) {
        if (key.includes(prefix)) _inMemoryCache.delete(key);
    }
}

// ============================================
// Auth API (replaces bigBazarApi.auth)
// ============================================
export const auth = {
    async signUp({ name, email, mobile, password }) {
        try {
            const res = await fetch(`${API_BASE}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, mobile, password })
            });
            const json = await res.json();
            if (!res.ok) return { data: {}, error: { message: json.error || 'Signup failed' } };
            
            setToken(json.session.access_token);
            _authListeners.forEach(fn => fn('SIGNED_IN', json.session));
            return { data: json, error: null };
        } catch (err) {
            return { data: {}, error: { message: err.message } };
        }
    },

    async signInWithPassword({ email, mobile, password }) {
        try {
            const res = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, mobile, password })
            });
            const json = await res.json();
            if (!res.ok) return { data: {}, error: { message: json.error || 'Login failed' } };
            if (json.step === 2) return { data: json, error: null }; // Admin 2FA — caller handles step 2

            setToken(json.session.access_token);
            _authListeners.forEach(fn => fn('SIGNED_IN', json.session));
            return { data: json, error: null };
        } catch (err) {
            return { data: {}, error: { message: err.message } };
        }
    },

    async getSession() {
        const token = getToken();
        if (!token) return { data: { session: null }, error: null };
        // Admin panel must not treat a Google customer JWT as a dashboard session
        if (isAdminPath() && peekTokenType(token) !== 'admin') {
            return { data: { session: null }, error: null };
        }
        try {
            const res = await fetch(`${API_BASE}/api/auth/session`, { headers: headers() });
            if (!res.ok) {
                if (isAdminPath()) clearAdminToken();
                else clearCustomerToken();
                return { data: { session: null }, error: null };
            }
            const json = await res.json();
            return { data: { session: json.session }, error: null };
        } catch (err) {
            return { data: { session: null }, error: null };
        }
    },

    async signOut() {
        if (isAdminPath()) clearAdminToken();
        else clearCustomerToken();
        _authListeners.forEach(fn => fn('SIGNED_OUT', null));
        return { error: null };
    },

    onAuthStateChange(callback) {
        _authListeners.push(callback);
        // Check initial state
        if (getToken()) {
            auth.getSession().then(({ data }) => {
                if (data.session) callback('SIGNED_IN', data.session);
                else callback('SIGNED_OUT', null);
            });
        }
        return { data: { subscription: { unsubscribe: () => {
            _authListeners = _authListeners.filter(fn => fn !== callback);
        }}}};
    }
};

// ============================================
// Database Query Builder (replaces bigBazarApi.from())
// ============================================
export function from(table) {
    return new QueryBuilder(table);
}

class QueryBuilder {
    constructor(table) {
        this._table = table;
        this._filters = {};
        this._orderCol = null;
        this._orderAsc = false;
        this._rangeFrom = null;
        this._rangeTo = null;
        this._selectFields = '*';
        this._countMode = false;
        this._single = false;
        this._inFilters = {};
        this._orFilter = null;
        this._likeFilters = {};
        this._limitCount = null;
    }

    select(fields = '*', opts = {}) {
        this._selectFields = fields;
        if (opts?.count === 'exact') this._countMode = true;
        return this;
    }

    eq(col, val) { this._filters[col] = val; return this; }
    
    in(col, vals) { this._inFilters[col] = vals; return this; }
    
    or(conditions) { this._orFilter = conditions; return this; }

    order(col, { ascending = false } = {}) {
        this._orderCol = col;
        this._orderAsc = ascending;
        return this;
    }

    range(from, to) {
        this._rangeFrom = from;
        this._rangeTo = to;
        return this;
    }

    limit(count) {
        this._limitCount = count;
        return this;
    }

    page(pageNum) {
        this._page = pageNum;
        return this;
    }

    single() { this._single = true; return this; }

    // Execute SELECT or other queued action
    async then(resolve, _reject) {
        try {
            let result;
            if (this._action === 'update') result = await this._executeUpdate();
            else if (this._action === 'delete') result = await this._executeDelete();
            else if (this._action === 'upsert' || this._action === 'insert') result = await this._executeInsert();
            else result = await this._executeSelect();
            resolve(result);
        } catch (err) {
            resolve({ data: null, error: err, count: 0 });
        }
    }

    async _executeSelect() {
        const params = new URLSearchParams();
        
        // Map table to API endpoint
        const endpoint = this._getEndpoint();
        
        // Apply filters
        for (const [k, v] of Object.entries(this._filters)) {
            params.set(k, v);
        }
        
        // Map specific query patterns
        if (this._table === 'products') {
            if (this._filters.status) params.set('status', this._filters.status);
            if (this._filters.id) params.set('id', this._filters.id);
            // Forward boolean flags as category hints the backend understands
            if (this._filters.is_new) params.set('category', 'New');
            if (this._filters.is_sale) params.set('category', 'Sale');
            if (this._filters.is_exclusive) params.set('category', 'Premium');
            // in() filter for category — send ALL values, not just the first
            if (this._inFilters.category) params.set('category', this._inFilters.category.join(','));
            if (this._inFilters.id) params.set('ids', this._inFilters.id.join(','));
            if (this._orFilter) {
                // Extract search from or filter like "name.ilike.%query%,description.ilike.%query%"
                const nameMatch = this._orFilter.match(/name\.ilike\.%(.+?)%/);
                if (nameMatch) params.set('search', nameMatch[1]);
                // Wedding / category.ilike filters were previously dropped — forward as category
                const catMatch = this._orFilter.match(/category\.ilike\.%(.+?)%/);
                if (catMatch) params.set('category', catMatch[1]);
                // Exclusive-only OR branch (when no category clause)
                if (!catMatch && /is_exclusive\.eq\.true/i.test(this._orFilter)) {
                    params.set('category', 'Premium');
                }
            }
        }
        
        if (this._table === 'subcategory-counts') {
            if (this._filters.category) params.set('category', this._filters.category);
            if (this._inFilters.category) params.set('category', this._inFilters.category.join(','));
        }
        
        if (this._table === 'orders') {
            if (this._orFilter) params.set('search', this._extractSearchFromOr());
        }
        
        if (this._table === 'site_settings') {
            if (this._filters.key) params.set('key', this._filters.key);
        }
        
        if (this._table === 'reviews') {
            if (this._filters.product_id) params.set('product_id', this._filters.product_id);
        }
        
        if (this._orderCol) {
            params.set('order_by', this._orderCol);
            params.set('ascending', String(this._orderAsc));
        }
        
        if (this._limitCount !== null) {
            params.set('limit', this._limitCount);
        }
        
        if (this._rangeFrom !== null) {
            const limit = this._rangeTo - this._rangeFrom + 1;
            const page = Math.floor(this._rangeFrom / limit);
            params.set('page', page);
            params.set('limit', limit);
        } else if (this._page !== null && this._page !== undefined) {
            params.set('page', this._page);
        }

        // For Admin requests: add cache-buster params so no intermediate proxy/CDN caches it
        const isAdmin = isAdminRequest();
        if (isAdmin) {
            params.set('_admin', 'true');
            params.set('_t', String(Date.now()));
        }
        
        const url = `${API_BASE}${endpoint}?${params.toString()}`;

        // Admin requests ALWAYS have 0 cache TTL — accuracy & freshness is essential
        const cacheTtl = isAdmin
            ? 0
            : (this._table === 'site_settings' || this._table === 'subcategory-counts')
                ? 300000
                : (this._table === 'products' || this._table === 'reviews')
                    ? 30000
                    : 0;

        if (cacheTtl > 0) {
            return getCachedOrFetch(url, cacheTtl, async () => {
                const res = await fetch(url, { headers: headers(), cache: 'no-store' });
                const json = await res.json();
                if (!res.ok) return { data: null, error: { message: json.error }, count: 0 };
                let data = json.data;
                const count = json.count || (Array.isArray(data) ? data.length : (data ? 1 : 0));
                if (this._single) data = Array.isArray(data) ? data[0] || null : data;
                return { data, error: null, count };
            });
        }

        const res = await fetch(url, { 
            headers: headers(),
            cache: isAdmin ? 'no-store' : 'default'
        });
        const json = await res.json();
        
        if (!res.ok) return { data: null, error: { message: json.error }, count: 0 };

        let data = json.data;
        const count = json.count || (Array.isArray(data) ? data.length : (data ? 1 : 0));
        
        if (this._single) {
            data = Array.isArray(data) ? data[0] || null : data;
        }
        
        return { data, error: null, count };
    }

    // Lazy action queueing
    insert(records) { this._action = 'insert'; this._records = records; return this; }
    upsert(records) { this._action = 'upsert'; this._records = records; return this; }
    update(values) { this._action = 'update'; this._values = values; return this; }
    delete() { this._action = 'delete'; return this; }

    // Internal Executors
    async _executeInsert() {
        invalidateClientCache();
        try { localStorage.removeItem('bb_site_settings_cache'); } catch (_) {}
        const endpoint = this._getEndpoint();
        const items = Array.isArray(this._records) ? this._records : [this._records];
        const results = [];
        for (const item of items) {
            const res = await fetch(`${API_BASE}${endpoint}`, {
                method: 'POST',
                headers: headers(),
                cache: 'no-store',
                body: JSON.stringify(item)
            });
            const json = await res.json();
            if (!res.ok) return { data: null, error: { message: json.error } };
            results.push(typeof json.data !== 'undefined' ? json.data : json);
        }
        return { data: results.length === 1 ? results[0] : results, error: null };
    }

    async _executeUpdate() {
        invalidateClientCache();
        try { localStorage.removeItem('bb_site_settings_cache'); } catch (_) {}
        const id = this._filters.id;
        if (!id) return { data: null, error: { message: 'No ID filter for update' } };
        const endpoint = this._getEndpoint();
        const res = await fetch(`${API_BASE}${endpoint}/${id}`, {
            method: 'PUT',
            headers: headers(),
            cache: 'no-store',
            body: JSON.stringify(this._values)
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: { message: json.error } };
        return { data: json.data, error: null };
    }

    async _executeDelete() {
        invalidateClientCache();
        try { localStorage.removeItem('bb_site_settings_cache'); } catch (_) {}
        const id = this._filters.id;
        const key = this._filters.key;
        const status = this._filters.status;
        if (!id && !key && !status) return { data: null, error: { message: 'No filter for delete' } };
        const endpoint = this._getEndpoint();
        let url = `${API_BASE}${endpoint}`;
        if (id) url += `/${id}`;
        else if (key) url += `/${key}`;
        else if (status) url += `?status=${status}`;

        const res = await fetch(url, { 
            method: 'DELETE', 
            headers: headers(),
            cache: 'no-store'
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: { message: json.error } };
        return { data: null, error: null };
    }

    _getEndpoint() {
        const map = {
            products: '/api/products',
            'subcategory-counts': '/api/products/subcategory-counts',
            orders: '/api/orders',
            reviews: '/api/reviews',
            site_settings: '/api/settings'
        };
        return map[this._table] || `/api/${this._table}`;
    }

    _extractSearchFromOr() {
        if (!this._orFilter) return '';
        // Extract first ilike pattern
        const match = this._orFilter.match(/\.ilike\.%(.+?)%/);
        return match ? match[1] : '';
    }
}

// ============================================
// Storage API (replaces bigBazarApi.storage)
// ============================================
export const storage = {
    from(_bucket) {
        return {
            async upload(_filePath, file) {
                const formData = new FormData();
                formData.append('file', file);
                const token = getToken();
                if (!token) {
                    return { data: null, error: { message: 'Not signed in as admin. Please log in again on /admin.' } };
                }

                const res = await fetch(`${API_BASE}/api/upload`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                });
                const text = await res.text();
                let json = {};
                try { json = text ? JSON.parse(text) : {}; } catch (_) {
                    return { data: null, error: { message: `Upload failed (${res.status})` } };
                }
                if (!res.ok) return { data: null, error: { message: json.error || 'Transfer failed' } };
                return { data: { path: json.data.path, fullPath: json.data.publicUrl }, error: null };
            },
            getPublicUrl(filePath) {
                // If it's already a full URL, return it
                if (filePath.startsWith('http') || filePath.startsWith('data:') || filePath.startsWith('/')) {
                    return { data: { publicUrl: filePath } };
                }
                // KV uploads use up-* ids served by GET /api/img/:id
                if (String(filePath).startsWith('up-')) {
                    return { data: { publicUrl: `${API_BASE}/api/img/${filePath}` } };
                }
                return { data: { publicUrl: `${API_BASE}/api/img/${filePath}` } };
            }
        };
    }
};

// ============================================
// Single export — all traffic goes through the Cloudflare / TiDB backend
// ============================================
export const bigBazarApi = { auth, from, storage };

export default bigBazarApi;
