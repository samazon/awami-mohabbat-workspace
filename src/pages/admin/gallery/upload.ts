import type { APIRoute } from 'astro';
import { z } from 'zod';
import { PHOTO_REQUEST_MAX_BYTES } from '@/lib/gallery/upload';
import { audit } from '@/lib/services/admin';
import { PhotoUploadError, storeGalleryPhoto } from '@/lib/services/gallery-admin';

/**
 * POST /admin/gallery/upload — one photo per request, sent one after another by
 * the gallery page. Under /admin, so the middleware has already checked
 * Cloudflare Access; Astro's origin check covers CSRF.
 *
 * `base` and `index` set the photo's place: base − index, so the first photo of
 * a batch shows first. `base` is the batch's start time, from the browser, and
 * must be within a day of the server's clock.
 */
const DAY = 86_400_000;
const Fields = z.object({
  base: z.coerce.number().int(),
  index: z.coerce.number().int().min(0).max(10_000),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = locals.admin;
  if (!admin) return json({ error: 'Not authorised.' }, 403);

  const length = Number(request.headers.get('content-length') ?? NaN);
  if (!Number.isFinite(length) || length > PHOTO_REQUEST_MAX_BYTES) return json({ error: 'The photo is too large.' }, 413);

  const form = await request.formData();
  const fields = Fields.safeParse({ base: form.get('base'), index: form.get('index') });
  const photo = form.get('photo');
  if (!fields.success || !(photo instanceof File)) return json({ error: 'Bad request.' }, 400);
  if (Math.abs(fields.data.base - Date.now()) > DAY) return json({ error: 'Your computer clock looks wrong. Fix it and try again.' }, 400);

  try {
    const res = await storeGalleryPhoto(photo, fields.data.base - fields.data.index);
    await audit(admin.id, res.created ? 'gallery.add' : 'gallery.readd', `gallery_photos:${res.id}`);
    return json(res, 200);
  } catch (err) {
    if (err instanceof PhotoUploadError) return json({ error: err.message }, 400);
    throw err;
  }
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
