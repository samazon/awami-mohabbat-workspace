import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { editionPages, editionTranslations, editions, siteConfig } from '../src/lib/db/schema';
import {
  deleteDraftEdition,
  getEditionStatus,
  listEditions,
  publishEdition,
  writeEdition,
  type EditionWriteInput,
} from '../src/lib/editions/data';
import { EditionUploadError, PAGE_MAX_BYTES, checkPage, checkPdf, contentHash16 } from '../src/lib/editions/upload';
import { readImageHeader, readPngHeader } from '../src/lib/image-header';
import { contentHash } from '../scripts/ingest';
import { SITE_CONFIG } from '../scripts/seed-static';
import { testDb } from './helpers/db';

const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#eee' } });
const page = { hash: 'a1b2c3d4e5f60718', width: 2400, height: 3600, origBytes: 900_000 };
const draft = (over: Partial<EditionWriteInput> = {}): EditionWriteInput => ({
  date: '2026-11-14',
  volume: 20,
  issue: 150,
  pdf: { hash: 'ffeeddccbbaa9988', bytes: 5_000_000 },
  pages: [page, page, page, page],
  ur: { headline: 'سرخی', summary: 'خلاصہ' },
  en: null,
  status: 'draft',
  ...over,
});

async function withConfig() {
  const t = testDb();
  await t.db.insert(siteConfig).values({ ...SITE_CONFIG(1), currentVolume: 20, currentIssue: 149 });
  return t;
}
const masthead = async (db: ReturnType<typeof testDb>['db']) =>
  (await db.select({ v: siteConfig.currentVolume, i: siteConfig.currentIssue }).from(siteConfig))[0];

describe('readPngHeader', () => {
  it('reads PNG sizes and leaves readImageHeader (team photos) refusing PNG', async () => {
    const png = await img(1600, 2400).png().toBuffer();
    expect(readPngHeader(png)).toEqual({ type: 'png', width: 1600, height: 2400 });
    expect(readImageHeader(png)).toBeNull();
    expect(readPngHeader(await img(10, 10).jpeg().toBuffer())).toBeNull();
    expect(readPngHeader(new TextEncoder().encode('not a png at all, really not'))).toBeNull();
  });
});

describe('checkPage', () => {
  it('accepts JPEG and PNG pages of any width (the paper scans at ~1140px)', async () => {
    expect(checkPage(await img(1140, 1700).jpeg().toBuffer(), 1)).toEqual({ ext: 'jpg', contentType: 'image/jpeg', width: 1140, height: 1700 });
    expect(checkPage(await img(2000, 3000).png().toBuffer(), 2)).toMatchObject({ ext: 'png', width: 2000 });
    expect(checkPage(await img(600, 900).jpeg().toBuffer(), 3).width).toBe(600);
  });
  it('refuses other formats, empty files and oversized files by their bytes', async () => {
    const webp = await img(1600, 2400).webp().toBuffer();
    expect(() => checkPage(webp, 1)).toThrow(/JPEG or PNG/);
    expect(() => checkPage(new TextEncoder().encode('<svg onload=alert(1)>'), 1)).toThrow(/JPEG or PNG/);
    expect(() => checkPage(new Uint8Array(0), 4)).toThrow(/missing or empty/);
    expect(() => checkPage(new Uint8Array(PAGE_MAX_BYTES + 1), 1)).toThrow(EditionUploadError);
  });
});

describe('checkPdf', () => {
  it('requires the %PDF- signature and a non-empty file', () => {
    expect(() => checkPdf(new TextEncoder().encode('%PDF-1.7\n…'))).not.toThrow();
    expect(() => checkPdf(new TextEncoder().encode('<html>'))).toThrow(/not a PDF/);
    expect(() => checkPdf(new Uint8Array(0))).toThrow(/missing/);
  });
});

describe('contentHash16', () => {
  it('matches the seed CLI hash, so keys are the same whichever path uploaded them', async () => {
    const buf = await img(50, 50).jpeg().toBuffer();
    expect(await contentHash16(new Uint8Array(buf))).toBe(contentHash(buf));
  });
});

