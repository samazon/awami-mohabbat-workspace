/**
 * Shrink a source image once, before it goes into src/assets.
 *
 *   pnpm optimize-image <input> <name>.webp --width 660
 *
 * The site renders on demand with `imageService: 'compile'`, so <Image> can't
 * resize at request time: /_image passes the original through untouched. Every
 * photo is therefore stored already sized (widest box it's shown in × 2 for
 * high-density screens) and rendered with a plain <img>.
 *
 * Output always lands in src/assets/ (a subfolder is allowed); it never
 * enlarges past the original's width and keeps transparency.
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { z } from 'zod';

const ROOT = resolve(import.meta.dirname, '..');
const ASSETS = resolve(ROOT, 'src', 'assets');
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

const Args = z.object({
  input: z.string().min(1),
  output: z.string().regex(/^[a-z0-9-]+(\/[a-z0-9-]+)*\.webp$/, 'lowercase path under src/assets ending .webp, e.g. team/jane-doe.webp'),
  width: z.coerce.number().int().min(16).max(4000),
  quality: z.coerce.number().int().min(40).max(100).default(82),
});

async function main() {
  const { values, positionals } = parseArgs({
    options: { width: { type: 'string' }, quality: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  });
  const parsed = Args.safeParse({ input: positionals[0], output: positionals[1], width: values.width, quality: values.quality });
  if (!parsed.success || positionals.length !== 2) {
    console.error('Usage: pnpm optimize-image <input> <name>.webp --width <px> [--quality 82]');
    for (const i of parsed.success ? [] : parsed.error.issues) console.error(`  ${i.path.join('.')}: ${i.message}`);
    process.exit(2);
  }
  const { input, output, width, quality } = parsed.data;

  const out = resolve(ASSETS, output);
  // Belt and braces on top of the regex: the resolved path must stay inside src/assets.
  if (!out.startsWith(ASSETS + sep)) throw new Error('Output must be inside src/assets.');

  const src = resolve(input);
  const { size } = await stat(src);
  if (size > MAX_INPUT_BYTES) throw new Error(`Input is ${Math.round(size / 1024 / 1024)} MB; the limit is 25 MB.`);

  const buf = await readFile(src);
  const meta = await sharp(buf).metadata();
  if (!meta.format || !['jpeg', 'png', 'webp'].includes(meta.format)) {
    throw new Error(`Input must be JPEG, PNG or WebP, got ${meta.format ?? 'an unknown format'}.`);
  }

  const webp = await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).webp({ quality, alphaQuality: 90 }).toBuffer();
  const res = await sharp(webp).metadata();
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, webp);
  console.log(`✓ ${relative(ROOT, out)}  ${res.width}×${res.height}  ${Math.round(webp.byteLength / 1024)} KB  (from ${meta.width}×${meta.height}, ${Math.round(size / 1024)} KB)`);
}

main().catch((err: unknown) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
