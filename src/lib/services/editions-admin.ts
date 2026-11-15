import { env } from 'cloudflare:workers';
import { db } from '@/lib/db/client';
import {
  deleteDraftEdition,
  getEditionStatus,
  listEditions,
  publishEdition,
  writeEdition,
} from '@/lib/editions/data';
import { EditionUploadError, checkPage, checkPdf, contentHash16 } from '@/lib/editions/upload';
import { IMMUTABLE_CACHE_CONTROL, PAGE_COUNT, PAGE_VARIANTS, editionPageKey, editionPdfKey, type PageVariant } from '@/lib/media';

/**
 * Admin upload of a daily edition: the browser version of `pnpm seed`.
 *
 * Every file is checked before anything is stored. Then R2 first (originals,
 * WebP sizes made by the Images binding, the PDF), D1 last, like the CLI: a
 * failure half-way leaves unused objects, never rows pointing at missing files.
 * The edition is saved as a draft; publishing is a separate, deliberate click.
 */

export { EditionUploadError };

export interface DraftInput {
  date: string;
  pages: File[];
  pdf: File | null;
  headlineUr: string;
  headlineEn: string;
  /** Required to replace an edition that is already live on that date. */
  replacePublished: boolean;
}

const bytesOf = async (f: File) => new Uint8Array(await f.arrayBuffer());

async function put(key: string, body: Uint8Array<ArrayBuffer> | ArrayBuffer, contentType: string) {
  await env.MEDIA.put(key, body, { httpMetadata: { contentType, cacheControl: IMMUTABLE_CACHE_CONTROL } });
}

/** One WebP size of a page. `scale-down` never enlarges a page narrower than the target. */
async function webpVariant(bytes: Uint8Array<ArrayBuffer>, variant: PageVariant): Promise<ArrayBuffer> {
  const spec = PAGE_VARIANTS[variant];
  const result = await env.IMAGES.input(new Blob([bytes]).stream())
    .transform({ width: spec.width, fit: 'scale-down' })
    .output({ format: 'image/webp', quality: spec.quality });
  return new Response(result.image()).arrayBuffer();
}

export async function saveEditionDraft(input: DraftInput): Promise<void> {
  const d = db();
  const status = await getEditionStatus(d, input.date);
  if (status === 'published' && !input.replacePublished) {
    throw new EditionUploadError(
      `An edition for ${input.date} is already live. Tick "Replace the live edition" to upload over it.`,
    );
  }
  if (input.pages.length !== PAGE_COUNT) throw new EditionUploadError(`All ${PAGE_COUNT} pages are required.`);
  if (!input.pdf || input.pdf.size === 0) throw new EditionUploadError('The PDF is missing. Every edition needs one.');

  // ---- check everything before storing anything ----
  for (const [i, f] of input.pages.entries()) checkPage(await bytesOf(f), i + 1);
  checkPdf(await bytesOf(input.pdf));

  // ---- R2 (one file in memory at a time) ----
  const pages = [];
  for (const [i, f] of input.pages.entries()) {
    const n = i + 1;
    const bytes = await bytesOf(f);
    const page = checkPage(bytes, n);
    const hash = await contentHash16(bytes);
    await put(editionPageKey(input.date, n, 'orig', hash, page.ext), bytes, page.contentType);
    for (const variant of Object.keys(PAGE_VARIANTS) as PageVariant[]) {
      await put(editionPageKey(input.date, n, variant, hash), await webpVariant(bytes, variant), 'image/webp');
    }
    pages.push({ hash, width: page.width, height: page.height, origBytes: bytes.byteLength });
  }
  const pdfBytes = await bytesOf(input.pdf);
  const pdfHash = await contentHash16(pdfBytes);
  await put(editionPdfKey(input.date, pdfHash), pdfBytes, 'application/pdf');

  // ---- then D1 ----
  await writeEdition(d, {
    date: input.date,
    pdf: { hash: pdfHash, bytes: pdfBytes.byteLength },
    pages,
    ur: { headline: input.headlineUr },
    en: { headline: input.headlineEn, machineTranslated: false },
    status: 'draft',
  });
}

export const adminListEditions = () => listEditions(db());
export const adminEditionStatus = (date: string) => getEditionStatus(db(), date);
export const adminPublishEdition = (date: string) => publishEdition(db(), date);
export const adminDeleteDraft = (date: string) => deleteDraftEdition(db(), date);
