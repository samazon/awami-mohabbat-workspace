import { CDN_BASE } from 'astro:env/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { galleryPhotos } from '@/lib/db/schema';
import { addPhoto, deletePhoto, listAllPhotos, setCaption, setHidden } from '@/lib/gallery/data';
import { PhotoUploadError, checkPhoto } from '@/lib/gallery/upload';
import { contentHash16 } from '@/lib/editions/upload';
import { GALLERY_VARIANTS, galleryPhotoKey, mediaUrl, type GalleryVariant } from '@/lib/media';
import { deleteMedia, putMedia, resizeSet } from './images';

/**
 * Gallery admin: the browser version of `pnpm gallery`. Photos arrive one per
 * request, so a batch of any size stays inside the Worker's limits. Only the
 * resized WebPs are stored, never the original (which may carry GPS). R2 first,
 * then D1. Re-uploading the same file skips R2 and, like the CLI, moves the
 * photo to its place in the new batch.
 */

export { PhotoUploadError };

export async function storeGalleryPhoto(file: File, sortKey: number): Promise<{ id: number; created: boolean }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = checkPhoto(bytes);
  const hash = await contentHash16(bytes);
  const d = db();

  const [existing] = await d.select({ id: galleryPhotos.id }).from(galleryPhotos).where(eq(galleryPhotos.hash, hash)).limit(1);
  let size = header;
  if (!existing) {
    const set = await resizeSet(bytes, header, GALLERY_VARIANTS);
    for (const v of set.variants) await putMedia(galleryPhotoKey(hash, v.variant), v.body, 'image/webp');
    size = set;
  }
  return addPhoto(d, { hash, width: size.width, height: size.height }, { sortKey, moveExisting: true });
}

export interface AdminPhoto {
  id: number;
  thumb: string;
  view: string;
  captionUr: string | null;
  captionEn: string | null;
  hidden: boolean;
}

export const ADMIN_PER_PAGE = 60;

export async function adminListPhotos(page: number): Promise<{ items: AdminPhoto[]; total: number; hidden: number; pageCount: number }> {
  const rows = await listAllPhotos(db());
  const pageCount = Math.max(1, Math.ceil(rows.length / ADMIN_PER_PAGE));
  const items = rows.slice((page - 1) * ADMIN_PER_PAGE, page * ADMIN_PER_PAGE).map((r) => ({
    id: r.id,
    thumb: mediaUrl(CDN_BASE, galleryPhotoKey(r.hash, 'thumb')),
    view: mediaUrl(CDN_BASE, galleryPhotoKey(r.hash, 'view')),
    captionUr: r.captionUr,
    captionEn: r.captionEn,
    hidden: r.hidden,
  }));
  return { items, total: rows.length, hidden: rows.filter((r) => r.hidden).length, pageCount };
}

/** Empty text clears a caption. */
export const adminSetCaption = (id: number, ur: string, en: string) =>
  setCaption(db(), id, { ur: ur.trim() || null, en: en.trim() || null });
export const adminSetPhotoHidden = (id: number, hidden: boolean) => setHidden(db(), id, hidden);
export const adminPhotoCount = async () => (await listAllPhotos(db())).length;

/**
 * Delete a photo for good: the row first (so the site stops showing it at once),
 * then its files. Readers' browsers may keep a copy they already loaded.
 */
export async function adminDeletePhoto(id: number): Promise<boolean> {
  const hash = await deletePhoto(db(), id);
  if (!hash) return false;
  await deleteMedia((Object.keys(GALLERY_VARIANTS) as GalleryVariant[]).map((v) => galleryPhotoKey(hash, v)));
  return true;
}
