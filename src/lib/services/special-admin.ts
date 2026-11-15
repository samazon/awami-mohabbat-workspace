import { CDN_BASE } from 'astro:env/server';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { contentHash16 } from '@/lib/editions/upload';
import { PhotoUploadError, checkPhoto } from '@/lib/gallery/upload';
import { SPECIAL_VARIANTS, mediaUrl, specialEditionKey, type SpecialVariant } from '@/lib/media';
import { addSpecial, deleteSpecial, listAllSpecials, setSpecialHidden, updateSpecial } from '@/lib/special/data';
import { deleteMedia, putMedia, resizeSet } from './images';

/**
 * Special editions admin: the browser version of `pnpm special`. One page image
 * per upload, with its Urdu title (required), English title and printed date
 * (optional). Only resized WebPs are stored. R2 first, then D1; uploading the
 * same file again just updates its title and date, as the CLI does.
 */

export { PhotoUploadError };

export interface SpecialText {
  titleUr: string;
  titleEn: string | null;
  publishedDate: string | null;
}

export async function storeSpecial(file: File, text: SpecialText): Promise<{ id: number; created: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = checkPhoto(bytes);
  const hash = await contentHash16(bytes);
  const set = await resizeSet(bytes, header, SPECIAL_VARIANTS);
  for (const v of set.variants) await putMedia(specialEditionKey(hash, v.variant), v.body, 'image/webp');
  return addSpecial(db(), {
    hash,
    width: set.width,
    height: set.height,
    titleUr: text.titleUr,
    titleEn: text.titleEn ?? undefined,
    publishedDate: text.publishedDate ?? undefined,
  });
}

export async function adminListSpecials() {
  const rows = await listAllSpecials(db());
  return rows.map((r) => ({
    id: r.id,
    thumb: mediaUrl(CDN_BASE, specialEditionKey(r.hash, 'thumb')),
    view: mediaUrl(CDN_BASE, specialEditionKey(r.hash, 'view')),
    titleUr: r.titleUr,
    titleEn: r.titleEn,
    publishedDate: r.publishedDate,
    hidden: r.hidden,
  }));
}

export const adminUpdateSpecial = (id: number, t: SpecialText) =>
  updateSpecial(db(), id, { titleUr: t.titleUr, titleEn: t.titleEn, publishedDate: t.publishedDate });
export const adminSetSpecialHidden = (id: number, hidden: boolean) => setSpecialHidden(db(), id, hidden);

/** Delete for good: the row first (the site stops showing it at once), then its files. */
export async function adminDeleteSpecial(id: number): Promise<boolean> {
  const hash = await deleteSpecial(db(), id);
  if (!hash) return false;
  await deleteMedia((Object.keys(SPECIAL_VARIANTS) as SpecialVariant[]).map((v) => specialEditionKey(hash, v)));
  return true;
}

/** Form fields → SpecialText. Empty English title or date means none. */
export const SpecialTextForm = z.object({
  titleUr: z.string().trim().min(1, 'The Urdu title is required.').max(300),
  titleEn: z
    .string()
    .trim()
    .max(300)
    .default('')
    .transform((v) => v || null),
  publishedDate: z
    .string()
    .trim()
    .default('')
    .refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))), 'Pick a real date or leave it empty.')
    .transform((v) => v || null),
});
