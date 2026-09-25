import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { articleTranslations, articles } from '../src/lib/db/schema';
import { ArticleRuleError } from '../src/lib/columns/rules';
import { listHomepageSlots, setHomepageSlot, upsertColumn, upsertColumnist } from '../src/lib/columns/write';
import { testDb } from './helpers/db';

const columnist = {
  slug: 'iqbal-khokhar',
  nameUr: 'اقبال کھوکھر',
  columnTitleUr: 'قلم کا فرض',
  banner: { hash: 'a1b2c3d4e5f60718', width: 902, height: 625 },
};
const column = (slug: string, over: Record<string, unknown> = {}) => ({
  slug,
  columnist: 'iqbal-khokhar',
  publishedDate: '2026-09-20',
  status: 'published' as const,
  ur: { title: `عنوان ${slug}`, excerpt: 'مختصر', body: 'متن' },
  ...over,
});

async function setup() {
  const { db } = testDb();
  await upsertColumnist(db, columnist);
  return db;
}

describe('upsertColumnist', () => {
  it('inserts, then updates in place on the same slug', async () => {
    const { db } = testDb();
    const a = await upsertColumnist(db, columnist);
    const b = await upsertColumnist(db, { ...columnist, columnTitleUr: 'نیا نام' });
    expect(b).toBe(a);
  });
});

describe('upsertColumn', () => {
  it('writes the article and its Urdu translation with no author', async () => {
    const db = await setup();
    const id = await upsertColumn(db, column('a'));
    const [tr] = await db.select().from(articleTranslations).where(eq(articleTranslations.articleId, id));
    expect(tr).toMatchObject({ locale: 'ur', title: 'عنوان a', author: null });
  });

  it('updates in place and removes an English row the file no longer has', async () => {
    const db = await setup();
    const id = await upsertColumn(db, column('a', { en: { title: 'T', excerpt: 'E', body: 'B' } }));
    expect(await upsertColumn(db, column('a'))).toBe(id);
    const rows = await db.select().from(articleTranslations).where(eq(articleTranslations.articleId, id));
    expect(rows.map((r) => r.locale)).toEqual(['ur']);
  });

  it('refuses an unknown columnist', async () => {
    const db = await setup();
    await expect(upsertColumn(db, column('a', { columnist: 'nobody' }))).rejects.toThrow(ArticleRuleError);
  });

  it('refuses a slug already used by a non-column article', async () => {
    const db = await setup();
    await db.insert(articles).values({ slug: 'taken', category: 'report', publishedDate: '2026-09-01', createdAt: 0, updatedAt: 0 });
    await expect(upsertColumn(db, column('taken'))).rejects.toThrow(/report/);
  });
});

describe('setHomepageSlot', () => {
  it('fills slots, moves a column to a new slot, and clears', async () => {
    const db = await setup();
    await upsertColumn(db, column('a'));
    await upsertColumn(db, column('b'));
    await setHomepageSlot(db, 1, 'a');
    await setHomepageSlot(db, 3, 'b');
    await setHomepageSlot(db, 2, 'a'); // moves a from 1 to 2
    expect(await listHomepageSlots(db)).toEqual([
      { slot: 2, slug: 'a', status: 'published' },
      { slot: 3, slug: 'b', status: 'published' },
    ]);
    await setHomepageSlot(db, 3, null);
    expect((await listHomepageSlots(db)).map((s) => s.slot)).toEqual([2]);
  });

  it('refuses drafts, non-columns, unknown slugs and slots outside 1-3', async () => {
    const db = await setup();
    await upsertColumn(db, column('draft', { status: 'draft' }));
    await db.insert(articles).values({ slug: 'rep', category: 'report', status: 'published', publishedDate: '2026-09-01', createdAt: 0, updatedAt: 0 });
    await expect(setHomepageSlot(db, 1, 'draft')).rejects.toThrow(/draft/);
    await expect(setHomepageSlot(db, 1, 'rep')).rejects.toThrow(/not a column/);
    await expect(setHomepageSlot(db, 1, 'missing')).rejects.toThrow(/No article/);
    await expect(setHomepageSlot(db, 4, 'draft')).rejects.toThrow();
  });
});
