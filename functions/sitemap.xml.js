/**
 * Cloudflare Pages Function — Dynamic Cached XML Sitemap.
 * Generates an XML sitemap for static pages and dynamic product routes.
 * Implements 24-hour edge caching via Cloudflare caches.default.
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const cacheKey = new Request(url.toString(), request);
  const cache = caches.default;

  // Try retrieving cached sitemap response
  let response = await cache.match(cacheKey);
  if (response) {
    return response;
  }

  let domain = url.origin;
  try {
    const preferred = String(env?.PUBLIC_SITE_ORIGIN || '').trim().replace(/\/$/, '');
    if (preferred) domain = new URL(preferred).origin;
  } catch (_) {}
  const staticRoutes = [
    '',
    '/about-us',
    '/store-locations',
    '/faq',
    '/shipping',
    '/returns',
    '/size-guide',
    '/contact-us',
    '/privacy-policy',
    '/terms'
  ];

  const currentDate = new Date().toISOString().split('T')[0];

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

  // Add static routes
  for (const r of staticRoutes) {
    const loc = `${domain}${r}`;
    const priority = r === '' ? '1.0' : '0.8';
    xml += `  <url>\n`;
    xml += `    <loc>${loc}</loc>\n`;
    xml += `    <lastmod>${currentDate}</lastmod>\n`;
    xml += `    <changefreq>daily</changefreq>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // Prefer live products API; fall back to static JSON if API unavailable
  try {
    let products = null;
    try {
      const apiRes = await fetch(`${domain}/api/products?status=published&limit=100&page=0`);
      if (apiRes.ok) {
        const apiJson = await apiRes.json();
        if (Array.isArray(apiJson?.data)) products = apiJson.data;
      }
    } catch (_) {}

    if (!products) {
      const prodRes = await fetch(`${domain}/all_products.json`);
      if (prodRes.ok) {
        const json = await prodRes.json();
        if (Array.isArray(json)) products = json;
      }
    }

    if (Array.isArray(products)) {
      for (const p of products) {
        if (p.id) {
          const lastMod = p.created_at ? String(p.created_at).split('T')[0] : currentDate;
          xml += `  <url>\n`;
          xml += `    <loc>${domain}/product/${p.id}</loc>\n`;
          xml += `    <lastmod>${lastMod}</lastmod>\n`;
          xml += `    <changefreq>weekly</changefreq>\n`;
          xml += `    <priority>0.7</priority>\n`;
          xml += `  </url>\n`;
        }
      }
    }
  } catch (err) {
    console.warn('Sitemap products fetch warning:', err);
  }

  xml += `</urlset>`;

  response = new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400'
    }
  });

  // Store in Cloudflare edge cache asynchronously
  context.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}
