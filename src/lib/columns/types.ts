import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type * as schema from '../db/schema';

/**
 * Any async Drizzle SQLite database over our schema: D1 in the Worker,
 * sqlite-proxy in the CLI and the tests. The run-result type differs by
 * driver and nothing here reads it, hence `any`.
 */
export type AnyDb = BaseSQLiteDatabase<'async', any, typeof schema>;
