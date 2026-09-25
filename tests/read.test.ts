import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { articles } from '../src/lib/db/schema';
import {
  getColumn,
  getHomepageColumns,
  listColumns,
  listFilterColumnists,
  listPublishedColumnSlugs,
  moreFromColumnist,
} from '../src/lib/columns/read';
import { setHomepageSlot, upsertColumn, upsertColumnist } from '../src/lib/columns/write';
import { testDb } from './helpers/db';

const banner = { hash: 'a1b2c3d4e5f60718', width: 902, height: 625 };

async function world() {
  const { db } = testDb();
  await upsertColumnist(db, { slug: 'iqbal-khokhar', nameUr: 'اقبال کھوکھر', nameEn: 'Iqbal Khokhar', columnTitleUr: 'قلم کا فرض', banner });
  await upsertColumnist(db, { slug: 'samina-rasheed', nameUr: 'ثمینہ رشید', columnTitleUr: 'آئینہ', banner });
  await upsertColumnist(db, { slug: 'retired', nameUr: 'سابق', columnTitleUr: 'پرانا', banner, active: false });
  // 14 published columns by Iqbal, days 01..14; 1 by Samina; 1 draft; 1 by the retired writer.
  for (let d = 1; d <= 14; d++) {
    const day = String(d).padStart(2, '0');
    await upsertColumn(db, {
      slug: `iqbal-${day}`, columnist: 'iqbal-khokhar', publishedDate: `2026-09-${day}`, status: 'published',
      ur: { title: `کالم ${day}`, excerpt: 'مختصر', body: '## سرخی\n\nمتن' },
      ...(d === 14 ? { en: { title: 'Column 14', excerpt: 'Short', body: 'Text' } } : {}),
    });
  }
  await upsertColumn(db, { slug: 'samina-1', columnist: 'samina-rasheed', publishedDate: '2026-09-10', status: 'published', ur: { title: 'آئینہ ۱', excerpt: 'م', body: 'م' } });
  await upsertColumn(db, { slug: 'draft-1', columnist: 'samina-rasheed', publishedDate: '2026-09-20', status: 'draft', ur: { title: 'مسودہ', excerpt: 'م', body: 'م' } });
  await upsertColumn(db, { slug: 'old-1', columnist: 'retired', publishedDate: '2026-08-01', status: 'published', ur: { title: 'پرانا ۱', excerpt: 'م', body: 'م' } });
  return db;
}

describe('listColumns', () => {
  it('pages newest first, published only', async () => {
    const db = await world();
    const p1 = await listColumns(db, { locale: 'ur', page: 1 });
    expect(p1.total).toBe(16); // 14 + samina-1 + old-1, no draft
    expect(p1.pageCount).toBe(2);
    // samina-1 shares 2026-09-10 with iqbal-10 but was inserted later (higher id), so it comes first.
    expect(p1.items.map((i) => i.slug)).toEqual([
      'iqbal-14', 'iqbal-13', 'iqbal-12', 'iqbal-11', 'samina-1', 'iqbal-10',
      'iqbal-09', 'iqbal-08', 'iqbal-07', 'iqbal-06', 'iqbal-05', 'iqbal-04',
    ]);
    const p2 = await listColumns(db, { locale: 'ur', page: 2 });
    expect(p2.items.map((i) => i.slug)).toEqual(['iqbal-03', 'iqbal-02', 'iqbal-01', 'old-1']);
  });

  it('filters by columnist', async () => {
    const db = await world();
    const r = await listColumns(db, { locale: 'ur', columnistSlug: 'samina-rasheed', page: 1 });
    expect(r.items.map((i) => i.slug)).toEqual(['samina-1']);
  });

  it('uses English where it exists and falls back to Urdu, labelled', async () => {
    const db = await world();
    const r = await listColumns(db, { locale: 'en', page: 1 });
    const en = r.items.find((i) => i.slug === 'iqbal-14')!;
    const ur = r.items.find((i) => i.slug === 'iqbal-13')!;
    expect(en).toMatchObject({ title: 'Column 14', translation: { locale: 'en', isFallback: false } });
    expect(ur).toMatchObject({ title: 'کالم 13', translation: { locale: 'ur', isFallback: true } });
    expect(en.columnist).toMatchObject({ name: 'Iqbal Khokhar', nameLang: 'en', columnTitle: 'قلم کا فرض', columnTitleLang: 'ur' });
  });
});

describe('getColumn', () => {
  it('returns rendered HTML and reading time for a published column', async () => {
    const db = await world();
    const c = await getColumn(db, 'iqbal-03', 'ur');
    expect(c).toMatchObject({ slug: 'iqbal-03', readingMinutes: 1, bodyHtml: '<h2>سرخی</h2>\n<p>متن</p>\n' });
    expect(c!.banner).toEqual({ columnistSlug: 'iqbal-khokhar', ...banner });
  });

  it('returns null for drafts, unknown slugs and non-columns', async () => {
    const db = await world();
    await db.insert(articles).values({ slug: 'rep', category: 'report', status: 'published', publishedDate: '2026-09-01', createdAt: 0, updatedAt: 0 });
    expect(await getColumn(db, 'draft-1', 'ur')).toBeNull();
    expect(await getColumn(db, 'nope', 'ur')).toBeNull();
    expect(await getColumn(db, 'rep', 'ur')).toBeNull();
  });
});

describe('moreFromColumnist', () => {
  it('returns up to three others by the same writer, newest first', async () => {
    const db = await world();
    const c = (await getColumn(db, 'iqbal-14', 'ur'))!;
    const more = await moreFromColumnist(db, c.columnist.id, c.articleId, 'ur');
    expect(more.map((m) => m.slug)).toEqual(['iqbal-13', 'iqbal-12', 'iqbal-11']);
  });
});

describe('listFilterColumnists', () => {
  it('lists active writers who have a published column', async () => {
    const db = await world();
    expect((await listFilterColumnists(db, 'ur')).map((c) => c.slug).sort()).toEqual(['iqbal-khokhar', 'samina-rasheed']);
  });
});

describe('getHomepageColumns', () => {
  it('returns picks in slot order and drops ones that were unpublished', async () => {
    const db = await world();
    expect(await getHomepageColumns(db, 'ur')).toEqual([]);
    await setHomepageSlot(db, 3, 'samina-1');
    await setHomepageSlot(db, 1, 'iqbal-02');
    await setHomepageSlot(db, 2, 'iqbal-05');
    expect((await getHomepageColumns(db, 'ur')).map((c) => c.slug)).toEqual(['iqbal-02', 'iqbal-05', 'samina-1']);
    await db.update(articles).set({ status: 'draft' }).where(eq(articles.slug, 'iqbal-05'));
    expect((await getHomepageColumns(db, 'ur')).map((c) => c.slug)).toEqual(['iqbal-02', 'samina-1']);
  });
});

describe('listPublishedColumnSlugs', () => {
  it('lists every published column for the sitemap', async () => {
    const db = await world();
    const slugs = await listPublishedColumnSlugs(db);
    expect(slugs).toHaveLength(16);
    expect(slugs.some((s) => s.slug === 'draft-1')).toBe(false);
  });
});
