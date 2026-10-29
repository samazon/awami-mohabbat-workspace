import { describe, expect, it } from 'vitest';
import { createMember, getMember, getProfileBySlug, listProfileSlugs, slugify, updateMember } from '../src/lib/team/data';
import { testDb } from './helpers/db';

const base = { groupKey: 'digital' as const, nameEn: 'Sommer Bareen', nameUr: 'سومر برین' };

describe('slugify', () => {
  it('makes lowercase hyphenated Latin slugs', () => {
    expect(slugify('Sommer Bareen')).toBe('sommer-bareen');
    expect(slugify('  Basharat A. Sami ')).toBe('basharat-a-sami');
    expect(slugify('Zoë Ćelić')).toBe('zoe-celic');
    expect(slugify('سومر برین')).toBe('');
  });
});

describe('team profile pages', () => {
  it('are off by default: no slug, no public profile', async () => {
    const { db } = testDb();
    const id = await createMember(db, base);
    expect((await getMember(db, id))?.slug).toBeNull();
    expect(await listProfileSlugs(db)).toEqual([]);
  });

  it('switching on mints a slug once and keeps it, even after a rename', async () => {
    const { db } = testDb();
    const id = await createMember(db, { ...base, profilePage: true });
    expect((await getMember(db, id))?.slug).toBe('sommer-bareen');
    expect((await getProfileBySlug(db, 'sommer-bareen'))?.id).toBe(id);

    await updateMember(db, id, { ...base, nameEn: 'Sommer B.', profilePage: true });
    expect((await getMember(db, id))?.slug).toBe('sommer-bareen');
  });

  it('a second person with the same name gets name-<id>; a name with no Latin letters gets member-<id>', async () => {
    const { db } = testDb();
    await createMember(db, { ...base, profilePage: true });
    const twin = await createMember(db, { ...base, profilePage: true });
    expect((await getMember(db, twin))?.slug).toBe(`sommer-bareen-${twin}`);
    const urduOnly = await createMember(db, { ...base, nameEn: '—', profilePage: true });
    expect((await getMember(db, urduOnly))?.slug).toBe(`member-${urduOnly}`);
  });

  it('switched off or hidden: the page is gone, the slug kept for later', async () => {
    const { db } = testDb();
    const id = await createMember(db, { ...base, profilePage: true });
    await updateMember(db, id, { ...base, profilePage: false });
    expect(await getProfileBySlug(db, 'sommer-bareen')).toBeNull();
    expect(await listProfileSlugs(db)).toEqual([]);

    await updateMember(db, id, { ...base, profilePage: true, hidden: true });
    expect(await getProfileBySlug(db, 'sommer-bareen')).toBeNull();

    await updateMember(db, id, { ...base, profilePage: true });
    expect((await getProfileBySlug(db, 'sommer-bareen'))?.id).toBe(id);
    expect((await listProfileSlugs(db)).map((p) => p.slug)).toEqual(['sommer-bareen']);
  });

  it('refuses malformed slugs before querying', async () => {
    const { db } = testDb();
    await createMember(db, { ...base, profilePage: true });
    for (const bad of ['Sommer-Bareen', 'sommer--bareen', "x' OR 1=1", '../team', 'a'.repeat(81)]) {
      expect(await getProfileBySlug(db, bad)).toBeNull();
    }
  });
});
