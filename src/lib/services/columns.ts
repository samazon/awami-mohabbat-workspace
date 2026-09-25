import { CDN_BASE } from 'astro:env/server';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { columnistBannerKey, mediaUrl } from '@/lib/media';
import * as read from '@/lib/columns/read';
import type { BannerRef, ColumnDetail, ColumnList, ColumnSummary } from '@/lib/columns/read';

export type { FilterColumnist } from '@/lib/columns/read';

/** Banner URLs plus the original size, which gives the aspect ratio for width/height attributes. */
export interface BannerView {
  card: string;
  view: string;
  width: number;
  height: number;
}
export type ColumnCardView = Omit<ColumnSummary, 'banner'> & { banner: BannerView };
export type ColumnView = Omit<ColumnDetail, 'banner'> & { banner: BannerView };
export type ColumnListView = Omit<ColumnList, 'items'> & { items: ColumnCardView[] };

const bannerView = (b: BannerRef): BannerView => ({
  card: mediaUrl(CDN_BASE, columnistBannerKey(b.columnistSlug, 'card', b.hash)),
  view: mediaUrl(CDN_BASE, columnistBannerKey(b.columnistSlug, 'view', b.hash)),
  width: b.width,
  height: b.height,
});
const withBanner = <T extends { banner: BannerRef }>(x: T): Omit<T, 'banner'> & { banner: BannerView } => ({
  ...x,
  banner: bannerView(x.banner),
});

export async function listColumns(opts: { locale: Locale; columnistSlug?: string; page: number }): Promise<ColumnListView> {
  const r = await read.listColumns(db(), opts);
  return { ...r, items: r.items.map(withBanner) };
}

export async function getColumn(slug: string, locale: Locale): Promise<ColumnView | null> {
  const c = await read.getColumn(db(), slug, locale);
  return c ? withBanner(c) : null;
}

export async function moreFromColumnist(columnistId: number, excludeArticleId: number, locale: Locale): Promise<ColumnCardView[]> {
  return (await read.moreFromColumnist(db(), columnistId, excludeArticleId, locale)).map(withBanner);
}

export const listFilterColumnists = (locale: Locale) => read.listFilterColumnists(db(), locale);

export async function getHomepageColumns(locale: Locale): Promise<ColumnCardView[]> {
  return (await read.getHomepageColumns(db(), locale)).map(withBanner);
}

export const listPublishedColumnSlugs = () => read.listPublishedColumnSlugs(db());
