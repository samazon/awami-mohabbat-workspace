import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { articles, joinRequests } from '../src/lib/db/schema';
import { applyMigrations, testDb } from './helpers/db';

const ROOT = resolve(import.meta.dirname, '..');

describe('migrations', () => {
  it('apply cleanly and produce queryable tables', async () => {
    const { db } = testDb();
    expect(await db.select().from(articles)).toEqual([]);
    expect(await db.select().from(joinRequests)).toEqual([]);
  });

  it('0005 refuses to run when articles already exist', () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON'); // D1 always enforces FKs; match it during migration too
    applyMigrations(sqlite, { upTo: '0004_join_requests_email_phone' });

    sqlite
      .prepare(
        'INSERT INTO articles (slug, category, published_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('x', 'report', '2026-09-01', 'published', 0, 0);
    sqlite
      .prepare(
        'INSERT INTO article_translations (article_id, locale, title, author, excerpt, body, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(1, 'ur', 'عنوان', 'مصنف', 'اقتباس', 'متن', 0);

    const apply0005 = () => {
      const sql = readFileSync(join(ROOT, 'drizzle', '0005_columns.sql'), 'utf8');
      for (const stmt of sql.split('--> statement-breakpoint')) if (stmt.trim()) sqlite.exec(stmt);
    };
    expect(apply0005).toThrow(/CHECK constraint failed/);

    const row = sqlite.prepare('SELECT count(*) AS n FROM article_translations').get() as { n: number };
    expect(row.n).toBe(1);
  });
});
