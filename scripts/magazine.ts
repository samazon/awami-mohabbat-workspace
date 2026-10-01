/**
 * Monthly magazine issues until the admin panel exists.
 *
 *   pnpm magazine add <folder> [--dry-run]   upload one issue described by <folder>/issue.yaml
 *   pnpm magazine list                        every issue, hidden included
 *   pnpm magazine hide <YYYY-MM> | show <YYYY-MM>
 *
 *   --remote   write to production D1 + R2 (default: the local state `astro dev` reads)
 *
 * issue.yaml:
 *
 *   month: 2019-12
 *   title: کرسمس و سالِ نو — انٹرنیشنل ایڈیشن
 *   title_en: Christmas and New Year — International Edition   # optional
 *   pdf: full-magazine.pdf                                       # optional, in the folder
 *
 * Pages are every other image in the folder, in name order (page-01.jpg,
 * page-02.jpg … — numbers are compared as numbers). Each becomes thumb, view and
 * zoom WebPs; originals are never uploaded. Re-running a month replaces that
 * issue (new hashed keys, rows rewritten). R2 first, then D1.
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { ZodError, z } from 'zod';
import { listAllIssues, setIssueHidden, upsertIssue } from '../src/lib/magazine/data';
import { MAGAZINE_VARIANTS, magazinePageKey, magazinePdfKey } from '../src/lib/media';
import { localDb, remoteCreds, remoteDb, type SeedDb, type Target } from './d1';
import { contentHash, deriveWebpSet, kb } from './ingest';
import { R2Uploader, type Upload } from './r2';
import { readWranglerConfig } from './wrangler-config';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE = 'Usage: pnpm magazine add <folder> [--dry-run] | list | hide <YYYY-MM> | show <YYYY-MM>  [--remote]';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const PDF_MAX = 60 * 1024 * 1024;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { remote: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false } },
});
const target: Target = values.remote ? 'remote' : 'local';

// YAML reads an unquoted 2019-12 as a string, but be lenient with a Date too.
const yamlMonth = z.union([z.string(), z.date()]).transform((v) => (v instanceof Date ? v.toISOString().slice(0, 7) : v));
const Manifest = z
  .object({ month: yamlMonth, title: z.string(), title_en: z.string().optional(), pdf: z.string().optional() })
  .strict();

async function open(): Promise<{ db: SeedDb; bucket: string }> {
  const { bucket, databaseId } = await readWranglerConfig(ROOT);
  const db = target === 'local' ? localDb(ROOT).db : remoteDb(await remoteCreds(ROOT, databaseId));
  console.log(`Target: ${target === 'local' ? 'LOCAL (.wrangler state)' : 'PRODUCTION (remote D1 + R2)'}`);
  return { db, bucket };
}

async function add(folder: string | undefined) {
  if (!folder) throw new Error(USAGE);
  const dir = resolve(folder);
  const text = await readFile(join(dir, 'issue.yaml'), 'utf8').catch(() => {
    throw new Error(`${join(dir, 'issue.yaml')} not found (month and title are required).`);
  });
  const m = Manifest.parse(parseYaml(text) ?? {});

  // The PDF must sit in the folder itself: a bare file name, nothing outside it.
  let pdf: { path: string; buf: Buffer } | null = null;
  if (m.pdf) {
    if (m.pdf.includes('/') || m.pdf.includes('\\') || m.pdf.startsWith('.')) throw new Error('pdf: give a file name in the issue folder.');
    const path = join(dir, m.pdf);
    if ((await stat(path)).size > PDF_MAX) throw new Error(`${m.pdf} is over 60 MB.`);
    const buf = await readFile(path);
    if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${m.pdf} is not a PDF.`);
    pdf = { path, buf };
  }

  const files = (await readdir(dir))
    .filter((n) => !n.startsWith('.') && IMAGE_EXT.has(extname(n).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  if (!files.length) throw new Error('No page images (.jpg, .png, .webp) in the folder.');

  console.log(`\nMagazine ${m.month}  ·  ${files.length} pages${pdf ? `  ·  PDF ${kb(pdf.buf.byteLength)}` : ''}  ·  target: ${target}${values['dry-run'] ? '  ·  DRY RUN' : ''}`);

  // Derive every page first, so one bad file stops the issue before anything is written.
  const uploads: Upload[] = [];
  const pages: { hash: string; width: number; height: number }[] = [];
  let total = 0;
  for (const [i, name] of files.entries()) {
    const d = await deriveWebpSet(await readFile(join(dir, name)), name, MAGAZINE_VARIANTS);
    for (const v of d.variants) {
      uploads.push({ key: magazinePageKey(m.month, i + 1, v.variant, d.hash), contentType: 'image/webp', source: { buffer: v.buffer } });
      total += v.buffer.byteLength;
    }
    pages.push({ hash: d.hash, width: d.width, height: d.height });
    console.log(`  p${String(i + 1).padStart(2, '0')}  ${name}  ${d.width}×${d.height}  →  ${d.variants.map((v) => `${v.variant} ${kb(v.buffer.byteLength)}`).join(' · ')}`);
  }
  const pdfRef = pdf ? { hash: contentHash(pdf.buf), bytes: pdf.buf.byteLength } : undefined;
  if (pdf && pdfRef) uploads.push({ key: magazinePdfKey(m.month, pdfRef.hash), contentType: 'application/pdf', source: { path: pdf.path } });
  console.log(`  ${uploads.length} objects  (${kb(total)} of page images)`);
  if (values['dry-run']) return console.log('\nDry run — nothing written.\n');

  const { db, bucket } = await open();
  const r2 = new R2Uploader(ROOT, bucket, target);
  try {
    for (const [i, u] of uploads.entries()) {
      process.stdout.write(`\r  uploading ${i + 1}/${uploads.length}`);
      await r2.put(u);
    }
    process.stdout.write('\n');
  } finally {
    await r2.close();
  }
  const res = await upsertIssue(db, { month: m.month, titleUr: m.title, titleEn: m.title_en, pdf: pdfRef, pages });
  console.log(`\n✓ Issue ${m.month} ${res.created ? 'published' : 'replaced'} (${pages.length} pages).\n`);
}

async function list() {
  const { db } = await open();
  const rows = await listAllIssues(db);
  if (!rows.length) return console.log('  (none)');
  for (const r of rows) console.log(`  ${r.month}  ${r.titleUr}${r.pdfHash ? '  · PDF' : ''}${r.hidden ? '  (hidden)' : ''}`);
}

async function main() {
  const [cmd, a] = positionals;
  if (cmd === 'add') return add(a);
  if (cmd === 'list') return list();
  if ((cmd === 'hide' || cmd === 'show') && a && /^\d{4}-\d{2}$/.test(a)) {
    const { db } = await open();
    const ok = await setIssueHidden(db, a, cmd === 'hide');
    return console.log(ok ? `  ${a} ${cmd === 'hide' ? 'hidden' : 'shown'}` : `  ${a}: no such issue`);
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
