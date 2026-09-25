import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/** The R2 bucket and D1 id this project deploys with, read from wrangler.jsonc. */
export async function readWranglerConfig(root: string): Promise<{ bucket: string; databaseId: string }> {
  const raw = await readFile(resolve(root, 'wrangler.jsonc'), 'utf8');
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) as {
    r2_buckets?: { binding: string; bucket_name: string }[];
    d1_databases?: { binding: string; database_id: string }[];
  };
  const bucket = json.r2_buckets?.find((b) => b.binding === 'MEDIA')?.bucket_name;
  const databaseId = json.d1_databases?.find((d) => d.binding === 'DB')?.database_id;
  if (!bucket || !databaseId) throw new Error('wrangler.jsonc is missing the MEDIA bucket or DB database.');
  return { bucket, databaseId };
}
