/**
 * Gallery photos until the admin panel exists.
 *
 *   pnpm gallery add <folder | file…> [--dry-run] [--reverse]   upload JPEG/PNG/WebP photos
 *   pnpm gallery list                                 every photo, hidden included
 *   pnpm gallery caption <id> [--ur "…"] [--en "…"] [--clear-ur] [--clear-en]
 *   pnpm gallery hide <id> | show <id>
 *
 *   --remote   write to production D1 + R2 (default: the local state `astro dev` reads)
 *
 * `add` on a folder reads an optional captions.yaml there:
 *
 *   IMG_1234.jpg:
 *     ur: تقریب کا منظر
 *     en: The ceremony
 *
 * A batch appears above earlier batches; within a batch, folder (name) order is
 * kept — or reversed with --reverse (e.g. Facebook downloads, whose numeric names
 * grow over time, so --reverse puts the most recent first). A file already in the gallery is not uploaded again (its captions, if
 * given, are updated). Only resized WebPs are uploaded — never the original,
 * which may carry the phone's GPS location. R2 first, then D1.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { ZodError, z } from 'zod';
import { eq } from 'drizzle-orm';
import { galleryPhotos } from '../src/lib/db/schema';
import { addPhoto, listAllPhotos, setCaption, setHidden } from '../src/lib/gallery/data';
import { galleryPhotoKey } from '../src/lib/media';
import { localDb, remoteCreds, remoteDb, type SeedDb, type Target } from './d1';
import { deriveGalleryPhoto, kb } from './ingest';
import { R2Uploader } from './r2';
import { readWranglerConfig } from './wrangler-config';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE =
  'Usage: pnpm gallery add <folder|file…> [--dry-run] [--reverse] | list | caption <id> [--ur …] [--en …] [--clear-ur] [--clear-en] | hide <id> | show <id>  [--remote]';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    reverse: { type: 'boolean', default: false },
    ur: { type: 'string' },
    en: { type: 'string' },
    'clear-ur': { type: 'boolean', default: false },
    'clear-en': { type: 'boolean', default: false },
  },
});
const target: Target = values.remote ? 'remote' : 'local';

const Captions = z.record(
  z.string(),
  z.object({ ur: z.string().trim().min(1).max(300).optional(), en: z.string().trim().min(1).max(300).optional() }).strict(),
);

async function open(): Promise<{ db: SeedDb; bucket: string }> {
  const { bucket, databaseId } = await readWranglerConfig(ROOT);
  const db = target === 'local' ? localDb(ROOT).db : remoteDb(await remoteCreds(ROOT, databaseId));
  console.log(`Target: ${target === 'local' ? 'LOCAL (.wrangler state)' : 'PRODUCTION (remote D1 + R2)'}`);
  return { db, bucket };
}

/** Folder → its image files (name order) + captions.yaml; files → themselves. */
async function collect(args: string[]): Promise<{ files: string[]; captions: z.infer<typeof Captions> }> {
  const files: string[] = [];
  let captions: z.infer<typeof Captions> = {};
  for (const a of args) {
    const p = resolve(a);
    if ((await stat(p)).isDirectory()) {
      const names = (await readdir(p)).filter((n) => !n.startsWith('.') && IMAGE_EXT.has(extname(n).toLowerCase()));
      names.sort((x, y) => x.localeCompare(y, 'en', { numeric: true }));
      files.push(...names.map((n) => join(p, n)));
      const yamlPath = join(p, 'captions.yaml');
      const yamlText = await readFile(yamlPath, 'utf8').catch(() => null);
      if (yamlText !== null) captions = { ...captions, ...Captions.parse(parseYaml(yamlText) ?? {}) };
    } else {
      if (!IMAGE_EXT.has(extname(p).toLowerCase())) throw new Error(`${basename(p)}: only .jpg, .jpeg, .png and .webp files can be added.`);
      files.push(p);
    }
  }
  if (!files.length) throw new Error('No .jpg, .jpeg, .png or .webp files found.');
  const unknown = Object.keys(captions).filter((k) => !files.some((f) => basename(f) === k));
  if (unknown.length) console.warn(`  ⚠ captions.yaml names files that aren't here: ${unknown.join(', ')}`);
  return { files, captions };
}

