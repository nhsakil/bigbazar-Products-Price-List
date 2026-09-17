import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getDb } from './db.js';
import { jwtSign, jwtVerify } from './jwt-workers.js';
import bcrypt from 'bcryptjs';
import { FAQ_KB, DELIVERY_AREAS, normalizeQuery, matchFAQ, detectLanguage } from './assistant-kb.js';
import {
  isDirectOrderIntent,
  extractOrderQuantity,
  extractOrderKeywords,
  mapProductRow,
  detectCategoryMatch,
  hasProductCatalogSearchIntent,
  resolveFaqReply,
  getCatalogReplyText,
  getSmartFallbackReply,
  buildProductSearch,
  defaultQuickReplies
} from './assistant-query.js';
import { getVapidConfig, sendWebPushBatch } from './webPush.js';

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Simple in-memory store for rate limiting (at Edge level per isolate)
const rateLimitStore = new Map();
let lastCleanup = Date.now();

const checkRateLimit = (ip, endpoint, limit, windowMs) => {
  const now = Date.now();
  if (now - lastCleanup > 300000) {
    for (const [k, v] of rateLimitStore.entries()) {
      if (now > v.resetTime) rateLimitStore.delete(k);
    }
    lastCleanup = now;
  }

  const key = `${ip}:${endpoint}`;
  const record = rateLimitStore.get(key);

  if (!record) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count += 1;
  return true;
};

// ── Part 4: Cloudflare KV Cache & Rate-Limit Helpers ──
async function kvGet(c, key) {
  try {
    const kv = c.env?.BIGBAZAR_CACHE;
    if (!kv) return null;
    const val = await kv.get(key, { type: 'json' });
    return val;
  } catch (_) {
    return null;
  }
}

async function kvSet(c, key, value, ttlSeconds = 86400) {
  try {
    const kv = c.env?.BIGBAZAR_CACHE;
    if (!kv) return;
    await kv.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSeconds) });
  } catch (_) {}
}

async function kvDelete(c, key) {
  try {
    const kv = c.env?.BIGBAZAR_CACHE;
    if (!kv) return;
    await kv.delete(key);
  } catch (_) {}
}

// In-isolate memory cache for catalog_version so version read takes 0ms
let _memCatalogVersion = '1';
let _memVersionFetchedAt = 0;

async function getCatalogVersion(c) {
  const now = Date.now();
  if (_memCatalogVersion && (now - _memVersionFetchedAt < 15000)) {
    return _memCatalogVersion;
  }
  try {
    const kv = c.env?.BIGBAZAR_CACHE;
    if (!kv) return _memCatalogVersion || '1';
    const ver = await kv.get('catalog_version');
    if (ver) {
      _memCatalogVersion = ver;
      _memVersionFetchedAt = now;
    }
  } catch (_) {}
  return _memCatalogVersion || '1';
}

async function bumpCatalogVersion(c) {
  const newVer = Date.now().toString();
  _memCatalogVersion = newVer;
  _memVersionFetchedAt = Date.now();
  try {
    const kv = c.env?.BIGBAZAR_CACHE;
    if (kv) {
      await kv.put('catalog_version', newVer);
    }
  } catch (_) {}
  return newVer;
}

// Background task execution helper (Cloudflare waitUntil or reliable async fallback)
async function runInBackground(c, promiseFn) {
  const waitFn = (c.executionCtx && typeof c.executionCtx.waitUntil === 'function')
    ? c.executionCtx.waitUntil.bind(c.executionCtx)
    : (c.env?.eventContext && typeof c.env.eventContext.waitUntil === 'function')
      ? c.env.eventContext.waitUntil.bind(c.env.eventContext)
      : null;

  if (waitFn) {
    try {
      waitFn(Promise.resolve().then(promiseFn).catch(err => console.error('BG err:', err)));
      return;
    } catch (_) {}
  }
  // Safe fallback: execute directly so cache write is never lost
  try {
    await promiseFn();
  } catch (_) {}
}

async function checkRateLimitKV(c, endpoint, limit = 10, windowMs = 60000) {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  const kv = c.env?.BIGBAZAR_CACHE;
  if (!kv) {
    return checkRateLimit(ip, endpoint, limit, windowMs);
  }
  try {
    const key = `rl:${ip}:${endpoint}`;
    const current = await kv.get(key);
    const count = current ? parseInt(current) : 0;
    if (count >= limit) return false;
    await kv.put(key, String(count + 1), { expirationTtl: Math.ceil(windowMs / 1000) });
    return true;
  } catch (_) {
    return checkRateLimit(ip, endpoint, limit, windowMs);
  }
}

// Cloudflare Serverless API
const app = new Hono().basePath('/api');

// Global Error Handler for Debugging
app.onError((err, c) => {
  // Log details server-side only
  console.error(err);
  console.error('Environment check:', {
    has_db_host: !!c.env.DB_HOST,
    has_db_user: !!c.env.DB_USER,
    has_db_pass: !!c.env.DB_PASSWORD,
    has_db_name: !!c.env.DB_NAME,
    has_db_port: !!c.env.DB_PORT,
    has_jwt: !!c.env.JWT_SECRET
  });

  return c.json({ 
    error: 'Internal Server Error'
  }, 500);
});

/**
 * Logic previously using local getConn now uses import { getDb } from './db.js'
 */

// ============================================
// ============================================
// Auth Logic
// ============================================

// ============================================
// Middleware
// ============================================
app.use('*', async (c, next) => {
  const origin = c.req.header('origin');
  // Exact localhost / 127.0.0.1 only — never substring match (blocks evil-localhost.com)
  let isLocalhost = false;
  try {
    if (origin) {
      const host = new URL(origin).hostname;
      isLocalhost = host === 'localhost' || host === '127.0.0.1';
    }
  } catch (_) {}

  const extraOrigins = String(c.env?.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const publicOrigin = String(c.env?.PUBLIC_SITE_ORIGIN || '').trim().replace(/\/$/, '');
  if (publicOrigin) extraOrigins.push(publicOrigin);

  const isCustomOrigin = origin && extraOrigins.some((allowed) => {
    try {
      return origin === allowed || origin === new URL(allowed).origin;
    } catch {
      return origin === allowed;
    }
  });

  const isAllowed = !origin ||
                   isLocalhost ||
                   isCustomOrigin ||
                   origin === 'https://bigbazarbariarhat.pages.dev' ||
                   origin.endsWith('.bigbazarbariarhat.pages.dev') ||
                   origin === 'https://bigbazarbaraiyarhat.pages.dev' ||
                   origin.endsWith('.bigbazarbaraiyarhat.pages.dev');

  if (isAllowed) {
    return cors({
      origin: origin || '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })(c, next);
  }
  await next();
});

// Auth Middleware
const getJwtSecret = (c) => {
  const secret = c.env?.JWT_SECRET || (typeof process !== 'undefined' && process.env?.JWT_SECRET);
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is missing.');
  }
  return secret;
};

const requireAuth = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'No token provided' }, 401);
  try {
    const secret = getJwtSecret(c);
    c.set('user', await jwtVerify(token, secret));
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

const requireAdmin = async (c, next) => {
  const user = c.get('user');
  if (!user || user.type !== 'admin') {
    return c.json({ error: 'Unauthorized: Admin access required' }, 403);
  }
  await next();
};

/**
 * Check if request originates from Admin panel or explicitly requests fresh data
 */
const isAdminOrNoCache = async (c) => {
  const authHeader = c.req.header('Authorization');
  const cacheCtrl = c.req.header('Cache-Control');
  const { _admin, _t } = c.req.query();
  // Only bypass cache if the token is actually an admin token (not customer)
  let isAdminAuth = false;
  if (authHeader) {
    try {
      const token = authHeader.replace('Bearer ', '');
      const decoded = await jwtVerify(token, getJwtSecret(c));
      isAdminAuth = decoded.type === 'admin';
    } catch (_) {}
  }
  return !!(
    isAdminAuth || 
    _admin === 'true' || 
    _t || 
    (cacheCtrl && (cacheCtrl.includes('no-cache') || cacheCtrl.includes('no-store')))
  );
};

/**
 * Check if the request is authenticated with a valid Admin JWT.
 * Used for authorization decisions (e.g. viewing draft/deleted products),
 * separate from cache-busting decisions.
 */
const isAdminUser = async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) return false;
  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = await jwtVerify(token, getJwtSecret(c));
    return decoded && decoded.type === 'admin';
  } catch (_) {
    return false;
  }
};

/**
 * Customer auth middleware — verifies JWT with type='customer'.
 * Attaches user info to context but does NOT require admin role.
 */
const requireCustomerAuth = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Authentication required' }, 401);
  try {
    const secret = getJwtSecret(c);
    const decoded = await jwtVerify(token, secret);
    if (decoded.type !== 'customer') return c.json({ error: 'Customer auth required' }, 403);
    c.set('customer', decoded);
    await next();
  } catch (err) {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
};

/**
 * Optional customer auth — attaches user info if present, but doesn't block.
 * Used on routes like POST /orders where login is optional.
 */
const optionalCustomerAuth = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    try {
      const secret = getJwtSecret(c);
      const decoded = await jwtVerify(token, secret);
      if (decoded.type === 'customer') {
        c.set('customer', decoded);
      }
    } catch (_) { /* Ignore invalid tokens for optional auth */ }
  }
  await next();
};

// Health check endpoint
app.get('/health', async (c) => {
  try {
    const conn = getDb(c.env);
    const r = await conn.execute('SELECT 1 as ok');
    return c.json({ status: 'ok', db: !!r[0] });
  } catch (err) {
    return c.json({ status: 'error', message: err.message }, 500);
  }
});

