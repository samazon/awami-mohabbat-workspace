import { env } from 'cloudflare:workers';
import { readJpegOrientation } from '@/lib/image-header';
import { IMMUTABLE_CACHE_CONTROL } from '@/lib/media';

/**
 * Resizing and storing uploads inside the Worker. sharp can't run here, so the
 * Cloudflare Images binding makes the WebP sizes. WebP output carries no EXIF,
 * so a phone photo's GPS location never reaches the bucket.
 */

/** One WebP size. `scale-down` never enlarges an image narrower than `width`. */
export async function webpSize(
  bytes: Uint8Array<ArrayBuffer>,
  width: number,
  quality: number,
  rotate: 0 | 90 | 270 = 0,
): Promise<ArrayBuffer> {
  const result = await env.IMAGES.input(new Blob([bytes]).stream())
    .transform({ width, fit: 'scale-down', ...(rotate ? { rotate } : {}) })
    .output({ format: 'image/webp', quality });
  return new Response(result.image()).arrayBuffer();
}

/**
 * Every WebP size of one photo, upright, plus its size as displayed.
 *
 * Phones save portrait shots sideways with an EXIF orientation of 6 or 8. Whether
 * the resize applies that by itself isn't something to rely on (wrangler's local
 * emulation doesn't), so: make the largest size, and if it came out sideways,
 * make it again with an explicit quarter turn. 180° (orientation 3) and mirrored
 * shots are rare and left as they are.
 */
export async function resizeSet<V extends string>(
  bytes: Uint8Array<ArrayBuffer>,
  header: { width: number; height: number },
  specs: Record<V, { width: number; quality: number }>,
): Promise<{ width: number; height: number; variants: { variant: V; body: ArrayBuffer }[] }> {
  const names = (Object.keys(specs) as V[]).sort((a, b) => specs[b].width - specs[a].width);
  const largest = names[0]!;
  const orientation = readJpegOrientation(bytes);
  const quarterTurn = orientation >= 5 && header.width !== header.height;

  let rotate: 0 | 90 | 270 = 0;
  let first = await webpSize(bytes, specs[largest].width, specs[largest].quality);
  if (quarterTurn) {
    const out = await storedSize(first);
    if (out.width > out.height === header.width > header.height) {
      rotate = orientation === 5 || orientation === 6 ? 90 : 270;
      first = await webpSize(bytes, specs[largest].width, specs[largest].quality, rotate);
    }
  }
  const variants = [{ variant: largest, body: first }];
  for (const v of names.slice(1)) variants.push({ variant: v, body: await webpSize(bytes, specs[v].width, specs[v].quality, rotate) });
  const size = quarterTurn ? { width: header.height, height: header.width } : header;
  return { ...size, variants };
}

/** Width and height of an image as stored (after any EXIF rotation the resize applied). */
export async function storedSize(bytes: ArrayBuffer): Promise<{ width: number; height: number }> {
  const info = await env.IMAGES.info(new Blob([bytes]).stream());
  if (!('width' in info) || !info.width || !info.height) throw new Error('Could not read the resized image size.');
  return { width: info.width, height: info.height };
}

/** Store an immutable object; keys carry a content hash, so it can be cached forever. */
export async function putMedia(key: string, body: Uint8Array<ArrayBuffer> | ArrayBuffer, contentType: string): Promise<void> {
  await env.MEDIA.put(key, body, { httpMetadata: { contentType, cacheControl: IMMUTABLE_CACHE_CONTROL } });
}

export async function deleteMedia(keys: string[]): Promise<void> {
  if (keys.length) await env.MEDIA.delete(keys);
}
