import { CDN_BASE } from 'astro:env/server';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { galleryPhotoKey, mediaUrl } from '@/lib/media';
import { PER_PAGE, listPhotos, listVisibleHashes, type PhotoPage, type PhotoRef } from '@/lib/gallery/data';

export interface PhotoView extends Omit<PhotoRef, 'hash'> {
  thumb: string;
  view: string;
  /** The view derivative's size (≤ 2000w): what the full-screen viewer opens. */
  viewWidth: number;
  viewHeight: number;
}
export type GalleryPageView = Omit<PhotoPage, 'items'> & { items: PhotoView[] };

const VIEW_MAX = 2000;

const toView = ({ hash, ...p }: PhotoRef): PhotoView => {
  const scale = p.width > VIEW_MAX ? VIEW_MAX / p.width : 1;
  return {
    ...p,
    thumb: mediaUrl(CDN_BASE, galleryPhotoKey(hash, 'thumb')),
    view: mediaUrl(CDN_BASE, galleryPhotoKey(hash, 'view')),
    viewWidth: Math.round(p.width * scale),
    viewHeight: Math.round(p.height * scale),
  };
};

/** ?page= → a page of photos, or null for a 404 (malformed or out of range). */
export async function resolveGallery(params: URLSearchParams, locale: Locale): Promise<GalleryPageView | null> {
  let page = 1;
  const raw = params.get('page');
  if (raw !== null) {
    if (!/^[1-9]\d{0,3}$/.test(raw)) return null;
    page = Number(raw);
  }
  const r = await listPhotos(db(), { locale, page });
  if (page > 1 && page > r.pageCount) return null;
  return { ...r, items: r.items.map(toView) };
}

/**
 * Sitemap image entries: for each gallery page, its path and the full-size
 * image URLs shown on it (absolute against `origin` when CDN_BASE is a path).
 */
export async function gallerySitemapPages(origin: URL): Promise<{ path: string; images: string[] }[]> {
  const hashes = await listVisibleHashes(db());
  const pages: { path: string; images: string[] }[] = [];
  for (let i = 0; i < hashes.length; i += PER_PAGE) {
    const n = i / PER_PAGE + 1;
    pages.push({
      path: n === 1 ? '/gallery' : `/gallery?page=${n}`,
      images: hashes.slice(i, i + PER_PAGE).map((h) => new URL(mediaUrl(CDN_BASE, galleryPhotoKey(h, 'view')), origin).toString()),
    });
  }
  return pages;
}
