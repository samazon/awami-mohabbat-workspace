import { CDN_BASE } from 'astro:env/server';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { db } from '@/lib/db/client';
import { contentHash16 } from '@/lib/editions/upload';
import { PhotoUploadError, checkPhoto } from '@/lib/gallery/upload';
import { deleteIssue, listAllIssues, listIssuesForAdmin, setIssueHidden, updateIssueTitles, upsertIssue } from '@/lib/magazine/data';
import { MagazineUploadError, checkMagazinePdf } from '@/lib/magazine/upload';
import { MAGAZINE_VARIANTS, magazinePageKey, magazinePdfKey, mediaUrl, type MagazineVariant } from '@/lib/media';
import { deleteMedia, putMedia, resizeSet } from './images';

/**
 * Magazine admin: the browser version of `pnpm magazine`. The admin picks the
 * PDF; the browser renders each page to an image and uploads them one per
 * request, then the PDF, then saves the issue. Files land in R2 first and the
 * issue row is written last, only after every file it names is confirmed there.
 * Saving a month that already exists replaces that issue, as the CLI does.
 */

export { MagazineUploadError, PhotoUploadError };

export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Pick a month.');
export const PageNumber = z.coerce.number().int().min(1).max(500);
const hash = z.string().regex(/^[a-f0-9]{16}$/);
const optTitle = z
  .string()
  .trim()
  .max(300)
  .default('')
  .transform((v) => v || null);

export const IssueSave = z.object({
  month: Month,
  titleUr: z.string().trim().min(1, 'The Urdu title is required.').max(300),
  titleEn: optTitle,
  pages: z.array(z.object({ hash, width: z.number().int().positive(), height: z.number().int().positive() })).min(1).max(500),
  pdf: z.object({ hash, bytes: z.number().int().positive() }),
  replace: z.boolean().default(false),
});

export async function storeMagazinePage(month: string, n: number, bytes: Uint8Array<ArrayBuffer>) {
  const header = checkPhoto(bytes);
  const pageHash = await contentHash16(bytes);
  const set = await resizeSet(bytes, header, MAGAZINE_VARIANTS);
  for (const v of set.variants) await putMedia(magazinePageKey(month, n, v.variant, pageHash), v.body, 'image/webp');
  return { hash: pageHash, width: set.width, height: set.height };
}

export async function storeMagazinePdf(month: string, bytes: Uint8Array<ArrayBuffer>) {
  checkMagazinePdf(bytes);
  const pdfHash = await contentHash16(bytes);
  await putMedia(magazinePdfKey(month, pdfHash), bytes, 'application/pdf');
  return { hash: pdfHash, bytes: bytes.byteLength };
}

/** Write the issue row, after checking that every file it names is in R2 (fail closed). */
export async function saveIssue(input: z.output<typeof IssueSave>): Promise<{ created: boolean }> {
  const existing = (await listAllIssues(db())).find((i) => i.month === input.month);
  if (existing && !input.replace) {
    throw new MagazineUploadError(`There is already an issue for ${input.month}. Tick "Replace" to upload over it.`);
  }
  const keys = [
    ...input.pages.map((p, i) => magazinePageKey(input.month, i + 1, 'view', p.hash)),
    magazinePdfKey(input.month, input.pdf.hash),
  ];
  for (const key of keys) {
    if (!(await env.MEDIA.head(key))) throw new MagazineUploadError('Some uploaded files are missing. Please upload the issue again.');
  }
  const res = await upsertIssue(db(), {
    month: input.month,
    titleUr: input.titleUr,
    titleEn: input.titleEn ?? undefined,
    pdf: input.pdf,
    pages: input.pages,
  });
  return { created: res.created };
}

export async function adminListIssues() {
  const rows = await listIssuesForAdmin(db());
  return rows.map((r) => ({
    ...r,
    coverUrl: r.cover ? mediaUrl(CDN_BASE, magazinePageKey(r.month, r.cover.n, 'thumb', r.cover.hash)) : null,
  }));
}

export const adminIssueExists = async (month: string) => (await listAllIssues(db())).some((i) => i.month === month);
export const adminSetIssueHidden = (month: string, hidden: boolean) => setIssueHidden(db(), month, hidden);
export const adminUpdateIssueTitles = (month: string, titleUr: string, titleEn: string | null) =>
  updateIssueTitles(db(), month, { titleUr, titleEn });

/** Delete for good: the rows first (the site stops showing it at once), then every page size and the PDF. */
export async function adminDeleteIssue(month: string): Promise<boolean> {
  const gone = await deleteIssue(db(), month);
  if (!gone) return false;
  const keys = gone.pages.flatMap((p) => (Object.keys(MAGAZINE_VARIANTS) as MagazineVariant[]).map((v) => magazinePageKey(month, p.n, v, p.hash)));
  if (gone.pdfHash) keys.push(magazinePdfKey(month, gone.pdfHash));
  for (let i = 0; i < keys.length; i += 1000) await deleteMedia(keys.slice(i, i + 1000));
  return true;
}
