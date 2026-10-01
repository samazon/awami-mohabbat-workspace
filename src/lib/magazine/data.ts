import { asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Locale } from '../../i18n';
import { magazineIssues, magazinePages } from '../db/schema';
import type { AnyDb } from '../columns/types';

/**
 * Magazine reads and writes, shared by the Worker (services/magazine.ts), the
 * `pnpm magazine` CLI and the tests. Every input is parsed here; Drizzle
 * parameterises every statement.
 */

const title = z.string().trim().min(1).max(300);
const hash = z.string().regex(/^[a-f0-9]{8,64}$/);

export const IssueInput = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'expected YYYY-MM'),
  titleUr: title,
  titleEn: title.optional(),
  pdf: z.object({ hash, bytes: z.number().int().positive() }).optional(),
  pages: z
    .array(z.object({ hash, width: z.number().int().positive().max(20_000), height: z.number().int().positive().max(20_000) }))
    .min(1)
    .max(500),
});

export interface PageRef {
  n: number;
  hash: string;
  width: number;
  height: number;
}

export interface IssueSummary {
  month: string;
  title: string;
  titleLang: Locale;
  pageCount: number;
  cover: PageRef;
}

export interface IssueDetail extends IssueSummary {
  pages: PageRef[];
  pdf: { hash: string; bytes: number } | null;
}

/** Create or replace a month's issue (pages are rewritten in order). Returns the issue id. */
export async function upsertIssue(db: AnyDb, raw: z.input<typeof IssueInput>, now = Date.now()): Promise<{ id: number; created: boolean }> {
  const p = IssueInput.parse(raw);
  const values = {
    titleUr: p.titleUr,
    titleEn: p.titleEn ?? null,
    pdfHash: p.pdf?.hash ?? null,
    pdfBytes: p.pdf?.bytes ?? null,
  };
  const [existing] = await db.select({ id: magazineIssues.id }).from(magazineIssues).where(eq(magazineIssues.month, p.month)).limit(1);
  let id: number;
  if (existing) {
    id = existing.id;
    await db.update(magazineIssues).set(values).where(eq(magazineIssues.id, id));
    await db.delete(magazinePages).where(eq(magazinePages.issueId, id));
  } else {
    const [row] = await db.insert(magazineIssues).values({ month: p.month, ...values, createdAt: now }).returning({ id: magazineIssues.id });
    id = row!.id;
  }
  for (const [i, pg] of p.pages.entries()) {
    await db.insert(magazinePages).values({ issueId: id, pageNumber: i + 1, ...pg });
  }
  return { id, created: !existing };
}

export async function setIssueHidden(db: AnyDb, month: string, hidden: boolean): Promise<boolean> {
  const res = await db.update(magazineIssues).set({ hidden }).where(eq(magazineIssues.month, month)).returning({ id: magazineIssues.id });
  return res.length > 0;
}

const pickTitle = (locale: Locale, ur: string, en: string | null): { title: string; titleLang: Locale } =>
  locale === 'en' && en ? { title: en, titleLang: 'en' } : { title: ur, titleLang: 'ur' };

const pagesOf = async (db: AnyDb, ids: number[]) => {
  if (!ids.length) return new Map<number, PageRef[]>();
  const rows = await db.select().from(magazinePages).where(inArray(magazinePages.issueId, ids)).orderBy(asc(magazinePages.pageNumber));
  const by = new Map<number, PageRef[]>();
  for (const r of rows) {
    const list = by.get(r.issueId) ?? [];
    list.push({ n: r.pageNumber, hash: r.hash, width: r.width, height: r.height });
    by.set(r.issueId, list);
  }
  return by;
};

/** Visible issues, newest month first. */
export async function listIssues(db: AnyDb, locale: Locale): Promise<IssueSummary[]> {
  const rows = await db.select().from(magazineIssues).where(eq(magazineIssues.hidden, false)).orderBy(desc(magazineIssues.month));
  const pages = await pagesOf(db, rows.map((r) => r.id));
  return rows.flatMap((r) => {
    const list = pages.get(r.id);
    if (!list?.length) return [];
    return [{ month: r.month, ...pickTitle(locale, r.titleUr, r.titleEn), pageCount: list.length, cover: list[0]! }];
  });
}

export async function getIssue(db: AnyDb, month: string, locale: Locale): Promise<IssueDetail | null> {
  const [r] = await db.select().from(magazineIssues).where(eq(magazineIssues.month, month)).limit(1);
  if (!r || r.hidden) return null;
  const list = (await pagesOf(db, [r.id])).get(r.id) ?? [];
  if (!list.length) return null;
  return {
    month: r.month,
    ...pickTitle(locale, r.titleUr, r.titleEn),
    pageCount: list.length,
    cover: list[0]!,
    pages: list,
    pdf: r.pdfHash && r.pdfBytes ? { hash: r.pdfHash, bytes: r.pdfBytes } : null,
  };
}

/** Every issue, hidden included — for the CLI's `list`. */
export async function listAllIssues(db: AnyDb) {
  return db.select().from(magazineIssues).orderBy(desc(magazineIssues.month));
}
