/**
 * Ad campaigns until the admin panel has an Ads section.
 *
 *   pnpm ads add <image> --slot home-hero-side --client "…" --link <url|/path> --alt "…"
 *                [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--same-tab] [--sponsored] [--dry-run]
 *   pnpm ads list
 *   pnpm ads end <id>          stop a campaign now (kept for the record)
 *
 *   --remote   production D1 + R2 (default: local)
 *
 * The image is resized to the slot's display size ×2 (WebP, no metadata). The
 * link must be https:// (or http://) or a path on this site starting with "/";
 * anything else — javascript:, data:, protocol-relative "//" — is refused.
 * Row first (paused), then R2, then the row goes live: a failed upload never
 * leaves a live ad pointing at a missing image.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { desc, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { ZodError, z } from 'zod';
import { adCampaigns, adSlots } from '../src/lib/db/schema';
import { adCreativeKey } from '../src/lib/media';
import { localDb, remoteCreds, remoteDb, type Target } from './d1';
import { contentHash, kb } from './ingest';
import { R2Uploader } from './r2';
import { readWranglerConfig } from './wrangler-config';

const ROOT = resolve(import.meta.dirname, '..');
const USAGE = 'Usage: pnpm ads add <image> --slot <id> --client "…" --link <url|/path> --alt "…" [--from] [--to] [--same-tab] [--sponsored] | list | end <id>  [--remote]';
const MAX_BYTES = 15 * 1024 * 1024;
/** Display width per kind; the creative is stored at twice that for sharp screens. */
const DISPLAY_W: Record<string, number> = { portrait: 300, halfpage: 300, rect: 300, square: 300, leaderboard: 970, banner: 728, mobile: 320 };

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    remote: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    slot: { type: 'string' },
    client: { type: 'string' },
    link: { type: 'string' },
    alt: { type: 'string' },
    from: { type: 'string' },
    to: { type: 'string' },
    'same-tab': { type: 'boolean', default: false },
    sponsored: { type: 'boolean', default: false },
  },
});
const target: Target = values.remote ? 'remote' : 'local';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'not a real date');
export const AdLink = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    if (v.startsWith('/')) return !v.startsWith('//') && !v.includes('\\');
    try {
      const u = new URL(v);
      return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname;
    } catch {
      return false;
    }
  }, 'link must be https://… or a path on this site starting with /');
const Input = z.object({
  slot: z.string().regex(/^[a-z0-9-]{1,40}$/),
  client: z.string().trim().min(1).max(120),
  link: AdLink,
  alt: z.string().trim().min(1).max(200),
  from: isoDate,
  to: isoDate,
});

const today = () => new Date().toISOString().slice(0, 10);
const inAYear = () => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
};

async function open() {
  const { bucket, databaseId } = await readWranglerConfig(ROOT);
  const db = target === 'local' ? localDb(ROOT).db : remoteDb(await remoteCreds(ROOT, databaseId));
  console.log(`Target: ${target === 'local' ? 'LOCAL (.wrangler state)' : 'PRODUCTION (remote D1 + R2)'}`);
  return { db, bucket };
}

async function add(file: string | undefined) {
  if (!file) throw new Error(USAGE);
  const a = Input.parse({
    slot: values.slot,
    client: values.client,
    link: values.link,
    alt: values.alt,
    from: values.from ?? today(),
    to: values.to ?? inAYear(),
  });
  if (a.to < a.from) throw new Error('--to is before --from.');

  const buf = await readFile(resolve(file));
  if (buf.byteLength > MAX_BYTES) throw new Error(`Image is ${kb(buf.byteLength)}; the limit is 15 MB.`);
  let meta;
  try {
    meta = await sharp(buf, { failOn: 'error' }).metadata();
  } catch {
    throw new Error('That file could not be read as an image.');
  }
  if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '')) throw new Error(`Image must be JPEG, PNG or WebP, got ${meta.format ?? 'unknown'}.`);

  const { db, bucket } = await open();
  const [slot] = await db.select().from(adSlots).where(eq(adSlots.slotId, a.slot)).limit(1);
  if (!slot) throw new Error(`No ad slot "${a.slot}".`);
  const width = (DISPLAY_W[slot.kind] ?? 300) * 2;
  const { data, info } = await sharp(buf, { failOn: 'error' })
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  const hash = contentHash(data);
  console.log(`  ${slot.slotId} (${slot.kind})  ${info.width}×${info.height}  ${kb(data.byteLength)}  →  ${a.link}  ·  ${a.from} … ${a.to}`);
  if (values['dry-run']) return console.log('\nDry run — nothing written.\n');

  const [row] = await db
    .insert(adCampaigns)
    .values({
      client: a.client,
      slotId: a.slot,
      type: 'image',
      linkUrl: a.link,
      altText: a.alt,
      startDate: a.from,
      endDate: a.to,
      status: 'paused',
      labelAs: values.sponsored ? 'sponsored' : 'advertisement',
      newTab: !values['same-tab'],
      createdAt: Date.now(),
    })
    .returning({ id: adCampaigns.id });
  const id = row!.id;
  const r2 = new R2Uploader(ROOT, bucket, target);
  try {
    await r2.put({ key: adCreativeKey(id, hash), contentType: 'image/webp', source: { buffer: data } });
  } finally {
    await r2.close();
  }
  // A slot shows one campaign: any other live one in it ends now.
  const others = await db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.slotId, a.slot));
  for (const o of others) if (o.id !== id) await db.update(adCampaigns).set({ status: 'ended' }).where(eq(adCampaigns.id, o.id));
  await db.update(adCampaigns).set({ imageHash: hash, imageWidth: info.width, imageHeight: info.height, status: 'live' }).where(eq(adCampaigns.id, id));
  console.log(`\n✓ Campaign #${id} live in ${a.slot}.\n`);
}

async function list() {
  const { db } = await open();
  const rows = await db.select().from(adCampaigns).orderBy(desc(adCampaigns.id));
  if (!rows.length) return console.log('  (none)');
  for (const r of rows) console.log(`  #${r.id}  ${r.status.padEnd(7)}  ${r.slotId}  ${r.startDate}…${r.endDate}  ${r.client}  →  ${r.linkUrl}`);
}

async function end(raw: string | undefined) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) throw new Error(USAGE);
  const { db } = await open();
  const res = await db.update(adCampaigns).set({ status: 'ended' }).where(eq(adCampaigns.id, id)).returning({ id: adCampaigns.id });
  console.log(res.length ? `  #${id} ended` : `  #${id}: no such campaign`);
}

async function main() {
  const [cmd, a] = positionals;
  if (cmd === 'add') return add(a);
  if (cmd === 'list') return list();
  if (cmd === 'end') return end(a);
  throw new Error(USAGE);
}

main().catch((err: unknown) => {
  if (err instanceof ZodError) console.error(`Invalid input:\n${err.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  else if (err instanceof Error && err.message.startsWith('Failed query')) {
    console.error(`Database rejected the write: ${(err.cause as { message?: string } | undefined)?.message ?? 'unknown error'}`);
  } else if (err instanceof Error) console.error(err.message);
  else console.error('Failed.');
  process.exit(1);
});
