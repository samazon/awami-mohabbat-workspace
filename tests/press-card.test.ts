import { describe, expect, it } from 'vitest';
import { createMember, deleteMember } from '../src/lib/team/data';
import { getPressCard, savePressCard } from '../src/lib/team/press-card';
import { testDb } from './helpers/db';

const base = { groupKey: 'reporting' as const, nameEn: 'Atif Gill', nameUr: 'عاطف گل' };
const card = { cnic: '35401-1234567-1', station: 'Lahore', address: '12 Mall Road, Lahore', cardNo: '004/09', validUntil: '2026-12-31' };

describe('press cards', () => {
  it('saves, reads back and replaces a member’s card; empty fields become null', async () => {
    const { db } = testDb();
    const id = await createMember(db, base);
    expect(await getPressCard(db, id)).toBeNull();

    expect(await savePressCard(db, id, card)).toBe(true);
    expect(await getPressCard(db, id)).toMatchObject(card);

    expect(await savePressCard(db, id, { ...card, cnic: ' ', address: '', validUntil: '2027-06-30' })).toBe(true);
    expect(await getPressCard(db, id)).toMatchObject({ cnic: null, address: null, station: 'Lahore', validUntil: '2027-06-30' });
  });

  it('rejects a malformed CNIC, card number or date', async () => {
    const { db } = testDb();
    const id = await createMember(db, base);
    await expect(savePressCard(db, id, { ...card, cnic: '35401-1234567' })).rejects.toThrow(/CNIC/);
    await expect(savePressCard(db, id, { ...card, cnic: '35401-123456-12' })).rejects.toThrow(/CNIC/);
    await expect(savePressCard(db, id, { ...card, cnic: '35401-1234567-1; drop' })).rejects.toThrow(/too_big|CNIC/);
    await expect(savePressCard(db, id, { ...card, cardNo: '<b>1</b>' })).rejects.toThrow(/letters, digits/);
    await expect(savePressCard(db, id, { ...card, validUntil: '2026-02-30' })).rejects.toThrow(/not a real date/);
    expect(await getPressCard(db, id)).toBeNull();
  });

  it('refuses an unknown member and goes away with a deleted one', async () => {
    const { db } = testDb();
    expect(await savePressCard(db, 999, card)).toBe(false);

    const id = await createMember(db, base);
    await savePressCard(db, id, card);
    await deleteMember(db, id);
    expect(await getPressCard(db, id)).toBeNull();
  });
});
