import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { deriveSpecialEdition } from '../scripts/ingest';
import { PER_PAGE, addSpecial, listAllSpecials, listSpecials, setSpecialHidden, updateSpecial } from '../src/lib/special/data';
import { specialEditionKey } from '../src/lib/media';
import { testDb } from './helpers/db';

const hash = (n: number) => n.toString(16).padStart(16, '0');
const add = (db: ReturnType<typeof testDb>['db'], n: number, extra: Record<string, string> = {}) =>
  addSpecial(db, { hash: hash(n), width: 900, height: 1600, titleUr: `عنوان ${n}`, ...extra });

describe('specialEditionKey', () => {
  it('builds hashed keys under special/ and rejects bad input', () => {
    expect(specialEditionKey('a1b2c3d4e5f60718', 'view')).toBe('special/a1b2c3d4e5f60718/page-view.webp');
    expect(() => specialEditionKey('../x', 'view')).toThrow(RangeError);
    expect(() => specialEditionKey('a1b2c3d4e5f60718', 'orig' as never)).toThrow(RangeError);
  });
});

describe('deriveSpecialEdition', () => {
  it('makes a 480w thumb and never upscales the view', async () => {
    const img = await sharp({ create: { width: 900, height: 1600, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const out = await deriveSpecialEdition(img);
    expect(out.variants.map((v) => [v.variant, v.width])).toEqual([['thumb', 480], ['view', 900]]);
  });
});

describe('special editions data', () => {
  it('orders newest date first, undated last', async () => {
    const { db } = testDb();
    await add(db, 1, { publishedDate: '2017-06-22' });
    await add(db, 2);
    await add(db, 3, { publishedDate: '2026-05-29' });
    await add(db, 4, { publishedDate: '2019-05-30' });
    await add(db, 5);
    const page = await listSpecials(db, { locale: 'ur', page: 1 });
    expect(page.items.map((p) => p.hash)).toEqual([hash(3), hash(4), hash(1), hash(5), hash(2)]);
  });

  it('re-adding the same file updates it instead of duplicating', async () => {
    const { db } = testDb();
    await add(db, 1);
    const again = await add(db, 1, { titleUr: 'نیا عنوان', publishedDate: '2020-01-01' });
    expect(again.created).toBe(false);
    const [row] = await listAllSpecials(db);
    expect(row).toMatchObject({ titleUr: 'نیا عنوان', publishedDate: '2020-01-01' });
    expect((await listAllSpecials(db)).length).toBe(1);
  });

  it('uses the English title on English pages when there is one', async () => {
    const { db } = testDb();
    await add(db, 1, { titleEn: 'English title' });
    await add(db, 2);
    const en = await listSpecials(db, { locale: 'en', page: 1 });
    expect(en.items.map((p) => [p.title, p.titleLang])).toEqual([['عنوان 2', 'ur'], ['English title', 'en']]);
  });

  it('edits, hides, paginates, and rejects bad input', async () => {
    const { db } = testDb();
    const { id } = await add(db, 1);
    expect(await updateSpecial(db, id, { publishedDate: '2025-06-11', titleEn: 'X' })).toBe(true);
    expect(await updateSpecial(db, id, { titleEn: null })).toBe(true);
    await expect(updateSpecial(db, id, { publishedDate: '2025-02-30' })).rejects.toThrow();
    await setSpecialHidden(db, id, true);
    expect((await listSpecials(db, { locale: 'ur', page: 1 })).total).toBe(0);
    for (let i = 2; i <= PER_PAGE + 3; i++) await add(db, i);
    expect((await listSpecials(db, { locale: 'ur', page: 2 })).items.length).toBe(2);
    await expect(addSpecial(db, { hash: hash(99), width: 10, height: 10, titleUr: '' })).rejects.toThrow();
    await expect(addSpecial(db, { hash: hash(99), width: 10, height: 10, titleUr: 'x', publishedDate: '1 May' })).rejects.toThrow();
  });
});
