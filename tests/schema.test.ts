import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { articles, columnists, homepageColumns } from '../src/lib/db/schema';
import { dbError, testDb } from './helpers/db';

const now = 1_790_000_000_000;
type Db = ReturnType<typeof testDb>['db'];

async function seedColumnist(db: Db) {
  const [c] = await db
    .insert(columnists)
    .values({
      slug: 'iqbal-khokhar',
      nameUr: 'اقبال کھوکھر',
      columnTitleUr: 'قلم کا فرض',
      bannerHash: 'a1b2c3d4e5f60718',
      bannerWidth: 902,
      bannerHeight: 625,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return c!;
}

const article = (over: Partial<typeof articles.$inferInsert>) => ({
  slug: 'maqami-sahafat',
  category: 'column' as const,
  publishedDate: '2026-09-20',
  status: 'published' as const,
  createdAt: now,
  updatedAt: now,
  ...over,
});

describe('columns schema', () => {
  it('rejects a column without a columnist', async () => {
    const { db } = testDb();
    expect(await dbError(db.insert(articles).values(article({})))).toMatch(/CHECK/i);
  });

  it('rejects a non-column that has a columnist', async () => {
    const { db } = testDb();
    const c = await seedColumnist(db);
    expect(await dbError(db.insert(articles).values(article({ category: 'report', columnistId: c.id })))).toMatch(/CHECK/i);
  });

  it('accepts a column with a columnist', async () => {
    const { db } = testDb();
    const c = await seedColumnist(db);
    await db.insert(articles).values(article({ columnistId: c.id }));
    expect(await db.select().from(articles)).toHaveLength(1);
  });

  it('refuses to delete a columnist who still has columns', async () => {
    const { db } = testDb();
    const c = await seedColumnist(db);
    await db.insert(articles).values(article({ columnistId: c.id }));
    expect(await dbError(db.delete(columnists).where(eq(columnists.id, c.id)))).toMatch(/FOREIGN KEY/i);
  });

  it('only allows slots 1 to 3, and one slot per column', async () => {
    const { db } = testDb();
    const c = await seedColumnist(db);
    const [a] = await db.insert(articles).values(article({ columnistId: c.id })).returning();
    expect(await dbError(db.insert(homepageColumns).values({ slot: 4, articleId: a!.id, updatedAt: now }))).toMatch(/CHECK/i);
    await db.insert(homepageColumns).values({ slot: 1, articleId: a!.id, updatedAt: now });
    expect(await dbError(db.insert(homepageColumns).values({ slot: 2, articleId: a!.id, updatedAt: now }))).toMatch(/UNIQUE/i);
  });

  it('empties the slot when the column is deleted', async () => {
    const { db } = testDb();
    const c = await seedColumnist(db);
    const [a] = await db.insert(articles).values(article({ columnistId: c.id })).returning();
    await db.insert(homepageColumns).values({ slot: 1, articleId: a!.id, updatedAt: now });
    await db.delete(articles).where(eq(articles.id, a!.id));
    expect(await db.select().from(homepageColumns)).toEqual([]);
  });
});