// ============================================
// IMAGE CDN ENDPOINT — zero TiDB queries, instant static asset delivery
// ============================================
app.get('/img/:id', async (c) => {
  const id = c.req.param('id');
  const kv = c.env?.BIGBAZAR_CACHE;

  // 1. Try KV for ANY id (up-* uploads and legacy product-id keys)
  if (kv) {
    try {
      const cached = await kv.get(`img:${id}`, { type: 'arrayBuffer' });
      if (cached) {
        let mimeType = 'image/jpeg';
        try {
          const storedType = await kv.get(`img_type:${id}`);
          if (storedType) mimeType = storedType;
        } catch (_) {}
        return new Response(cached, {
          headers: {
            'Content-Type': mimeType,
            'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
            'CDN-Cache-Control': 'max-age=604800',
            'Cloudflare-CDN-Cache-Control': 'max-age=604800',
          }
        });
      }
    } catch (_) {}
  }

  // 2. Product id → resolve real image_url from DB (Cloudinary / up-* / data URI)
  //    Skip circular self-refs like /api/img/{this-same-id}
  try {
    const conn = getDb(c.env);
    const rows = await conn.execute(
      'SELECT image_url, images FROM products WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows?.[0]) {
      let imgs = [];
      try {
        imgs = typeof rows[0].images === 'string' ? JSON.parse(rows[0].images) : (rows[0].images || []);
      } catch (_) {}
      const candidates = [rows[0].image_url, ...(Array.isArray(imgs) ? imgs : [])].filter(
        (u) => typeof u === 'string' && u.length > 2
      );

      for (const url of candidates) {
        // Ignore circular /api/img/{this id}
        if (url === `/api/img/${id}` || url === `/img/${id}`) continue;
        if (url.startsWith('http://') || url.startsWith('https://')) {
          if (/instagram\.com|instagr\.am/i.test(url)) continue;
          return c.redirect(url, 302);
        }
        if (url.startsWith('/api/img/up-') || url.startsWith('/img/up-')) {
          const upId = url.split('/').pop();
          return c.redirect(`/api/img/${upId}`, 302);
        }
        if (url.startsWith('data:image/')) {
          const m = url.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
          if (m) {
            const binary = Uint8Array.from(atob(m[2]), (ch) => ch.charCodeAt(0));
            return new Response(binary, {
              headers: {
                'Content-Type': m[1],
                'Cache-Control': 'public, max-age=3600',
              }
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('img resolve error:', err?.message || err);
  }

  // 3. Legacy static product JPG (only works for migrated assets)
  return c.redirect(`/img/products/${id}.jpg`, 301);
});

// ============================================
// SETTINGS IMAGE CDN ENDPOINT — zero TiDB queries, instant static asset delivery
// ============================================
app.get('/settings-img/:type/:id', async (c) => {
  const type = c.req.param('type'); // 'subcat' or 'slide'
  const id = decodeURIComponent(c.req.param('id'));

  if (type === 'slide') {
    return c.redirect(`/img/slides/${id}.jpg`, 301);
  }
  if (type === 'subcat') {
    const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '_');
    return c.redirect(`/img/subcats/${safeId}.jpg`, 301);
  }

  return c.json({ error: 'Unknown image type' }, 404);
});

// ============================================
// AUTH ROUTES
// ============================================

app.post('/auth/register', async (c) => {
  if (!(await checkRateLimitKV(c, 'register', 3, 60000))) {
    return c.json({ error: 'Too many registration attempts. Please try again after a minute.' }, 429);
  }

  const { name, email, mobile, password } = await c.req.json();
  if (!mobile || !password) return c.json({ error: 'Mobile and Password are required' }, 400);

  const conn = getDb(c.env);
  const id = crypto.randomUUID();
  const hash = await bcrypt.hash(password, 10);

  try {
    await conn.execute(
      'INSERT INTO customers (id, name, email, mobile, password_hash) VALUES (?, ?, ?, ?, ?)',
      [id, name || null, email || null, mobile, hash]
    );

    const regSecret = getJwtSecret(c);
    const token = await jwtSign({ id, mobile, type: 'customer' }, regSecret, { expiresIn: '30d' });
    return c.json({
      session: { access_token: token, user: { id, name, email, mobile } },
      user: { id, name, email, mobile }
    });
  } catch (err) {
    if (err.message.includes('Duplicate entry')) return c.json({ error: 'Email or Mobile already exists' }, 400);
    return c.json({ error: err.message }, 500);
  }
});

app.post('/auth/login', async (c) => {
  if (!(await checkRateLimitKV(c, 'login', 5, 60000))) {
    return c.json({ error: 'Too many login attempts. Please try again after a minute.' }, 429);
  }

  const { email, mobile, password } = await c.req.json();
  const identifier = email || mobile;
  if (!identifier || !password) return c.json({ error: 'Identifier and Password are required' }, 400);

  const conn = getDb(c.env);
  
  // Resolve JWT secret once — same source used for both sign and verify
  const jwtSecret = getJwtSecret(c);

  // Check Admin
  const adminEmail = (identifier === 'admin' || identifier === 'admin@bigbazar.com') ? 'admin@bigbazar.com' : identifier;
  const admins = await conn.execute('SELECT * FROM admin_users WHERE email = ? OR email = ?', [adminEmail, identifier]);
  if (admins.length > 0) {
    const user = admins[0];
    const cleanInput = password.trim();
    const cleanHash = (user.password_hash || '').trim();

    const valid = await bcrypt.compare(cleanInput, cleanHash);
    if (!valid) return c.json({ error: 'Incorrect password. Please try again.' }, 401);

    const token = await jwtSign(
      { id: user.id, email: user.email, type: 'admin' },
      jwtSecret,
      { expiresIn: '30d' }
    );
    
    return c.json({
      session: { 
        access_token: token, 
        user: { id: user.id, name: 'Admin', email: user.email, type: 'admin' } 
      },
      user: { id: user.id, name: 'Admin', email: user.email, type: 'admin' }
    });
  }

  // Check Customer — guard against missing table (customers table may not be created yet)
  let customers = [];
  try {
    customers = await conn.execute('SELECT * FROM customers WHERE email = ? OR mobile = ?', [identifier, identifier]);
  } catch (dbErr) {
    if (dbErr.message.includes("doesn't exist") || dbErr.message.includes('Table')) {
      return c.json({ error: 'No account found with this email or mobile.' }, 401);
    }
    throw dbErr; // re-throw unexpected DB errors
  }
  if (customers.length === 0) return c.json({ error: 'No account found with this email or mobile.' }, 401);

  const user = customers[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return c.json({ error: 'Incorrect password. Please try again.' }, 401);

  const token = await jwtSign({ id: user.id, mobile: user.mobile, type: 'customer' }, jwtSecret, { expiresIn: '30d' });
  return c.json({
    session: { access_token: token, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile } },
    user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile }
  });
});

app.get('/auth/session', requireAuth, async (c) => {
  const user = c.get('user');
  return c.json({ session: { user, access_token: c.req.header('Authorization')?.replace('Bearer ', '') } });
});

// Stub — 2FA pending codes (feature removed; kept so Admin.jsx doesn't 404)
app.get('/auth/pending-codes', requireAuth, async (c) => {
  return c.json({ codes: [] });
});

// ============================================
// PRODUCT ROUTES
// ============================================

const parseProductRow = (row) => {
  if (!row) return null;
  const tryParse = (val) => {
    try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return []; }
  };
  return {
    ...row,
    images: tryParse(row.images),
    available_sizes: tryParse(row.available_sizes),
    available_colors: tryParse(row.available_colors),
    is_sale: !!row.is_sale,
    is_hot: !!row.is_hot,
    is_new: !!row.is_new,
    is_sold_out: !!row.is_sold_out,
    is_deleted: !!row.is_deleted,
    is_exclusive: !!row.is_exclusive
  };
};

/**
 * Lightweight product row parser for listings — replaces heavy base64
 * image data with CDN URLs. Never invent /api/img/{productId} for missing
 * static JPGs — that 301s to /img/products/{id}.jpg and breaks storefront.
 */
const parseProductRowLite = (row) => {
  if (!row) return null;
  const tryParse = (val) => {
    try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return []; }
  };
  const parsedImages = tryParse(row.images);
  const rawImageUrl = row.image_url;
  // Only product-scoped CDN path when we intentionally map data: blobs → /api/img/:id
  // (GET /img/:id will resolve real Cloudinary/KV/DB bytes). Prefer keeping real remote URLs.
  const cdnUrl = row.id ? `/api/img/${row.id}` : null;

  const isUsableUrl = (u) =>
    typeof u === 'string' &&
    u.length > 0 &&
    !u.startsWith('data:') &&
    !/^https?:\/\/(www\.)?instagram\.com\//i.test(u) &&
    !/^https?:\/\/(www\.)?instagr\.am\//i.test(u);

  let finalImageUrl = null;
  if (isUsableUrl(rawImageUrl)) {
    finalImageUrl = rawImageUrl;
  } else if (rawImageUrl && rawImageUrl.startsWith('data:') && cdnUrl) {
    finalImageUrl = cdnUrl;
  } else if (Array.isArray(parsedImages) && parsedImages.length > 0) {
    const first = parsedImages.find(img => isUsableUrl(img));
    if (first) finalImageUrl = first;
    else if (typeof parsedImages[0] === 'string' && parsedImages[0].startsWith('data:') && cdnUrl) {
      finalImageUrl = cdnUrl;
    }
  }

  const finalImages = Array.isArray(parsedImages) && parsedImages.length > 0
    ? parsedImages
        .map(img => {
          if (isUsableUrl(img)) return img;
          if (typeof img === 'string' && img.startsWith('data:') && cdnUrl) return cdnUrl;
          return null;
        })
        .filter(Boolean)
    : (finalImageUrl ? [finalImageUrl] : []);

  const rawColors = tryParse(row.available_colors);
  const cleanColors = Array.isArray(rawColors) ? rawColors.map(c => {
    if (typeof c === 'object' && c !== null && typeof c.image === 'string' && c.image.startsWith('data:') && cdnUrl) {
      return { ...c, image: cdnUrl };
    }
    return c;
  }) : rawColors;

  return {
    ...row,
    image_url: finalImageUrl || null,
    images: finalImages,
    available_sizes: tryParse(row.available_sizes),
    available_colors: cleanColors,
    is_sale: !!row.is_sale,
    is_hot: !!row.is_hot,
    is_new: !!row.is_new,
    is_sold_out: !!row.is_sold_out,
    is_deleted: !!row.is_deleted,
    is_exclusive: !!row.is_exclusive
  };
};

/**
 * Transforms heavy base64 strings in site_settings into fast CDN URLs.
 * Shrinks /api/settings response payload from 2.6 MB down to 3.5 KB!
 */
function transformSettingsLite(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const clean = { ...settings };
  if (clean.subcategories && typeof clean.subcategories === 'object') {
    const transformed = {};
    for (const [cat, list] of Object.entries(clean.subcategories)) {
      if (Array.isArray(list)) {
        transformed[cat] = list.map(s => {
          if (s && typeof s.image_url === 'string' && s.image_url.startsWith('data:')) {
            return { ...s, image_url: `/api/settings-img/subcat/${encodeURIComponent(s.id)}` };
          }
          return s;
        });
      } else {
        transformed[cat] = list;
      }
    }
    clean.subcategories = transformed;
  }
  if (Array.isArray(clean.main_slides)) {
    clean.main_slides = clean.main_slides.map((slide, idx) => {
      if (slide && typeof slide.image === 'string' && slide.image.startsWith('data:')) {
        return { ...slide, image: `/api/settings-img/slide/${encodeURIComponent(slide.id || idx)}` };
      }
      return slide;
    });
  }
  return clean;
}

/**
 * Event-Driven Cache Priming (Pre-warming):
 * Generates the default home listing & settings in the background
 * immediately when Admin makes any changes, ensuring customers hit 100% cache.
 */
async function prewarmCatalogCache(c) {
  try {
    const conn = getDb(c.env);
    const ver = await getCatalogVersion(c);
    
    // 1. Prewarm default home products (status=published, page 0, limit 12)
    const selectFields = 'id, serial_no, created_at, name, price, original_price, description, category, subcategory, video_url, status, is_sale, is_hot, is_new, is_sold_out, is_deleted, available_sizes, available_colors, stock_count, is_exclusive, images, image_url, platform_id';
    const whereSql = " WHERE status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL)";
    const querySql = `SELECT ${selectFields} FROM products${whereSql} ORDER BY is_hot DESC, created_at DESC LIMIT 12 OFFSET 0`;
    
    const rows = await conn.execute(querySql);
    const countRes = await conn.execute(`SELECT COUNT(*) as total FROM products${whereSql}`);
    const total = countRes[0]?.total || rows.length;
    const defaultProductsData = { data: rows.map(parseProductRowLite), count: total };
    
    const defaultParams = new URLSearchParams();
    defaultParams.set('status', 'published');
    defaultParams.set('page', '0');
    defaultParams.set('limit', '12');
    defaultParams.set('order_by', 'created_at');
    defaultParams.set('ascending', 'false');
    
    await kvSet(c, `cache:${ver}:products:${defaultParams.toString()}`, defaultProductsData, 86400);

    // 2. Prewarm settings (transformed lite)
    const settingsRes = await conn.execute("SELECT `key`, value FROM site_settings WHERE `key` NOT LIKE 'ping:%' AND `key` NOT LIKE 'rl:%' AND `key` NOT LIKE 'site_visitors%'");
    const settings = {};
    settingsRes.forEach(r => {
      try { settings[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch(e) { settings[r.key] = r.value; }
    });
    const liteSettings = transformSettingsLite(settings);
    await kvSet(c, `cache:${ver}:settings`, { data: liteSettings }, 86400);
  } catch (err) {
    console.error('Prewarm background error:', err);
  }
}

// Map of subcategories & exact keywords for resilient searching & counting
const SUB_KEYWORDS_MAP = {
  'panjabi': ['panjabi', 'punjabi', 'পাঞ্জাবি', 'পাঞ্জাবী', 'kabli', 'কাবলি'],
  'panjabi/pajama': ['panjabi', 'punjabi', 'পাঞ্জাবি', 'পাঞ্জাবী', 'kabli', 'কাবলি', 'pajama'],
  'formal shirt': ['formal shirt', 'ফরমাল শার্ট', 'dress shirt'],
  'formal wear': ['formal shirt', 'ফরমাল শার্ট', 'dress shirt'],
  'casual wear': ['polo', 't-shirt', 'tshirt', 't shirt', 'টি-শার্ট', 'পোলো'],
  'jeans/trousers': ['jeans', 'trouser', 'trousers', 'pant', 'pants', 'জিন্স', 'প্যান্ট', 'ট্রাউজার'],
  'sari': ['sari', 'saree', 'শাড়ি', 'শাড়ি', 'jamdani', 'কাটান', 'কাতান'],
  'three-piece': ['three-piece', 'three piece', '3 piece', '3-piece', 'থ্রি-পিস', 'থ্রি পিস', 'salwar'],
  'three-piece/salwar': ['three-piece', 'three piece', '3 piece', '3-piece', 'থ্রি-পিস', 'থ্রি পিস', 'salwar'],
  'borka/abaya/hijab': ['borka', 'abaya', 'hijab', 'বোরকা', 'আবায়া', 'হিজাব', 'khimar'],
  'western': ['western', 'tunic', 'ওয়েস্টার্ন'],
  'frock/dress': ['frock', 'dress', 'ফ্রক', 'ড্রেস'],
  'polo/t-shirt': ['polo', 't-shirt', 'tshirt', 't shirt', 'টি-শার্ট', 'পোলো'],
  'shirt/trouser': ['shirt', 'trouser', 'pant', 'শার্ট', 'ট্রাউজার', 'প্যান্ট'],
  'lehenga/gown': ['lehenga', 'gown', 'লেহেঙ্গা', 'গাউন'],
};

// ── Subcategory Counts Endpoint ──
app.get('/products/subcategory-counts', async (c) => {
  if (!(await checkRateLimitKV(c, 'subcounts', 60, 60000))) {
    return c.json({ error: 'Too many requests' }, 429);
  }
  const isNoCache = await isAdminOrNoCache(c);
  const { category = '' } = c.req.query();
  const ver = await getCatalogVersion(c);
  const cacheKey = `cache:${ver}:subcounts:${category}`;

  if (!isNoCache) {
    const cached = await kvGet(c, cacheKey);
    if (cached) {
      c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      c.header('X-Cache-Status', 'HIT');
      return c.json(cached);
    }
  }

  const conn = getDb(c.env);
  let sql = `SELECT id, name, category, subcategory FROM products
             WHERE status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL)`;
  const params = [];
  if (category && category !== 'All') {
    const maps = {
      'Men': ['Men', 'ছেলেদের'],
      'Women': ['Women', 'মেয়েদের'],
      'Kids (Boys)': ['Kids (Boys)', 'বাচ্চাদের (ছেলে)'],
      'Kids (Girls)': ['Kids (Girls)', 'বাচ্চাদের (মেয়ে)']
    };
    const catList = category.split(',').map(c => c.trim()).filter(Boolean);
    const allCats = new Set();
    catList.forEach(c => {
      const mapped = maps[c];
      if (mapped) mapped.forEach(m => allCats.add(m));
      else allCats.add(c);
    });
    const cats = [...allCats];
    sql += ` AND category IN (${cats.map(() => '?').join(',')})`;
    params.push(...cats);
  }
  const products = await conn.execute(sql, params);
  
  // Calculate counts per subcategory (matching DB subcategory OR name keywords)
  const countsMap = {};
  products.forEach(p => {
    const subCol = p.subcategory ? p.subcategory.trim() : '';
    const nameLower = (p.name || '').toLowerCase();

    if (subCol) {
      countsMap[subCol] = (countsMap[subCol] || 0) + 1;
    }

    // Check keyword map matches
    for (const [subKey, keywords] of Object.entries(SUB_KEYWORDS_MAP)) {
      if (keywords.some(kw => nameLower.includes(kw))) {
        // Map back to standard capitalized subcategory name
        const normKey = subKey.charAt(0).toUpperCase() + subKey.slice(1);
        if (!subCol || subCol.toLowerCase() !== subKey) {
          countsMap[normKey] = (countsMap[normKey] || 0) + 1;
        }
      }
    }
  });

  const res = Object.entries(countsMap).map(([subcategory, count]) => ({ subcategory, count }));
  const responseData = { data: res };
  if (isNoCache) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
  } else {
    runInBackground(c, () => kvSet(c, cacheKey, responseData, 86400));
    c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
    c.header('X-Cache-Status', 'MISS');
  }
  return c.json(responseData);
});

app.get('/products', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  if (!checkRateLimit(ip, 'products', 150, 60000)) {
    return c.json({ error: 'Too many requests' }, 429);
  }

  const isNoCache = await isAdminOrNoCache(c);
  const { status, category, subcategory, search, page = 0, limit = 12, id, ids, order_by = 'created_at', ascending = 'false' } = c.req.query();
  
  const pageNum = Math.max(0, parseInt(page) || 0);
  const limitNum = Math.max(1, Math.min(parseInt(limit) || 12, 100));

  // Sanitize cache key to prevent bot cache-busting
  const safeParams = new URLSearchParams();
  if (status) safeParams.set('status', status);
  if (category) safeParams.set('category', category);
  if (subcategory) safeParams.set('subcategory', subcategory);
  if (search) safeParams.set('search', search);
  safeParams.set('page', String(pageNum));
  safeParams.set('limit', String(limitNum));
  if (id) safeParams.set('id', id);
  if (ids) safeParams.set('ids', ids);
  safeParams.set('order_by', order_by);
  safeParams.set('ascending', ascending);

  const ver = await getCatalogVersion(c);
  const cacheKey = `cache:${ver}:products:${safeParams.toString()}`;

  if (!isNoCache) {
    const cached = await kvGet(c, cacheKey);
    if (cached) {
      c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      c.header('X-Cache-Status', 'HIT');
      return c.json(cached);
    }
  }

  const conn = getDb(c.env);

  try {
    const isAdmin = await isAdminUser(c);

    if (id) {
      // Bug #2 fix: only authenticated admins can view deleted/unpublished products
      const res = isAdmin
        ? await conn.execute('SELECT * FROM products WHERE id = ?', [id])
        : await conn.execute(
            "SELECT * FROM products WHERE id = ? AND status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL)",
            [id]
          );
      const singleData = { data: parseProductRowLite(res[0]) || null, count: res.length };
      if (isNoCache) {
        c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        c.header('Pragma', 'no-cache');
        c.header('Expires', '0');
      } else {
        runInBackground(c, () => kvSet(c, cacheKey, singleData, 86400));
        c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
        c.header('X-Cache-Status', 'MISS');
      }
      return c.json(singleData);
    }

    if (ids) {
      const list = ids.split(',').filter(Boolean);
      if (!list.length) return c.json({ data: [], count: 0 });
      // Bug #2 fix: only authenticated admins can view deleted/unpublished products
      const res = isAdmin
        ? await conn.execute(`SELECT * FROM products WHERE id IN (${list.map(() => '?').join(',')})`, list)
        : await conn.execute(
            `SELECT * FROM products WHERE id IN (${list.map(() => '?').join(',')}) AND status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL)`,
            list
          );
      const listData = { data: res.map(parseProductRowLite), count: res.length };
      if (isNoCache) {
        c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        c.header('Pragma', 'no-cache');
        c.header('Expires', '0');
      } else {
        runInBackground(c, () => kvSet(c, cacheKey, listData, 86400));
        c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
        c.header('X-Cache-Status', 'MISS');
      }
      return c.json(listData);
    }

    // Column selection for listings (parseProductRowLite converts base64 to CDN URLs if any)
    let selectFields = 'id, serial_no, created_at, name, price, original_price, description, category, subcategory, video_url, status, is_sale, is_hot, is_new, is_sold_out, is_deleted, available_sizes, available_colors, stock_count, is_exclusive, images, image_url, platform_id';
    let whereSql = ' WHERE (is_deleted = 0 OR is_deleted IS NULL)';
    const params = [];

    // Public catalog: default to published only. Admins (JWT) may omit status to see drafts.
    if (status) {
      whereSql += ' AND status = ?';
      params.push(status);
    } else if (!isAdmin) {
      whereSql += " AND status = 'published'";
    }
    if (category && category !== 'All') {
      if (category === 'New') {
        whereSql += ' AND is_new = 1';
      } else if (category === 'Sale') {
        whereSql += ' AND is_sale = 1';
      } else if (category === 'Premium') {
        whereSql += ' AND is_exclusive = 1';
      } else {
        const catList = category.split(',').map(c => c.trim()).filter(Boolean);
        const maps = { 
          'Men': ['Men', 'ছেলেদের'], 
          'Women': ['Women', 'মেয়েদের'], 
          'Kids (Boys)': ['Kids (Boys)', 'বাচ্চাদের (ছেলে)'], 
          'Kids (Girls)': ['Kids (Girls)', 'বাচ্চাদের (মেয়ে)'] 
        };
        const allCats = new Set();
        catList.forEach(c => {
          const mapped = maps[c];
          if (mapped) mapped.forEach(m => allCats.add(m));
          else allCats.add(c);
        });
        const cats = [...allCats];
        whereSql += ` AND category IN (${cats.map(() => '?').join(',')})`;
        params.push(...cats);
      }
    }
    if (subcategory) {
      const rawSub = String(subcategory).trim();
      const normalizedSub = rawSub.replace(/-/g, ' ').toLowerCase();
      const keywords = SUB_KEYWORDS_MAP[normalizedSub] || SUB_KEYWORDS_MAP[rawSub.toLowerCase()] || [normalizedSub];

      const conditions = ['subcategory = ?', 'LOWER(subcategory) = ?'];
      params.push(rawSub, normalizedSub);

      keywords.forEach(kw => {
        if (kw.length >= 2) {
          conditions.push('LOWER(name) LIKE ?');
          params.push(`%${kw.toLowerCase()}%`);
        }
      });

      whereSql += ` AND (${conditions.join(' OR ')})`;
    }
    if (search) {
      whereSql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const dir = ascending === 'true' ? 'ASC' : 'DESC';
    const orderCol = order_by === 'created_at' ? 'created_at' : 'serial_no';

    const querySql = `SELECT ${selectFields} FROM products${whereSql} ORDER BY ${orderCol} ${dir} LIMIT ? OFFSET ?`;
    const queryParams = [...params, limitNum, pageNum * limitNum];

    const rows = await conn.execute(querySql, queryParams);

    // Fast count: if on page 0 and rows < limit, count equals rows.length without extra DB roundtrip
    let total = rows.length;
    if (pageNum > 0 || rows.length >= limitNum) {
      try {
        const countRes = await conn.execute(`SELECT COUNT(*) as total FROM products${whereSql}`, params);
        total = countRes[0]?.total || rows.length;
      } catch (_) {
        total = rows.length;
      }
    }

    const resultData = { data: rows.map(parseProductRowLite), count: total };
    if (isNoCache) {
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
    } else {
      runInBackground(c, () => kvSet(c, cacheKey, resultData, 86400));
      c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      c.header('X-Cache-Status', 'MISS');
    }
    return c.json(resultData);
  } catch (err) {
    console.error('Products API Error:', err);
    return c.json({ data: [], count: 0, error: err.message }, 500);
  }
});

app.get('/products/:id', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  if (!checkRateLimit(ip, 'product_details', 100, 60000)) {
    return c.json({ error: 'Too many requests' }, 429);
  }
  const pid = c.req.param('id');
  const isNoCache = await isAdminOrNoCache(c);
  const ver = await getCatalogVersion(c);
  const cacheKey = `cache:${ver}:product:${pid}`;

  if (!isNoCache) {
    const cached = await kvGet(c, cacheKey);
    if (cached) {
      c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      c.header('X-Cache-Status', 'HIT');
      return c.json(cached);
    }
  }

  try {
    const conn = getDb(c.env);
    const isAdmin = await isAdminUser(c);
    // Include images + image_url so storefront can show Cloudinary / KV uploads.
    // parseProductRowLite strips data: blobs to /api/img/:id (resolved by GET /img/:id).
    const detailFields = 'id, serial_no, created_at, name, price, original_price, description, category, subcategory, video_url, status, platform_id, is_sale, is_hot, is_new, is_sold_out, is_deleted, available_sizes, available_colors, stock_count, is_exclusive, images, image_url';
    const res = isAdmin
      ? await conn.execute(`SELECT ${detailFields} FROM products WHERE id = ?`, [pid])
      : await conn.execute(
          `SELECT ${detailFields} FROM products WHERE id = ? AND status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL)`,
          [pid]
        );
    if (!res.length) return c.json({ error: 'Not found' }, 404);
    const parsed = parseProductRowLite(res[0]);
    const resultData = { data: parsed };

    if (isNoCache) {
      c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      c.header('Pragma', 'no-cache');
      c.header('Expires', '0');
    } else {
      runInBackground(c, () => kvSet(c, cacheKey, resultData, 86400));
      c.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
      c.header('X-Cache-Status', 'MISS');
    }
    return c.json(resultData);
  } catch (err) {
    console.error('Product detail error:', err);
    return c.json({ error: 'Internal error' }, 500);
  }
});

const toTitleCase = (str) => {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/[a-zA-Z]+/g, (match) => match.charAt(0).toUpperCase() + match.slice(1).toLowerCase());
};

app.post('/products', requireAuth, requireAdmin, async (c) => {
  const p = await c.req.json();
  const conn = getDb(c.env);
  const id = p.id || crypto.randomUUID();
  const name = toTitleCase(p.name);
  try {
    await conn.execute(
      `INSERT INTO products (serial_no, id, created_at, name, price, original_price, description, category, subcategory, images, image_url, video_url, status, platform_id, is_sale, is_hot, is_new, is_sold_out, is_deleted, available_sizes, available_colors, stock_count, is_exclusive)
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.serial_no || null, id, name, p.price, p.original_price || null, p.description || '', p.category || 'Women', p.subcategory || null,
        JSON.stringify(p.images || []), p.image_url || null, p.video_url || '', p.status || 'published', p.platform_id || null,
        p.is_sale ? 1 : 0, p.is_hot ? 1 : 0, p.is_new ? 1 : 0, p.is_sold_out ? 1 : 0, p.is_deleted ? 1 : 0,
        JSON.stringify(p.available_sizes || []), JSON.stringify(p.available_colors || []), p.stock_count ?? 3, p.is_exclusive ? 1 : 0
      ]
    );
    await bumpCatalogVersion(c);
    runInBackground(c, () => prewarmCatalogCache(c));
    return c.json({ success: true, data: { id }, id });
  } catch (err) {
    console.error('Product insert error:', err);
    return c.json({ error: err.message }, 500);
  }
});

app.put('/products/:id', requireAuth, requireAdmin, async (c) => {
  const p = await c.req.json();
  const id = c.req.param('id');
  const conn = getDb(c.env);
  const setClauses = [];
  const params = [];
  
  const fields = {
    name: p.name ? toTitleCase(p.name) : p.name, price: p.price, original_price: p.original_price, description: p.description, category: p.category, subcategory: p.subcategory,
    images: p.images !== undefined ? JSON.stringify(p.images) : undefined, image_url: p.image_url, video_url: p.video_url,
    status: p.status, is_sale: p.is_sale !== undefined ? (p.is_sale ? 1 : 0) : undefined,
    is_hot: p.is_hot !== undefined ? (p.is_hot ? 1 : 0) : undefined, is_new: p.is_new !== undefined ? (p.is_new ? 1 : 0) : undefined,
    is_sold_out: p.is_sold_out !== undefined ? (p.is_sold_out ? 1 : 0) : undefined,
    is_deleted: p.is_deleted !== undefined ? (p.is_deleted ? 1 : 0) : undefined,
    available_sizes: p.available_sizes !== undefined ? JSON.stringify(p.available_sizes) : undefined,
    available_colors: p.available_colors !== undefined ? JSON.stringify(p.available_colors) : undefined,
    stock_count: p.stock_count,
    is_exclusive: p.is_exclusive !== undefined ? (p.is_exclusive ? 1 : 0) : undefined,
    serial_no: (p.serial_no !== undefined && p.serial_no !== null && String(p.serial_no).trim() !== '' && !Number.isNaN(Number(p.serial_no)))
      ? Number(p.serial_no)
      : undefined,
    platform_id: p.platform_id
  };

  // SAFETY GUARD: If admin edits a product without changing images, the form
  // may contain dummy display URLs like '/api/img/<id>'. Do not overwrite the real DB image!
  if (fields.images) {
    try {
      const parsed = JSON.parse(fields.images);
      if (Array.isArray(parsed) && parsed.every(img => typeof img === 'string' && img.startsWith('/api/img/') && !img.includes('/up-'))) {
        delete fields.images;
      }
    } catch (_) {}
  }
  if (fields.image_url && fields.image_url.startsWith('/api/img/') && !fields.image_url.includes('/up-')) {
    delete fields.image_url;
  }

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) { setClauses.push(`${key} = ?`); params.push(val); }
  }
  if (!setClauses.length) return c.json({ success: true });
  params.push(id);
  await conn.execute(`UPDATE products SET ${setClauses.join(', ')} WHERE id = ?`, params);
  await bumpCatalogVersion(c);
  runInBackground(c, () => prewarmCatalogCache(c));
  // Evict the binary KV image cache so the new photo is served immediately
  if (p.image_url !== undefined || p.images !== undefined) {
    const kv = c.env?.BIGBAZAR_CACHE;
    if (kv) { try { await kv.delete(`img:${id}`); } catch (_) {} }
  }
  return c.json({ success: true });
});

app.delete('/products/:id', requireAuth, requireAdmin, async (c) => {
  const pid = c.req.param('id');
  const conn = getDb(c.env);

  // Bug #1 fix: soft-delete when orders reference this product to avoid orphans
  const orderRefs = await conn.execute(
    'SELECT COUNT(*) as cnt FROM orders WHERE product_id = ?', [pid]
  );
  if (orderRefs[0]?.cnt > 0) {
    // Soft-delete: orders exist, preserve referential integrity
    await conn.execute(
      "UPDATE products SET is_deleted = 1, status = 'archived' WHERE id = ?", [pid]
    );
  } else {
    // Hard-delete safe: no orders reference this product
    await conn.execute('DELETE FROM products WHERE id = ?', [pid]);
  }

  await bumpCatalogVersion(c);
  runInBackground(c, () => prewarmCatalogCache(c));
  // Also evict binary KV image cache so the CDN stops serving the
  // deleted product's image.
  const kvImg = c.env?.BIGBAZAR_CACHE;
  if (kvImg) { try { await kvImg.delete(`img:${pid}`); } catch (_) {} }
  return c.json({ success: true });
});

// ============================================
// ORDER ROUTES
// ============================================

app.get('/orders', requireAuth, requireAdmin, async (c) => {
  const { status, search, page = 0, limit = 20, ascending = 'false' } = c.req.query();
  const conn = getDb(c.env);
  let sql = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (search) {
    sql += ' AND (customer_phone LIKE ? OR customer_name LIKE ? OR customer_address LIKE ? OR id LIKE ?)';
    const p = `%${search}%`; params.push(p, p, p, p);
  }
  const countSQL = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countRes = await conn.execute(countSQL, params);
  const total = countRes[0].total;
  sql += ` ORDER BY created_at ${ascending === 'true' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(page) * parseInt(limit));
  const res = await conn.execute(sql, params);
  return c.json({ data: res, count: total });
});

app.post('/orders', optionalCustomerAuth, async (c) => {
  if (!(await checkRateLimitKV(c, 'orders', 5, 60000))) {
    return c.json({ error: 'Too many order requests. Please try again after a minute.' }, 429);
  }

  const o = await c.req.json();
  const conn = getDb(c.env);
  const id = crypto.randomUUID();
  const customerId = c.get('customer')?.id || null;

  if (!o.product_id) {
    return c.json({ error: 'Product ID is required' }, 400);
  }

  const tx = await conn.begin();
  try {
    // Fallback when clients omit items[]: honor quantity from payload (never hardcode 1)
    const fallbackQty = Math.max(1, parseInt(o.quantity ?? o.qty, 10) || 1);
    const itemsToProcess = Array.isArray(o.items) && o.items.length > 0
      ? o.items
      : [{
          id: o.product_id,
          quantity: fallbackQty,
          selectedColor: o.color || null,
          selectedSize: o.size || null
        }];

    let calculatedSubtotal = 0;

    for (const item of itemsToProcess) {
      // 1. Fetch product and lock row inside transaction
      const products = await tx.execute(
        'SELECT name, price, stock_count, is_sold_out, is_deleted, status, available_colors FROM products WHERE id = ? FOR UPDATE',
        [item.id]
      );

      if (products.length === 0) {
        await tx.rollback();
        return c.json({ error: `Product not found: ${item.id}` }, 404);
      }

      const product = products[0];
      if (product.is_deleted || product.status !== 'published') {
        await tx.rollback();
        return c.json({ error: `Product "${product.name}" is no longer available` }, 400);
      }

      const hadRealStock = product.stock_count !== null && product.stock_count !== undefined;
      const requestedQty = parseInt(item.quantity) || 1;

      if (hadRealStock && product.stock_count < requestedQty) {
        await tx.rollback();
        return c.json({ error: `Product "${product.name}" is out of stock (Requested: ${requestedQty}, Available: ${product.stock_count})` }, 400);
      }

      // Calculate true price of the product item
      const itemUnitPrice = parseFloat(product.price || 0);
      calculatedSubtotal += itemUnitPrice * requestedQty;

      // Decrement stock
      let updatedGlobalStock = product.stock_count;
      if (hadRealStock) {
        updatedGlobalStock = Math.max(0, product.stock_count - requestedQty);
      }

      // Decrement color/size variant stock
      let availableColorsParsed = [];
      try {
        availableColorsParsed = typeof product.available_colors === 'string'
          ? JSON.parse(product.available_colors)
          : (product.available_colors || []);
      } catch (e) {
        availableColorsParsed = [];
      }

      if (item.selectedColor && availableColorsParsed.length > 0) {
        availableColorsParsed = availableColorsParsed.map(color => {
          const colorName = typeof color === 'object' ? color.name : color;
          if (colorName === item.selectedColor && color.sizes?.length > 0) {
            const updatedSizes = color.sizes.map(sz => {
              const szName = typeof sz === 'object' ? sz.name : sz;
              if (szName === item.selectedSize) {
                return { ...sz, stock: Math.max(0, (sz.stock || 0) - requestedQty) };
              }
              return sz;
            });
            return { ...color, sizes: updatedSizes };
          }
          return color;
        });
      }

      await tx.execute(
        'UPDATE products SET stock_count = ?, is_sold_out = ?, available_colors = ? WHERE id = ?',
        [
          updatedGlobalStock,
          hadRealStock && updatedGlobalStock <= 0 ? 1 : (product.is_sold_out ? 1 : 0),
          JSON.stringify(availableColorsParsed),
          item.id
        ]
      );
    }

    // Normalize delivery area aliases (legacy clients sent "chittagong")
    const rawArea = String(o.delivery_area || 'outside').toLowerCase().trim();
    let normalizedArea = 'outside';
    if (rawArea === 'mirsarai') {
      normalizedArea = 'mirsarai';
    } else if (rawArea === 'chattogram' || rawArea === 'chittagong' || rawArea.includes('chittagong') || rawArea.includes('chattogram')) {
      normalizedArea = 'chattogram';
    } else if (rawArea === 'outside') {
      normalizedArea = 'outside';
    } else {
      normalizedArea = rawArea || 'outside';
    }

    let calculatedDeliveryCharge = 150;
    if (normalizedArea === 'mirsarai') {
      calculatedDeliveryCharge = 0;
    } else if (normalizedArea === 'chattogram') {
      calculatedDeliveryCharge = 100;
    }

    const calculatedTotalAmount = calculatedSubtotal + calculatedDeliveryCharge;

    // Public clients may claim payment — never trust Fully Paid; require a non-COD reference for Advance
    const paymentRef = String(o.last_four_digits || '').trim();
    const isCodOnly = !paymentRef || /^cod$/i.test(paymentRef);
    const claimedPaid = Boolean(o.is_advance_paid) ||
      o.payment_status === 'Advance Paid' ||
      o.payment_status === 'Fully Paid';
    let safePaymentStatus = 'Unpaid';
    let safeAdvancePaid = 0;
    if (claimedPaid && !isCodOnly) {
      // Cap at Advance Paid — admin must confirm Fully Paid after verifying the transfer
      safePaymentStatus = 'Advance Paid';
      safeAdvancePaid = 1;
    }

    // 3. Create the order using server-side calculated totals
    // Build INSERT with optional user_id column
    const orderCols = 'id, product_id, product_name, product_price, customer_name, customer_phone, customer_address, customer_note, delivery_area, delivery_charge, total_amount, last_four_digits, status, size, color, is_advance_paid, is_exclusive_order, payment_status, moderator_reference';
    const orderVals = [
      id, o.product_id, o.product_name, calculatedSubtotal, o.customer_name, o.customer_phone, o.customer_address, o.customer_note || null,
      normalizedArea || 'outside', calculatedDeliveryCharge, calculatedTotalAmount, o.last_four_digits || 'COD', 'Pending',
      o.size || null, o.color || null, safeAdvancePaid, o.is_exclusive_order ? 1 : 0, safePaymentStatus, o.moderator_reference || null
    ];
    const colsSql = customerId ? orderCols + ', user_id' : orderCols;
    const placeholders = customerId ? orderVals.map(() => '?').join(', ') + ', ?' : orderVals.map(() => '?').join(', ');
    if (customerId) orderVals.push(customerId);
    
    try {
      await tx.execute(`INSERT INTO orders (${colsSql}) VALUES (${placeholders})`, orderVals);
    } catch (insertErr) {
      // If user_id column doesn't exist yet, retry without it
      if (insertErr.message?.includes('user_id') || insertErr.message?.includes('Unknown column')) {
        const fallbackVals = orderVals.slice(0, -1); // Remove customerId
        await tx.execute(
          `INSERT INTO orders (${orderCols}) VALUES (${fallbackVals.map(() => '?').join(', ')})`,
          fallbackVals
        );
      } else {
        throw insertErr;
      }
    }

    await tx.commit();
    await bumpCatalogVersion(c);
    runInBackground(c, () => prewarmCatalogCache(c));
    return c.json({ success: true, order_id: id, data: { id, order_id: id } });
  } catch (err) {
    await tx.rollback();
    console.error('Order placement transaction error:', err);
    return c.json({ error: err.message }, 500);
  }
});

async function restoreOrderStock(tx, order) {
  if (!order) return;

  const parseLine = (str) => {
    const res = { name: str, size: null, color: null, sku: null, qty: 1, pid: null };
    const colorMatch = str.match(/\((?:Color|রঙ):\s*([^)]*)\)/i);
    const sizeMatch = str.match(/\((?:Size|সাইজ):\s*([^)]*)\)/i);
    const skuMatch = str.match(/\((?:SKU):\s*([^)]*)\)/i);
    const qtyMatch = str.match(/\((?:Qty|পরিমাণ):\s*(\d+)\)/i);
    // Bug #5 fix: parse embedded product ID for reliable lookup
    const pidMatch = str.match(/\(PID:\s*([^)]*)\)/i);
    if (colorMatch) res.color = colorMatch[1].trim();
    if (sizeMatch) res.size = sizeMatch[1].trim();
    if (skuMatch) res.sku = skuMatch[1].trim();
    if (qtyMatch) res.qty = parseInt(qtyMatch[1], 10) || 1;
    if (pidMatch) res.pid = pidMatch[1].trim();
    res.name = str.split('(')[0].trim();
    return res;
  };

  const parsedLines = (order.product_name || '').split(' + ').map(parseLine);

  for (let i = 0; i < parsedLines.length; i++) {
    const item = parsedLines[i];
    const qty = item.qty || 1;
    const selectedColor = item.color || order.color || null;
    const selectedSize = item.size || order.size || null;

    let productId = (i === 0 && order.product_id) ? order.product_id : null;

    // Bug #5 fix: use embedded PID first (most reliable, rename-proof)
    if (!productId && item.pid) {
      productId = item.pid;
    }

    if (!productId && item.sku) {
      const pBySku = await tx.execute('SELECT id FROM products WHERE platform_id = ? OR serial_no = ? LIMIT 1', [item.sku, item.sku]);
      if (pBySku.length > 0) productId = pBySku[0].id;
    }

    if (!productId && item.name) {
      const pByName = await tx.execute('SELECT id FROM products WHERE name = ? LIMIT 1', [item.name]);
      if (pByName.length > 0) productId = pByName[0].id;
    }

    if (!productId && order.product_id) {
      productId = order.product_id;
    }

    if (!productId) {
      console.warn(`restoreOrderStock: Could not find product for order ${order.id}, line item: "${item.name}"`);
      continue;
    }

    // Lock product row inside transaction
    const products = await tx.execute(
      'SELECT stock_count, is_sold_out, available_colors FROM products WHERE id = ? FOR UPDATE',
      [productId]
    );

    if (products.length === 0) continue;

    const product = products[0];
    const hadRealStock = product.stock_count !== null && product.stock_count !== undefined;

    // 1. Increment global stock count
    let updatedGlobalStock = product.stock_count;
    if (hadRealStock) {
      updatedGlobalStock = product.stock_count + qty;
    }

    // 2. Increment color/size variant stock
    let availableColorsParsed = [];
    try {
      availableColorsParsed = typeof product.available_colors === 'string'
        ? JSON.parse(product.available_colors)
        : (product.available_colors || []);
    } catch (e) {
      availableColorsParsed = [];
    }

    if (selectedColor && availableColorsParsed.length > 0) {
      availableColorsParsed = availableColorsParsed.map(color => {
        const colorName = typeof color === 'object' ? color.name : color;
        if (colorName === selectedColor && color.sizes?.length > 0) {
          const updatedSizes = color.sizes.map(sz => {
            const szName = typeof sz === 'object' ? sz.name : sz;
            if (szName === selectedSize) {
              return { ...sz, stock: (sz.stock || 0) + qty };
            }
            return sz;
          });
          return { ...color, sizes: updatedSizes };
        }
        return color;
      });
    }

    // 3. Update product in DB and reset is_sold_out to 0 if stock is restored
    await tx.execute(
      'UPDATE products SET stock_count = ?, is_sold_out = ?, available_colors = ? WHERE id = ?',
      [
        updatedGlobalStock,
        hadRealStock && updatedGlobalStock > 0 ? 0 : product.is_sold_out,
        JSON.stringify(availableColorsParsed),
        productId
      ]
    );
  }
}

