import { SLUG_RE } from './rules';

export type ColumnsQuery = { ok: true; page: number; columnist: string | null } | { ok: false };

/**
 * /columns query string → validated state. A malformed page is a 404 (ok: false);
 * a malformed or unknown columnist just means "all" (the caller checks it exists).
 */
export function parseColumnsQuery(params: URLSearchParams): ColumnsQuery {
  let page = 1;
  const rawPage = params.get('page');
  if (rawPage !== null) {
    if (!/^[1-9]\d{0,3}$/.test(rawPage)) return { ok: false };
    page = Number(rawPage);
  }
  const raw = params.get('columnist');
  const columnist = raw && raw.length <= 80 && SLUG_RE.test(raw) ? raw : null;
  return { ok: true, page, columnist };
}

export const isPageInRange = (page: number, total: number, pageCount: number): boolean =>
  page === 1 || (total > 0 && page <= pageCount);
