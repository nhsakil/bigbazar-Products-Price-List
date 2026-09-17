/**
 * Stable import path for the Hono API (avoids dynamic import of [[path]].js).
 * Cloudflare file routing still uses [[path]].js for /api/*.
 */
export { onRequest, default } from './[[path]].js';
