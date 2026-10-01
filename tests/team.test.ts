import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { readImageHeader } from '../src/lib/image-header';
import { createMember, deleteMember, getMember, listMembers, moveMember, updateMember } from '../src/lib/team/data';
import { teamPhotoKey } from '../src/lib/media';
import { testDb } from './helpers/db';

const base = { groupKey: 'reporting' as const, nameEn: 'Atif Gill', nameUr: 'عاطف گل' };
const photo = { hash: 'a1b2c3d4e5f60718', ext: 'webp' as const, width: 660, height: 825 };

describe('readImageHeader', () => {
  it('reads real WebP (lossy, lossless, extended) and JPEG sizes', async () => {
    const img = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 4, background: '#4a6a' } });
    expect(readImageHeader(await img(660, 825).webp().toBuffer())).toEqual({ type: 'webp', width: 660, height: 825 });
    expect(readImageHeader(await img(300, 200).webp({ lossless: true }).toBuffer())).toEqual({ type: 'webp', width: 300, height: 200 });
    expect(readImageHeader(await img(640, 800).webp({ alphaQuality: 50 }).toBuffer())).toMatchObject({ width: 640, height: 800 });
    expect(readImageHeader(await img(660, 825).jpeg({ progressive: true }).toBuffer())).toEqual({ type: 'jpg', width: 660, height: 825 });
  });
  it('rejects anything else, whatever it claims to be', async () => {
    expect(readImageHeader(await sharp({ create: { width: 10, height: 10, channels: 3, background: '#000' } }).png().toBuffer())).toBeNull();
    expect(readImageHeader(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull();
    expect(readImageHeader(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
    expect(readImageHeader(new TextEncoder().encode('RIFF0000WEBPVP8 garbage'))).toBeNull();
  });
});

describe('teamPhotoKey', () => {
  it('builds team/<hash>.<ext> and rejects anything else', () => {
    expect(teamPhotoKey('a1b2c3d4e5f60718', 'webp')).toBe('team/a1b2c3d4e5f60718.webp');
    expect(() => teamPhotoKey('../x', 'webp')).toThrow(RangeError);
    expect(() => teamPhotoKey('a1b2c3d4e5f60718', 'svg' as never)).toThrow(RangeError);
  });
});

describe('team data', () => {
  it('creates members at the end of their group and lists them in page order', async () => {
    const { db } = testDb();
    await createMember(db, { ...base, groupKey: 'international', nameEn: 'Khalid Gill', nameUr: 'خالد گل', country: 'CA' });
    await createMember(db, { ...base, nameEn: 'A' });
    await createMember(db, { ...base, nameEn: 'B' });
    await createMember(db, { ...base, groupKey: 'executive', nameEn: 'Chief', featured: true });
    const rows = await listMembers(db);
    expect(rows.map((r) => [r.groupKey, r.nameEn, r.sortOrder])).toEqual([
      ['executive', 'Chief', 1],
      ['reporting', 'A', 1],
      ['reporting', 'B', 2],
      ['international', 'Khalid Gill', 1],
    ]);
    expect(rows.find((r) => r.nameEn === 'Khalid Gill')?.country).toBe('ca');
  });

  it('updates fields and photo; empty optional fields become null; one featured member only', async () => {
    const { db } = testDb();
    const a = await createMember(db, { ...base, featured: true });
    const b = await createMember(db, { ...base, nameEn: 'Other' }, photo);
    await updateMember(db, a, { ...base, roleEn: 'Bureau Chief', roleUr: 'بیورو چیف', placeEn: '' }, photo);
    await updateMember(db, b, { ...base, nameEn: 'Other', featured: true }, null);
    const ra = await getMember(db, a);
    const rb = await getMember(db, b);
    expect(ra).toMatchObject({ roleEn: 'Bureau Chief', placeEn: null, photoHash: photo.hash, featured: false });
    expect(rb).toMatchObject({ photoHash: null, featured: true });
  });

  it('reorders within a group, and moving group goes to the end', async () => {
    const { db } = testDb();
    const ids = [];
    for (const n of ['A', 'B', 'C']) ids.push(await createMember(db, { ...base, nameEn: n }));
    expect(await moveMember(db, ids[2]!, 'up')).toBe(true);
    expect((await listMembers(db)).map((r) => r.nameEn)).toEqual(['A', 'C', 'B']);
    expect(await moveMember(db, ids[0]!, 'up')).toBe(false); // already first
    await createMember(db, { ...base, groupKey: 'digital', nameEn: 'D' });
    await updateMember(db, ids[0]!, { ...base, nameEn: 'A', groupKey: 'digital' });
    expect((await listMembers(db)).filter((r) => r.groupKey === 'digital').map((r) => r.nameEn)).toEqual(['D', 'A']);
  });

  it('hides, deletes, and rejects bad input at the boundary', async () => {
    const { db } = testDb();
    const id = await createMember(db, { ...base, hidden: true });
    expect(await listMembers(db)).toEqual([]);
    expect((await listMembers(db, { includeHidden: true })).length).toBe(1);
    expect(await deleteMember(db, id)).toBe(true);
    await expect(createMember(db, { ...base, nameEn: '' })).rejects.toThrow();
    await expect(createMember(db, { ...base, groupKey: 'nope' as never })).rejects.toThrow();
    await expect(createMember(db, { ...base, country: 'BEL' })).rejects.toThrow();
    await expect(createMember(db, base, { ...photo, hash: '../../etc' })).rejects.toThrow();
    await expect(createMember(db, base, { ...photo, width: 5000 })).rejects.toThrow();
  });
});
