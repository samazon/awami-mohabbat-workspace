import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { GALLERY_MAX_BYTES, deriveGalleryPhoto } from '../scripts/ingest';
import { PER_PAGE, addPhoto, listAllPhotos, listPhotos, lowestSortKey, setCaption, setHidden } from '../src/lib/gallery/data';
import { galleryPhotoKey } from '../src/lib/media';
import { testDb } from './helpers/db';

const image = (width: number, height: number, format: 'png' | 'jpeg' | 'webp' | 'gif') =>
  sharp({ create: { width, height, channels: 3, background: '#4a6' } })[format]().toBuffer();
const hash = (n: number) => n.toString(16).padStart(16, '0');

describe('galleryPhotoKey', () => {
  it('builds hashed, immutable keys under gallery/', () => {
    expect(galleryPhotoKey('a1b2c3d4e5f60718', 'thumb')).toBe('gallery/a1b2c3d4e5f60718/photo-thumb.webp');
    expect(galleryPhotoKey('a1b2c3d4e5f60718', 'view')).toBe('gallery/a1b2c3d4e5f60718/photo-view.webp');
  });
  it('rejects a bad hash or variant', () => {
    expect(() => galleryPhotoKey('../etc/passwd', 'view')).toThrow(RangeError);
    expect(() => galleryPhotoKey('a1b2c3d4e5f60718', 'orig' as never)).toThrow(RangeError);
  });
});