app.put('/orders/:id', requireAuth, requireAdmin, async (c) => {
  const o = await c.req.json();
  const id = c.req.param('id');
  const conn = getDb(c.env);

  const tx = await conn.begin();
  try {
    // 1. Fetch current order with row lock
    const currentOrders = await tx.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (currentOrders.length === 0) {
      await tx.rollback();
      return c.json({ error: 'Order not found' }, 404);
    }
    const currentOrder = currentOrders[0];

    // 2. Restore stock when moving to Cancelled OR Deleted (trash), if not already restored
    const stockAlreadyRestored = currentOrder.status === 'Cancelled' || currentOrder.status === 'Deleted';
    const isTransitioningToCancelled = o.status === 'Cancelled' && !stockAlreadyRestored;
    const isTransitioningToDeleted = o.status === 'Deleted' && !stockAlreadyRestored;
    if (isTransitioningToCancelled || isTransitioningToDeleted) {
      await restoreOrderStock(tx, currentOrder);
    }

    // 3. Update fields
    const setClauses = [];
    const params = [];
    const fields = {
      status: o.status,
      is_advance_paid: o.is_advance_paid !== undefined ? (o.is_advance_paid ? 1 : 0) : undefined,
      payment_status: o.payment_status,
      delivery_charge: o.delivery_charge,
      total_amount: o.total_amount
    };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) { setClauses.push(`${key} = ?`); params.push(val); }
    }
    if (setClauses.length > 0) {
      params.push(id);
      await tx.execute(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = ?`, params);
    }

    await tx.commit();
    if (isTransitioningToCancelled || isTransitioningToDeleted) {
      await bumpCatalogVersion(c);
      runInBackground(c, () => prewarmCatalogCache(c));
    }
    return c.json({ success: true });
  } catch (err) {
    await tx.rollback();
    console.error('Order update transaction error:', err);
    return c.json({ error: err.message }, 500);
  }
});

// Bulk delete by status — used by Admin "Empty Bin" feature
app.delete('/orders', requireAuth, requireAdmin, async (c) => {
  const status = c.req.query('status');
  if (!status) return c.json({ error: 'status query param required' }, 400);
  const conn = getDb(c.env);
  const tx = await conn.begin();
  try {
    const orders = await tx.execute('SELECT * FROM orders WHERE status = ? FOR UPDATE', [status]);
    let restoredAny = false;
    for (const order of orders) {
      // Cancelled/Deleted already restored stock on status transition — do not double-restore
      if (order.status !== 'Cancelled' && order.status !== 'Deleted') {
        await restoreOrderStock(tx, order);
        restoredAny = true;
      }
    }
    await tx.execute('DELETE FROM orders WHERE status = ?', [status]);
    await tx.commit();
    if (restoredAny) {
      await bumpCatalogVersion(c);
      runInBackground(c, () => prewarmCatalogCache(c));
    }
    return c.json({ success: true });
  } catch (err) {
    await tx.rollback();
    console.error('Bulk order delete error:', err);
    return c.json({ error: err.message }, 500);
  }
});

app.delete('/orders/:id', requireAuth, requireAdmin, async (c) => {
  const conn = getDb(c.env);
  const id = c.req.param('id');
  const tx = await conn.begin();
  try {
    let stockWasRestored = false;
    // 1. Fetch order with row lock
    const orders = await tx.execute('SELECT * FROM orders WHERE id = ? FOR UPDATE', [id]);
    if (orders.length > 0) {
      const order = orders[0];

      // 2. Restore stock unless already restored via Cancelled/Deleted transition
      if (order.status !== 'Cancelled' && order.status !== 'Deleted') {
        await restoreOrderStock(tx, order);
        stockWasRestored = true;
      }

      // 3. Delete order
      await tx.execute('DELETE FROM orders WHERE id = ?', [id]);
    }
    await tx.commit();
    if (stockWasRestored) {
      await bumpCatalogVersion(c);
      runInBackground(c, () => prewarmCatalogCache(c));
    }
    return c.json({ success: true });
  } catch (err) {
    await tx.rollback();
    console.error('Order deletion transaction error:', err);
    return c.json({ error: err.message }, 500);
  }
});

app.get('/orders/track', async (c) => {
  const query = (c.req.query('query') || '').trim();
  if (!query) return c.json({ data: [] });

  const cacheKey = `cache:orders:track:${query}`;
  const cached = await kvGet(c, cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const conn = getDb(c.env);
  const res = await conn.execute(
    'SELECT * FROM orders WHERE customer_phone = ? OR id = ? ORDER BY created_at DESC',
    [query, query]
  );
  const responseData = { data: res };
  await kvSet(c, cacheKey, responseData, 60);
  return c.json(responseData);
});

// ============================================
// REVIEWS
// ============================================
app.get('/reviews', async (c) => {
  const pid = c.req.query('product_id') || '';
  const cacheKey = `cache:reviews:${pid}`;
  const cached = await kvGet(c, cacheKey);
  if (cached) {
    c.header('Cache-Control', 'public, max-age=60, s-maxage=300');
    return c.json(cached);
  }

  const conn = getDb(c.env);
  const res = await conn.execute('SELECT * FROM reviews' + (pid ? ' WHERE product_id = ?' : '') + ' ORDER BY created_at DESC', pid ? [pid] : []);
  const responseData = { data: res };
  await kvSet(c, cacheKey, responseData, 120);
  c.header('Cache-Control', 'public, max-age=60, s-maxage=300');
  return c.json(responseData);
});

app.post('/reviews', async (c) => {
  const r = await c.req.json();
  const conn = getDb(c.env);
  const id = crypto.randomUUID();
  await conn.execute(
    'INSERT INTO reviews (id, rating, comment, customer_name, product_id, product_name) VALUES (?, ?, ?, ?, ?, ?)',
    [id, r.rating || 5, r.comment, r.customer_name, r.product_id, r.product_name]
  );
  await kvDelete(c, 'cache:reviews');
  return c.json({ success: true, id });
});

// ============================================
// SETTINGS
// ============================================
app.get('/settings', async (c) => {
  const isNoCache = await isAdminOrNoCache(c);
  const ver = await getCatalogVersion(c);
  const cacheKey = `cache:${ver}:settings`;

  if (!isNoCache) {
    const cached = await kvGet(c, cacheKey);
    if (cached) {
      c.header('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=1200');
      c.header('X-Cache-Status', 'HIT');
      return c.json(cached);
    }
  }

  const conn = getDb(c.env);
  const res = await conn.execute("SELECT `key`, value FROM site_settings WHERE `key` NOT LIKE 'ping:%' AND `key` NOT LIKE 'rl:%' AND `key` NOT LIKE 'site_visitors%'");
  const settings = {};
  res.forEach(r => {
    try { settings[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value; } catch(e) { settings[r.key] = r.value; }
  });
  // Admin gets raw settings so editing doesn't overwrite real images with dummy URLs.
  // Customers get lightweight CDN URLs for sub-second page loads.
  const cleanSettings = isNoCache ? settings : transformSettingsLite(settings);
  const responseData = { data: cleanSettings };

  if (isNoCache) {
    c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
  } else {
    runInBackground(c, () => kvSet(c, cacheKey, responseData, 86400));
    c.header('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=1200');
    c.header('X-Cache-Status', 'MISS');
  }
  return c.json(responseData);
});

app.post('/settings', requireAuth, requireAdmin, async (c) => {
  const s = await c.req.json();
  const conn = getDb(c.env);

  // Merge protection: Never let dummy display URLs overwrite real images in TiDB!
  if (s.key === 'main_slides' && Array.isArray(s.value)) {
    try {
      const existingRows = await conn.execute("SELECT value FROM site_settings WHERE `key` = 'main_slides'");
      if (existingRows[0]) {
        const oldSlides = typeof existingRows[0].value === 'string' ? JSON.parse(existingRows[0].value) : existingRows[0].value;
        if (Array.isArray(oldSlides)) {
          s.value = s.value.map(newSlide => {
            if (newSlide.image && typeof newSlide.image === 'string' && newSlide.image.startsWith('/api/settings-img/')) {
              const matchedOld = oldSlides.find(os => String(os.id) === String(newSlide.id));
              if (matchedOld && matchedOld.image) {
                return { ...newSlide, image: matchedOld.image };
              }
            }
            return newSlide;
          });
        }
      }
    } catch (_) {}
  }

  if (s.key === 'subcategories' && typeof s.value === 'object' && s.value !== null) {
    try {
      const existingRows = await conn.execute("SELECT value FROM site_settings WHERE `key` = 'subcategories'");
      if (existingRows[0]) {
        const oldSubcats = typeof existingRows[0].value === 'string' ? JSON.parse(existingRows[0].value) : existingRows[0].value;
        if (typeof oldSubcats === 'object' && oldSubcats !== null) {
          for (const [catName, newItems] of Object.entries(s.value)) {
            if (Array.isArray(newItems) && Array.isArray(oldSubcats[catName])) {
              newItems.forEach(newItem => {
                if (newItem.image_url && typeof newItem.image_url === 'string' && newItem.image_url.startsWith('/api/settings-img/')) {
                  const oldItem = oldSubcats[catName].find(oi => oi && String(oi.id) === String(newItem.id));
                  if (oldItem && oldItem.image_url) {
                    newItem.image_url = oldItem.image_url;
                  }
                }
              });
            }
          }
        }
      }
    } catch (_) {}
  }

  await conn.execute(
    'INSERT INTO site_settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [s.key, JSON.stringify(s.value)]
  );
  await bumpCatalogVersion(c);
  runInBackground(c, () => prewarmCatalogCache(c));
  return c.json({ success: true });
});

// ============================================
// VISITOR ANALYTICS (DISABLED to eliminate TiDB RU writes)
// ============================================
app.post('/analytics/ping', (c) => c.json({ success: true }));
app.get('/analytics/stats', (c) => c.json({ success: true, online_now: 0, today_count: 0, total_count: 0 }));
app.post('/analytics/track-visitor', (c) => c.json({ success: true }));
app.get('/analytics/visitor-count', (c) => c.json({ success: true, count: 0 }));

// ============================================
// UPLOAD (Cloudinary primary / Base64 fallback)
// ============================================

/**
 * Fast base64 encoding for ArrayBuffers — kept as fallback when
 * Cloudinary env vars are not configured.
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * SHA-1 hex digest using the Web Crypto API (available in Workers).
 * Cloudinary requires HMAC-style signatures: sha1(paramsString + apiSecret).
 */
async function sha1Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

app.post('/upload', requireAuth, requireAdmin, async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.file;
    if (!file || !(file instanceof File)) return c.json({ error: 'No file uploaded' }, 400);

    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return c.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.` }, 413);
    }

    // ── Cloudinary upload (primary path) ──────────────────────────────────
    const cloudName  = c.env.CLOUDINARY_CLOUD_NAME;
    const apiKey     = c.env.CLOUDINARY_API_KEY;
    const apiSecret  = c.env.CLOUDINARY_API_SECRET;

    if (cloudName && apiKey && apiSecret) {
      try {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const folder = 'bigbazar';
        const eager = 'q_auto,f_auto,w_1600,c_limit';

        const paramsToSign = `eager=${eager}&folder=${folder}&timestamp=${timestamp}`;
        const signature = await sha1Hex(paramsToSign + apiSecret);

        const formData = new FormData();
        formData.append('file', file);
        formData.append('api_key', apiKey);
        formData.append('timestamp', timestamp);
        formData.append('signature', signature);
        formData.append('folder', folder);
        formData.append('eager', eager);

        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
          { method: 'POST', body: formData }
        );

        if (cloudRes.ok) {
          const result = await cloudRes.json();
          const publicUrl = result.eager?.[0]?.secure_url || result.secure_url;
          return c.json({
            success: true,
            data: {
              path: result.public_id,
              publicUrl
            }
          });
        }
        console.warn('Cloudinary upload unsuccessful, falling back to KV:', cloudRes.status);
      } catch (cloudErr) {
        console.warn('Cloudinary error, falling back to KV:', cloudErr.message);
      }
    }

    // ── Resilient KV Binary Storage Fallback ────────────────────────────────
    // Stores the binary image in Cloudflare KV edge cache.
    // Zero multi-megabyte base64 strings in the database!
    const arrayBuffer = await file.arrayBuffer();
    const kv = c.env?.BIGBAZAR_CACHE;
    const uploadId = 'up-' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const mimeType = file.type || 'image/jpeg';

    if (kv) {
      try {
        await kv.put(`img:${uploadId}`, arrayBuffer);
        await kv.put(`img_type:${uploadId}`, mimeType);
        return c.json({
          success: true,
          data: {
            path: uploadId,
            publicUrl: `/api/img/${uploadId}`
          }
        });
      } catch (kvErr) {
        console.error('KV image store error:', kvErr);
      }
    }

    // Ultimate fallback if KV is unavailable
    const base64 = arrayBufferToBase64(arrayBuffer);
    const dataUrl = `data:${mimeType};base64,${base64}`;

    return c.json({
      success: true,
      data: {
        path: `base64-${Date.now()}`,
        publicUrl: dataUrl
      }
    });
  } catch (err) {
    return c.json({ error: 'Upload failed', details: err.message }, 500);
  }
});


