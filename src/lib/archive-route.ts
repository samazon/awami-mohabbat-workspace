import type { APIContext } from 'astro';
import { localePath, type Locale } from '@/i18n';
import { editionExists, getArchiveMonths, type ArchiveMonth } from '@/lib/services/editions';

export interface ArchiveState {
  year: number;
  month: number;
  page: number;
  months: ArchiveMonth[];
  missingDate: string | null;
}

/**
 * Resolve /archive's query string into a validated view, or a redirect.
 *
 *   ?date=YYYY-MM-DD  → redirect to that edition if it exists, else that month + notice
 *   ?y=&m=&p=         → that month/page; anything malformed falls back to the newest month
 */
export async function resolveArchive(ctx: APIContext, locale: Locale): Promise<ArchiveState | Response> {
  const q = ctx.url.searchParams;
  const months = await getArchiveMonths();
  const newest = months[0] ?? { year: new Date().getFullYear(), month: new Date().getMonth() + 1, count: 0 };

  const picked = q.get('date');
  let missingDate: string | null = null;
  let year = newest.year;
  let month = newest.month;

  if (picked && /^\d{4}-\d{2}-\d{2}$/.test(picked) && !Number.isNaN(Date.parse(`${picked}T00:00:00Z`))) {
    if (await editionExists(picked)) return ctx.redirect(localePath(locale, `/edition/${picked}`), 302);
    missingDate = picked;
    year = Number(picked.slice(0, 4));
    month = Number(picked.slice(5, 7));
  } else {
    const y = Number(q.get('y'));
    const m = Number(q.get('m'));
    if (Number.isInteger(y) && y >= 1900 && y <= 2100) year = y;
    if (Number.isInteger(m) && m >= 1 && m <= 12) month = m;
  }

  const p = Number(q.get('p'));
  const page = Number.isInteger(p) && p >= 1 && p <= 10000 ? p : 1;

  return { year, month, page, months, missingDate };
}
