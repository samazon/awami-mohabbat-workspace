import type { APIRoute } from 'astro';
import { isLocale } from '@/i18n';
import { getEditionByDate } from '@/lib/services/editions';

/** GET /api/v1/editions/YYYY-MM-DD?locale=ur|en — one edition with its four pages. */
export const GET: APIRoute = async ({ params, url }) => {
  const date = params.date ?? '';
  const locale = url.searchParams.get('locale') ?? 'ur';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
  if (!isLocale(locale)) return json({ error: 'locale must be ur or en' }, 400);

  const edition = await getEditionByDate(date, locale);
  if (!edition) return json({ error: 'not found' }, 404);
  return json({ locale, edition });
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'no-store',
    },
  });