async function add(args: string[]) {
  if (!args.length) throw new Error(USAGE);
  const collected = await collect(args);
  const { captions } = collected;
  const files = values.reverse ? [...collected.files].reverse() : collected.files;
  console.log(`\nGallery add  ·  ${files.length} photo(s)  ·  target: ${target}${values['dry-run'] ? '  ·  DRY RUN' : ''}`);

  // Derive everything first, so a bad file stops the batch before anything is written.
  const derived = [];
  for (const file of files) {
    const d = await deriveGalleryPhoto(await readFile(file), basename(file));
    derived.push({ file, name: basename(file), d });
    const sizes = d.variants.map((v) => `${v.variant} ${v.width}w ${kb(v.buffer.byteLength)}`).join(' · ');
    const cap = captions[basename(file)];
    console.log(`  ${basename(file)}  ${d.width}×${d.height}  →  ${sizes}${cap ? '  · caption' : ''}`);
  }
  if (values['dry-run']) return console.log('\nDry run — nothing written.\n');

  const { db, bucket } = await open();
  const r2 = new R2Uploader(ROOT, bucket, target);
  const base = Date.now();
  let added = 0;
  let skipped = 0;
  try {
    for (const [i, { name, d }] of derived.entries()) {
      const [existing] = await db.select({ id: galleryPhotos.id }).from(galleryPhotos).where(eq(galleryPhotos.hash, d.hash)).limit(1);
      if (!existing) {
        for (const v of d.variants) {
          await r2.put({ key: galleryPhotoKey(d.hash, v.variant), contentType: 'image/webp', source: { buffer: v.buffer } });
        }
      }
      const cap = captions[name];
      const res = await addPhoto(
        db,
        { hash: d.hash, width: d.width, height: d.height, captionUr: cap?.ur, captionEn: cap?.en },
        { now: base, sortKey: base - i },
      );
      if (res.created) added++;
      else skipped++;
      console.log(`  ${res.created ? 'added  ' : 'exists '} #${res.id}  ${name}`);
    }
  } finally {
    await r2.close();
  }
  console.log(`\n✓ ${added} added, ${skipped} already in the gallery.\n`);
}

async function list() {
  const { db } = await open();
  const rows = await listAllPhotos(db);
  if (!rows.length) return console.log('  (no photos)');
  for (const r of rows) {
    const cap = [r.captionUr && `ur: ${r.captionUr}`, r.captionEn && `en: ${r.captionEn}`].filter(Boolean).join('  |  ');
    console.log(`  #${r.id}  ${r.width}×${r.height}${r.hidden ? '  (hidden)' : ''}${cap ? `  ${cap}` : ''}`);
  }
}

const idArg = (raw: string | undefined) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(USAGE);
  return id;
};

async function main() {
  const [cmd, ...rest] = positionals;
  if (cmd === 'add') return add(rest);
  if (cmd === 'list') return list();
  if (cmd === 'caption') {
    const id = idArg(rest[0]);
    const { db } = await open();
    const ok = await setCaption(db, id, {
      ur: values['clear-ur'] ? null : values.ur,
      en: values['clear-en'] ? null : values.en,
    });
    return console.log(ok ? `  #${id} caption updated` : `  #${id}: nothing changed (unknown id, or no --ur/--en given)`);
  }
  if (cmd === 'hide' || cmd === 'show') {
    const id = idArg(rest[0]);
    const { db } = await open();
    const ok = await setHidden(db, id, cmd === 'hide');
    return console.log(ok ? `  #${id} ${cmd === 'hide' ? 'hidden' : 'shown'}` : `  #${id}: no such photo`);
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
