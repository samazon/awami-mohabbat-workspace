import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url }) => {
  const sitemap = new URL('/sitemap.xml', url.origin).toString();
  const body = ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', `Sitemap: ${sitemap}`, ''].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, s-maxage=86400' },
  });
};
