import type { APIRoute } from 'astro';
import { isLocale } from '@/i18n';
import { getRecentEditions } from '@/lib/services/editions';

/**
 * GET /api/v1/editions?locale=ur|en&limit=1..50&before=YYYY-MM-DD
 * Read-only. The same service call the homepage uses — this is the boundary a
 * future app or partner feed would consume.
 */
export const GET: APIRoute = async ({ url }) => {
  const locale = url.searchParams.get('locale') ?? 'ur';
  const limitRaw = url.searchParams.get('limit') ?? '10';
  const before = url.searchParams.get('before') ?? undefined;

  if (!isLocale(locale)) return bad('locale must be ur or en');
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return bad('limit must be an integer 1..50');
  if (before !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(before)) return bad('before must be YYYY-MM-DD');

  const editions = await getRecentEditions(locale, { limit, beforeDate: before });
  return json({ locale, editions });
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'no-store',
    },
  });

const bad = (message: string) => json({ error: message }, 400);