// ============================================
// GOOGLE CUSTOMER AUTH (Continue with Google)
// ============================================

/**
 * Decode a Base64url string to ArrayBuffer (used for JWT parsing).
 */
function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const binary = atob(base64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Decode a Base64url JSON payload from a JWT segment.
 */
function decodeJwtSegment(segment) {
  const buffer = base64urlToBuffer(segment);
  const text = new TextDecoder().decode(buffer);
  return JSON.parse(text);
}

/**
 * Verify a Google ID token's signature and claims using Web Crypto API.
 * No external dependency required — fetches Google's JWKS directly.
 */
async function verifyGoogleIdToken(idToken, googleClientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const header = decodeJwtSegment(parts[0]);
  const payload = decodeJwtSegment(parts[1]);

  // 1. Check claims first (fast fail before crypto)
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error('Token expired');
  if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
    throw new Error('Invalid issuer');
  }
  if (payload.aud !== googleClientId) throw new Error('Invalid audience');

  // 2. Fetch Google's public keys (JWKS)
  const jwksRes = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!jwksRes.ok) throw new Error('Failed to fetch Google JWKS');
  const jwks = await jwksRes.json();
  const jwk = jwks.keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Key not found in Google JWKS');

  // 3. Import the RSA public key
  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['verify']
  );

  // 4. Verify the signature
  const signedContent = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const signatureBuffer = base64urlToBuffer(parts[2]);
  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    signatureBuffer,
    signedContent
  );
  if (!isValid) throw new Error('Signature verification failed');

  // 5. Reject unverified emails — we key accounts off this address.
  // Only an explicit `false` fails; older tokens may omit the claim entirely.
  if (payload.email_verified === false || payload.email_verified === 'false') {
    throw new Error('Google account email is not verified');
  }

  return payload;
}


