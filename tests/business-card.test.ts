import { describe, expect, it } from 'vitest';
import { createMember, deleteMember } from '../src/lib/team/data';
import { getBusinessCard, saveBusinessCard } from '../src/lib/team/business-card';
import { testDb } from './helpers/db';

const base = { groupKey: 'digital' as const, nameEn: 'Sommer Bareen', nameUr: 'سومر برین' };
const card = { mobile: '0304-2198241', phone2: '+92 322 8077033', email: 'news@example.com' };

describe('business cards', () => {
  it('saves, reads back and replaces; empty fields become null', async () => {
    const { db } = testDb();
    const id = await createMember(db, base);
    expect(await getBusinessCard(db, id)).toBeNull();

    expect(await saveBusinessCard(db, id, card)).toBe(true);
    expect(await getBusinessCard(db, id)).toMatchObject(card);

    expect(await saveBusinessCard(db, id, { mobile: '0300 1234567', phone2: ' ', email: '' })).toBe(true);
    expect(await getBusinessCard(db, id)).toMatchObject({ mobile: '0300 1234567', phone2: null, email: null });
  });

  it('rejects malformed phones and emails', async () => {
    const { db } = testDb();
    const id = await createMember(db, base);
    await expect(saveBusinessCard(db, id, { ...card, mobile: '12345' })).rejects.toThrow(/7 to 15 digits/);
    await expect(saveBusinessCard(db, id, { ...card, mobile: '0304<script>' })).rejects.toThrow(/digits, spaces/);
    await expect(saveBusinessCard(db, id, { ...card, email: 'not-an-email' })).rejects.toThrow(/email/);
    expect(await getBusinessCard(db, id)).toBeNull();
  });

  it('refuses an unknown member and goes away with a deleted one', async () => {
    const { db } = testDb();
    expect(await saveBusinessCard(db, 999, card)).toBe(false);
    const id = await createMember(db, base);
    await saveBusinessCard(db, id, card);
    await deleteMember(db, id);
    expect(await getBusinessCard(db, id)).toBeNull();
  });
});
