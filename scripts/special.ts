/**
 * Special editions (اشاعتِ خاص) until the admin panel exists.
 *
 *   pnpm special add <folder> [--dry-run]     upload every page listed in <folder>/editions.yaml
 *   pnpm special list                          every page, hidden included
 *   pnpm special set <id> [--title "…"] [--title-en "…"] [--date YYYY-MM-DD] [--clear-date] [--clear-title-en]
 *   pnpm special hide <id> | show <id>
 *
 *   --remote   write to production D1 + R2 (default: the local state `astro dev` reads)
 *
 * editions.yaml names each file with its Urdu title and, if printed, its date:
 *
 *   bishop-andrew-francis.jpg:
 *     title: بشپ اینڈریو فرانسس — ایک عہد ساز شخصیت
 *     date: 2017-06-22          # optional
 *     title_en: Bishop Andrew Francis   # optional
 *
 * Every image in the folder must be listed (so nothing goes up untitled). A file
 * already uploaded is not uploaded again; its title and date are updated. Only
 * resized WebPs are uploaded — never the original. R2 first, then D1.
 */
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { parse as parseYaml } from 'yaml';
import { ZodError, z } from 'zod';
import { specialEditions } from '../src/lib/db/schema';
import { addSpecial, listAllSpecials, setSpecialHidden, updateSpecial } from '../src/lib/special/data';
import { specialEditionKey } from '../src/lib/media';
import { localDb, remoteCreds, remoteDb, type SeedDb, type Target } from './d1';
import { deriveSpecialEdition, kb } from './ingest';
import { R2Uploader } from './r2';
import { readWranglerConfig } from './wrangler-config';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE =
  'Usage: pnpm special add <folder> [--dry-run] | list | set <id> [--title …] [--title-en …] [--date YYYY-MM-DD] [--clear-date] [--clear-title-en] | hide <id> | show <id>  [--remote]';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    title: { type: 'string' },
    'title-en': { type: 'string' },
    date: { type: 'string' },
    'clear-date': { type: 'boolean', default: false },
    'clear-title-en': { type: 'boolean', default: false },
  },
});
const target: Target = values.remote ? 'remote' : 'local';

// YAML turns an unquoted 2017-06-22 into a Date; accept both and normalise.
const yamlDate = z.union([z.string(), z.date()]).transform((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v));
const Manifest = z.record(
  z.string(),
  z.object({ title: z.string(), title_en: z.string().optional(), date: yamlDate.optional() }).strict(),
);

async function open(): Promise<{ db: SeedDb; bucket: string }> {
  const { bucket, databaseId } = await readWranglerConfig(ROOT);
  const db = target === 'local' ? localDb(ROOT).db : remoteDb(await remoteCreds(ROOT, databaseId));
  console.log(`Target: ${target === 'local' ? 'LOCAL (.wrangler state)' : 'PRODUCTION (remote D1 + R2)'}`);
  return { db, bucket };
}

async function add(folder: string | undefined) {
  if (!folder) throw new Error(USAGE);
  const dir = resolve(folder);
  const text = await readFile(join(dir, 'editions.yaml'), 'utf8').catch(() => {
    throw new Error(`${join(dir, 'editions.yaml')} not found: list each file with its title (see pnpm special --help in scripts/special.ts).`);
  });
  const manifest = Manifest.parse(parseYaml(text) ?? {});
  const files = (await readdir(dir)).filter((n) => !n.startsWith('.') && IMAGE_EXT.has(extname(n).toLowerCase())).sort();
  const unlisted = files.filter((f) => !(f in manifest));
  if (unlisted.length) throw new Error(`Not in editions.yaml (add a title for each): ${unlisted.join(', ')}`);
  const missing = Object.keys(manifest).filter((k) => !files.includes(k));
  if (missing.length) throw new Error(`editions.yaml lists files that aren't in the folder: ${missing.join(', ')}`);

  console.log(`\nSpecial editions add  ·  ${files.length} page(s)  ·  target: ${target}${values['dry-run'] ? '  ·  DRY RUN' : ''}`);
  // Derive and validate everything first, so one bad file stops the batch before anything is written.
  const derived = [];
  for (const name of files) {
    const d = await deriveSpecialEdition(await readFile(join(dir, name)), name);
    const m = manifest[name]!;
    derived.push({ name, d, m });
    const sizes = d.variants.map((v) => `${v.variant} ${v.width}w ${kb(v.buffer.byteLength)}`).join(' · ');
    console.log(`  ${name}  ${d.width}×${d.height}  ${m.date ?? 'no date'}  →  ${sizes}`);
  }
  if (values['dry-run']) return console.log('\nDry run — nothing written.\n');

  const { db, bucket } = await open();
  const r2 = new R2Uploader(ROOT, bucket, target);
  let added = 0;
  try {
    for (const { name, d, m } of derived) {
      const [existing] = await db.select({ id: specialEditions.id }).from(specialEditions).where(eq(specialEditions.hash, d.hash)).limit(1);
      if (!existing) {
        for (const v of d.variants) {
          await r2.put({ key: specialEditionKey(d.hash, v.variant), contentType: 'image/webp', source: { buffer: v.buffer } });
        }
      }
      const res = await addSpecial(db, {
        hash: d.hash,
        width: d.width,
        height: d.height,
        titleUr: m.title,
        titleEn: m.title_en,
        publishedDate: m.date,
      });
      if (res.created) added++;
      console.log(`  ${res.created ? 'added  ' : 'updated'} #${res.id}  ${name}`);
    }
  } finally {
    await r2.close();
  }
  console.log(`\n✓ ${added} added, ${derived.length - added} updated.\n`);
}

async function list() {
  const { db } = await open();
  const rows = await listAllSpecials(db);
  if (!rows.length) return console.log('  (none)');
  for (const r of rows) {
    console.log(`  #${r.id}  ${r.publishedDate ?? 'no date   '}  ${r.titleUr}${r.titleEn ? `  |  ${r.titleEn}` : ''}${r.hidden ? '  (hidden)' : ''}`);
  }
}

const idArg = (raw: string | undefined) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(USAGE);
  return id;
};

async function main() {
  const [cmd, a] = positionals;
  if (cmd === 'add') return add(a);
  if (cmd === 'list') return list();
  if (cmd === 'set') {
    const id = idArg(a);
    const { db } = await open();
    const ok = await updateSpecial(db, id, {
      titleUr: values.title,
      titleEn: values['clear-title-en'] ? null : values['title-en'],
      publishedDate: values['clear-date'] ? null : values.date,
    });
    return console.log(ok ? `  #${id} updated` : `  #${id}: nothing changed (unknown id, or nothing given)`);
  }
  if (cmd === 'hide' || cmd === 'show') {
    const id = idArg(a);
    const { db } = await open();
    const ok = await setSpecialHidden(db, id, cmd === 'hide');
    return console.log(ok ? `  #${id} ${cmd === 'hide' ? 'hidden' : 'shown'}` : `  #${id}: no such page`);
  }
  throw new Error(USAGE);
}

main().catch((err: unknown) => {
  // Messages only: never dump file contents, SQL parameters or credentials.
  if (err instanceof ZodError) console.error(`Invalid input:\n${err.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  else if (err instanceof Error && err.message.startsWith('Failed query')) {
    console.error(`Database rejected the write: ${(err.cause as { message?: string } | undefined)?.message ?? 'unknown error'}`);
  } else if (err instanceof Error) console.error(err.message);
  else console.error('Failed.');
  process.exit(1);
});
