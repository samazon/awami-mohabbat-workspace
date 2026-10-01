import { CDN_BASE } from 'astro:env/server';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { magazinePageKey, magazinePdfKey, mediaUrl } from '@/lib/media';
import { getIssue, listIssues, type PageRef } from '@/lib/magazine/data';

export interface MagazinePageView {
  n: number;
  thumb: string;
  view: string;
  zoom: string;
  width: number;
  height: number;
  /** The zoom derivative's size (≤ 2400w): what the full-screen viewer opens. */
  zoomWidth: number;
  zoomHeight: number;
}

const ZOOM_MAX = 2400;

const pageView = (month: string, p: PageRef): MagazinePageView => {
  const scale = p.width > ZOOM_MAX ? ZOOM_MAX / p.width : 1;
  return {
    n: p.n,
    thumb: mediaUrl(CDN_BASE, magazinePageKey(month, p.n, 'thumb', p.hash)),
    view: mediaUrl(CDN_BASE, magazinePageKey(month, p.n, 'view', p.hash)),
    zoom: mediaUrl(CDN_BASE, magazinePageKey(month, p.n, 'zoom', p.hash)),
    width: p.width,
    height: p.height,
    zoomWidth: Math.round(p.width * scale),
    zoomHeight: Math.round(p.height * scale),
  };
};

export async function listMagazine(locale: Locale) {
  const issues = await listIssues(db(), locale);
  return issues.map((i) => ({ ...i, cover: pageView(i.month, i.cover) }));
}

export async function getMagazineIssue(month: string, locale: Locale) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const i = await getIssue(db(), month, locale);
  if (!i) return null;
  return {
    ...i,
    cover: pageView(i.month, i.cover),
    pages: i.pages.map((p) => pageView(i.month, p)),
    pdf: i.pdf ? { url: mediaUrl(CDN_BASE, magazinePdfKey(i.month, i.pdf.hash)), bytes: i.pdf.bytes } : null,
  };
}

/** Sitemap: the list page plus one entry per issue, each with its page images. */
export async function magazineSitemapPages(origin: URL): Promise<{ path: string; images: string[] }[]> {
  const issues = await listIssues(db(), 'ur');
  const out = [];
  for (const i of issues) {
    const full = await getIssue(db(), i.month, 'ur');
    out.push({
      path: `/magazine/${i.month}`,
      images: (full?.pages ?? []).map((p) => new URL(mediaUrl(CDN_BASE, magazinePageKey(i.month, p.n, 'view', p.hash)), origin).toString()),
    });
  }
  return out;
}
