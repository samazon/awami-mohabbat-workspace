/**
 * R2 key layout and URL derivation. Pure functions — shared by the Worker and
 * by the Node seed/ingest scripts, so nothing here may import astro:* or
 * cloudflare:* modules.
 *
 * Keys are date-addressed with a content hash, so every object is immutable
 * and a re-upload for the same date produces new keys instead of fighting the
 * CDN cache. URLs are never stored in the database — only the hash is.
 *
 *   editions/2026-09-16/page-1-thumb.a3f91c2e.webp    400w
 *   editions/2026-09-16/page-1-view.a3f91c2e.webp    1200w
 *   editions/2026-09-16/page-1-zoom.a3f91c2e.webp    2400w
 *   editions/2026-09-16/page-1-orig.a3f91c2e.jpg     as uploaded
 *   editions/2026-09-16/edition.7b02d4f1.pdf
 */

export const PAGE_COUNT = 4;
export type PageNumber = 1 | 2 | 3 | 4;
export const PAGE_NUMBERS: readonly PageNumber[] = [1, 2, 3, 4];

export const PAGE_VARIANTS = {
  thumb: { width: 400, quality: 82 },
  view: { width: 1200, quality: 80 },
  zoom: { width: 2400, quality: 78 },
} as const;
export type PageVariant = keyof typeof PAGE_VARIANTS;

/** Immutable objects: cache forever. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[a-f0-9]{8,64}$/;

/** Every key component is validated — these values originate outside the app. */
export const assertIsoDate = (date: string): string => {
  if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new RangeError(`Invalid ISO date: ${JSON.stringify(date)}`);
  }
  return date;
};

export const assertHash = (hash: string): string => {
  if (!HASH.test(hash)) throw new RangeError(`Invalid content hash: ${JSON.stringify(hash)}`);
  return hash;
};

