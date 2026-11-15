import { and, desc, eq, gt } from 'drizzle-orm';
import { z } from 'zod';
import { editionPages, editionTranslations, editions, siteConfig } from '../db/schema';
import { isoToDate } from '../dates';
import { PAGE_COUNT, assertIsoDate } from '../media';
import type { AnyDb } from '../columns/types';

/**
 * Edition writes, shared by the seed CLI (scripts/seed.ts), the admin panel and
 * the tests. Pure: no astro:* or cloudflare:* imports, so Node can run it.
 * Every write is parsed here first (CWE-20); Drizzle parameterises the SQL.
 */

const isoDate = z.string().refine((d) => {
  try {
    assertIsoDate(d);
    return true;
  } catch {
    return false;
  }
}, 'must be a real date as YYYY-MM-DD');
const hash = z.string().regex(/^[a-f0-9]{16}$/, 'must be a 16-character content hash');
const positive = z.number().int().positive();
const text = (max: number) => z.string().trim().min(1).max(max);

/** The summary is optional: stored empty (the column is NOT NULL) and hidden on the site. */
export const EditionText = z.object({ headline: text(300), summary: z.string().trim().max(1200).default('') });

/**
 * Vol/Issue are no longer asked for. 0 means "not given": the columns are NOT NULL,
 * and making them nullable would mean rebuilding `editions`, whose cascades would
 * delete every page and translation on D1.
 */
const number = (max: number) => z.number().int().min(0).max(max).default(0);

export const EditionWrite = z.object({
  date: isoDate,
  volume: number(9_999),
  issue: number(999_999),
  pdf: z.object({ hash, bytes: positive }).nullable(),
  pages: z
    .array(z.object({ hash, width: positive, height: positive, origBytes: positive }))
    .length(PAGE_COUNT, `exactly ${PAGE_COUNT} pages are required`),
  ur: EditionText,
  en: EditionText.extend({ machineTranslated: z.boolean() }).nullable(),
  status: z.enum(['draft', 'published']),
});
export type EditionWriteInput = z.input<typeof EditionWrite>;

/**
 * Store one edition, replacing any edition already on that date (pages and
 * translations cascade). A published write also moves the masthead's Vol/Issue.
 */
export async function writeEdition(db: AnyDb, input: EditionWriteInput, now = Date.now()): Promise<number> {
  const e = EditionWrite.parse(input);
  await db.delete(editions).where(eq(editions.date, e.date));
  const [inserted] = await db
    .insert(editions)
    .values({
      date: e.date,
      // Retired (not shown anywhere); the column is NOT NULL, so store empty.
      hijriDate: '',
      volume: e.volume,
      issue: e.issue,
      pdfHash: e.pdf?.hash ?? null,
      pdfBytes: e.pdf?.bytes ?? null,
      status: e.status,
      publishedAt: e.status === 'published' ? isoToDate(e.date).getTime() : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: editions.id });
  const editionId = inserted!.id;

  for (const [i, p] of e.pages.entries()) {
    await db.insert(editionPages).values({ editionId, pageNumber: i + 1, ...p });
  }
  await db.insert(editionTranslations).values({
    editionId, locale: 'ur', headline: e.ur.headline, summary: e.ur.summary, isMachineTranslated: false, updatedAt: now,
  });
  if (e.en) {
    await db.insert(editionTranslations).values({
      editionId, locale: 'en', headline: e.en.headline, summary: e.en.summary, isMachineTranslated: e.en.machineTranslated, updatedAt: now,
    });
  }

  if (e.status === 'published') await syncMasthead(db, now);
  return editionId;
}

/** Draft → published. False when there is no draft on that date (already live, or never saved). */
export async function publishEdition(db: AnyDb, date: string, now = Date.now()): Promise<boolean> {
  const rows = await db
    .update(editions)
    .set({ status: 'published', publishedAt: isoToDate(assertIsoDate(date)).getTime(), updatedAt: now })
    .where(and(eq(editions.date, date), eq(editions.status, 'draft')))
    .returning({ id: editions.id });
  if (rows.length === 0) return false;
  await syncMasthead(db, now);
  return true;
}

/** Delete a draft. Published editions are never removed this way. */
export async function deleteDraftEdition(db: AnyDb, date: string): Promise<boolean> {
  const rows = await db
    .delete(editions)
    .where(and(eq(editions.date, assertIsoDate(date)), eq(editions.status, 'draft')))
    .returning({ id: editions.id });
  return rows.length > 0;
}

/**
 * The masthead holds the Vol/Issue of the newest published edition that has one. Derived
 * from the data rather than from the last write, so publishing a back-dated
 * edition never rolls the masthead back.
 */
export async function syncMasthead(db: AnyDb, now = Date.now()): Promise<void> {
  const [latest] = await db
    .select({ volume: editions.volume, issue: editions.issue })
    .from(editions)
    .where(and(eq(editions.status, 'published'), gt(editions.issue, 0)))
    .orderBy(desc(editions.date))
    .limit(1);
  if (!latest) return;
  await db
    .update(siteConfig)
    .set({ currentVolume: latest.volume, currentIssue: latest.issue, updatedAt: now })
    .where(eq(siteConfig.id, 1));
}

export async function getEditionStatus(db: AnyDb, date: string): Promise<'draft' | 'published' | null> {
  const [row] = await db.select({ status: editions.status }).from(editions).where(eq(editions.date, date)).limit(1);
  return row?.status ?? null;
}

export interface EditionListItem {
  date: string;
  status: 'draft' | 'published';
  volume: number;
  issue: number;
  headlineUr: string | null;
  hasPdf: boolean;
}

/** Newest first, drafts included: the admin list. */
export async function listEditions(db: AnyDb, limit = 60): Promise<EditionListItem[]> {
  const rows = await db
    .select({
      date: editions.date,
      status: editions.status,
      volume: editions.volume,
      issue: editions.issue,
      pdfHash: editions.pdfHash,
      headlineUr: editionTranslations.headline,
    })
    .from(editions)
    .leftJoin(editionTranslations, and(eq(editionTranslations.editionId, editions.id), eq(editionTranslations.locale, 'ur')))
    .orderBy(desc(editions.date))
    .limit(limit);
  return rows.map(({ pdfHash, ...r }) => ({ ...r, hasPdf: pdfHash != null }));
}

