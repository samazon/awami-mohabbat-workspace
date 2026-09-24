import { defineMiddleware } from 'astro:middleware';

/**
 * Cache policy + baseline security headers for every response.
 *
 * Cache-Control has to be set HERE, not in a layout: Astro streams HTML, and by
 * the time a layout's frontmatter runs the headers have already gone out.
 *
 * Workers responses are not cached by Cloudflare's CDN on their own, so the
 * Cache API stores successful anonymous GETs for the page's `s-maxage`. Media
 * (/media/*) is immutable and bypasses this. Five minutes of staleness is
 * invisible on a daily paper and means no purge machinery at all.
 *
 * Browsers get `max-age=0` and no `stale-while-revalidate`: with SWR, Chrome
 * shows a returning reader the copy it already has (up to a day old — the
 * previous edition, the previous header) and only fetches the new one in the
 * background. The edge cache ignores SWR, so dropping it costs nothing there.
 */
const PUBLIC_PAGE = 'public, max-age=0, s-maxage=300';
const NO_STORE = 'private, no-store';

/** Workers' shared edge cache. The DOM lib types `caches` without `.default`. */
const edgeCache = (): Cache => (caches as unknown as { default: Cache }).default;

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);

  // One canonical host: www → apex, permanently.
  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice(4);
    return Response.redirect(url.toString(), 301);
  }

  const isMedia = url.pathname.startsWith('/media/');
  const cacheable = request.method === 'GET' && !isMedia && import.meta.env.PROD;

  if (cacheable) {
    const hit = await edgeCache().match(request);
    if (hit) {
      const h = new Headers(hit.headers);
      // The Cache API hands entries back with the zone's Browser Cache TTL
      // (4 h by default) written into max-age. Browsers must revalidate.
      const cc = h.get('cache-control');
      if (cc) h.set('cache-control', /\bmax-age=\d+/.test(cc) ? cc.replace(/\bmax-age=\d+/, 'max-age=0') : `max-age=0, ${cc}`);
      h.set('x-cache', 'HIT');
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
    }
  }

  const response = await next();
  const h = new Headers(response.headers);

  if (!isMedia && !h.has('cache-control')) {
    h.set('cache-control', request.method === 'GET' && response.status === 200 ? PUBLIC_PAGE : NO_STORE);
  }
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('x-frame-options', 'DENY');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  if (cacheable) h.set('x-cache', 'MISS');

  const out = new Response(response.body, { status: response.status, statusText: response.statusText, headers: h });

  if (cacheable && out.status === 200) {
    const cc = h.get('cache-control') ?? '';
    if (/\bs-maxage=\d+/.test(cc) && !/\bprivate\b/.test(cc)) {
      context.locals.cfContext?.waitUntil(edgeCache().put(request, out.clone()));
    }
  }
  return out;
});