// POST /auth/google — "Continue with Google" login
app.post('/auth/google', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  if (!checkRateLimit(ip, 'google-auth', 10, 60000)) {
    return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
  }

  const { credential } = await c.req.json();
  if (!credential) return c.json({ error: 'Google credential is required' }, 400);

  const googleClientId = c.env?.GOOGLE_CLIENT_ID || (typeof process !== 'undefined' && process.env?.GOOGLE_CLIENT_ID);
  if (!googleClientId) return c.json({ error: 'Google login is not configured' }, 500);

  try {
    // Verify the Google ID token
    const payload = await verifyGoogleIdToken(credential, googleClientId);

    const googleId = payload.sub;
    const email = payload.email || '';
    const name = payload.name || '';
    const avatarUrl = payload.picture || '';

    const conn = getDb(c.env);

    // Check if user exists
    const existing = await conn.execute('SELECT * FROM users WHERE google_id = ?', [googleId]);
    let userId;

    if (existing.length > 0) {
      userId = existing[0].id;
      // Update name/avatar on every login (they may change on Google's side)
      await conn.execute(
        'UPDATE users SET name = ?, avatar_url = ?, email = ? WHERE id = ?',
        [name, avatarUrl, email, userId]
      );
    } else {
      userId = crypto.randomUUID();
      await conn.execute(
        'INSERT INTO users (id, google_id, email, name, avatar_url) VALUES (?, ?, ?, ?, ?)',
        [userId, googleId, email, name, avatarUrl]
      );
    }
    await kvDelete(c, `cache:user:${userId}`);

    // Issue JWT
    const jwtSecret = getJwtSecret(c);
    const token = await jwtSign(
      { id: userId, email, type: 'customer' },
      jwtSecret,
      { expiresIn: '30d' }
    );

    return c.json({
      user: { id: userId, name, email, avatar_url: avatarUrl, phone: existing?.[0]?.phone || null },
      token
    });
  } catch (err) {
    console.error('Google auth error:', err.message);
    return c.json({ error: 'Google login failed: ' + err.message }, 401);
  }
});

