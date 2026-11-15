import { formatFileSize } from '../dates';

/**
 * Limits for magazine uploads in /admin. Pages arrive one per request (the
 * browser renders them from the PDF), then the PDF on its own.
 */

/** The PDF is held in memory once to hash it; compressed issues are well under this. */
export const MAGAZINE_PDF_MAX_BYTES = 40 * 1024 * 1024;

export class MagazineUploadError extends Error {
  override name = 'MagazineUploadError';
}

export function checkMagazinePdf(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new MagazineUploadError('The PDF is empty.');
  if (bytes.byteLength > MAGAZINE_PDF_MAX_BYTES) {
    throw new MagazineUploadError(`The PDF is ${formatFileSize(bytes.byteLength)}; the limit is ${formatFileSize(MAGAZINE_PDF_MAX_BYTES)}. Compress it first.`);
  }
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (magic.some((v, i) => bytes[i] !== v)) throw new MagazineUploadError('That file is not a PDF.');
}
