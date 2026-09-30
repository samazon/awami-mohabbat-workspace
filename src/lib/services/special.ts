import { CDN_BASE } from 'astro:env/server';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { mediaUrl, specialEditionKey } from '@/lib/media';
import { PER_PAGE, listSpecials, listVisibleSpecialHashes, type SpecialPage, type SpecialRef } from '@/lib/special/data';

export interface SpecialView extends Omit<SpecialRef, 'hash'> {
  thumb: string;
  view: string;
  /** The view derivative's size (≤ 2400w): what the viewer opens. */
  viewWidth: number;
  viewHeight: number;
}
export type SpecialPageView = Omit<SpecialPage, 'items'> & { items: SpecialView[] };

const VIEW_MAX = 2400;

const toView = ({ hash, ...p }: SpecialRef): SpecialView => {
  const scale = p.width > VIEW_MAX ? VIEW_MAX / p.width : 1;
  return {
    ...p,
    thumb: mediaUrl(CDN_BASE, specialEditionKey(hash, 'thumb')),
    view: mediaUrl(CDN_BASE, specialEditionKey(hash, 'view')),
    viewWidth: Math.round(p.width * scale),
    viewHeight: Math.round(p.height * scale),
  };
};

/** ?page= → a page of special editions, or null for a 404. */
export async function resolveSpecials(params: URLSearchParams, locale: Locale): Promise<SpecialPageView | null> {
  let page = 1;
  const raw = params.get('page');
  if (raw !== null) {
    if (!/^[1-9]\d{0,3}$/.test(raw)) return null;
    page = Number(raw);
  }
  const r = await listSpecials(db(), { locale, page });
  if (page > 1 && page > r.pageCount) return null;
  return { ...r, items: r.items.map(toView) };
}

/** Sitemap image entries per list page, absolute against `origin`. */
export async function specialSitemapPages(origin: URL): Promise<{ path: string; images: string[] }[]> {
  const hashes = await listVisibleSpecialHashes(db());
  const pages: { path: string; images: string[] }[] = [];
  for (let i = 0; i < hashes.length; i += PER_PAGE) {
    const n = i / PER_PAGE + 1;
    pages.push({
      path: n === 1 ? '/special-editions' : `/special-editions?page=${n}`,
      images: hashes.slice(i, i + PER_PAGE).map((h) => new URL(mediaUrl(CDN_BASE, specialEditionKey(h, 'view')), origin).toString()),
    });
  }
  return pages;
}