// GET /account/me — Current logged-in customer profile
app.get('/account/me', requireCustomerAuth, async (c) => {
  const customer = c.get('customer');
  const cacheKey = `cache:user:${customer.id}`;
  const cached = await kvGet(c, cacheKey);
  if (cached) {
    return c.json(cached);
  }

  const conn = getDb(c.env);
  try {
    const rows = await conn.execute('SELECT id, name, email, avatar_url, phone, created_at FROM users WHERE id = ?', [customer.id]);
    if (rows.length === 0) return c.json({ error: 'User not found' }, 404);
    const responseData = { user: rows[0] };
    await kvSet(c, cacheKey, responseData, 120);
    return c.json(responseData);
  } catch (err) {
    return c.json({ error: 'Failed to load profile' }, 500);
  }
});

// PUT /account/me — Update customer phone (the only editable field for now)
app.put('/account/me', requireCustomerAuth, async (c) => {
  const customer = c.get('customer');
  const { phone } = await c.req.json();
  const conn = getDb(c.env);
  try {
    await conn.execute('UPDATE users SET phone = ? WHERE id = ?', [phone || null, customer.id]);
    await kvDelete(c, `cache:user:${customer.id}`);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

// GET /account/orders — Customer's orders by user_id and/or profile phone
app.get('/account/orders', requireCustomerAuth, async (c) => {
  const customer = c.get('customer');
  const page = parseInt(c.req.query('page') || '0', 10) || 0;
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10) || 50, 100);
  const conn = getDb(c.env);

  const phoneVariants = (phone) => {
    const raw = String(phone || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (!digits) return [];
    const set = new Set([raw, digits]);
    if (digits.startsWith('880') && digits.length >= 13) {
      set.add('0' + digits.slice(3));
      set.add(digits.slice(2));
    }
    if (digits.startsWith('0') && digits.length === 11) {
      set.add('88' + digits);
      set.add('880' + digits.slice(1));
      set.add('+880' + digits.slice(1));
    }
    if (digits.length >= 10) set.add(digits.slice(-10));
    return [...set].filter(Boolean);
  };

  try {
    let phone = null;
    try {
      const users = await conn.execute('SELECT phone FROM users WHERE id = ? LIMIT 1', [customer.id]);
      phone = users[0]?.phone || null;
    } catch (_) {}

    const variants = phoneVariants(phone);
    const clauses = ['user_id = ?'];
    const params = [customer.id];

    if (variants.length > 0) {
      clauses.push(`customer_phone IN (${variants.map(() => '?').join(',')})`);
      params.push(...variants);
      const last10 = String(phone || '').replace(/\D/g, '').slice(-10);
      if (last10.length === 10) {
        clauses.push('customer_phone LIKE ?');
        params.push('%' + last10);
      }
    }

    const whereSql = clauses.join(' OR ');
    let orders = [];
    try {
      orders = await conn.execute(
        `SELECT * FROM orders WHERE (${whereSql}) ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, limit, page * limit]
      );
    } catch (err) {
      // Fallback if user_id column missing
      if (variants.length === 0) return c.json({ data: [], count: 0, phone: null });
      orders = await conn.execute(
        `SELECT * FROM orders WHERE customer_phone IN (${variants.map(() => '?').join(',')})
         OR customer_phone LIKE ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...variants, '%' + String(phone || '').replace(/\D/g, '').slice(-10), limit, page * limit]
      );
    }

    // Dedupe by id (phone OR user_id can overlap)
    const seen = new Set();
    const unique = [];
    for (const o of orders || []) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      unique.push(o);
    }

    return c.json({ data: unique, count: unique.length, phone: phone || null });
  } catch (err) {
    console.error('account/orders error:', err?.message || err);
    return c.json({ data: [], count: 0, phone: null });
  }
});

/** Ensure in-app notification tables exist (safe to call repeatedly). */
async function ensureNotificationTables(conn) {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id VARCHAR(36) PRIMARY KEY,
      type VARCHAR(50) NOT NULL DEFAULT 'new_product',
      title VARCHAR(255) NOT NULL,
      body TEXT,
      product_id VARCHAR(36) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_notifications_created (created_at DESC)
    )
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id VARCHAR(36) NOT NULL,
      user_id VARCHAR(36) NOT NULL,
      read_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notification_id, user_id),
      INDEX idx_reads_user (user_id)
    )
  `);
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      endpoint TEXT NOT NULL,
      endpoint_hash VARCHAR(64) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(512) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_push_endpoint (endpoint_hash),
      INDEX idx_push_user (user_id)
    )
  `);
}

// GET /admin/users — Google sign-in customers
app.get('/admin/users', requireAuth, requireAdmin, async (c) => {
  const conn = getDb(c.env);
  try {
    const countRows = await conn.execute('SELECT COUNT(*) AS total FROM users');
    const users = await conn.execute(
      'SELECT id, name, email, phone, avatar_url, created_at FROM users ORDER BY created_at DESC LIMIT 500'
    );
    return c.json({ count: countRows[0]?.total || 0, data: users || [] });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to load users', count: 0, data: [] }, 500);
  }
});