describe('deriveGalleryPhoto', () => {
  it('makes thumb and view WebPs and never upscales', async () => {
    const out = await deriveGalleryPhoto(await image(3000, 2000, 'jpeg'));
    expect([out.width, out.height]).toEqual([3000, 2000]);
    expect(out.variants.map((v) => [v.variant, v.width])).toEqual([['thumb', 640], ['view', 2000]]);
    const small = await deriveGalleryPhoto(await image(800, 600, 'png'));
    expect(small.variants.map((v) => v.width)).toEqual([640, 800]);
  });

  it('writes no EXIF metadata into the derivatives', async () => {
    const withExif = await sharp(await image(1200, 900, 'jpeg'))
      .withExif({ IFD0: { Make: 'TestPhone', Model: 'GPS-Cam' } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await deriveGalleryPhoto(withExif);
    for (const v of out.variants) expect((await sharp(v.buffer).metadata()).exif).toBeUndefined();
  });

  it('accepts WebP; rejects other formats, non-images and oversize files', async () => {
    await expect(deriveGalleryPhoto(await image(500, 500, 'webp'))).resolves.toBeTruthy();
    await expect(deriveGalleryPhoto(await image(100, 100, 'gif'))).rejects.toThrow(/JPEG, PNG or WebP/);
    await expect(deriveGalleryPhoto(Buffer.from('not an image'))).rejects.toThrow(/could not be read/);
    await expect(deriveGalleryPhoto(Buffer.alloc(GALLERY_MAX_BYTES + 1))).rejects.toThrow(/25 MB/);
  });
});

describe('gallery data', () => {
  it('adds photos, skips a duplicate file, and lists newest first', async () => {
    const { db } = testDb();
    expect((await addPhoto(db, { hash: hash(1), width: 800, height: 600 }, { sortKey: 1 })).created).toBe(true);
    expect((await addPhoto(db, { hash: hash(2), width: 800, height: 600, captionUr: 'تقریب' }, { sortKey: 2 })).created).toBe(true);
    const dup = await addPhoto(db, { hash: hash(1), width: 800, height: 600, captionEn: 'Ceremony' }, { sortKey: 9 });
    expect(dup.created).toBe(false);
    const page = await listPhotos(db, { locale: 'ur', page: 1 });
    expect(page.total).toBe(2);
    expect(page.items.map((p) => p.hash)).toEqual([hash(2), hash(1)]);
    // The duplicate's caption was merged in, and its position kept.
    expect(page.items[1]).toMatchObject({ caption: 'Ceremony', captionLang: 'en' });
  });

  it('picks the caption in the page language, falling back to the other', async () => {
    const { db } = testDb();
    await addPhoto(db, { hash: hash(1), width: 10, height: 10, captionUr: 'اردو', captionEn: 'English' });
    await addPhoto(db, { hash: hash(2), width: 10, height: 10 });
    const en = await listPhotos(db, { locale: 'en', page: 1 });
    const byHash = Object.fromEntries(en.items.map((p) => [p.hash, p]));
    expect(byHash[hash(1)]).toMatchObject({ caption: 'English', captionLang: 'en' });
    expect(byHash[hash(2)]).toMatchObject({ caption: null, captionLang: null });
    const ur = await listPhotos(db, { locale: 'ur', page: 1 });
    expect(ur.items.find((p) => p.hash === hash(1))).toMatchObject({ caption: 'اردو', captionLang: 'ur' });
  });

  it('hides and shows photos, and edits or clears captions', async () => {
    const { db } = testDb();
    const { id } = await addPhoto(db, { hash: hash(1), width: 10, height: 10, captionUr: 'پرانا' });
    expect(await setHidden(db, id, true)).toBe(true);
    expect((await listPhotos(db, { locale: 'ur', page: 1 })).total).toBe(0);
    expect((await listAllPhotos(db)).length).toBe(1);
    await setHidden(db, id, false);
    await setCaption(db, id, { ur: null, en: 'New' });
    expect((await listPhotos(db, { locale: 'ur', page: 1 })).items[0]).toMatchObject({ caption: 'New', captionLang: 'en' });
    expect(await setHidden(db, 9999, true)).toBe(false);
  });

  it('paginates', async () => {
    const { db } = testDb();
    for (let i = 1; i <= PER_PAGE + 3; i++) await addPhoto(db, { hash: hash(i), width: 10, height: 10 }, { sortKey: i });
    const p2 = await listPhotos(db, { locale: 'ur', page: 2 });
    expect(p2.pageCount).toBe(2);
    expect(p2.items.length).toBe(3);
    expect(p2.items.at(-1)!.hash).toBe(hash(1));
  });

  it('rejects bad input at the boundary', async () => {
    const { db } = testDb();
    await expect(addPhoto(db, { hash: 'nope', width: 10, height: 10 })).rejects.toThrow();
    await expect(addPhoto(db, { hash: hash(1), width: 0, height: 10 })).rejects.toThrow();
    await expect(addPhoto(db, { hash: hash(1), width: 10, height: 10, captionUr: 'x'.repeat(301) })).rejects.toThrow();
  });
});

describe('re-running a batch', () => {
  it('keeps the batch in order when earlier photos already exist', async () => {
    const { db } = testDb();
    // First attempt stopped after 2 of 4 photos.
    await addPhoto(db, { hash: hash(1), width: 10, height: 10 }, { sortKey: 100, moveExisting: true });
    await addPhoto(db, { hash: hash(2), width: 10, height: 10 }, { sortKey: 99, moveExisting: true });
    // Re-run of the whole batch, later.
    for (const [i, h] of [1, 2, 3, 4].entries()) {
      await addPhoto(db, { hash: hash(h), width: 10, height: 10 }, { sortKey: 500 - i, moveExisting: true });
    }
    const page = await listPhotos(db, { locale: 'ur', page: 1 });
    expect(page.items.map((p) => p.hash)).toEqual([hash(1), hash(2), hash(3), hash(4)]);
  });

  it('leaves existing positions alone without moveExisting', async () => {
    const { db } = testDb();
    await addPhoto(db, { hash: hash(1), width: 10, height: 10 }, { sortKey: 100 });
    await addPhoto(db, { hash: hash(2), width: 10, height: 10 }, { sortKey: 200 });
    await addPhoto(db, { hash: hash(1), width: 10, height: 10 }, { sortKey: 999 });
    expect((await listPhotos(db, { locale: 'ur', page: 1 })).items.map((p) => p.hash)).toEqual([hash(2), hash(1)]);
  });
});

describe('adding a batch at the bottom', () => {
  it('places it below every existing photo, keeping its own order', async () => {
    const { db } = testDb();
    expect(await lowestSortKey(db, 777)).toBe(777); // empty gallery
    await addPhoto(db, { hash: hash(1), width: 10, height: 10 }, { sortKey: 1000 });
    await addPhoto(db, { hash: hash(2), width: 10, height: 10 }, { sortKey: 999 });
    const base = (await lowestSortKey(db)) - 1;
    for (const [i, h] of [3, 4].entries()) await addPhoto(db, { hash: hash(h), width: 10, height: 10 }, { sortKey: base - i });
    expect((await listPhotos(db, { locale: 'ur', page: 1 })).items.map((p) => p.hash)).toEqual([hash(1), hash(2), hash(3), hash(4)]);
  });
});
