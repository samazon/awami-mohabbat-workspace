import type { APIRoute } from 'astro';
import { json, rawUploadGuard } from '@/lib/admin/raw-upload';
import { MAGAZINE_PDF_MAX_BYTES } from '@/lib/magazine/upload';
import { MagazineUploadError, Month, storeMagazinePdf } from '@/lib/services/magazine-admin';

/** POST /admin/magazine/pdf?month=YYYY-MM — the issue's PDF as the body. */
export const POST: APIRoute = async ({ request, url, locals }) => {
  if (!locals.admin) return json({ error: 'Not authorised.' }, 403);
  const refused = rawUploadGuard(request, url, MAGAZINE_PDF_MAX_BYTES);
  if (refused) return refused;
  const month = Month.safeParse(url.searchParams.get('month'));
  if (!month.success) return json({ error: 'Bad request.' }, 400);
  try {
    return json(await storeMagazinePdf(month.data, new Uint8Array(await request.arrayBuffer())), 200);
  } catch (err) {
    if (err instanceof MagazineUploadError) return json({ error: err.message }, 400);
    throw err;
  }
};
