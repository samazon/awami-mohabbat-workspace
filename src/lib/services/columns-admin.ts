import { CDN_BASE } from 'astro:env/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import {
  deleteColumn,
  getColumnForEdit,
  listColumnistsForAdmin,
  listColumnsForAdmin,
  setColumnStatus,
  setColumnistActive,
  uniqueColumnSlug,
  uniqueColumnistSlug,
} from '@/lib/columns/admin';
import { BannerError, checkBanner } from '@/lib/columns/banner';
import { ArticleRuleError } from '@/lib/columns/rules';
import { setHomepageSlot, upsertColumn, upsertColumnist } from '@/lib/columns/write';
import { contentHash16 } from '@/lib/editions/upload';
import { BANNER_VARIANTS, columnistBannerKey, mediaUrl } from '@/lib/media';
import { putMedia, resizeSet } from './images';

/**
 * Columns admin: the browser version of `pnpm columns`. A column and, for a
 * new writer, the columnist and their logo are saved from one form. Logo files
 * go to R2 first, rows to D1 after; web addresses are made once and kept.
 */

export { ArticleRuleError, BannerError };

const req = (label: string, max: number) => z.string().trim().min(1, `${label} is required.`).max(max);
const opt = (max: number) => z.string().trim().max(max).default('');

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
    bodyUr: req('The column text', 100_000),
    titleEn: opt(300),
    excerptEn: opt(600),
    bodyEn: opt(100_000),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
      .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'Pick a real date.'),
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

/** Check and store a logo: the original plus its card and view WebPs. */
async function storeBanner(slug: string, logo: File) {
  const bytes = new Uint8Array(await logo.arrayBuffer());
  const checked = checkBanner(bytes);
  const hash = await contentHash16(bytes);
  await putMedia(columnistBannerKey(slug, 'orig', hash, checked.ext), bytes, checked.contentType);
  const set = await resizeSet(bytes, checked, BANNER_VARIANTS);
  for (const v of set.variants) await putMedia(columnistBannerKey(slug, v.variant, hash), v.body, 'image/webp');
  return { hash, width: set.width, height: set.height };
}

const hasFile = (f: File | null): f is File => f instanceof File && f.size > 0;

export async function saveColumnFromForm(f: ColumnFormInput, logo: File | null): Promise<{ slug: string; createdColumnist: boolean }> {
  const d = db();
  const existing = f.slug ? await getColumnForEdit(d, f.slug) : null;
  if (f.slug && !existing) throw new ArticleRuleError('That column no longer exists.');

  let columnistSlug = f.columnist;
  const createdColumnist = f.columnist === 'new';
  if (createdColumnist) {
    if (!hasFile(logo)) throw new BannerError('Choose the columnist’s logo.');
    columnistSlug = await uniqueColumnistSlug(d, f.newNameEn);
    const banner = await storeBanner(columnistSlug, logo);
    await upsertColumnist(d, {
      slug: columnistSlug,
      nameUr: f.newNameUr,
      nameEn: f.newNameEn,
      columnTitleUr: f.newColumnUr,
      columnTitleEn: f.newColumnEn || undefined,
      banner,
    });
  }

  const slug = existing?.slug ?? (await uniqueColumnSlug(d, f.date, columnistSlug));
  const publish = f.intent === 'publish';
  await upsertColumn(d, {
    slug,
    columnist: columnistSlug,
    publishedDate: f.date,
    status: publish ? 'published' : 'draft',
    ur: { title: f.titleUr, excerpt: f.excerptUr, body: f.bodyUr },
    en: f.titleEn ? { title: f.titleEn, excerpt: f.excerptEn, body: f.bodyEn } : undefined,
  });

  if (!publish) await setColumnStatus(d, slug, 'draft'); // frees a homepage spot it may have held
  else if (f.homeSlot) await setHomepageSlot(d, Number(f.homeSlot), slug);
  else if (existing?.homeSlot) await setHomepageSlot(d, existing.homeSlot, null);
  return { slug, createdColumnist };
}

export async function saveColumnistFromForm(slug: string, f: z.output<typeof ColumnistForm>, logo: File | null): Promise<void> {
  const d = db();
  const current = (await listColumnistsForAdmin(d)).find((c) => c.slug === slug);
  if (!current) throw new ArticleRuleError('That columnist no longer exists.');
  const banner = hasFile(logo) ? await storeBanner(slug, logo) : current.banner;
  await upsertColumnist(d, {
    slug,
    nameUr: f.nameUr,
    nameEn: f.nameEn || undefined,
    columnTitleUr: f.columnTitleUr,
    columnTitleEn: f.columnTitleEn || undefined,
    banner,
    active: current.active,
  });
}

export const adminListColumns = () => listColumnsForAdmin(db());
export const adminGetColumn = (slug: string) => getColumnForEdit(db(), slug);
export async function adminListColumnists() {
  const rows = await listColumnistsForAdmin(db());
  return rows.map((r) => ({ ...r, cardUrl: mediaUrl(CDN_BASE, columnistBannerKey(r.slug, 'card', r.banner.hash)) }));
}
export const adminSetColumnStatus = (slug: string, status: 'draft' | 'published') => setColumnStatus(db(), slug, status);
export const adminDeleteColumn = (slug: string) => deleteColumn(db(), slug);
export const adminSetHomeSlot = (slot: number, slug: string | null) => setHomepageSlot(db(), slot, slug);
export const adminSetColumnistActive = (slug: string, active: boolean) => setColumnistActive(db(), slug, active);