export const assertPageNumber = (n: number): PageNumber => {
  if (!Number.isInteger(n) || n < 1 || n > PAGE_COUNT) {
    throw new RangeError(`Page number out of range 1..${PAGE_COUNT}: ${n}`);
  }
  return n as PageNumber;
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** URL- and key-safe slug: lowercase words joined by single hyphens, 80 chars max. */
export const assertSlug = (slug: string): string => {
  if (slug.length > 80 || !SLUG.test(slug)) throw new RangeError(`Invalid slug: ${JSON.stringify(slug)}`);
  return slug;
};

/**
 * Columnist banners: the ready-made picture the paper prints above a column.
 *
 *   columnists/iqbal-khokhar/banner-card.a3f91c2e.webp   480w  cards, homepage
 *   columnists/iqbal-khokhar/banner-view.a3f91c2e.webp   960w  reading page, share card
 *   columnists/iqbal-khokhar/banner-orig.a3f91c2e.png    as uploaded
 */
export const BANNER_VARIANTS = {
  card: { width: 480, quality: 82 },
  view: { width: 960, quality: 82 },
} as const;
export type BannerVariant = keyof typeof BANNER_VARIANTS;

export const columnistBannerKey = (
  slug: string,
  variant: BannerVariant | 'orig',
  hash: string,
  origExt: 'jpg' | 'png' = 'jpg',
): string =>
  `columnists/${assertSlug(slug)}/banner-${variant}.${assertHash(hash)}.${variant === 'orig' ? origExt : 'webp'}`;

/**
 * Gallery photos. No original is stored: phone photos carry EXIF (often GPS),
 * and the WebP derivatives are written without metadata.
 *
 *   gallery/a3f91c2e…/photo-thumb.webp   640w   grid
 *   gallery/a3f91c2e…/photo-view.webp   2000w   full-screen viewer
 */
export const GALLERY_VARIANTS = {
  thumb: { width: 640, quality: 80 },
  view: { width: 2000, quality: 80 },
} as const;
export type GalleryVariant = keyof typeof GALLERY_VARIANTS;

export const galleryPhotoKey = (hash: string, variant: GalleryVariant): string => {
  if (!(variant in GALLERY_VARIANTS)) throw new RangeError(`Invalid gallery variant: ${JSON.stringify(variant)}`);
  return `gallery/${assertHash(hash)}/photo-${variant}.webp`;
};

/**
 * Special editions (اشاعتِ خاص): one full newspaper page each, read by zooming.
 *
 *   special/a3f91c2e…/page-thumb.webp    480w   list
 *   special/a3f91c2e…/page-view.webp    2400w   viewer (never upscaled)
 */
export const SPECIAL_VARIANTS = {
  thumb: { width: 480, quality: 80 },
  view: { width: 2400, quality: 82 },
} as const;
export type SpecialVariant = keyof typeof SPECIAL_VARIANTS;

export const specialEditionKey = (hash: string, variant: SpecialVariant): string => {
  if (!(variant in SPECIAL_VARIANTS)) throw new RangeError(`Invalid special-edition variant: ${JSON.stringify(variant)}`);
  return `special/${assertHash(hash)}/page-${variant}.webp`;
};

/**
 * Monthly magazine: an issue per month, many pages, plus its PDF.
 *
 *   magazine/2019-12/page-03-thumb.a3f91c2e….webp    360w   strip, covers
 *   magazine/2019-12/page-03-view.a3f91c2e….webp    1400w   reader stage
 *   magazine/2019-12/page-03-zoom.a3f91c2e….webp    2400w   full screen (never upscaled)
 *   magazine/2019-12/issue.7b02d4f1….pdf
 */
export const MAGAZINE_VARIANTS = {
  thumb: { width: 360, quality: 80 },
  view: { width: 1400, quality: 80 },
  zoom: { width: 2400, quality: 80 },
} as const;
export type MagazineVariant = keyof typeof MAGAZINE_VARIANTS;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
export const assertMonth = (m: string): string => {
  if (!MONTH.test(m)) throw new RangeError(`Invalid month: ${JSON.stringify(m)}`);
  return m;
};

export const magazinePageKey = (month: string, page: number, variant: MagazineVariant, hash: string): string => {
  if (!Number.isInteger(page) || page < 1 || page > 500) throw new RangeError(`Invalid page: ${page}`);
  if (!(variant in MAGAZINE_VARIANTS)) throw new RangeError(`Invalid magazine variant: ${JSON.stringify(variant)}`);
  return `magazine/${assertMonth(month)}/page-${String(page).padStart(2, '0')}-${variant}.${assertHash(hash)}.webp`;
};

export const magazinePdfKey = (month: string, hash: string): string => `magazine/${assertMonth(month)}/issue.${assertHash(hash)}.pdf`;

export const editionPageKey = (
  date: string,
  page: number,
  variant: PageVariant | 'orig',
  hash: string,
  origExt: 'jpg' | 'png' = 'jpg',
): string => {
  const ext = variant === 'orig' ? origExt : 'webp';
  return `editions/${assertIsoDate(date)}/page-${assertPageNumber(page)}-${variant}.${assertHash(hash)}.${ext}`;
};

export const editionPdfKey = (date: string, hash: string): string =>
  `editions/${assertIsoDate(date)}/edition.${assertHash(hash)}.pdf`;

export const articleImageKey = (slug: string, variant: PageVariant | 'orig', hash: string): string => {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) throw new RangeError(`Invalid slug: ${JSON.stringify(slug)}`);
  return `articles/${slug}/image-${variant}.${assertHash(hash)}.${variant === 'orig' ? 'jpg' : 'webp'}`;
};

/** Join a CDN base (absolute URL or in-app path like "/media") with a key. */
export const mediaUrl = (cdnBase: string, key: string): string =>
  `${cdnBase.replace(/\/+$/, '')}/${key}`;

export const contentTypeFor = (key: string): string => {
  if (key.endsWith('.webp')) return 'image/webp';
  if (key.endsWith('.jpg') || key.endsWith('.jpeg')) return 'image/jpeg';
  if (key.endsWith('.png')) return 'image/png';
  if (key.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
};
