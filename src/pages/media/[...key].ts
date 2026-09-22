import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { IMMUTABLE_CACHE_CONTROL, contentTypeFor } from '@/lib/media';

/**
 * Serves R2 objects through the Worker. Used in local dev and until the R2
 * custom domain (cdn.<domain>) is configured — after that CDN_BASE points
 * there and this route simply stops receiving traffic.
 *
 * Keys are allow-listed to our three prefixes and a conservative charset;
 * anything else is a 404, never a bucket listing or a traversal.
 */
const KEY = /^(editions|articles|ads)\/[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)+$/;

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!KEY.test(key) || key.includes('..')) {
    return new Response('Not found', { status: 404 });
  }

  const object = await env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const etag = object.httpEtag;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { etag, 'cache-control': IMMUTABLE_CACHE_CONTROL } });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has('content-type')) headers.set('content-type', contentTypeFor(key));
  headers.set('etag', etag);
  headers.set('cache-control', IMMUTABLE_CACHE_CONTROL);
  headers.set('content-length', String(object.size));
  headers.set('x-content-type-options', 'nosniff');

  return new Response(object.body, { status: 200, headers });
};
