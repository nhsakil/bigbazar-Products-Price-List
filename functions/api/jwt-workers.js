/**
 * Workers-compatible JWT (HS256) using Web Crypto API.
 * Drop-in replacement for `jsonwebtoken` sign/verify in Cloudflare Workers.
 */

const encoder = new TextEncoder();

function base64UrlEncode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function parseExpiry(expiresIn) {
  if (typeof expiresIn === 'number') return expiresIn;
  if (typeof expiresIn !== 'string') return 0;
  const match = expiresIn.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return 0;
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return 0;
  }
}

async function getKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Sign a JWT payload with HMAC-SHA256.
 * @param {object} payload - The JWT claims
 * @param {string} secret - The HMAC secret
 * @param {object} [options] - { expiresIn: '30d' | number (seconds) }
 * @returns {Promise<string>} Signed JWT string
 */
export async function jwtSign(payload, secret, options = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const claims = { ...payload, iat: now };
  if (options.expiresIn) {
    const seconds = parseExpiry(options.expiresIn);
    if (seconds > 0) claims.exp = now + seconds;
  }

  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await getKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Verify a JWT and return its decoded payload.
 * @param {string} token - The JWT string
 * @param {string} secret - The HMAC secret
 * @returns {Promise<object>} Decoded payload
 * @throws {Error} If token is invalid or expired
 */
export async function jwtVerify(token, secret) {
  if (!token || typeof token !== 'string') throw new Error('Invalid token');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token structure');

  const [headerB64, payloadB64, signatureB64] = parts;

  // Verify signature
  const key = await getKey(secret);
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(signingInput));
  if (!valid) throw new Error('Invalid signature');

  // Decode and check expiry
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}
