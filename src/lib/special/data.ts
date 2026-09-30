import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Locale } from '../../i18n';
import { specialEditions } from '../db/schema';
import type { AnyDb } from '../columns/types';

/**
 * Special-edition reads and writes, shared by the Worker (services/special.ts),
 * the `pnpm special` CLI and the tests. Every input is parsed here; Drizzle
 * parameterises every statement.
 */

export const PER_PAGE = 24;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'not a real date');
const title = z.string().trim().min(1).max(300);

export const SpecialInput = z.object({
  hash: z.string().regex(/^[a-f0-9]{8,64}$/),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  titleUr: title,
  titleEn: title.optional(),
  publishedDate: isoDate.optional(),
});

export interface SpecialRef {
  id: number;
  hash: string;
  width: number;
  height: number;
  /** In the page's language, falling back to Urdu. */
  title: string;
  titleLang: Locale;
  publishedDate: string | null;
}

export interface SpecialPage {
  items: SpecialRef[];
  total: number;
  page: number;
  pageCount: number;
  perPage: number;
}

/** Add a page, or — if this exact file is already there — update its title and date. */
export async function addSpecial(
  db: AnyDb,
  raw: z.input<typeof SpecialInput>,
  now = Date.now(),
): Promise<{ id: number; created: boolean }> {
  const p = SpecialInput.parse(raw);
  const values = { titleUr: p.titleUr, titleEn: p.titleEn ?? null, publishedDate: p.publishedDate ?? null };
  const [existing] = await db.select({ id: specialEditions.id }).from(specialEditions).where(eq(specialEditions.hash, p.hash)).limit(1);
  if (existing) {
    await db.update(specialEditions).set(values).where(eq(specialEditions.id, existing.id));
    return { id: existing.id, created: false };
  }
  const [row] = await db
    .insert(specialEditions)
    .values({ hash: p.hash, width: p.width, height: p.height, ...values, createdAt: now })
    .returning({ id: specialEditions.id });
  return { id: row!.id, created: true };
}

/** Change title or date. `undefined` leaves a field alone; `null` clears the English title or the date. */
export async function updateSpecial(
  db: AnyDb,
  id: number,
  c: { titleUr?: string; titleEn?: string | null; publishedDate?: string | null },
): Promise<boolean> {
  const set: Partial<typeof specialEditions.$inferInsert> = {};
  if (c.titleUr !== undefined) set.titleUr = title.parse(c.titleUr);
  if (c.titleEn !== undefined) set.titleEn = c.titleEn === null ? null : title.parse(c.titleEn);
  if (c.publishedDate !== undefined) set.publishedDate = c.publishedDate === null ? null : isoDate.parse(c.publishedDate);
  if (!Object.keys(set).length) return false;
  const res = await db.update(specialEditions).set(set).where(eq(specialEditions.id, id)).returning({ id: specialEditions.id });
  return res.length > 0;
}

export async function setSpecialHidden(db: AnyDb, id: number, hidden: boolean): Promise<boolean> {
  const res = await db.update(specialEditions).set({ hidden }).where(eq(specialEditions.id, id)).returning({ id: specialEditions.id });
  return res.length > 0;
}

// Newest first; undated pages after every dated one, newest upload first among them.
const order = [sql`${specialEditions.publishedDate} IS NULL`, desc(specialEditions.publishedDate), desc(specialEditions.id)];

export async function listSpecials(db: AnyDb, opts: { locale: Locale; page: number }): Promise<SpecialPage> {
  const visible = eq(specialEditions.hidden, false);
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(specialEditions).where(visible);
  const total = Number(n);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows = await db
    .select()
    .from(specialEditions)
    .where(visible)
    .orderBy(...order)
    .limit(PER_PAGE)
    .offset((opts.page - 1) * PER_PAGE);
  return {
    items: rows.map((r) => {
      const en = opts.locale === 'en' && r.titleEn;
      return {
        id: r.id,
        hash: r.hash,
        width: r.width,
        height: r.height,
        title: en ? r.titleEn! : r.titleUr,
        titleLang: en ? 'en' : 'ur',
        publishedDate: r.publishedDate,
      };
    }),
    total,
    page: opts.page,
    pageCount,
    perPage: PER_PAGE,
  };
}

/** Every page, hidden included, in display order — for the CLI's `list`. */
export async function listAllSpecials(db: AnyDb) {
  return db.select().from(specialEditions).orderBy(...order);
}

/** Visible hashes in display order, for the sitemap's image entries. */
export async function listVisibleSpecialHashes(db: AnyDb): Promise<string[]> {
  const rows = await db.select({ hash: specialEditions.hash }).from(specialEditions).where(eq(specialEditions.hidden, false)).orderBy(...order);
  return rows.map((r) => r.hash);
}
