import { CDN_BASE } from 'astro:env/server';
import type { z } from 'zod';
import { db } from '@/lib/db/client';
import {
  deleteColumn,
  getColumnForEdit,
  listColumnistsForAdmin,
  listColumnsForAdmin,
  setColumnStatus,
  setColumnistActive,
} from '@/lib/columns/admin';
import { BannerError, checkBanner } from '@/lib/columns/banner';
import { ArticleRuleError } from '@/lib/columns/rules';
import { saveColumn, type ColumnFormInput, type ColumnistForm } from '@/lib/columns/save';
import { setHomepageSlot, upsertColumnist } from '@/lib/columns/write';
import { contentHash16 } from '@/lib/editions/upload';
import { BANNER_VARIANTS, columnistBannerKey, mediaUrl } from '@/lib/media';
import { putMedia, resizeSet } from './images';

/**
 * Columns admin: the browser version of `pnpm columns`. A column and, for a
 * new writer, the columnist and their logo are saved from one form. Logo files
 * go to R2 first, rows to D1 after; web addresses are made once and kept.
 */

export { ArticleRuleError, BannerError };

export { ColumnForm, ColumnistForm, type ColumnFormInput } from '@/lib/columns/save';
type ColumnistFormInput = z.output<typeof ColumnistForm>;

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

export const saveColumnFromForm = (f: ColumnFormInput, logo: File | null) =>
  saveColumn(db(), f, hasFile(logo) ? (slug) => storeBanner(slug, logo) : null);

export async function saveColumnistFromForm(slug: string, f: ColumnistFormInput, logo: File | null): Promise<void> {
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
