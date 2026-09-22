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
import { PAGE_VARIANTS, type PageVariant } from '../src/lib/media';

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
