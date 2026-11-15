import { describe, expect, it } from 'vitest';
import { addSpecial, deleteSpecial, listAllSpecials } from '../src/lib/special/data';
import { testDb } from './helpers/db';

describe('deleteSpecial', () => {
  it('removes the row and returns its hash, so the files can be deleted too', async () => {
    const { db } = testDb();
    const { id } = await addSpecial(db, { hash: 'a1b2c3d4e5f60718', width: 2000, height: 3000, titleUr: 'خاص' });
    await addSpecial(db, { hash: 'b1b2c3d4e5f60718', width: 2000, height: 3000, titleUr: 'دوسری', publishedDate: '2017-06-22' });
    expect(await deleteSpecial(db, id)).toBe('a1b2c3d4e5f60718');
    expect((await listAllSpecials(db)).map((s) => s.titleUr)).toEqual(['دوسری']);
    expect(await deleteSpecial(db, id)).toBeNull();
  });
});
