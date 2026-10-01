import type { APIRoute } from 'astro';
import { LOCALES, localePath } from '@/i18n';
import { getRecentEditions } from '@/lib/services/editions';
import { listPublishedColumnSlugs } from '@/lib/services/columns';
import { gallerySitemapPages } from '@/lib/services/gallery';
import { specialSitemapPages } from '@/lib/services/special';
import { magazineSitemapPages } from '@/lib/services/magazine';

/**
 * Static routes plus every published edition and column, each in both locales with hreflang alternates.
 * Gallery and special-edition pages carry <image:image> entries (Google's image sitemap extension) for their photos.
 * Every new indexable page belongs here. The under-construction sections
 * (/media-forum) are noindex, so they join the list once built.
 */
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ url }) => {
  const base = new URL(url.origin);
  const [editions, columns, galleryPages, specialPages, magazinePages] = await Promise.all([
    getRecentEditions('ur', { limit: 5000 }),
    listPublishedColumnSlugs(),
    gallerySitemapPages(base),
    specialSitemapPages(base),
    magazineSitemapPages(base),
  ]);
  const galleryImages = new Map([...galleryPages, ...specialPages, ...magazinePages].map((g) => [g.path, g.images]));
  const routes: { path: string; changefreq: string }[] = [
    { path: '/', changefreq: 'daily' },
    { path: '/archive', changefreq: 'daily' },
    { path: '/columns', changefreq: 'daily' },
    { path: '/gallery', changefreq: 'weekly' },
    ...galleryPages.filter((g) => g.path !== '/gallery').map((g) => ({ path: g.path, changefreq: 'weekly' })),
    { path: '/special-editions', changefreq: 'weekly' },
    { path: '/magazine', changefreq: 'monthly' },
    ...magazinePages.map((g) => ({ path: g.path, changefreq: 'yearly' })),
    ...specialPages.filter((g) => g.path !== '/special-editions').map((g) => ({ path: g.path, changefreq: 'weekly' })),
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
        const images = (galleryImages.get(r.path) ?? []).map((src) => `<image:image><image:loc>${esc(src)}</image:loc></image:image>`).join('');
        return `<url><loc>${esc(loc)}</loc>${alts}<changefreq>${r.changefreq}</changefreq>${images}</url>`;
      }),
    )
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls}</urlset>`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=3600' },
  });
};
