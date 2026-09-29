import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Locale } from '../../i18n';
import { galleryPhotos } from '../db/schema';
import type { AnyDb } from '../columns/types';

/**
 * Gallery reads and writes, shared by the Worker (via services/gallery.ts),
 * the `pnpm gallery` CLI and the tests. Every input is parsed here; Drizzle
 * parameterises every statement.
 */

export const PER_PAGE = 48;

const caption = z.string().trim().min(1).max(300).optional();

export const PhotoInput = z.object({
  hash: z.string().regex(/^[a-f0-9]{8,64}$/),
  width: z.number().int().positive().max(20_000),
  height: z.number().int().positive().max(20_000),
  captionUr: caption,
  captionEn: caption,
});

export interface PhotoRef {
  id: number;
  hash: string;
  width: number;
  height: number;
  /** In the page's language, falling back to the other one; null if neither. */
  caption: string | null;
  captionLang: Locale | null;
}

export interface PhotoPage {
  items: PhotoRef[];
  total: number;
  page: number;
  pageCount: number;
  perPage: number;
}

/**
 * Add a photo, or — if this exact file is already there — update its captions
 * (only the ones given). With `moveExisting`, an existing photo also takes the
 * new `sortKey`, so re-running a batch (e.g. after a failure part-way) keeps the
 * whole batch in order instead of leaving the first attempt's photos below it.
 * Returns the row id and whether it was new.
 */
export async function addPhoto(
  db: AnyDb,
  raw: z.input<typeof PhotoInput>,
  { now = Date.now(), sortKey = now, moveExisting = false }: { now?: number; sortKey?: number; moveExisting?: boolean } = {},
): Promise<{ id: number; created: boolean }> {
  const p = PhotoInput.parse(raw);
  const [existing] = await db.select({ id: galleryPhotos.id }).from(galleryPhotos).where(eq(galleryPhotos.hash, p.hash)).limit(1);
  if (existing) {
    const set: Partial<typeof galleryPhotos.$inferInsert> = {};
    if (p.captionUr) set.captionUr = p.captionUr;
    if (p.captionEn) set.captionEn = p.captionEn;
    if (moveExisting) set.sortKey = sortKey;
    if (Object.keys(set).length) await db.update(galleryPhotos).set(set).where(eq(galleryPhotos.id, existing.id));
    return { id: existing.id, created: false };
  }
  const [row] = await db
    .insert(galleryPhotos)
    .values({
      hash: p.hash,
      width: p.width,
      height: p.height,
      captionUr: p.captionUr ?? null,
      captionEn: p.captionEn ?? null,
      sortKey,
      createdAt: now,
    })
    .returning({ id: galleryPhotos.id });
  return { id: row!.id, created: true };
}

/** Set or clear captions. `null` clears; `undefined` leaves as is. */
export async function setCaption(db: AnyDb, id: number, c: { ur?: string | null; en?: string | null }): Promise<boolean> {
  const clean = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : caption.parse(v) ?? null);
  const set: Partial<typeof galleryPhotos.$inferInsert> = {};
  const ur = clean(c.ur);
  const en = clean(c.en);
  if (ur !== undefined) set.captionUr = ur;
  if (en !== undefined) set.captionEn = en;
  if (!Object.keys(set).length) return false;
  const res = await db.update(galleryPhotos).set(set).where(eq(galleryPhotos.id, id)).returning({ id: galleryPhotos.id });
  return res.length > 0;
}

export async function setHidden(db: AnyDb, id: number, hidden: boolean): Promise<boolean> {
  const res = await db.update(galleryPhotos).set({ hidden }).where(eq(galleryPhotos.id, id)).returning({ id: galleryPhotos.id });
  return res.length > 0;
}

const pickCaption = (locale: Locale, ur: string | null, en: string | null): Pick<PhotoRef, 'caption' | 'captionLang'> => {
  const [first, second]: [Locale, Locale] = locale === 'en' ? ['en', 'ur'] : ['ur', 'en'];
  const value = (l: Locale) => (l === 'ur' ? ur : en);
  if (value(first)) return { caption: value(first), captionLang: first };
  if (value(second)) return { caption: value(second), captionLang: second };
  return { caption: null, captionLang: null };
};

export async function listPhotos(db: AnyDb, opts: { locale: Locale; page: number }): Promise<PhotoPage> {
  const visible = eq(galleryPhotos.hidden, false);
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(galleryPhotos).where(visible);
  const total = Number(n);
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const rows = await db
    .select()
    .from(galleryPhotos)
    .where(visible)
    .orderBy(desc(galleryPhotos.sortKey), desc(galleryPhotos.id))
    .limit(PER_PAGE)
    .offset((opts.page - 1) * PER_PAGE);
  return {
    items: rows.map((r) => ({
      id: r.id,
      hash: r.hash,
      width: r.width,
      height: r.height,
      ...pickCaption(opts.locale, r.captionUr, r.captionEn),
    })),
    total,
    page: opts.page,
    pageCount,
    perPage: PER_PAGE,
  };
}

/** Every photo, hidden included, newest first — for the CLI's `list`. */
export async function listAllPhotos(db: AnyDb) {
  return db.select().from(galleryPhotos).orderBy(desc(galleryPhotos.sortKey), desc(galleryPhotos.id));
}

