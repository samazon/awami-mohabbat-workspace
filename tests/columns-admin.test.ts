import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  deleteColumn,
  getColumnForEdit,
  listColumnistsForAdmin,
  listColumnsForAdmin,
  setColumnStatus,
  setColumnistActive,
  slugFromName,
  uniqueColumnSlug,
  uniqueColumnistSlug,
} from '../src/lib/columns/admin';
import { ArticleRuleError } from '../src/lib/columns/rules';
import { BANNER_MAX_BYTES, BannerError, checkBanner } from '../src/lib/columns/banner';
import { setHomepageSlot, upsertColumn, upsertColumnist } from '../src/lib/columns/write';
import { testDb } from './helpers/db';

const banner = { hash: 'a1b2c3d4e5f60718', width: 1200, height: 300 };
const tr = (title: string) => ({ title, excerpt: `${title} خلاصہ`, body: `${title} متن` });

async function seeded() {
  const t = testDb();
  await upsertColumnist(t.db, { slug: 'iqbal-khokhar', nameUr: 'اقبال کھوکھر', nameEn: 'Iqbal Khokhar', columnTitleUr: 'قلم کا فرض', banner });
  return t;
}
const column = (slug: string, date: string, status: 'draft' | 'published' = 'published', withEn = false) => ({
  slug,
  columnist: 'iqbal-khokhar',
  publishedDate: date,
  status,
  ur: tr(`کالم ${slug}`),
  en: withEn ? { title: 'Title', excerpt: 'Excerpt', body: 'Body' } : undefined,
});

describe('slugFromName', () => {
  it('makes a web address from the English name', () => {
    expect(slugFromName('Iqbal Khokhar')).toBe('iqbal-khokhar');
    expect(slugFromName('  Dr. M. Ali  ')).toBe('dr-m-ali');
  });
  it('refuses a name with no Latin letters or digits', () => {
    expect(() => slugFromName('اقبال')).toThrow(ArticleRuleError);
    expect(() => slugFromName('—')).toThrow(ArticleRuleError);
  });
});

describe('unique slugs', () => {
  it('numbers a columnist slug that is taken', async () => {
    const { db } = testDb();
    expect(await uniqueColumnistSlug(db, 'Iqbal Khokhar')).toBe('iqbal-khokhar');
    await upsertColumnist(db, { slug: 'iqbal-khokhar', nameUr: 'ا', columnTitleUr: 'ق', banner });
    expect(await uniqueColumnistSlug(db, 'Iqbal Khokhar')).toBe('iqbal-khokhar-2');
  });
  it('gives two columns by one writer on one date different addresses', async () => {
    const { db } = await seeded();
    const first = await uniqueColumnSlug(db, '2026-11-15', 'iqbal-khokhar');
    expect(first).toBe('2026-11-15-iqbal-khokhar');
    await upsertColumn(db, column(first, '2026-11-15'));
    const second = await uniqueColumnSlug(db, '2026-11-15', 'iqbal-khokhar');
    expect(second).toBe('2026-11-15-iqbal-khokhar-2');
    await upsertColumn(db, column(second, '2026-11-15'));
    expect(await uniqueColumnSlug(db, '2026-11-15', 'iqbal-khokhar')).toBe('2026-11-15-iqbal-khokhar-3');
  });
});

describe('admin lists and edit', () => {
  it('lists drafts and live columns newest first, with their homepage spot', async () => {
    const { db } = await seeded();
    await upsertColumn(db, column('a', '2026-11-01'));
    await upsertColumn(db, column('b', '2026-11-10', 'draft'));
    await setHomepageSlot(db, 2, 'a');
    expect((await listColumnsForAdmin(db)).map((c) => [c.slug, c.status, c.homeSlot, c.columnistNameUr])).toEqual([
      ['b', 'draft', null, 'اقبال کھوکھر'],
      ['a', 'published', 2, 'اقبال کھوکھر'],
    ]);
  });
  it('returns a column for editing with both languages, and keeps its slug on re-save', async () => {
    const { db } = await seeded();
    await upsertColumn(db, column('a', '2026-11-01', 'published', true));
    const c = await getColumnForEdit(db, 'a');
    expect(c).toMatchObject({ slug: 'a', columnistSlug: 'iqbal-khokhar', publishedDate: '2026-11-01', ur: { title: 'کالم a' }, en: { title: 'Title' } });
    await upsertColumn(db, { ...column('a', '2026-11-01'), ur: tr('نیا') });
    expect((await listColumnsForAdmin(db)).map((x) => [x.slug, x.titleUr])).toEqual([['a', 'نیا']]);
    expect((await getColumnForEdit(db, 'a'))?.en).toBeNull();
    expect(await getColumnForEdit(db, 'missing')).toBeNull();
  });
});

describe('status and delete', () => {
  it('unpublishing frees the homepage spot, and re-publishing does not take it back', async () => {
    const { db } = await seeded();
    await upsertColumn(db, column('a', '2026-11-01'));
    await setHomepageSlot(db, 2, 'a');
    expect(await setColumnStatus(db, 'a', 'draft')).toBe(true);
    expect((await listColumnsForAdmin(db))[0]).toMatchObject({ status: 'draft', homeSlot: null });
    await setColumnStatus(db, 'a', 'published');
    expect((await listColumnsForAdmin(db))[0]).toMatchObject({ status: 'published', homeSlot: null });
    expect(await setColumnStatus(db, 'missing', 'draft')).toBe(false);
  });
  it('deletes a column with its spot', async () => {
    const { db } = await seeded();
    await upsertColumn(db, column('a', '2026-11-01'));
    await setHomepageSlot(db, 1, 'a');
    expect(await deleteColumn(db, 'a')).toBe(true);
    expect(await listColumnsForAdmin(db)).toEqual([]);
    expect(await deleteColumn(db, 'a')).toBe(false);
  });
  it('retires a columnist and counts their drafts too', async () => {
    const { db } = await seeded();
    await upsertColumn(db, column('a', '2026-11-01'));
    await upsertColumn(db, column('b', '2026-11-02', 'draft'));
    expect(await setColumnistActive(db, 'iqbal-khokhar', false)).toBe(true);
    expect((await listColumnistsForAdmin(db))[0]).toMatchObject({ slug: 'iqbal-khokhar', active: false, columnCount: 2, banner });
    expect(await setColumnistActive(db, 'nobody', true)).toBe(false);
  });
});

describe('checkBanner', () => {
  const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#335' } });
  it('accepts JPEG and PNG logos, reading the size from the bytes', async () => {
    expect(checkBanner(await img(1200, 300).jpeg().toBuffer())).toEqual({ ext: 'jpg', contentType: 'image/jpeg', width: 1200, height: 300 });
    expect(checkBanner(await img(900, 250).png().toBuffer())).toEqual({ ext: 'png', contentType: 'image/png', width: 900, height: 250 });
  });
  it('refuses WebP, non-images, empty and oversized files', async () => {
    const webp = await img(600, 200).webp().toBuffer();
    expect(() => checkBanner(webp)).toThrow(BannerError);
    expect(() => checkBanner(new TextEncoder().encode('<svg onload=alert(1)>'))).toThrow(BannerError);
    expect(() => checkBanner(new Uint8Array(0))).toThrow(BannerError);
    expect(() => checkBanner(new Uint8Array(BANNER_MAX_BYTES + 1))).toThrow(/10 MB|limit/);
  });
});
