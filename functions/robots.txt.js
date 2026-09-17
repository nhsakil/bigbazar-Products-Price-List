/**
 * Cloudflare Pages Function — AI & Search Engine Crawling Rules (robots.txt).
 * Explicitly allows search bots and AI answer engine crawlers.
 */

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const domain = url.origin;

  const robots = `# AI & Search Engine Crawling Rules for Big Bazar Baraiyarhat
User-agent: *
Allow: /

User-agent: Googlebot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Bingbot
Allow: /

Disallow: /admin
Disallow: /api/auth/

Sitemap: ${domain}/sitemap.xml
`;

  return new Response(robots, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400'
    }
  });
}
