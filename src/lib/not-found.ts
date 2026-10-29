import type { AstroGlobal } from 'astro';

/**
 * Render the English not-found page with a real 404 status.
 *
 * Astro keeps the 404 status only when a page rewrites to `/404` itself; a
 * rewrite to `/en/404` comes back as 200, so search engines would index every
 * mistyped or withdrawn English URL as a real page. This re-wraps the response.
 */
export async function englishNotFound(astro: AstroGlobal): Promise<Response> {
  const res = await astro.rewrite('/en/404');
  return new Response(res.body, { status: 404, statusText: 'Not Found', headers: res.headers });
}
