import { readImageHeader, readPngHeader } from '../image-header';
import { formatFileSize as kb } from '../dates';

/**
 * Checks for edition files uploaded in /admin. Pure, so the tests run them in
 * Node. Type and size come from the bytes, never from the browser's claim
 * (CWE-434). There is no minimum width: the paper's own scans are about
 * 1140px wide, and refusing them would just stop the day's upload.
 */

/** Per page. Compressed scans are typically 1–4 MB; the cap keeps the Worker well inside its memory. */
export const PAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PDF_MAX_BYTES = 25 * 1024 * 1024;
/** Anything bigger is refused before the body is read. Slack covers the text fields and multipart framing. */
export const REQUEST_MAX_BYTES = 4 * PAGE_MAX_BYTES + PDF_MAX_BYTES + 256 * 1024;

export class EditionUploadError extends Error {
  override name = 'EditionUploadError';
}

export interface CheckedPage {
  ext: 'jpg' | 'png';
  contentType: 'image/jpeg' | 'image/png';
  width: number;
  height: number;
}

export function checkPage(bytes: Uint8Array, n: number): CheckedPage {
  const label = `Page ${n}`;
  if (bytes.byteLength === 0) throw new EditionUploadError(`${label} is missing or empty.`);
  if (bytes.byteLength > PAGE_MAX_BYTES) {
    throw new EditionUploadError(`${label} is ${kb(bytes.byteLength)}; the limit is ${kb(PAGE_MAX_BYTES)}. Compress it first.`);
  }
  const jpg = readImageHeader(bytes);
  const h = jpg?.type === 'jpg' ? jpg : readPngHeader(bytes);
  if (!h) throw new EditionUploadError(`${label} must be a JPEG or PNG image.`);
  return h.type === 'png'
    ? { ext: 'png', contentType: 'image/png', width: h.width, height: h.height }
    : { ext: 'jpg', contentType: 'image/jpeg', width: h.width, height: h.height };
}

export function checkPdf(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new EditionUploadError('The PDF is missing. Every edition needs one.');
  if (bytes.byteLength > PDF_MAX_BYTES) {
    throw new EditionUploadError(`The PDF is ${kb(bytes.byteLength)}; the limit is ${kb(PDF_MAX_BYTES)}. Compress it first.`);
  }
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (magic.some((v, i) => bytes[i] !== v)) throw new EditionUploadError('The PDF file is not a PDF.');
}

/** First 16 hex chars of SHA-256: the same content hash the seed CLI writes (scripts/ingest.ts contentHash). */
export async function contentHash16(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
