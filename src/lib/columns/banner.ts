import { formatFileSize } from '../dates';
import { readImageHeader, readPngHeader } from '../image-header';

/**
 * Checks for a columnist's logo (banner) uploaded in /admin. Pure, so the tests
 * run it in Node. Type and size come from the bytes (CWE-434). JPEG or PNG only:
 * the original is kept, and its key's extension is jpg or png
 * (columnistBannerKey in media.ts), as with `pnpm columns`.
 */

export const BANNER_MAX_BYTES = 10 * 1024 * 1024;

export class BannerError extends Error {
  override name = 'BannerError';
}

export interface CheckedBanner {
  ext: 'jpg' | 'png';
  contentType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

export function checkBanner(bytes: Uint8Array): CheckedBanner {
  if (bytes.byteLength === 0) throw new BannerError('The logo file is empty.');
  if (bytes.byteLength > BANNER_MAX_BYTES) {
    throw new BannerError(`The logo is ${formatFileSize(bytes.byteLength)}; the limit is 10 MB.`);
  }
  const jpg = readImageHeader(bytes);
  if (jpg?.type === 'jpg') return { ext: 'jpg', contentType: 'image/jpeg', width: jpg.width, height: jpg.height };
  const png = readPngHeader(bytes);
  if (png) return { ext: 'png', contentType: 'image/png', width: png.width, height: png.height };
  throw new BannerError('The logo must be a JPEG or PNG image.');
}
