/**
 * Shared guard for /admin endpoints that take a raw file as the request body.
 * The middleware has already checked Cloudflare Access. Astro's origin check
 * only covers form content types, so the Origin is checked here too (CSRF):
 * a same-origin fetch always sends it.
 */
export function rawUploadGuard(request: Request, url: URL, maxBytes: number): Response | null {
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Cross-site request refused.' }, 403);
  const length = Number(request.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(length) || length <= 0) return json({ error: 'Empty upload.' }, 400);
  if (length > maxBytes) return json({ error: 'The file is too large.' }, 413);
  return null;
}

export const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
