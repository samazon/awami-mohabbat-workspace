import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_BYTES, PhotoUploadError, checkPhoto } from '../src/lib/gallery/upload';
import { readJpegOrientation } from '../src/lib/image-header';
import { addPhoto, deletePhoto, listAllPhotos } from '../src/lib/gallery/data';
import { testDb } from './helpers/db';

const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: '#ccc' } });

describe('checkPhoto', () => {
  it('accepts JPEG, PNG and WebP of any size, reading the size from the bytes', async () => {
    expect(checkPhoto(await img(1600, 1200).jpeg().toBuffer())).toEqual({ width: 1600, height: 1200 });
    expect(checkPhoto(await img(800, 600).png().toBuffer())).toEqual({ width: 800, height: 600 });
    expect(checkPhoto(await img(640, 480).webp().toBuffer())).toEqual({ width: 640, height: 480 });
  });
  it('refuses anything else, empty files and oversized files', async () => {
    expect(() => checkPhoto(new TextEncoder().encode('<svg onload=alert(1)>'))).toThrow(/JPEG, PNG or WebP/);
    const gif = await img(10, 10).gif().toBuffer();
    expect(() => checkPhoto(gif)).toThrow(PhotoUploadError);
    expect(() => checkPhoto(new Uint8Array(0))).toThrow(/empty/);
    expect(() => checkPhoto(new Uint8Array(PHOTO_MAX_BYTES + 1))).toThrow(/limit/);
  });
});

describe('readJpegOrientation', () => {
  it('reads the EXIF orientation phones use for portrait shots, and 1 when there is none', async () => {
    for (const o of [1, 3, 6, 8]) {
      expect(readJpegOrientation(await img(300, 200).jpeg().withMetadata({ orientation: o }).toBuffer())).toBe(o);
    }
    expect(readJpegOrientation(await img(300, 200).jpeg().toBuffer())).toBe(1);
    expect(readJpegOrientation(await img(300, 200).png().toBuffer())).toBe(1);
    expect(readJpegOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 8, 0x45]))).toBe(1);
  });
});

describe('deletePhoto', () => {
  it('removes the row and returns its hash, so the files can be deleted too', async () => {
    const { db } = testDb();
    const { id } = await addPhoto(db, { hash: 'a1b2c3d4e5f60718', width: 800, height: 600 });
    await addPhoto(db, { hash: 'b1b2c3d4e5f60718', width: 800, height: 600 });
    expect(await deletePhoto(db, id)).toBe('a1b2c3d4e5f60718');
    expect((await listAllPhotos(db)).map((p) => p.hash)).toEqual(['b1b2c3d4e5f60718']);
    expect(await deletePhoto(db, id)).toBeNull(); // already gone
  });
});
