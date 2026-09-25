import { and, asc, eq, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { articleTranslations, articles, columnists, homepageColumns } from '../db/schema';
import { ArticleRuleError, ColumnInput, ColumnistInput, Slot, assertArticleInvariants } from './rules';
import type { AnyDb } from './types';

/**
 * Writes for columns, shared by the `pnpm columns` CLI today and the admin
 * panel later. Every input is parsed at this boundary; Drizzle parameterises
 * every statement.
 */

export async function upsertColumnist(db: AnyDb, raw: z.input<typeof ColumnistInput>, now = Date.now()): Promise<number> {
  const c = ColumnistInput.parse(raw);
  const values = {
    nameUr: c.nameUr,
    nameEn: c.nameEn ?? null,
    columnTitleUr: c.columnTitleUr,
    columnTitleEn: c.columnTitleEn ?? null,
    bannerHash: c.banner.hash,
    bannerWidth: c.banner.width,
    bannerHeight: c.banner.height,
    active: c.active,
    updatedAt: now,
  };
  const [row] = await db
    .insert(columnists)
    .values({ slug: c.slug, ...values, createdAt: now })
    .onConflictDoUpdate({ target: columnists.slug, set: values })
    .returning({ id: columnists.id });
  return row!.id;
}

export async function upsertColumn(db: AnyDb, raw: z.input<typeof ColumnInput>, now = Date.now()): Promise<number> {
  const c = ColumnInput.parse(raw);

  const [writer] = await db.select({ id: columnists.id }).from(columnists).where(eq(columnists.slug, c.columnist)).limit(1);
  if (!writer) throw new ArticleRuleError(`No columnist with slug "${c.columnist}".`);

  const [existing] = await db
    .select({ category: articles.category })
    .from(articles)
    .where(eq(articles.slug, c.slug))
    .limit(1);
  if (existing && existing.category !== 'column') {
    throw new ArticleRuleError(`"${c.slug}" is already used by a ${existing.category} article.`);
  }
  assertArticleInvariants({ category: 'column', columnistId: writer.id, translations: [] });

  const values = { category: 'column' as const, columnistId: writer.id, publishedDate: c.publishedDate, status: c.status, updatedAt: now };
  const [row] = await db
    .insert(articles)
    .values({ slug: c.slug, ...values, createdAt: now })
    .onConflictDoUpdate({ target: articles.slug, set: values })
    .returning({ id: articles.id });
  const id = row!.id;

  // The file is the source of truth: a locale it no longer has is removed.
  for (const [locale, tr] of [['ur', c.ur], ['en', c.en]] as const) {
    if (!tr) {
      await db.delete(articleTranslations).where(and(eq(articleTranslations.articleId, id), eq(articleTranslations.locale, locale)));
      continue;
    }
    const t = { title: tr.title, excerpt: tr.excerpt, body: tr.body, author: null, updatedAt: now };
    await db
      .insert(articleTranslations)
      .values({ articleId: id, locale, ...t })
      .onConflictDoUpdate({ target: [articleTranslations.articleId, articleTranslations.locale], set: t });
  }
  return id;
}

/** Put a published column in slot 1-3 (moving it if it's in another slot), or clear the slot with `null`. */
export async function setHomepageSlot(db: AnyDb, slotRaw: number, articleSlug: string | null, now = Date.now()): Promise<void> {
  const slot = Slot.parse(slotRaw);
  if (articleSlug === null) {
    await db.delete(homepageColumns).where(eq(homepageColumns.slot, slot));
    return;
  }
  const [a] = await db
    .select({ id: articles.id, category: articles.category, status: articles.status })
    .from(articles)
    .where(eq(articles.slug, articleSlug))
    .limit(1);
  if (!a) throw new ArticleRuleError(`No article with slug "${articleSlug}".`);
  if (a.category !== 'column') throw new ArticleRuleError(`"${articleSlug}" is not a column.`);
  if (a.status !== 'published') throw new ArticleRuleError(`"${articleSlug}" is a draft; publish it before putting it on the homepage.`);

  await db.delete(homepageColumns).where(and(eq(homepageColumns.articleId, a.id), ne(homepageColumns.slot, slot)));
  await db
    .insert(homepageColumns)
    .values({ slot, articleId: a.id, updatedAt: now })
    .onConflictDoUpdate({ target: homepageColumns.slot, set: { articleId: a.id, updatedAt: now } });
}

export async function listHomepageSlots(db: AnyDb): Promise<{ slot: number; slug: string; status: 'draft' | 'published' }[]> {
  return db
    .select({ slot: homepageColumns.slot, slug: articles.slug, status: articles.status })
    .from(homepageColumns)
    .innerJoin(articles, eq(articles.id, homepageColumns.articleId))
    .orderBy(asc(homepageColumns.slot));
}
