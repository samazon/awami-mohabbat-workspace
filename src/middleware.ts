import { defineMiddleware } from 'astro:middleware';

/**
 * Edge cache for HTML + baseline security headers.
 *
 * Workers responses are not cached by Cloudflare's CDN on their own; this uses
 * the Cache API so a homepage render is served from the colo for the
 * `s-maxage` a page sets on itself. Only anonymous GETs with a public
 * cache-control are stored. Media (/media/*) is immutable and skips this path.
 */
/** Workers' shared edge cache. The DOM lib types `caches` without `.default`. */
const edgeCache = (): Cache => (caches as unknown as { default: Cache }).default;

export const onRequest = defineMiddleware(async (context, next) => {
  const { request } = context;
  const url = new URL(request.url);
  const cacheable = request.method === 'GET' && !url.pathname.startsWith('/media/') && import.meta.env.PROD;

  if (cacheable) {
    const hit = await edgeCache().match(request);
    if (hit) return hit;
  }

  const response = await next();
  const secured = withSecurityHeaders(response);

  if (cacheable && secured.status === 200) {
    const cc = secured.headers.get('cache-control') ?? '';
    if (/\bs-maxage=\d+/.test(cc) && !/\bprivate\b/.test(cc)) {
      context.locals.cfContext?.waitUntil(edgeCache().put(request, secured.clone()));
    }
  }
  return secured;
});

function withSecurityHeaders(res: Response): Response {
  const h = new Headers(res.headers);
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('x-frame-options', 'DENY');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
