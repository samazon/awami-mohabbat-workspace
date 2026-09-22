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
