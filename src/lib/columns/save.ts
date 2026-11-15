import { and, eq, notExists } from 'drizzle-orm';
import { z } from 'zod';
import { articles, columnists } from '../db/schema';
import { getColumnForEdit, setColumnStatus, uniqueColumnSlug, uniqueColumnistSlug } from './admin';
import { BannerError } from './banner';
import { ArticleRuleError, ColumnInput, SlugTakenError, isoDate } from './rules';
import type { AnyDb } from './types';
import { setHomepageSlot, upsertColumn, upsertColumnist } from './write';

/**
 * The column form's save, shared by /admin/columns/<slug> and the tests. Pure:
 * the logo is stored by a function the caller passes in (R2 in the Worker, a
 * stub in tests).
 *
 * Order, so a failure part-way never leaves a half-made writer behind:
 *   1. every column field is validated before anything is written;
 *   2. a new writer's logo goes to R2, then the writer row is created
 *      (create-only: never overwriting a writer saved at the same moment);
 *   3. the column row (create-only when new, retried with the next address);
 *   4. if 3 fails, a writer created in 2 is removed again, so a retry
 *      doesn't make a duplicate "-2" writer.
 */

const req = (label: string, max: number) => z.string().trim().min(1, `${label} is required.`).max(max);
const opt = (max: number) => z.string().trim().max(max).default('');
/** Browsers send line breaks as \r\n; store and measure them as \n, as the CLI does. */
const body = (label: string, required: boolean) => {
  const s = z.string().default('').transform((v) => v.replace(/\r\n?/g, '\n').trim());
  return required
    ? s.pipe(z.string().min(1, `${label} is required.`).max(100_000, `${label} is too long (100,000 characters at most).`))
    : s.pipe(z.string().max(100_000, `${label} is too long (100,000 characters at most).`));
};

export const ColumnForm = z
  .object({
    slug: z.string().trim().default(''),
    columnist: z.string().trim().min(1, 'Choose a columnist.'),
    newNameUr: opt(100),
    newNameEn: opt(100),
    newColumnUr: opt(100),
    newColumnEn: opt(100),
    titleUr: req('The Urdu title', 300),
    excerptUr: req('The Urdu excerpt', 600),
    bodyUr: body('The column text', true),
    titleEn: opt(300),
    excerptEn: opt(600),
    bodyEn: body('The English text', false),
    date: isoDate,
    intent: z.enum(['publish', 'draft']),
    homeSlot: z.enum(['', '1', '2', '3']).default(''),
  })
  .superRefine((f, ctx) => {
    if (f.columnist === 'new') {
      if (!f.newNameUr) ctx.addIssue({ code: 'custom', path: ['newNameUr'], message: 'The columnist’s Urdu name is required.' });
      if (!f.newNameEn) ctx.addIssue({ code: 'custom', path: ['newNameEn'], message: 'The English name is required (it makes the web address).' });
      if (!f.newColumnUr) ctx.addIssue({ code: 'custom', path: ['newColumnUr'], message: 'The column’s Urdu name is required.' });
    }
    const en = [f.titleEn, f.excerptEn, f.bodyEn].filter(Boolean).length;
    if (en !== 0 && en !== 3) ctx.addIssue({ code: 'custom', path: ['titleEn'], message: 'Fill in the English title, excerpt and text, or leave all three empty.' });
  });
export type ColumnFormInput = z.output<typeof ColumnForm>;

export const ColumnistForm = z.object({
  nameUr: req('The Urdu name', 100),
  nameEn: opt(100),
  columnTitleUr: req('The column’s Urdu name', 100),
  columnTitleEn: opt(100),
});

export type Banner = { hash: string; width: number; height: number };
/** Stores the logo for a columnist slug and returns its hash and size. */
export type StoreBanner = (columnistSlug: string) => Promise<Banner>;

const ATTEMPTS = 5;

export async function saveColumn(
  d: AnyDb,
  f: ColumnFormInput,
  storeBanner: StoreBanner | null,
): Promise<{ slug: string; columnistSlug: string; createdColumnist: boolean }> {
  const existing = f.slug ? await getColumnForEdit(d, f.slug) : null;
  if (f.slug && !existing) throw new ArticleRuleError('That column no longer exists.');

  const publish = f.intent === 'publish';
  const text = {
    publishedDate: f.date,
    status: publish ? ('published' as const) : ('draft' as const),
    ur: { title: f.titleUr, excerpt: f.excerptUr, body: f.bodyUr },
    en: f.titleEn ? { title: f.titleEn, excerpt: f.excerptEn, body: f.bodyEn } : undefined,
  };
  // 1. Everything the column row needs is valid before anything is written.
  ColumnInput.parse({ slug: 'check', columnist: 'check', ...text });

  // 2. A new writer: logo, then a create-only row.
  let columnistSlug = f.columnist;
  const createdColumnist = f.columnist === 'new';
  if (createdColumnist) {
    if (!storeBanner) throw new BannerError('Choose the columnist’s logo.');
    for (let i = 0; ; i++) {
      columnistSlug = await uniqueColumnistSlug(d, f.newNameEn);
      const banner = await storeBanner(columnistSlug);
      try {
        await upsertColumnist(
          d,
          { slug: columnistSlug, nameUr: f.newNameUr, nameEn: f.newNameEn, columnTitleUr: f.newColumnUr, columnTitleEn: f.newColumnEn || undefined, banner },
          Date.now(),
          { createOnly: true },
        );
        break;
      } catch (err) {
        if (!(err instanceof SlugTakenError) || i >= ATTEMPTS - 1) throw err;
      }
    }
  }

  try {
    // 3. The column: an existing one keeps its address; a new one is create-only.
    let slug = existing?.slug ?? '';
    for (let i = 0; ; i++) {
      if (!existing) slug = await uniqueColumnSlug(d, f.date, columnistSlug);
      try {
        await upsertColumn(d, { slug, columnist: columnistSlug, ...text }, Date.now(), { createOnly: !existing });
        break;
      } catch (err) {
        if (existing || !(err instanceof SlugTakenError) || i >= ATTEMPTS - 1) throw err;
      }
    }

    if (!publish) await setColumnStatus(d, slug, 'draft'); // frees a homepage spot it may have held
    else if (f.homeSlot) await setHomepageSlot(d, Number(f.homeSlot), slug);
    else if (existing?.homeSlot) await setHomepageSlot(d, existing.homeSlot, null);
    return { slug, columnistSlug, createdColumnist };
  } catch (err) {
    // 4. Don't leave a writer with no column behind; a retry would make "-2".
    if (createdColumnist) await deleteUnusedColumnist(d, columnistSlug);
    throw err;
  }
}

/** Remove a columnist only if no article points at them. */
async function deleteUnusedColumnist(d: AnyDb, slug: string): Promise<void> {
  await d
    .delete(columnists)
    .where(and(eq(columnists.slug, slug), notExists(d.select({ id: articles.id }).from(articles).where(eq(articles.columnistId, columnists.id)))));
}
