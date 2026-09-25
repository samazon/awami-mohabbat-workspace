import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { proxyDb } from '../../scripts/d1';

const ROOT = resolve(import.meta.dirname, '../..');
const journal = JSON.parse(readFileSync(join(ROOT, 'drizzle/meta/_journal.json'), 'utf8')) as {
  entries: { tag: string }[];
};

/**
 * Applies journal entries in order, the same SQL D1 runs. With `upTo`, stops after
 * (and including) the entry whose tag matches — for tests that need the schema as it
 * stood just before a specific migration.
 */
export function applyMigrations(sqlite: DatabaseSync, { upTo }: { upTo?: string } = {}) {
  for (const { tag } of journal.entries) {
    const sql = readFileSync(join(ROOT, 'drizzle', `${tag}.sql`), 'utf8');
    for (const stmt of sql.split('--> statement-breakpoint')) if (stmt.trim()) sqlite.exec(stmt);
    if (tag === upTo) return;
  }
}

/** A fresh in-memory SQLite with every migration applied in journal order: the same SQL D1 runs. */
export function testDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON'); // D1 always enforces FKs; match it during migration too
  applyMigrations(sqlite);
  return { db: proxyDb(sqlite), sqlite };
}

/**
 * Await a query that must fail and return its error text. Drizzle may wrap
 * driver errors ("Failed query: …") with the SQLite message in `cause`, so
 * this checks both.
 */
export async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    const err = e as Error & { cause?: { message?: string } };
    return `${err.message} ${err.cause?.message ?? ''}`;
  }
  throw new Error('expected the query to fail, but it succeeded');
}
