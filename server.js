import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import apiApp from './functions/api/[[path]].js';

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');

const app = new Hono();

// Inject Hostinger / Node.js environment variables into Hono context
app.use('*', async (c, next) => {
  c.env = { ...(c.env || {}), ...process.env };
  await next();
});

// Mount API routes under /api (standard for frontend fetch calls) and / (fallback)
app.route('/api', apiApp);
app.route('/', apiApp);

// Serve static assets from the dist folder built by Vite
app.use('/assets/*', serveStatic({ root: './dist' }));
app.use('/b.jpg', serveStatic({ root: './dist' }));
app.use('/favicon.ico', serveStatic({ root: './dist' }));
app.use('/robots.txt', serveStatic({ root: './dist' }));
app.use('/sitemap.xml', serveStatic({ root: './dist' }));
app.use('/*', serveStatic({ root: './dist' }));

// SPA Fallback: Serve dist/index.html for any client-side routes (e.g. /admin, /product/123)
app.get('*', (c) => {
  const reqPath = c.req.path;
  // If it's an API route that wasn't matched, return 404 JSON
  if (reqPath.startsWith('/api/')) {
    return c.json({ error: 'Endpoint not found' }, 404);
  }

  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, 'utf8');
    return c.html(html);
  }
  return c.text('Frontend build not found. Please run "npm run build" first.', 500);
});

// Port configuration for Hostinger / VPS / Production
const port = parseInt(process.env.PORT || '3000', 10);
const host = '0.0.0.0';

console.log(`=============================================`);
console.log(`BigBazar Production Server starting...`);
console.log(`Domain: ${process.env.PUBLIC_SITE_ORIGIN || 'https://onlinebigbazar.com'}`);
console.log(`Server listening on: http://${host}:${port}`);
console.log(`Database Host: ${process.env.DB_HOST || 'Not specified'}`);
console.log(`=============================================`);

serve({
  fetch: app.fetch,
  port,
  hostname: host,
});

export default app;
