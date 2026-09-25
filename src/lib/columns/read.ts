import { and, asc, desc, eq, inArray, ne, sql, type SQL } from 'drizzle-orm';
import type { Locale } from '../../i18n';
import { articleTranslations, articles, columnists, homepageColumns, type Article, type Columnist } from '../db/schema';
import { resolveTranslation, type TranslationMeta } from '../services/translate';
import { readingMinutes, renderMarkdown } from './markdown';
import type { AnyDb } from './types';

export const PER_PAGE = 12;

export interface BannerRef {
  columnistSlug: string;
  hash: string;
  width: number;
  height: number;
}

export interface ColumnSummary {
  articleId: number;
  slug: string;
  publishedDate: string;
  title: string;
  excerpt: string;
  columnist: { id: number; slug: string; name: string; nameLang: Locale; columnTitle: string; columnTitleLang: Locale };
  banner: BannerRef;
  translation: TranslationMeta;
}

export interface ColumnDetail extends ColumnSummary {
  bodyHtml: string;
  readingMinutes: number;
}

export interface ColumnList {
  items: ColumnSummary[];
  total: number;
  page: number;
  pageCount: number;
  perPage: number;
}

export interface FilterColumnist {
  slug: string;
  name: string;
  nameLang: Locale;
}

const publishedColumn = and(eq(articles.category, 'column'), eq(articles.status, 'published'));

/** English when we have it, else the Urdu source, and say which. */
const pick = (en: string | null, ur: string, locale: Locale): { text: string; lang: Locale } =>
  locale === 'en' && en ? { text: en, lang: 'en' } : { text: ur, lang: 'ur' };

type Joined = { a: Article; c: Columnist };

async function assemble(db: AnyDb, rows: Joined[], locale: Locale): Promise<(ColumnSummary & { body: string })[]> {
  if (rows.length === 0) return [];
  const trs = await db
    .select()
    .from(articleTranslations)
    .where(inArray(articleTranslations.articleId, rows.map((r) => r.a.id)));
  const out: (ColumnSummary & { body: string })[] = [];
  for (const { a, c } of rows) {
    const t = resolveTranslation(trs.filter((x) => x.articleId === a.id), locale);
    if (!t) continue; // no Urdu source row: not renderable
    const name = pick(c.nameEn, c.nameUr, locale);
    const title = pick(c.columnTitleEn, c.columnTitleUr, locale);
    out.push({
      articleId: a.id,
      slug: a.slug,
      publishedDate: a.publishedDate,
      title: t.row.title,
      excerpt: t.row.excerpt,
      body: t.row.body,
      columnist: { id: c.id, slug: c.slug, name: name.text, nameLang: name.lang, columnTitle: title.text, columnTitleLang: title.lang },
      banner: { columnistSlug: c.slug, hash: c.bannerHash, width: c.bannerWidth, height: c.bannerHeight },
      translation: t.meta,
    });
  }
  return out;
}

const summary = ({ body: _body, ...rest }: ColumnSummary & { body: string }): ColumnSummary => rest;

const joined = (db: AnyDb) =>
  db.select({ a: articles, c: columnists }).from(articles).innerJoin(columnists, eq(columnists.id, articles.columnistId));

const newestFirst = [desc(articles.publishedDate), desc(articles.id)];

export async function listColumns(
  db: AnyDb,
  opts: { locale: Locale; columnistSlug?: string; page: number },
): Promise<ColumnList> {
  const where: SQL | undefined = opts.columnistSlug ? and(publishedColumn, eq(columnists.slug, opts.columnistSlug)) : publishedColumn;
  const [count] = await db
    .select({ n: sql<number>`count(*)` })
    .from(articles)
    .innerJoin(columnists, eq(columnists.id, articles.columnistId))
    .where(where);
  const total = Number(count?.n ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows = await joined(db)
    .where(where)
    .orderBy(...newestFirst)
    .limit(PER_PAGE)
    .offset((opts.page - 1) * PER_PAGE);
  const items = (await assemble(db, rows, opts.locale)).map(summary);
  return { items, total, page: opts.page, pageCount, perPage: PER_PAGE };
}

export async function getColumn(db: AnyDb, slug: string, locale: Locale): Promise<ColumnDetail | null> {
  const rows = await joined(db).where(and(publishedColumn, eq(articles.slug, slug))).limit(1);
  const [c] = await assemble(db, rows, locale);
  if (!c) return null;
  const { body, ...rest } = c;
  return { ...rest, bodyHtml: renderMarkdown(body), readingMinutes: readingMinutes(body) };
}

export async function moreFromColumnist(
  db: AnyDb,
  columnistId: number,
  excludeArticleId: number,
  locale: Locale,
  limit = 3,
): Promise<ColumnSummary[]> {
  const rows = await joined(db)
    .where(and(publishedColumn, eq(articles.columnistId, columnistId), ne(articles.id, excludeArticleId)))
    .orderBy(...newestFirst)
    .limit(limit);
  return (await assemble(db, rows, locale)).map(summary);
}

export async function listFilterColumnists(db: AnyDb, locale: Locale): Promise<FilterColumnist[]> {
  const rows = await db
    .selectDistinct({ slug: columnists.slug, nameUr: columnists.nameUr, nameEn: columnists.nameEn })
    .from(columnists)
    .innerJoin(articles, eq(articles.columnistId, columnists.id))
    .where(and(eq(columnists.active, true), publishedColumn))
    .orderBy(asc(columnists.nameUr));
  return rows.map((r) => {
    const n = pick(r.nameEn, r.nameUr, locale);
    return { slug: r.slug, name: n.text, nameLang: n.lang };
  });
}

/** The editors' picks in slot order. Only published columns count; an empty result hides the section. */
export async function getHomepageColumns(db: AnyDb, locale: Locale): Promise<ColumnSummary[]> {
  const rows = await db
    .select({ a: articles, c: columnists })
    .from(homepageColumns)
    .innerJoin(articles, eq(articles.id, homepageColumns.articleId))
    .innerJoin(columnists, eq(columnists.id, articles.columnistId))
    .where(publishedColumn)
    .orderBy(asc(homepageColumns.slot));
  return (await assemble(db, rows, locale)).map(summary);
}

export async function listPublishedColumnSlugs(db: AnyDb): Promise<{ slug: string; publishedDate: string }[]> {
  return db
    .select({ slug: articles.slug, publishedDate: articles.publishedDate })
    .from(articles)
    .where(publishedColumn)
    .orderBy(...newestFirst);
}
