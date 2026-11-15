import { readImageHeader, readPngHeader } from '../image-header';
import { formatFileSize } from '../dates';

/**
 * Checks for one gallery photo uploaded in /admin. Pure, so the tests run it in
 * Node. Type and size come from the bytes, never from the browser (CWE-434).
 */

/** Per photo. Compressed photos are well under this; one photo per request. */
export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
/** Request cap, checked before the body is read: one photo plus form fields. */
export const PHOTO_REQUEST_MAX_BYTES = PHOTO_MAX_BYTES + 64 * 1024;

export class PhotoUploadError extends Error {
  override name = 'PhotoUploadError';
}

export interface CheckedPhoto {
  width: number;
  height: number;
}

export function checkPhoto(bytes: Uint8Array): CheckedPhoto {
  if (bytes.byteLength === 0) throw new PhotoUploadError('The file is empty.');
  if (bytes.byteLength > PHOTO_MAX_BYTES) {
    throw new PhotoUploadError(`The photo is ${formatFileSize(bytes.byteLength)}; the limit is ${formatFileSize(PHOTO_MAX_BYTES)}.`);
  }
  const h = readImageHeader(bytes) ?? readPngHeader(bytes);
  if (!h) throw new PhotoUploadError('Use a JPEG, PNG or WebP photo. (iPhone HEIC photos: export as JPEG first.)');
  return { width: h.width, height: h.height };
}

