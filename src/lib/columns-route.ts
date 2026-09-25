import type { APIContext } from 'astro';
import type { Locale } from '@/i18n';
import { isPageInRange, parseColumnsQuery } from '@/lib/columns/route';
import { listColumns, listFilterColumnists, type ColumnListView, type FilterColumnist } from '@/lib/services/columns';

export interface ColumnsState {
  page: number;
  columnist: string | null;
  filters: FilterColumnist[];
  result: ColumnListView;
}

/** /columns query → view state, or null for a 404. An unknown columnist shows everyone. */
export async function resolveColumns(ctx: APIContext, locale: Locale): Promise<ColumnsState | null> {
  const q = parseColumnsQuery(ctx.url.searchParams);
  if (!q.ok) return null;
  const filters = await listFilterColumnists(locale);
  const columnist = q.columnist && filters.some((f) => f.slug === q.columnist) ? q.columnist : null;
  const result = await listColumns({ locale, columnistSlug: columnist ?? undefined, page: q.page });
  if (!isPageInRange(q.page, result.total, result.pageCount)) return null;
  return { page: q.page, columnist, filters, result };
}
