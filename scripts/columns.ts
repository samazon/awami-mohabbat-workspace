/**
 * Columns content until the admin panel exists.
 *
 *   pnpm columns columnist add --slug iqbal-khokhar --name "اقبال کھوکھر" --column "قلم کا فرض" --banner ./banner.png
 *                              [--name-en "Iqbal Khokhar"] [--column-en "Duty of the Pen"] [--inactive]
 *   pnpm columns column upsert ./columns/maqami-sahafat.md
 *   pnpm columns home set 2 maqami-sahafat
 *   pnpm columns home clear 2
 *   pnpm columns home list
 *
 *   --remote   write to production D1 + R2 (default: the local state `astro dev` reads)
 *
 * R2 first, then D1, so a failure leaves orphaned objects rather than rows
 * pointing at files that don't exist. Remote needs CLOUDFLARE_ACCOUNT_ID and
 * CLOUDFLARE_API_TOKEN in the environment. Nothing is logged but the plan.
 */
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ZodError } from 'zod';
import { ArticleRuleError } from '../src/lib/columns/rules';
import { listHomepageSlots, setHomepageSlot, upsertColumn, upsertColumnist } from '../src/lib/columns/write';
import { columnistBannerKey, contentTypeFor } from '../src/lib/media';
import { parseColumnFile } from './column-file';
import { localDb, remoteCredsFromEnv, remoteDb, type SeedDb, type Target } from './d1';
import { BANNER_MAX_BYTES, deriveBanner, kb } from './ingest';
import { R2Uploader } from './r2';
import { readWranglerConfig } from './wrangler-config';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE = 'Usage: pnpm columns columnist add … | column upsert <file.md> | home set <slot> <slug> | home clear <slot> | home list  [--remote]';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: 'boolean', default: false },
    slug: { type: 'string' },
    name: { type: 'string' },
    'name-en': { type: 'string' },
    column: { type: 'string' },
    'column-en': { type: 'string' },
    banner: { type: 'string' },
    inactive: { type: 'boolean', default: false },
  },
});
const target: Target = values.remote ? 'remote' : 'local';

async function open(): Promise<{ db: SeedDb; bucket: string }> {
  const { bucket, databaseId } = await readWranglerConfig(ROOT);
  const db = target === 'local' ? localDb(ROOT).db : remoteDb(remoteCredsFromEnv(databaseId));
  console.log(`Target: ${target === 'local' ? 'LOCAL (.wrangler state)' : 'PRODUCTION (remote D1 + R2)'}`);
  return { db, bucket };
}

async function addColumnist() {
  const path = values.banner;
  if (!values.slug || !values.name || !values.column || !path) throw new Error('columnist add needs --slug, --name, --column and --banner.');
  const size = (await stat(path)).size;
  if (size > BANNER_MAX_BYTES) throw new Error(`Banner is ${kb(size)}; the limit is 10 MB.`);
  const derived = await deriveBanner(await readFile(path));

  const { db, bucket } = await open();
  const r2 = new R2Uploader(ROOT, bucket, target);
  try {
    const origKey = columnistBannerKey(values.slug, 'orig', derived.hash, derived.origExt);
    await r2.put({ key: origKey, contentType: contentTypeFor(origKey), source: { path } });
    for (const v of derived.variants) {
      const key = columnistBannerKey(values.slug, v.variant, derived.hash);
      await r2.put({ key, contentType: 'image/webp', source: { buffer: v.buffer } });
      console.log(`  R2  ${key}  ${v.width}×${v.height}  ${kb(v.buffer.byteLength)}`);
    }
  } finally {
    await r2.close();
  }
  const id = await upsertColumnist(db, {
    slug: values.slug,
    nameUr: values.name,
    nameEn: values['name-en'],
    columnTitleUr: values.column,
    columnTitleEn: values['column-en'],
    banner: { hash: derived.hash, width: derived.width, height: derived.height },
    active: !values.inactive,
  });
  console.log(`  D1  columnist #${id} ${values.slug}`);
}

async function upsertColumnFile(file: string) {
  const input = parseColumnFile(await readFile(file, 'utf8'));
  const { db } = await open();
  const id = await upsertColumn(db, input);
  console.log(`  D1  column #${id} ${input.slug} (${input.status ?? 'draft'})`);
}

async function home(action: string | undefined, slotArg: string | undefined, slug: string | undefined) {
  const { db } = await open();
  if (action === 'set' || action === 'clear') {
    const slot = Number(slotArg);
    if (action === 'set' && !slug) throw new Error('home set needs a slot and a column slug.');
    await setHomepageSlot(db, slot, action === 'set' ? slug! : null);
  } else if (action !== 'list') {
    throw new Error(USAGE);
  }
  const slots = await listHomepageSlots(db);
  for (const n of [1, 2, 3]) {
    const s = slots.find((x) => x.slot === n);
    console.log(`  slot ${n}: ${s ? `${s.slug}${s.status === 'published' ? '' : '  (draft: hidden on the homepage)'}` : '(empty)'}`);
  }
}

async function main() {
  const [group, action, a, b] = positionals;
  if (group === 'columnist' && action === 'add') return addColumnist();
  if (group === 'column' && action === 'upsert' && a) return upsertColumnFile(a);
  if (group === 'home') return home(action, a, b);
  throw new Error(USAGE);
}

main().catch((err: unknown) => {
  // Messages only: never dump file contents, SQL parameters or credentials.
  // Drizzle's "Failed query: …" message embeds the parameters (the column text), so only its cause is shown.
  if (err instanceof ZodError) console.error(`Invalid input:\n${err.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  else if (err instanceof ArticleRuleError) console.error(err.message);
  else if (err instanceof Error && err.message.startsWith('Failed query')) {
    console.error(`Database rejected the write: ${(err.cause as { message?: string } | undefined)?.message ?? 'unknown error'}`);
  } else if (err instanceof Error) console.error(err.message);
  else console.error('Failed.');
  process.exit(1);
});
