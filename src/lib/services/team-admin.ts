import { env } from 'cloudflare:workers';
import type { z } from 'zod';
import { db } from '@/lib/db/client';
import { readImageHeader } from '@/lib/image-header';
import { IMMUTABLE_CACHE_CONTROL, teamPhotoKey } from '@/lib/media';
import { createMember, deleteMember, getMember, listMembers, moveMember, updateMember, type MemberInput } from '@/lib/team/data';

/** Upload limits for a team photo, already cropped and sized in the browser (CWE-434). */
export const PHOTO_MAX_BYTES = 1_500_000;
const MIN_W = 300;
const MAX_W = 1400;

export class PhotoError extends Error {
  override name = 'PhotoError';
}

/**
 * Check an upload by its bytes (type and size from the file's own header,
 * never the browser's claim), then store it immutably under its content hash.
 */
export async function storeTeamPhoto(file: File) {
  if (file.size === 0) throw new PhotoError('The photo is empty.');
  if (file.size > PHOTO_MAX_BYTES) throw new PhotoError('The photo is over 1.5 MB. Crop it in the editor before saving.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const h = readImageHeader(bytes);
  if (!h) throw new PhotoError('The photo must be a JPEG or WebP image.');
  if (h.width < MIN_W || h.width > MAX_W) throw new PhotoError(`The photo must be ${MIN_W}–${MAX_W}px wide (it is ${h.width}px).`);
  const ratio = h.width / h.height;
  if (ratio < 0.7 || ratio > 0.9) throw new PhotoError('The photo must be a portrait crop (4:5). Use the crop tool.');

  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
  const key = teamPhotoKey(hash, h.type);
  await env.MEDIA.put(key, bytes, {
    httpMetadata: { contentType: h.type === 'webp' ? 'image/webp' : 'image/jpeg', cacheControl: IMMUTABLE_CACHE_CONTROL },
  });
  return { hash, ext: h.type, width: h.width, height: h.height };
}

export const adminListMembers = () => listMembers(db(), { includeHidden: true });
export const adminGetMember = (id: number) => getMember(db(), id);

export async function adminSaveMember(
  id: number | null,
  fields: z.input<typeof MemberInput>,
  photo: { file?: File | null; remove?: boolean },
) {
  const stored = photo.file && photo.file.size > 0 ? await storeTeamPhoto(photo.file) : null;
  const photoArg = stored ?? (photo.remove ? null : undefined);
  if (id === null) return { id: await createMember(db(), fields, stored), created: true };
  const ok = await updateMember(db(), id, fields, photoArg);
  return ok ? { id, created: false } : null;
}

export const adminDeleteMember = (id: number) => deleteMember(db(), id);
export const adminMoveMember = (id: number, dir: 'up' | 'down') => moveMember(db(), id, dir);
