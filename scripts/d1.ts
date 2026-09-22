/**
 * Two ways to reach D1 from a Node script, behind Drizzle's sqlite-proxy driver
 * so seed code is ordinary, fully parameterized Drizzle:
 *
 *   local   the miniflare SQLite file that `wrangler d1 migrations apply --local`
 *           creates — the same file `astro dev` reads
 *   remote  the D1 REST API (`/raw`), which takes `{ sql, params }` — no string
 *           building, no shelling out
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../src/lib/db/schema';

export type SeedDb = SqliteRemoteDatabase<typeof schema>;
export type Target = 'local' | 'remote';

const LOCAL_D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

export function findLocalSqlite(root: string): string {
  const dir = join(root, LOCAL_D1_DIR);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  } catch {
    throw new Error(`No local D1 state at ${dir}. Run \`pnpm db:migrate:local\` first.`);
  }
  if (files.length === 0) throw new Error(`No local D1 database in ${dir}. Run \`pnpm db:migrate:local\` first.`);
  // Newest wins if several exist (e.g. after a database_id change).
  files.sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs);
  return join(dir, files[0]!);
}

export function localDb(root: string): { db: SeedDb; path: string } {
  const path = findLocalSqlite(root);
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON'); // D1 enforces FKs; match it locally

  const db = drizzle(
    async (sql, params, method) => {
      const stmt = sqlite.prepare(sql);
      stmt.setReturnArrays(true);
      const p = params as (string | number | bigint | null | Uint8Array)[];
      if (method === 'run') {
        stmt.run(...p);
        return { rows: [] };
      }
      if (method === 'get') {
        const row = stmt.get(...p) as unknown[] | undefined;
        return { rows: row ?? [] };
      }
      return { rows: stmt.all(...p) as unknown as unknown[][] };
    },
    { schema },
  );
  return { db, path };
}

export interface RemoteCreds {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

/** Reads credentials from the environment. Never logged, never written. */
export function remoteCredsFromEnv(databaseId: string): RemoteCreds {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error('Remote seeding needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the environment.');
  }
  if (!/^[0-9a-f-]{36}$/.test(databaseId) || /^0+-0+-0+-0+-0+$/.test(databaseId)) {
    throw new Error('wrangler.jsonc still has the placeholder database_id. Run `wrangler d1 create awami-mohabbat` and paste the real id.');
  }
  return { accountId, apiToken, databaseId };
}

export function remoteDb(creds: RemoteCreds): SeedDb {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(creds.accountId)}/d1/database/${encodeURIComponent(creds.databaseId)}/raw`;

  return drizzle(
    async (sql, params, method) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${creds.apiToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      });
      const json = (await res.json()) as {
        success: boolean;
        errors?: { code: number; message: string }[];
        result?: { success: boolean; results?: { columns: string[]; rows: unknown[][] } }[];
      };
      if (!res.ok || !json.success) {
        const msg = json.errors?.map((e) => `${e.code}: ${e.message}`).join('; ') ?? `HTTP ${res.status}`;
        throw new Error(`D1 request failed — ${msg}`);
      }
      const rows = json.result?.[0]?.results?.rows ?? [];
      if (method === 'run') return { rows: [] };
      if (method === 'get') return { rows: rows[0] ?? [] };
      return { rows };
    },
    { schema },
  );
}
