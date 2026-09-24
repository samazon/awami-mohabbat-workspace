import { and, asc, desc, eq, gt, inArray, like, lt, sql } from 'drizzle-orm';
import { CDN_BASE } from 'astro:env/server';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { editionPages, editionTranslations, editions, type Edition } from '@/lib/db/schema';
import {
  PAGE_NUMBERS,
  editionPageKey,
  editionPdfKey,
  mediaUrl,
  type PageNumber,
} from '@/lib/media';
import { resolveTranslation, type TranslationMeta } from './translate';

export interface PageView {
  n: PageNumber;
  thumb: string;
  view: string;
  zoom: string;
  width: number;
  height: number;
}

export interface EditionView {
  id: number;
  date: string; // YYYY-MM-DD
  hijriDate: string;
  volume: number;
  issue: number;
  headline: string;
  summary: string;
  translation: TranslationMeta;
  pages: PageView[]; // always length 4, ordered
  pdfUrl: string | null;
  pdfBytes: number | null;
}

/** Archive card: no pages beyond the front-page thumbnail. */
export interface EditionCard {
  date: string;
  headline: string;
  thumb: string | null;
  translation: TranslationMeta;
}

const publishedOnly = eq(editions.status, 'published');

async function assemble(rows: Edition[], locale: Locale): Promise<EditionView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [pages, translations] = await Promise.all([
    db().select().from(editionPages).where(inArray(editionPages.editionId, ids)),
    db().select().from(editionTranslations).where(inArray(editionTranslations.editionId, ids)),
  ]);

  const views: EditionView[] = [];
  for (const e of rows) {
    const t = resolveTranslation(
      translations.filter((x) => x.editionId === e.id),
      locale,
    );
    if (!t) continue; // no Urdu source row → not renderable; skip rather than crash

    const pageRows = pages.filter((p) => p.editionId === e.id);
    const pageViews: PageView[] = [];
    for (const n of PAGE_NUMBERS) {
      const p = pageRows.find((x) => x.pageNumber === n);
      if (!p) break; // incomplete edition
      pageViews.push({
        n,
        thumb: mediaUrl(CDN_BASE, editionPageKey(e.date, n, 'thumb', p.hash)),
        view: mediaUrl(CDN_BASE, editionPageKey(e.date, n, 'view', p.hash)),
        zoom: mediaUrl(CDN_BASE, editionPageKey(e.date, n, 'zoom', p.hash)),
        width: p.width,
        height: p.height,
      });
    }
    if (pageViews.length !== PAGE_NUMBERS.length) continue; // rule 04: four or nothing

    views.push({
      id: e.id,
      date: e.date,
      hijriDate: e.hijriDate,
      volume: e.volume,
      issue: e.issue,
      headline: t.row.headline,
      summary: t.row.summary,
      translation: t.meta,
      pages: pageViews,
      pdfUrl: e.pdfHash ? mediaUrl(CDN_BASE, editionPdfKey(e.date, e.pdfHash)) : null,
      pdfBytes: e.pdfHash ? e.pdfBytes : null,
    });
  }
  return views;
}

/** The newest published edition — "today's" paper, even if today's isn't up yet. */
export async function getLatestEdition(locale: Locale): Promise<EditionView | null> {
  const rows = await db().select().from(editions).where(publishedOnly).orderBy(desc(editions.date)).limit(1);
  const [view] = await assemble(rows, locale);
  return view ?? null;
}

export async function getEditionByDate(date: string, locale: Locale): Promise<EditionView | null> {
  const rows = await db()
    .select()
    .from(editions)
    .where(and(publishedOnly, eq(editions.date, date)))
    .limit(1);
  const [view] = await assemble(rows, locale);
  return view ?? null;
}

/** Recent editions strictly before `beforeDate` (exclusive), newest first. */
export async function getRecentEditions(
  locale: Locale,
  opts: { limit: number; beforeDate?: string },
): Promise<EditionCard[]> {
  const where = opts.beforeDate
    ? and(publishedOnly, lt(editions.date, opts.beforeDate))
    : publishedOnly;
  const rows = await db().select().from(editions).where(where).orderBy(desc(editions.date)).limit(opts.limit);
  const views = await assemble(rows, locale);
  return views.map((v) => ({
    date: v.date,
    headline: v.headline,
    thumb: v.pages[0]?.thumb ?? null,
    translation: v.translation,
  }));
}

// ---------------------------------------------------------------------------
// Archive + edition navigation
// ---------------------------------------------------------------------------

/** The editions immediately before and after `date` (published only). */
export async function getAdjacentEditions(
  date: string,
): Promise<{ prev: string | null; next: string | null }> {
  const [[prev], [next]] = await Promise.all([
    db().select({ date: editions.date }).from(editions).where(and(publishedOnly, lt(editions.date, date))).orderBy(desc(editions.date)).limit(1),
    db().select({ date: editions.date }).from(editions).where(and(publishedOnly, gt(editions.date, date))).orderBy(asc(editions.date)).limit(1),
  ]);
  return { prev: prev?.date ?? null, next: next?.date ?? null };
}

export interface ArchiveMonth {
  year: number;
  month: number; // 1..12
  count: number;
}

/** Every (year, month) that has at least one published edition, newest first. */
export async function getArchiveMonths(): Promise<ArchiveMonth[]> {
  const ym = sql<string>`substr(${editions.date}, 1, 7)`;
  const rows = await db()
    .select({ ym, count: sql<number>`count(*)` })
    .from(editions)
    .where(publishedOnly)
    .groupBy(ym)
    .orderBy(desc(ym));
  return rows.map((r) => ({ year: Number(r.ym.slice(0, 4)), month: Number(r.ym.slice(5, 7)), count: Number(r.count) }));
}

export interface ArchivePage {
  items: EditionCard[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
}

/** Published editions in a month, newest first, paginated. */
export async function getEditionsInMonth(
  locale: Locale,
  year: number,
  month: number,
  opts: { page?: number; perPage?: number } = {},
): Promise<ArchivePage> {
  const perPage = Math.min(48, Math.max(1, opts.perPage ?? 12));
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-%`;
  const where = and(publishedOnly, like(editions.date, prefix));

  const [countRow] = await db().select({ total: sql<number>`count(*)` }).from(editions).where(where);
  const total = Number(countRow?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pageCount, Math.max(1, opts.page ?? 1));

  const rows = await db()
    .select()
    .from(editions)
    .where(where)
    .orderBy(desc(editions.date))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const views = await assemble(rows, locale);
  return {
    items: views.map((v) => ({ date: v.date, headline: v.headline, thumb: v.pages[0]?.thumb ?? null, translation: v.translation })),
    total,
    page,
    perPage,
    pageCount,
  };
}

/** True when a published edition exists for `date`. */
export async function editionExists(date: string): Promise<boolean> {
  const [row] = await db().select({ id: editions.id }).from(editions).where(and(publishedOnly, eq(editions.date, date))).limit(1);
  return !!row;
}
