import type { APIContext } from 'astro';
import { localePath, type Locale } from '@/i18n';
import { todayIso } from '@/lib/dates';
import { editionExists, getArchiveMonths, getFirstEditionDate } from '@/lib/services/editions';

export interface ArchiveState {
  year: number;
  month: number;
  /** A picked date with no edition — the page says so above the month. */
  missingDate: string | null;
  /** Bounds for the date picker: first edition … today (Pakistan time). */
  minDate: string;
  maxDate: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

/**
 * /archive shows one month: the current one (Pakistan time), or — when nothing
 * has been uploaded yet this month (say, on the 1st) — the latest month that
 * has editions. Past months are reached by date, not browsed:
 *
 *   ?date=YYYY-MM-DD  → redirect to that edition if it exists, else the notice
 *                       "not available online" above the default month.
 *
 * Old ?y=&m=&p= links are ignored and land on the default month.
 */
export async function resolveArchive(ctx: APIContext, locale: Locale): Promise<ArchiveState | Response> {
  const today = todayIso();
  const [months, first] = await Promise.all([getArchiveMonths(), getFirstEditionDate()]);
  const current = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
  const hasCurrent = months.some((m) => m.year === current.year && m.month === current.month);
  const shown = hasCurrent || !months[0] ? current : { year: months[0].year, month: months[0].month };

  let missingDate: string | null = null;
  const picked = ctx.url.searchParams.get('date');
  if (picked && ISO.test(picked) && isRealDate(picked)) {
    if (await editionExists(picked)) return ctx.redirect(localePath(locale, `/edition/${picked}`), 302);
    missingDate = picked;
  }

  return { ...shown, missingDate, minDate: first ?? today, maxDate: today };
}
