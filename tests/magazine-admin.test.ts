import { describe, expect, it } from 'vitest';
import { deleteIssue, listIssuesForAdmin, setIssueHidden, updateIssueTitles, upsertIssue } from '../src/lib/magazine/data';
import { MAGAZINE_PDF_MAX_BYTES, MagazineUploadError, checkMagazinePdf } from '../src/lib/magazine/upload';
import { testDb } from './helpers/db';

const pg = (h: string) => ({ hash: h.padEnd(16, '0'), width: 2400, height: 3400 });

describe('magazine admin data', () => {
  it('lists every issue (hidden too) with page count and cover, newest first', async () => {
    const { db } = testDb();
    await upsertIssue(db, { month: '2026-09', titleUr: 'ستمبر', pages: [pg('a1'), pg('a2')] });
    await upsertIssue(db, { month: '2026-10', titleUr: 'اکتوبر', titleEn: 'October', pdf: { hash: 'f'.repeat(16), bytes: 9 }, pages: [pg('b1')] });
    await setIssueHidden(db, '2026-09', true);
    const rows = await listIssuesForAdmin(db);
    expect(rows.map((r) => [r.month, r.pageCount, r.hidden, r.hasPdf, r.cover?.hash])).toEqual([
      ['2026-10', 1, false, true, 'b1'.padEnd(16, '0')],
      ['2026-09', 2, true, false, 'a1'.padEnd(16, '0')],
    ]);
  });

  it('edits titles, clearing English with null', async () => {
    const { db } = testDb();
    await upsertIssue(db, { month: '2026-10', titleUr: 'اکتوبر', titleEn: 'October', pages: [pg('b1')] });
    expect(await updateIssueTitles(db, '2026-10', { titleUr: 'نیا', titleEn: null })).toBe(true);
    expect((await listIssuesForAdmin(db))[0]).toMatchObject({ titleUr: 'نیا', titleEn: null });
    expect(await updateIssueTitles(db, '2026-11', { titleUr: 'x', titleEn: null })).toBe(false);
    await expect(updateIssueTitles(db, '2026-10', { titleUr: ' ', titleEn: null })).rejects.toThrow();
  });

  it('deletes an issue with its pages and returns their files', async () => {
    const { db } = testDb();
    await upsertIssue(db, { month: '2026-10', titleUr: 'اکتوبر', pdf: { hash: 'f'.repeat(16), bytes: 9 }, pages: [pg('b1'), pg('b2')] });
    const gone = await deleteIssue(db, '2026-10');
    expect(gone?.pages.map((p) => p.n)).toEqual([1, 2]);
    expect(gone?.pdfHash).toBe('f'.repeat(16));
    expect(await listIssuesForAdmin(db)).toEqual([]);
    expect(await deleteIssue(db, '2026-10')).toBeNull();
  });
});

describe('checkMagazinePdf', () => {
  it('requires a non-empty PDF under the limit', () => {
    expect(() => checkMagazinePdf(new TextEncoder().encode('%PDF-1.7'))).not.toThrow();
    expect(() => checkMagazinePdf(new TextEncoder().encode('PK\x03\x04'))).toThrow(/not a PDF/);
    expect(() => checkMagazinePdf(new Uint8Array(0))).toThrow(MagazineUploadError);
    expect(() => checkMagazinePdf(new Uint8Array(MAGAZINE_PDF_MAX_BYTES + 1))).toThrow(/limit/);
  });
});
