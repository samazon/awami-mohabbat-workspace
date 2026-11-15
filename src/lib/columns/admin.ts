import { and, asc, count, desc, eq, like, or } from 'drizzle-orm';
import { articleTranslations, articles, columnists, homepageColumns } from '../db/schema';
import { ArticleRuleError } from './rules';
import type { AnyDb } from './types';

/**
 * Admin-only reads and writes for columns, on top of write.ts. Pure (no
 * astro:* or cloudflare:* imports) so the tests run them on SQLite.
 * Web addresses are never typed: they are made here, once, and never change.
 */

/** "Dr. M. Ali" → "dr-m-ali". Throws when nothing Latin is left to make an address from. */
export function slugFromName(nameEn: string): string {
  const slug = nameEn
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  if (!slug) throw new ArticleRuleError('The English name needs some Latin letters (A–Z) — it makes the columnist’s web address.');
  return slug;
}

/** `base`, or the first of `base-2`, `base-3` … not in `taken`. */
const firstFree = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
};

export async function uniqueColumnistSlug(db: AnyDb, nameEn: string): Promise<string> {
  const base = slugFromName(nameEn);
  const rows = await db
    .select({ slug: columnists.slug })
    .from(columnists)
    .where(or(eq(columnists.slug, base), like(columnists.slug, `${base}-%`)));
  return firstFree(base, new Set(rows.map((r) => r.slug)));
}

export async function uniqueColumnSlug(db: AnyDb, date: string, columnistSlug: string): Promise<string> {
  const base = `${date}-${columnistSlug}`;
  const rows = await db
    .select({ slug: articles.slug })
    .from(articles)
    .where(or(eq(articles.slug, base), like(articles.slug, `${base}-%`)));
  return firstFree(base, new Set(rows.map((r) => r.slug)));
}

export interface AdminColumnRow {
  slug: string;
  status: 'draft' | 'published';
  publishedDate: string;
  titleUr: string;
  columnistNameUr: string;
  homeSlot: number | null;
}

/** Every column, drafts included, newest date first. */
export async function listColumnsForAdmin(db: AnyDb): Promise<AdminColumnRow[]> {
  return db
    .select({
      slug: articles.slug,
      status: articles.status,
      publishedDate: articles.publishedDate,
      titleUr: articleTranslations.title,
      columnistNameUr: columnists.nameUr,
      homeSlot: homepageColumns.slot,
    })
    .from(articles)
    .innerJoin(columnists, eq(columnists.id, articles.columnistId))
    .innerJoin(articleTranslations, and(eq(articleTranslations.articleId, articles.id), eq(articleTranslations.locale, 'ur')))
    .leftJoin(homepageColumns, eq(homepageColumns.articleId, articles.id))
    .where(eq(articles.category, 'column'))
    .orderBy(desc(articles.publishedDate), desc(articles.id));
}

export interface ColumnForEdit {
  slug: string;
  columnistSlug: string;
  publishedDate: string;
  status: 'draft' | 'published';
  ur: { title: string; excerpt: string; body: string };
  en: { title: string; excerpt: string; body: string } | null;
  homeSlot: number | null;
}

export async function getColumnForEdit(db: AnyDb, slug: string): Promise<ColumnForEdit | null> {
  const [a] = await db
    .select({ id: articles.id, slug: articles.slug, columnistSlug: columnists.slug, publishedDate: articles.publishedDate, status: articles.status, homeSlot: homepageColumns.slot })
    .from(articles)
    .innerJoin(columnists, eq(columnists.id, articles.columnistId))
    .leftJoin(homepageColumns, eq(homepageColumns.articleId, articles.id))
    .where(and(eq(articles.slug, slug), eq(articles.category, 'column')))
    .limit(1);
  if (!a) return null;
  const trs = await db.select().from(articleTranslations).where(eq(articleTranslations.articleId, a.id));
  const pick = (locale: 'ur' | 'en') => {
    const t = trs.find((x) => x.locale === locale);
    return t ? { title: t.title, excerpt: t.excerpt, body: t.body } : null;
  };
  const ur = pick('ur');
  if (!ur) return null;
  const { id: _id, ...rest } = a;
  void _id;
  return { ...rest, ur, en: pick('en') };
}

export interface AdminColumnistRow {
  slug: string;
  nameUr: string;
  nameEn: string | null;
  columnTitleUr: string;
  columnTitleEn: string | null;
  active: boolean;
  banner: { hash: string; width: number; height: number };
  columnCount: number;
}

/** Every columnist (inactive too), with how many columns they have, drafts included. */
export async function listColumnistsForAdmin(db: AnyDb): Promise<AdminColumnistRow[]> {
  const rows = await db
    .select({
      slug: columnists.slug,
      nameUr: columnists.nameUr,
      nameEn: columnists.nameEn,
      columnTitleUr: columnists.columnTitleUr,
      columnTitleEn: columnists.columnTitleEn,
      active: columnists.active,
      hash: columnists.bannerHash,
      width: columnists.bannerWidth,
      height: columnists.bannerHeight,
      columnCount: count(articles.id),
    })
    .from(columnists)
    .leftJoin(articles, eq(articles.columnistId, columnists.id))
    .groupBy(columnists.id)
    .orderBy(asc(columnists.nameUr));
  return rows.map(({ hash, width, height, columnCount, ...r }) => ({ ...r, banner: { hash, width, height }, columnCount: Number(columnCount) }));
}

/** Publish or unpublish. Unpublishing also frees the column's homepage spot (it does not come back on re-publish). */
export async function setColumnStatus(db: AnyDb, slug: string, status: 'draft' | 'published', now = Date.now()): Promise<boolean> {
  const rows = await db
    .update(articles)
    .set({ status, updatedAt: now })
    .where(and(eq(articles.slug, slug), eq(articles.category, 'column')))
    .returning({ id: articles.id });
  const row = rows[0];
  if (!row) return false;
  if (status === 'draft') await db.delete(homepageColumns).where(eq(homepageColumns.articleId, row.id));
  return true;
}

/** Delete a column for good; its translations and homepage spot go with it (FK cascade). */
export async function deleteColumn(db: AnyDb, slug: string): Promise<boolean> {
  const rows = await db
    .delete(articles)
    .where(and(eq(articles.slug, slug), eq(articles.category, 'column')))
    .returning({ id: articles.id });
  return rows.length > 0;
}

export async function setColumnistActive(db: AnyDb, slug: string, active: boolean, now = Date.now()): Promise<boolean> {
  const rows = await db.update(columnists).set({ active, updatedAt: now }).where(eq(columnists.slug, slug)).returning({ id: columnists.id });
  return rows.length > 0;
}
