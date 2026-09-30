/**
 * Derivative pipeline for newspaper pages. Shared by the seed CLI today and by
 * the admin upload path later.
 *
 *   original  → sha256 (first 16 hex) → the content hash every key carries
 *   thumb      400w  WebP q82   archive grid + four-page strip
 *   view      1200w  WebP q80   default viewer image
 *   zoom      2400w  WebP q78   pinch / tap to zoom
 *
 * WebP over AVIF: AVIF encodes several times slower for ~15% smaller files,
 * which doesn't matter on immutable, cached-forever objects.
 */
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  BANNER_VARIANTS,
  GALLERY_VARIANTS,
  SPECIAL_VARIANTS,
  PAGE_VARIANTS,
  type BannerVariant,
  type GalleryVariant,
  type SpecialVariant,
  type PageVariant,
} from '../src/lib/media';

export interface DerivedVariant {
  variant: PageVariant;
  buffer: Buffer;
  width: number;
  height: number;
}

export interface DerivedPage {
  hash: string;
  width: number;
  height: number;
  origBytes: number;
  origExt: 'jpg' | 'png';
  variants: DerivedVariant[];
  warnings: string[];
}

export const contentHash = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex').slice(0, 16);

const MIN_WIDTH_HARD = 1200;
const MIN_WIDTH_SOFT = 2400;

export async function derivePage(input: Buffer, label = 'page'): Promise<DerivedPage> {
  const image = sharp(input, { failOn: 'error' }).rotate(); // honour EXIF orientation
  const meta = await image.metadata();

  if (meta.format !== 'jpeg' && meta.format !== 'png') {
    throw new Error(`${label}: expected a JPEG or PNG, got ${meta.format ?? 'unknown'}`);
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < MIN_WIDTH_HARD) {
    throw new Error(`${label}: ${width}px wide is too small to read; need at least ${MIN_WIDTH_HARD}px`);
  }
  const warnings: string[] = [];
  if (width < MIN_WIDTH_SOFT) {
    warnings.push(`${label}: ${width}px wide — the zoom derivative will not be enlarged past the original`);
  }
  if (height < width) {
    warnings.push(`${label}: landscape (${width}×${height}) — newspaper pages are expected portrait`);
  }

  const variants: DerivedVariant[] = [];
  for (const [variant, spec] of Object.entries(PAGE_VARIANTS) as [PageVariant, { width: number; quality: number }][]) {
    const { data, info } = await image
      .clone()
      .resize({ width: spec.width, withoutEnlargement: true })
      .webp({ quality: spec.quality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    variants.push({ variant, buffer: data, width: info.width, height: info.height });
  }

  return {
    hash: contentHash(input),
    width,
    height,
    origBytes: input.byteLength,
    origExt: meta.format === 'png' ? 'png' : 'jpg',
    variants,
    warnings,
  };
}

export const kb = (bytes: number): string => `${Math.round(bytes / 1024)} KB`;

// ---------------------------------------------------------------------------
// Columnist banners
// ---------------------------------------------------------------------------
export const BANNER_MAX_BYTES = 10 * 1024 * 1024;

export interface DerivedBanner {
  hash: string;
  width: number;
  height: number;
  origExt: 'jpg' | 'png';
  variants: { variant: BannerVariant; buffer: Buffer; width: number; height: number }[];
}

/** sharp throws on unrecognisable input (not just unsupported formats); give editors one clear message either way. */
async function readBannerMetadata(input: Buffer) {
  try {
    return await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    throw new Error('Banner must be JPEG or PNG, and this file could not be read as an image.');
  }
}

/** Validate a banner upload and derive its WebP sizes. Never upscales; honours EXIF orientation. */
export async function deriveBanner(input: Buffer): Promise<DerivedBanner> {
  if (input.byteLength > BANNER_MAX_BYTES) {
    throw new Error(`Banner is ${kb(input.byteLength)}; the limit is 10 MB.`);
  }
  const meta = await readBannerMetadata(input);
  if (meta.format !== 'jpeg' && meta.format !== 'png') {
    throw new Error(`Banner must be JPEG or PNG, got ${meta.format ?? 'an unknown format'}.`);
  }

  const { info } = await sharp(input, { failOn: 'error' }).rotate().toBuffer({ resolveWithObject: true });
  const variants: DerivedBanner['variants'] = [];
  for (const variant of Object.keys(BANNER_VARIANTS) as BannerVariant[]) {
    const spec = BANNER_VARIANTS[variant];
    const { data, info: v } = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: spec.width, withoutEnlargement: true })
      .webp({ quality: spec.quality })
      .toBuffer({ resolveWithObject: true });
    variants.push({ variant, buffer: data, width: v.width, height: v.height });
  }

  return {
    hash: contentHash(input),
    width: info.width,
    height: info.height,
    origExt: meta.format === 'png' ? 'png' : 'jpg',
    variants,
  };
}

// ---------------------------------------------------------------------------
// Gallery photos
// ---------------------------------------------------------------------------
export const GALLERY_MAX_BYTES = 25 * 1024 * 1024;

export interface DerivedPhoto {
  hash: string;
  /** Size after EXIF rotation, i.e. as the viewer shows it. */
  width: number;
  height: number;
  variants: { variant: GalleryVariant; buffer: Buffer; width: number; height: number }[];
}

/**
 * Validate a gallery photo and derive its WebP sizes. Honours EXIF orientation,
 * never upscales, and writes no metadata (sharp drops EXIF unless asked), so a
 * phone's GPS location never reaches the bucket.
 */
export async function deriveGalleryPhoto(input: Buffer, label = 'photo'): Promise<DerivedPhoto> {
  return deriveWebpSet(input, label, GALLERY_VARIANTS);
}

/** A special-edition page: same validation and privacy as a gallery photo, larger sizes. */
export async function deriveSpecialEdition(input: Buffer, label = 'page'): Promise<DerivedWebpSet<SpecialVariant>> {
  return deriveWebpSet(input, label, SPECIAL_VARIANTS);
}

export interface DerivedWebpSet<V extends string> {
  hash: string;
  width: number;
  height: number;
  variants: { variant: V; buffer: Buffer; width: number; height: number }[];
}

async function deriveWebpSet<V extends string>(
  input: Buffer,
  label: string,
  specs: Record<V, { width: number; quality: number }>,
): Promise<DerivedWebpSet<V>> {
  if (input.byteLength > GALLERY_MAX_BYTES) {
    throw new Error(`${label} is ${kb(input.byteLength)}; the limit is 25 MB.`);
  }
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(input, { failOn: 'error' }).metadata();
  } catch {
    throw new Error(`${label} could not be read as an image. Use JPEG, PNG or WebP.`);
  }
  if (meta.format !== 'jpeg' && meta.format !== 'png' && meta.format !== 'webp') {
    throw new Error(`${label} must be JPEG, PNG or WebP, got ${meta.format ?? 'an unknown format'}. (iPhone HEIC photos: export as JPEG first.)`);
  }

  const { info } = await sharp(input, { failOn: 'error' }).rotate().toBuffer({ resolveWithObject: true });
  const variants: DerivedWebpSet<V>['variants'] = [];
  for (const variant of Object.keys(specs) as V[]) {
    const spec = specs[variant];
    const { data, info: v } = await sharp(input, { failOn: 'error' })
      .rotate()
      .resize({ width: spec.width, withoutEnlargement: true })
      .webp({ quality: spec.quality })
      .toBuffer({ resolveWithObject: true });
    variants.push({ variant, buffer: data, width: v.width, height: v.height });
  }
  return { hash: contentHash(input), width: info.width, height: info.height, variants };
}
