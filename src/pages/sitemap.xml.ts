import type { APIRoute } from 'astro';
import { LOCALES, localePath } from '@/i18n';
import { getRecentEditions } from '@/lib/services/editions';
import { listPublishedColumnSlugs } from '@/lib/services/columns';

/**
 * Static routes plus every published edition and column, each in both locales with hreflang alternates.
 * Every new indexable page belongs here. The under-construction sections
 * (/media-forum, /magazine) are noindex, so they join the list once built.
 */
export const GET: APIRoute = async ({ url }) => {
  const base = new URL(url.origin);
  const [editions, columns] = await Promise.all([getRecentEditions('ur', { limit: 5000 }), listPublishedColumnSlugs()]);
  const routes: { path: string; changefreq: string }[] = [
    { path: '/', changefreq: 'daily' },
    { path: '/archive', changefreq: 'daily' },
    { path: '/columns', changefreq: 'daily' },
    { path: '/gallery', changefreq: 'weekly' },
    { path: '/about', changefreq: 'monthly' },
    { path: '/team', changefreq: 'monthly' },
    { path: '/contact', changefreq: 'monthly' },
    ...editions.map((e) => ({ path: `/edition/${e.date}`, changefreq: 'yearly' })),
    ...columns.map((c) => ({ path: `/columns/${c.slug}`, changefreq: 'monthly' })),
  ];
  const urls = routes
    .flatMap((r) =>
      LOCALES.map((l) => {
        const loc = new URL(localePath(l, r.path), base).toString();
        const alts = LOCALES.map(
          (a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${new URL(localePath(a, r.path), base).toString()}"/>`,
        ).join('');
        return `<url><loc>${loc}</loc>${alts}<changefreq>${r.changefreq}</changefreq></url>`;
      }),
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=3600' },
  });
};