describe('edition writes', () => {
  it('saves a draft without touching the masthead, then publishes it', async () => {
    const { db } = await withConfig();
    await writeEdition(db, draft());
    expect(await getEditionStatus(db, '2026-11-14')).toBe('draft');
    expect(await masthead(db)).toEqual({ v: 20, i: 149 });
    const [row] = await db.select().from(editions);
    expect(row).toMatchObject({ status: 'draft', publishedAt: null, pdfHash: 'ffeeddccbbaa9988' });
    expect(await db.select().from(editionPages)).toHaveLength(4);

    expect(await publishEdition(db, '2026-11-14')).toBe(true);
    expect(await getEditionStatus(db, '2026-11-14')).toBe('published');
    expect(await masthead(db)).toEqual({ v: 20, i: 150 });
    expect(await publishEdition(db, '2026-11-14')).toBe(false); // already live
  });

  it('never rolls the masthead back when a back-dated edition is published', async () => {
    const { db } = await withConfig();
    await writeEdition(db, draft({ status: 'published' }));
    await writeEdition(db, draft({ date: '2026-11-01', issue: 137, status: 'published' }));
    expect(await masthead(db)).toEqual({ v: 20, i: 150 });
  });

  it('stores headlines without summaries (summary saved empty)', async () => {
    const { db } = await withConfig();
    await writeEdition(db, draft({ ur: { headline: 'سرخی' }, en: { headline: 'Headline', machineTranslated: false } }));
    const rows = await db.select().from(editionTranslations);
    expect(rows.map((r) => [r.locale, r.headline, r.summary]).sort()).toEqual([
      ['en', 'Headline', ''],
      ['ur', 'سرخی', ''],
    ]);
    await expect(writeEdition(db, draft({ en: { headline: ' ', machineTranslated: false } }))).rejects.toThrow();
  });

  it('stores 0 for a missing Vol/Issue and leaves the masthead alone', async () => {
    const { db } = await withConfig();
    await writeEdition(db, draft({ volume: undefined, issue: undefined, status: 'published' }));
    expect((await db.select().from(editions))[0]).toMatchObject({ volume: 0, issue: 0 });
    expect(await masthead(db)).toEqual({ v: 20, i: 149 });
  });

  it('rejects bad input before writing anything', async () => {
    const { db } = await withConfig();
    await expect(writeEdition(db, draft({ pages: [page, page, page] }))).rejects.toThrow(/exactly 4/);
    await expect(writeEdition(db, draft({ date: '2026-02-30x' }))).rejects.toThrow();
    await expect(writeEdition(db, draft({ ur: { headline: '  ', summary: 'x' } }))).rejects.toThrow();
    await expect(writeEdition(db, draft({ pages: [{ ...page, hash: '../../etc' }, page, page, page] }))).rejects.toThrow();
    expect(await db.select().from(editions)).toHaveLength(0);
  });

  it('replaces the edition on the same date, and deletes drafts only', async () => {
    const { db } = await withConfig();
    await writeEdition(db, draft({ status: 'published' }));
    expect(await deleteDraftEdition(db, '2026-11-14')).toBe(false);
    await writeEdition(db, draft({ issue: 151 }));
    expect(await db.select().from(editions)).toHaveLength(1);
    expect((await db.select().from(editions).where(eq(editions.date, '2026-11-14')))[0]!.issue).toBe(151);
    expect(await deleteDraftEdition(db, '2026-11-14')).toBe(true);
    expect(await db.select().from(editionPages)).toHaveLength(0); // cascaded
  });

  it('lists drafts and live editions newest first', async () => {
    const { db } = await withConfig();
    await writeEdition(db, draft({ date: '2026-11-13', issue: 149, status: 'published' }));
    await writeEdition(db, draft());
    expect((await listEditions(db)).map((e) => [e.date, e.status, e.headlineUr, e.hasPdf])).toEqual([
      ['2026-11-14', 'draft', 'سرخی', true],
      ['2026-11-13', 'published', 'سرخی', true],
    ]);
  });
});
