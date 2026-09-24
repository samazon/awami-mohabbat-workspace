import { describe, expect, it } from 'vitest';
import { articles, joinRequests } from '../src/lib/db/schema';
import { testDb } from './helpers/db';

describe('migrations', () => {
  it('apply cleanly and produce queryable tables', async () => {
    const { db } = testDb();
    expect(await db.select().from(articles)).toEqual([]);
    expect(await db.select().from(joinRequests)).toEqual([]);
  });
});
