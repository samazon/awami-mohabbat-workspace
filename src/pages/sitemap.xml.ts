import type { APIRoute } from 'astro';
import { LOCALES, localePath } from '@/i18n';

/** Homepage in each locale with hreflang alternates. Editions/articles join in phase 2. */
export const GET: APIRoute = ({ url }) => {
  const base = new URL(url.origin);
  const routes = ['/', '/about'];
  const urls = routes
    .flatMap((route) =>
      LOCALES.map((l) => {
        const loc = new URL(localePath(l, route), base).toString();
        const alts = LOCALES.map(
          (a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${new URL(localePath(a, route), base).toString()}"/>`,
        ).join('');
        return `<url><loc>${loc}</loc>${alts}<changefreq>daily</changefreq></url>`;
      }),
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=3600' },
  });
};
