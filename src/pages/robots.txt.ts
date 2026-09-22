import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const sitemap = site ? new URL('/sitemap.xml', site).toString() : '/sitemap.xml';
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=86400' },
  });
};
