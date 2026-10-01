import { describe, expect, it } from 'vitest';
import { getIssue, listIssues, setIssueHidden, upsertIssue } from '../src/lib/magazine/data';
import { magazinePageKey, magazinePdfKey } from '../src/lib/media';
import { testDb } from './helpers/db';

const hash = (n: number) => n.toString(16).padStart(16, '0');
const pages = (n: number, base = 0) => Array.from({ length: n }, (_, i) => ({ hash: hash(base + i + 1), width: 2331, height: 3429 }));

describe('magazine keys', () => {
  it('builds month-addressed keys and rejects bad input', () => {
    expect(magazinePageKey('2019-12', 3, 'view', 'a1b2c3d4e5f60718')).toBe('magazine/2019-12/page-03-view.a1b2c3d4e5f60718.webp');
    expect(magazinePdfKey('2019-12', 'a1b2c3d4e5f60718')).toBe('magazine/2019-12/issue.a1b2c3d4e5f60718.pdf');
    expect(() => magazinePageKey('2019-13', 1, 'view', 'a1b2c3d4e5f60718')).toThrow(RangeError);
    expect(() => magazinePageKey('2019-12', 0, 'view', 'a1b2c3d4e5f60718')).toThrow(RangeError);
    expect(() => magazinePageKey('../x', 1, 'view', 'a1b2c3d4e5f60718')).toThrow(RangeError);
  });
});

describe('magazine data', () => {
  it('stores pages in order, lists newest month first with its cover', async () => {
    const { db } = testDb();
    await upsertIssue(db, { month: '2019-12', titleUr: 'دسمبر', pages: pages(3) });
    await upsertIssue(db, { month: '2020-01', titleUr: 'جنوری', titleEn: 'January', pages: pages(2, 10) });
    const list = await listIssues(db, 'en');
    expect(list.map((i) => [i.month, i.title, i.pageCount, i.cover.hash])).toEqual([
      ['2020-01', 'January', 2, hash(11)],
      ['2019-12', 'دسمبر', 3, hash(1)],
    ]);
    const issue = await getIssue(db, '2019-12', 'ur');
    expect(issue?.pages.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(issue?.pdf).toBeNull();
  });

  it('re-uploading a month replaces its pages and PDF', async () => {
    const { db } = testDb();
    const a = await upsertIssue(db, { month: '2019-12', titleUr: 'پرانا', pages: pages(5) });
    const b = await upsertIssue(db, { month: '2019-12', titleUr: 'نیا', pdf: { hash: hash(99), bytes: 1234 }, pages: pages(2, 20) });
    expect(b).toEqual({ id: a.id, created: false });
    const issue = await getIssue(db, '2019-12', 'ur');
    expect(issue?.title).toBe('نیا');
    expect(issue?.pages.map((p) => p.hash)).toEqual([hash(21), hash(22)]);
    expect(issue?.pdf).toEqual({ hash: hash(99), bytes: 1234 });
  });

  it('hides an issue and rejects bad input', async () => {
    const { db } = testDb();
    await upsertIssue(db, { month: '2019-12', titleUr: 'دسمبر', pages: pages(1) });
    expect(await setIssueHidden(db, '2019-12', true)).toBe(true);
    expect(await getIssue(db, '2019-12', 'ur')).toBeNull();
    expect(await listIssues(db, 'ur')).toEqual([]);
    await expect(upsertIssue(db, { month: '2019-13', titleUr: 'x', pages: pages(1) })).rejects.toThrow();
    await expect(upsertIssue(db, { month: '2019-11', titleUr: 'x', pages: [] })).rejects.toThrow();
  });
});