// POST /admin/notify-product — in-app + browser push to subscribed devices
app.post('/admin/notify-product', requireAuth, requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const productId = body.product_id || null;
  const productName = String(body.product_name || 'New product').trim().slice(0, 200);
  const conn = getDb(c.env);
  try {
    await ensureNotificationTables(conn);
    const id = crypto.randomUUID();
    const title = 'নতুন প্রোডাক্ট এসেছে!';
    const notifBody = `${productName} — এখনই দেখুন।`;
    await conn.execute(
      'INSERT INTO notifications (id, type, title, body, product_id) VALUES (?, ?, ?, ?, ?)',
      [id, 'new_product', title, notifBody, productId]
    );
    const countRows = await conn.execute('SELECT COUNT(*) AS total FROM users');

    let push = { delivered: 0, failed: 0, gone: 0, skipped: true };
    const vapid = getVapidConfig(c.env);
    if (vapid) {
      const subs = await conn.execute(
        'SELECT id, endpoint, p256dh, auth FROM push_subscriptions LIMIT 2000'
      );
      if (subs?.length) {
        const origin = new URL(c.req.url).origin;
        const url = productId ? `${origin}/product/${productId}` : `${origin}/products`;
        push = await sendWebPushBatch(
          subs,
          {
            title,
            body: notifBody,
            url,
            product_id: productId,
          },
          vapid,
          {
            onGone: async (sub) => {
              try {
                await conn.execute('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
              } catch (_) {}
            },
          }
        );
        push.skipped = false;
      } else {
        push.skipped = false;
      }
    }

    return c.json({
      success: true,
      notification_id: id,
      audience: countRows[0]?.total || 0,
      push,
    });
  } catch (err) {
    console.error('notify-product error:', err.message);
    return c.json({ error: err.message || 'Failed to create notification' }, 500);
  }
});

// GET /push/vapid-public-key — browser needs this to subscribe (public)
app.get('/push/vapid-public-key', (c) => {
  const vapid = getVapidConfig(c.env);
  if (!vapid?.publicKey) {
    return c.json({ error: 'Web Push is not configured', publicKey: null }, 503);
  }
  return c.json({ publicKey: vapid.publicKey });
});

// POST /account/push-subscribe — save browser push subscription for logged-in customer
app.post('/account/push-subscribe', requireCustomerAuth, async (c) => {
  const customer = c.get('customer');
  const body = await c.req.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return c.json({ error: 'Invalid subscription' }, 400);
  }
  const conn = getDb(c.env);
  try {
    await ensureNotificationTables(conn);
    const endpointHash = await sha256Hex(endpoint);
    const existing = await conn.execute(
      'SELECT id FROM push_subscriptions WHERE endpoint_hash = ?',
      [endpointHash]
    );
    const ua = (c.req.header('user-agent') || '').slice(0, 500);
    if (existing?.length) {
      await conn.execute(
        'UPDATE push_subscriptions SET user_id = ?, p256dh = ?, auth = ?, user_agent = ? WHERE endpoint_hash = ?',
        [customer.id, p256dh, auth, ua, endpointHash]
      );
    } else {
      await conn.execute(
        'INSERT INTO push_subscriptions (id, user_id, endpoint, endpoint_hash, p256dh, auth, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), customer.id, endpoint, endpointHash, p256dh, auth, ua]
      );
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message || 'Failed to save subscription' }, 500);
  }
});

