/**
 * Two ways to reach D1 from a Node script, behind Drizzle's sqlite-proxy driver
 * so seed code is ordinary, fully parameterized Drizzle:
 *
 *   local   the miniflare SQLite file that `wrangler d1 migrations apply --local`
 *           creates — the same file `astro dev` reads
 *   remote  the D1 REST API (`/raw`), which takes `{ sql, params }` — no string
 *           building; wrangler is called only to borrow its login (see remoteCreds)
 */
import { execFile } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import * as schema from '../src/lib/db/schema';

export type SeedDb = SqliteRemoteDatabase<typeof schema>;
export type Target = 'local' | 'remote';

const LOCAL_D1_DIR = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const execFileP = promisify(execFile);

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

/**
 * Credentials for the D1 REST API. CLOUDFLARE_API_TOKEN (+ CLOUDFLARE_ACCOUNT_ID)
 * win when set; otherwise borrow the `wrangler login` OAuth session via
 * `wrangler auth token` / `wrangler whoami --json`. Never logged, never written.
 */
export async function remoteCreds(root: string, databaseId: string): Promise<RemoteCreds> {
  if (!/^[0-9a-f-]{36}$/.test(databaseId) || /^0+-0+-0+-0+-0+$/.test(databaseId)) {
    throw new Error('wrangler.jsonc still has the placeholder database_id. Run `wrangler d1 create awami-mohabbat` and paste the real id.');
  }
  const envToken = process.env.CLOUDFLARE_API_TOKEN;
  const envAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (envToken) {
    if (!envAccount) throw new Error('CLOUDFLARE_API_TOKEN is set without CLOUDFLARE_ACCOUNT_ID.');
    return { accountId: envAccount, apiToken: envToken, databaseId };
  }

  const wrangler = join(root, 'node_modules', '.bin', 'wrangler');
  const run = async (args: string[]) => (await execFileP(wrangler, args, { cwd: root, maxBuffer: 1024 * 1024 })).stdout;

  // `auth token` prints a version banner, then the token alone on the last line.
  const tokenLine = (await run(['auth', 'token'])).trim().split('\n').pop()?.trim() ?? '';
  if (!/^[A-Za-z0-9._~+/=-]{20,}$/.test(tokenLine)) {
    throw new Error('Remote seeding needs `wrangler login` (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID).');
  }

  let accountId = envAccount;
  if (!accountId) {
    const who = JSON.parse(await run(['whoami', '--json'])) as { accounts?: { id: string }[] };
    const ids = (who.accounts ?? []).map((a) => a.id);
    if (ids.length !== 1) {
      throw new Error(`The wrangler login sees ${ids.length} accounts; set CLOUDFLARE_ACCOUNT_ID to pick one.`);
    }
    accountId = ids[0]!;
  }
  return { accountId, apiToken: tokenLine, databaseId };
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
