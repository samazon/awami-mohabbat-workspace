import type { APIRoute } from 'astro';
import { json, rawUploadGuard } from '@/lib/admin/raw-upload';
import { PHOTO_MAX_BYTES } from '@/lib/gallery/upload';
import { Month, PageNumber, PhotoUploadError, storeMagazinePage } from '@/lib/services/magazine-admin';

/** POST /admin/magazine/page?month=YYYY-MM&n=1 — one page image (rendered from the PDF in the browser) as the body. */
export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!locals.admin) return json({ error: 'Not authorised.' }, 403);
  const refused = rawUploadGuard(request, url, PHOTO_MAX_BYTES);
  if (refused) return refused;
  const month = Month.safeParse(url.searchParams.get('month'));
  const n = PageNumber.safeParse(url.searchParams.get('n'));
  if (!month.success || !n.success) return json({ error: 'Bad request.' }, 400);
  try {
    return json(await storeMagazinePage(month.data, n.data, new Uint8Array(await request.arrayBuffer())), 200);
  } catch (err) {
    if (err instanceof PhotoUploadError) return json({ error: `Page ${n.data}: ${err.message}` }, 400);
    throw err;
  }
};