// DELETE /account/push-subscribe — remove this browser's subscription
app.delete('/account/push-subscribe', requireCustomerAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const endpoint = body?.endpoint;
  if (!endpoint) return c.json({ error: 'endpoint required' }, 400);
  const conn = getDb(c.env);
  try {
    await ensureNotificationTables(conn);
    const endpointHash = await sha256Hex(endpoint);
    await conn.execute('DELETE FROM push_subscriptions WHERE endpoint_hash = ?', [endpointHash]);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// GET /account/notifications — in-app alerts for the logged-in customer
app.get('/account/notifications', requireCustomerAuth, async (c) => {
  const customer = c.get('customer');
  const conn = getDb(c.env);
  try {
    await ensureNotificationTables(conn);
    const rows = await conn.execute(
      `SELECT n.id, n.type, n.title, n.body, n.product_id, n.created_at,
              (r.user_id IS NOT NULL) AS is_read
       FROM notifications n
       LEFT JOIN notification_reads r
         ON r.notification_id = n.id AND r.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT 50`,
      [customer.id]
    );
    const unread = (rows || []).filter((n) => !n.is_read).length;
    return c.json({ data: rows || [], unread });
  } catch (err) {
    return c.json({ data: [], unread: 0, error: err.message }, 500);
  }
});

// POST /account/notifications/read — mark one or all as read
app.post('/account/notifications/read', requireCustomerAuth, async (c) => {
  const customer = c.get('customer');
  const body = await c.req.json().catch(() => ({}));
  const conn = getDb(c.env);
  try {
    await ensureNotificationTables(conn);
    if (body.all) {
      const all = await conn.execute('SELECT id FROM notifications ORDER BY created_at DESC LIMIT 100');
      for (const n of all || []) {
        await conn.execute(
          'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)',
          [n.id, customer.id]
        );
      }
    } else if (body.notification_id) {
      await conn.execute(
        'INSERT IGNORE INTO notification_reads (notification_id, user_id) VALUES (?, ?)',
        [body.notification_id, customer.id]
      );
    } else {
      return c.json({ error: 'notification_id or all required' }, 400);
    }
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// ============================================
// AI SHOPPING ASSISTANT (v2 — Upgraded)
// Features: FAQ RAG, KV cache, SSE streaming,
//   order status, delivery estimate, fallback chain
// ============================================

const groqTools = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search products by keyword, category, subcategory, or price range',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'optional free-text search' },
          category: { type: 'string' },
          subcategory: { type: 'string' },
          min_price: { type: 'number' },
          max_price: { type: 'number' },
          limit: { type: 'number' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_best_sellers',
      description: 'Get trending/best-selling products',
      parameters: { type: 'object', properties: { limit: { type: 'number' } } }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_faq_answer',
      description: 'Get answer for FAQ topics: delivery, return_policy, payment, size_chart, contact_info, how_to_order, mirsarai_offer',
      parameters: {
        type: 'object',
        properties: { topic: { type: 'string', description: 'FAQ topic key' } },
        required: ['topic']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'check_order_status',
      description: 'Check order status for a logged-in customer by their order reference ID',
      parameters: {
        type: 'object',
        properties: { order_ref: { type: 'string', description: 'Last 6 chars of order ID or full order ID' } },
        required: ['order_ref']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_delivery_estimate',
      description: 'Get estimated delivery days and charge for a given delivery area/city',
      parameters: {
        type: 'object',
        properties: { area: { type: 'string', description: 'city or area name' } },
        required: ['area']
      }
    }
  }
];

const SYSTEM_PROMPT = `You are BigBazar's friendly AI shopping assistant for a Bangladeshi fashion store.

RULES:
1. Detect the customer's language from their message (Bengali script = bn, Banglish or English = en) and ALWAYS reply in the SAME style and language.
2. Keep replies SHORT: 1-3 sentences maximum. Product cards are shown below your text, so never list prices or product details in your text.
3. Only describe products returned by a tool call. NEVER invent product names, prices, stock, or availability.
4. If asked about delivery, payment, returns, sizing, or contact info - call get_faq_answer with the matching topic.
5. If the customer mentions an order number, call check_order_status (only for logged-in users).
6. Politely decline questions unrelated to BigBazar products/services. Do not discuss competitor brands.
7. If you cannot help, suggest: "আমাদের মেসেঞ্জারে যোগাযোগ করুন" (Contact us on Messenger).
8. Never make up phone numbers, addresses, or policies. Use only tool-provided data.`;

function parseAssistantProductRow(r) {
  let images = [];
  try { images = r.images ? JSON.parse(r.images) : []; } catch (_) {}
  return {
    id: r.id, name: r.name, price: r.price,
    image_url: r.image_url || images[0] || '',
    description: r.description || '',
    category: r.category || '', subcategory: r.subcategory || ''
  };
}

async function executeGroqTool(c, conn, toolName, args, userId) {
  // --- search_products ---
  if (toolName === 'search_products') {
    const { query = '', category = '', subcategory = '', min_price, max_price, limit = 5 } = args;
    const safeLimit = Math.min(parseInt(limit) || 5, 10);
    const cacheKey = `cache:assistant:search:${encodeURIComponent(query)}:${encodeURIComponent(category)}:${safeLimit}`;
    const cached = await kvGet(c, cacheKey);
    if (cached) return cached;
    let sql = "SELECT * FROM products WHERE status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL)";
    const params = [];
    if (category && category !== 'All') { sql += ' AND category LIKE ?'; params.push(`%${category}%`); }
    if (subcategory) { sql += ' AND subcategory LIKE ?'; params.push(`%${subcategory}%`); }
    if (min_price) { sql += ' AND price >= ?'; params.push(parseFloat(min_price)); }
    if (max_price) { sql += ' AND price <= ?'; params.push(parseFloat(max_price)); }
    if (query) { sql += ' AND (name LIKE ? OR description LIKE ? OR subcategory LIKE ?)'; params.push(`%${query}%`, `%${query}%`, `%${query}%`); }
    sql += ' ORDER BY is_hot DESC, created_at DESC LIMIT ?';
    params.push(safeLimit);
    const rows = await conn.execute(sql, params);
    const result = { type: 'products', data: rows.map(parseAssistantProductRow) };
    await kvSet(c, cacheKey, result, 120);
    return result;
  }

  // --- get_best_sellers ---
  if (toolName === 'get_best_sellers') {
    const safeLimit = Math.min(parseInt(args.limit) || 5, 10);
    const cacheKey = `cache:assistant:bestsellers:${safeLimit}`;
    const cached = await kvGet(c, cacheKey);
    if (cached) return cached;
    const sql = "SELECT * FROM products WHERE status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY is_hot DESC, created_at DESC LIMIT ?";
    const rows = await conn.execute(sql, [safeLimit]);
    const result = { type: 'products', data: rows.map(parseAssistantProductRow) };
    await kvSet(c, cacheKey, result, 120);
    return result;
  }

  // --- get_faq_answer ---
  if (toolName === 'get_faq_answer') {
    const topic = (args.topic || '').toLowerCase().replace(/ /g, '_');
    const entry = FAQ_KB[topic];
    if (entry) return { type: 'faq', data: entry };
    // try fuzzy match
    for (const [key, kb] of Object.entries(FAQ_KB)) {
      if (key.includes(topic) || topic.includes(key)) return { type: 'faq', data: kb };
    }
    return { type: 'faq', data: null, error: 'Topic not found' };
  }

  // --- check_order_status (auth required) ---
  if (toolName === 'check_order_status') {
    if (!userId) return { type: 'error', message: 'Login required to check order status. Please log in first.' };
    const ref = (args.order_ref || '').trim().toUpperCase();
    if (!ref) return { type: 'error', message: 'Please provide your order reference number.' };
    try {
      // Try exact match first, then suffix match
      let rows = await conn.execute(
        'SELECT id, status, payment_status, total_amount, delivery_area, created_at FROM orders WHERE user_id = ? AND UPPER(id) LIKE ? ORDER BY created_at DESC LIMIT 1',
        [userId, `%${ref}%`]
      );
      if (rows.length === 0) return { type: 'order_not_found', message: `No order found with reference "${ref}" for your account.` };
      const o = rows[0];
      return {
        type: 'order_status',
        data: {
          ref: o.id.toString().slice(-6).toUpperCase(),
          status: o.status,
          payment_status: o.payment_status,
          total: o.total_amount,
          area: o.delivery_area,
          created_at: o.created_at
        }
      };
    } catch (err) {
      return { type: 'error', message: 'Could not retrieve order. Try again or contact support.' };
    }
  }

  // --- get_delivery_estimate ---
  if (toolName === 'get_delivery_estimate') {
    const areaInput = (args.area || '').toLowerCase().trim();
    let match = DELIVERY_AREAS.default;
    for (const [key, val] of Object.entries(DELIVERY_AREAS)) {
      if (areaInput.includes(key) || key.includes(areaInput)) { match = val; break; }
    }
    return { type: 'delivery_estimate', data: { area: args.area, days: match.days, charge: match.charge } };
  }

  return { error: 'Tool not found' };
}

// POST /api/assistant — AI Shopping Assistant with SSE Streaming
app.post('/assistant', optionalCustomerAuth, async (c) => {
  const ip = c.req.header('CF-Connecting-IP') || '127.0.0.1';
  if (!checkRateLimit(ip, 'assistant', 30, 60000)) {
    return c.json({
      reply: 'আপনি খুব বেশি মেসেজ পাঠাচ্ছেন। ১ মিনিট পর আবার চেষ্টা করুন।',
      products: [], quick_replies: ['শাড়ি কালেকশন', 'থ্রি-পিস কালেকশন', 'পারশি কালেকশন'], order_confirmation: null
    }, 429);
  }

  const geminiApiKey = c.env?.GEMINI_API_KEY || (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY);
  const groqApiKey = c.env?.GROQ_API_KEY || (typeof process !== 'undefined' && process.env?.GROQ_API_KEY);

  const body = await c.req.json().catch(() => ({}));
  const userMessage = (body.message || '').trim();
  const lang = body.language === 'en' ? 'en' : 'bn';
  const requestedOffset = parseInt(body.offset) || 0;
  const requestedLimit = 5;

  if (!userMessage) {
    return c.json({
      reply: lang === 'en'
        ? 'Assalamu Alaikum! Welcome to Big Bazar. What would you like to browse today?'
        : 'আসসালামু আলাইকুম! বিগ বাজারে আপনাকে স্বাগতম। আপনি আজ কী ধরনের পোশাক বা পণ্য দেখতে চান?',
      products: [],
      quick_replies: defaultQuickReplies(lang === 'en' ? 'en' : 'bn')
    });
  }

  const conn = getDb(c.env);
  const lowerMsg = userMessage.toLowerCase();
  const replyLang = lang === 'en' ? 'en' : 'bn';

  // ── Step 0: Direct Purchase / Order Intent ──
  if (isDirectOrderIntent(lowerMsg)) {
    const orderQty = extractOrderQuantity(lowerMsg);
    const candidateKeywords = extractOrderKeywords(lowerMsg);
    let targetProduct = null;

    if (candidateKeywords.length > 0) {
      for (const kw of candidateKeywords) {
        try {
          const matchedRows = await conn.execute(
            "SELECT id, name, price, original_price, images, image_url, description, category, subcategory, stock_count, available_sizes, available_colors, is_exclusive FROM products WHERE (LOWER(name) LIKE ? OR LOWER(subcategory) LIKE ?) AND status = 'published' AND (is_deleted = 0 OR is_deleted IS NULL) LIMIT 1",
            ['%' + kw + '%', '%' + kw + '%']
          );
          if (matchedRows && matchedRows.length > 0) {
            targetProduct = mapProductRow(matchedRows[0]);
            break;
          }
        } catch (e) {
          console.error('Order intent product search error:', e);
        }
      }
    }

    if (!targetProduct && body.current_product && body.current_product.id) {
      targetProduct = body.current_product;
    }

    if (targetProduct) {
      return c.json({
        reply: replyLang === 'en'
          ? ('Ready to order ' + targetProduct.name + ' (×' + orderQty + '). Fill in your name and delivery address, then submit.')
          : ('আপনার ' + targetProduct.name + ' (' + orderQty + ' টি) অর্ডারের জন্য নিচে ফরমটি প্রস্তুত করা হয়েছে। অনুগ্রহ করে আপনার নাম ও ডেলিভারির ঠিকানা দিয়ে সাবমিট করুন:'),
        order_intent: { product: targetProduct, quantity: orderQty },
        products: [targetProduct],
        total_count: 1,
        has_more: false,
        current_offset: 0,
        category_query: '',
        quick_replies: [],
        handoff: false
      });
    }
  }

  // ── Step 1: Category + customer-query routing ──
  const { matchedCategory, searchTerm } = detectCategoryMatch(lowerMsg, body.category_query);
  const wantsCatalog = hasProductCatalogSearchIntent(lowerMsg, matchedCategory);
  const faqReply = resolveFaqReply(userMessage, replyLang);

  let productsRes = [];
  let totalAvailable = 0;
  let hasMore = false;

  if (wantsCatalog) {
    const { countSql, countParams, dataSql, dataParams } = buildProductSearch(
      matchedCategory, userMessage, requestedLimit, requestedOffset
    );
    try {
      const countRows = await conn.execute(countSql, countParams);
      totalAvailable = countRows[0]?.total || 0;
      const rows = await conn.execute(dataSql, dataParams);
      productsRes = (rows || []).map(mapProductRow);
      hasMore = (requestedOffset + productsRes.length) < totalAvailable;
    } catch (err) {
      console.error('TiDB query error:', err);
    }
  }

  // ── Step 2: Determine Response (catalog → FAQ → AI → fallback) ──
  let replyText = '';

  if (wantsCatalog) {
    replyText = getCatalogReplyText(productsRes.length, requestedOffset, replyLang);
  } else if (faqReply) {
    replyText = faqReply;
  }

  // ── Step 3: AI Inference (Groq Ultra-Fast LPU & Google Gemini) with Product Context ──
  if (!replyText && (geminiApiKey || groqApiKey)) {
    const currProd = body.current_product || null;
    let prodContextStr = '';
    if (currProd) {
      prodContextStr = `
CURRENT VIEWED PRODUCT CONTEXT:
- Product Name: ${currProd.name || ''}
- Price: ৳${currProd.price || ''}
- Category/Subcategory: ${currProd.category || ''} / ${currProd.subcategory || ''}
- Description: ${currProd.description || 'Not specifically described'}
`;
    }

    const systemPrompt = `You are BigBazar AI Shopping Assistant for Big Bazar, a leading premier family fashion retail store located at 2nd Floor, Jomidar Plaza, Baraiyarhat Bazar, Mirsarai, Chittagong.
${prodContextStr}
FOOTER & BRAND KNOWLEDGE:
- Facebook: https://www.facebook.com/profile.php?id=100063541603515
- Instagram: https://www.instagram.com/big_bazar_25/
- TikTok & Videos: https://www.tiktok.com/@big.bazar2
- WhatsApp: 01824950082 (call/text for live video view, custom sizing or sharing photos: https://wa.me/8801824950082)
- Helpline: 01857045449
- Email: infobigbazar01@gmail.com
- Opening hours: Everyday 9:30 AM to 9:30 PM
- Pricing: Strict fixed-price shop ensuring fair prices and premium fabric quality.
- Delivery: Mirsarai Upazila 100% Free delivery (100 Tk advance confirmation fee), Chittagong District 100 Tk, All Bangladesh 150 Tk. Cash on delivery available.
- Bridal Zone: 'Biyer Sajani' (Exclusive bridal sarees, katan, lehenga, sherwani, kabli set, blazers).

PRODUCT INQUIRY & FABRIC INTELLIGENCE:
1. Delivery & Location Inquiries:
   - When a customer asks about delivery charge or delivery time ("delivery charge koto?", "delivery fee?", "kotodin lagbe?"):
     Explain clearly:
     * মীরসরাই উপজেলা: সম্পূর্ণ ফ্রি ডেলিভারি (১০০ টাকা অর্ডার কনফার্মেশন ফি অগ্রিম, যা মোট বিল থেকে বাদ যাবে)।
     * চট্টগ্রাম জেলা: ১০০ টাকা (১-২ দিন)।
     * সারা বাংলাদেশ: ১৫০ টাকা (২-৫ দিন)।
     Always finish by asking: "আপনার ডেলিভারির লোকেশন বা ঠিকানাটি কোথায়? (যেমন: মীরসরাই, চট্টগ্রাম নাকি অন্য কোনো জেলা?)"
   - When customer states their location (e.g. Mirsarai, Chittagong, Dhaka, Feni):
     * Mirsarai / Baraiyarhat: "মীরসরাই উপজেলায় সম্পূর্ণ ফ্রি হোম ডেলিভারি সুবিধা রয়েছে (১০০ টাকা অগ্রিম কনফার্মেশন ফি, যা মোট বিল থেকে বাদ যাবে)।"
     * Chittagong District: "চট্টগ্রাম জেলায় ডেলিভারি চার্জ মাত্র ১০০ টাকা (১-২ দিনের মধ্যে ডেলিভারি)।"
     * Other Districts: "আপনার এলাকায় ডেলিভারি চার্জ ১৫০ টাকা (২-৫ দিনের মধ্যে ক্যাশ অন ডেলিভারি)।"

2. Video Requests: If the customer asks for a video/real look of the dress/product, tell them: "এই পোশাকটির রিয়েল ভিডিও দেখতে বা লাইভ ভিডিও কলের মাধ্যমে দেখতে আমাদের অফিসিয়াল হোয়াটসঅ্যাপে (https://wa.me/8801824950082 বা 01824950082) মেসেজ দিন অথবা আমাদের টিকটক পেইজে (https://www.tiktok.com/@big.bazar2) ভিডিও দেখতে পারেন।"
3. Fabric / Material / Quality Requests:
   - If the product description contains details, use it.
   - If description is brief or missing, intelligently explain the fabric based on Bangladeshi fashion expertise:
     * Jamdani / Karchupi Saree: প্রিমিয়াম রেশম-সুতি মিক্সড সুতায় বোনা জমিন এবং নিখুঁত বিলাসবহুল কারচুপি ও জরির কাজ। পার্টি বা বিয়েতে পরার জন্য অত্যন্ত গর্জিয়াস ও আরামদায়ক।
     * Dupiyan Silk / Silk Saree: লাক্সারিয়াস ডুপিয়ান সিল্ক ফেব্রিক, চমৎকার শাইন ও নিখুঁত ড্রেপ।
     * Cotton Three-Piece / Kurti: ১০০% প্রিমিয়াম পিওর সুতি ফেব্রিক, যা অত্যন্ত আরামদায়ক, টেকসই এবং রঙ পাকা।
     * Panjabi / Sherwani: এক্সক্লুসিভ প্রিমিয়াম ফেব্রিক ও নিখুঁত ফিনিশিং।
   - Reassure the customer that Big Bazar guarantees 100% genuine quality and fixed fair pricing.

RULES:
1. Always reply in 1-2 fluent, polite, helpful Bengali sentences.
2. If customer asks for Facebook, Instagram, TikTok, Video, or any social link, provide the exact URL above.
3. Never use any emojis. Never output unfinished thoughts.`;

    if (groqApiKey) {
      const groqModels = ['openai/gpt-oss-120b', 'groq/compound', 'qwen/qwen3.6-27b'];
      for (const m of groqModels) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
              model: m,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage }
              ],
              max_tokens: 350,
              temperature: 0.3
            })
          });
          const groqData = await groqRes.json();
          let text = groqData.choices?.[0]?.message?.content?.trim() || '';
          text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
          if (text) {
            replyText = text;
            break;
          }
        } catch (e) {
          console.error(`Groq error for ${m}:`, e);
        }
      }
    }

    if (!replyText && geminiApiKey) {
      try {
        const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        for (const model of geminiModels) {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;
          const gRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemPrompt }] },
              contents: [{ role: 'user', parts: [{ text: userMessage }] }],
              generationConfig: { maxOutputTokens: 500, temperature: 0.3 }
            })
          });
          const gData = await gRes.json();
          const candidateText = gData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (candidateText) {
            replyText = candidateText;
            break;
          }
        }
      } catch (e) {
        console.error('Gemini call error:', e);
      }
    }
  }

  // ── Step 4: Smart fallbacks when AI is offline ──
  if (!replyText) {
    replyText = faqReply || getSmartFallbackReply(lowerMsg, replyLang);
  }

  return c.json({
    reply: replyText,
    products: productsRes,
    total_count: totalAvailable,
    has_more: hasMore,
    current_offset: requestedOffset,
    category_query: matchedCategory || searchTerm || '',
    quick_replies: [],
    handoff: false
  });
});


// Admin Conversation Dashboard APIs (Part 3b)
app.get('/admin/conversations/stats', requireAuth, requireAdmin, async (c) => {
  const conn = getDb(c.env);
  try {
    const cutoffActive = new Date(Date.now() - 5 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    const activeRes = await conn.execute(
      'SELECT COUNT(DISTINCT conversation_id) as active_now FROM messages WHERE created_at >= ?',
      [cutoffActive]
    );
    const todayStr = new Date(Date.now() + 6 * 3600 * 1000).toISOString().split('T')[0];
    const todayRes = await conn.execute(
      "SELECT COUNT(*) as today_total FROM conversations WHERE DATE(created_at) = ?",
      [todayStr]
    );
    return c.json({
      active_now: activeRes[0]?.active_now || 0,
      today_total: todayRes[0]?.today_total || 0
    });
  } catch (err) {
    return c.json({ active_now: 0, today_total: 0 });
  }
});

app.get('/admin/conversations', requireAuth, requireAdmin, async (c) => {
  const conn = getDb(c.env);
  const { limit = 50 } = c.req.query();
  try {
    const sql = `
      SELECT c.id, c.session_id, c.user_id, c.has_order, c.order_id, c.updated_at,
             (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
             (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
             u.name as user_name, u.email as user_email
      FROM conversations c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.updated_at DESC
      LIMIT ?
    `;
    const rows = await conn.execute(sql, [parseInt(limit)]);
    return c.json({ data: rows });
  } catch (err) {
    return c.json({ data: [] });
  }
});

app.get('/admin/conversations/:id/messages', requireAuth, requireAdmin, async (c) => {
  const id = c.req.param('id');
  const conn = getDb(c.env);
  try {
    const rows = await conn.execute(
      'SELECT id, role, content, metadata, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );
    return c.json({ data: rows });
  } catch (err) {
    return c.json({ data: [] });
  }
});

// ============================================
// EXPORT FOR CLOUDFLARE PAGES AND LOCAL SERVER
// ============================================
export const onRequest = (context) => {
  return app.fetch(context.request, context.env, context);
};

export default app;
