/**
 * Seed one edition (and, once, the static tables) into R2 + D1.
 *
 *   pnpm seed --date 2026-09-16 --pages ./scans/16/p1.jpg ./scans/16/p2.jpg ./scans/16/p3.jpg ./scans/16/p4.jpg \
 *             --pdf ./scans/16/edition.pdf --volume 20 --issue 89 \
 *             --headline-ur "…" --summary-ur "…" --headline-en "…" --summary-en "…"
 *
 *   --target local|remote   default local (the DB `astro dev` reads)
 *   --hijri "3 Rabi al-Thani 1448"   default: computed (Umm al-Qura)
 *   --mt-en                 mark the English text as machine-translated (shows the AI badge)
 *   --utility file.json     prayer times + rates for the day (else the design's demo values, labelled manual)
 *   --static                also (re)seed ad slots, emergency contacts, site config
 *   --dry-run               validate, derive, print the plan; write nothing
 *
 * Order is R2 first, then D1, so a failure mid-way leaves harmless orphaned
 * objects rather than rows that point at files that don't exist. Re-running
 * for the same date replaces that edition (new hashed keys, old rows removed).
 *
 * Remote target needs CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in the
 * environment (e.g. `tsx --env-file=.env scripts/seed.ts …`). Nothing is logged.
 */
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  adSlots,
  editionPages,
  editionTranslations,
  editions,
  emergencyContacts,
  siteConfig,
  utilityContent,
} from '../src/lib/db/schema';
import { hijriFor, isoToDate } from '../src/lib/dates';
import { PAGE_COUNT, assertIsoDate, contentTypeFor, editionPageKey, editionPdfKey } from '../src/lib/media';
import { localDb, remoteCredsFromEnv, remoteDb, type SeedDb, type Target } from './d1';
import { contentHash, derivePage, kb } from './ingest';
import { R2Uploader, type Upload } from './r2';
import { AD_SLOTS, DEMO_UTILITY, EMERGENCY_CONTACTS, SITE_CONFIG, type NewUtility } from './seed-static';

const ROOT = resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// Input validation — every value here came from a human at a terminal
// ---------------------------------------------------------------------------
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'expected HH:MM');
const rate = z.object({
  minor: z.number().int().nonnegative(),
  updatedAt: z.union([z.number().int(), z.iso.datetime()]),
  source: z.enum(['auto', 'manual']).default('manual'),
});
const UtilityFile = z.object({
  prayers: z.object({ fajr: hhmm, zuhr: hhmm, asr: hhmm, maghrib: hhmm, isha: hhmm }),
  prayerSource: z.enum(['auto', 'manual']).default('manual'),
  rates: z.object({ gold: rate, silver: rate, petrol: rate, diesel: rate }),
});

const Args = z.object({
  target: z.enum(['local', 'remote']).default('local'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  pages: z.array(z.string().min(1)).length(PAGE_COUNT, `exactly ${PAGE_COUNT} page images are required (rule 04)`),
  pdf: z.string().min(1).optional(),
  volume: z.coerce.number().int().positive(),
  issue: z.coerce.number().int().positive(),
  hijri: z.string().min(3).max(60).optional(),
  headlineUr: z.string().trim().min(1).max(300),
  summaryUr: z.string().trim().min(1).max(1200),
  headlineEn: z.string().trim().min(1).max(300).optional(),
  summaryEn: z.string().trim().min(1).max(1200).optional(),
  mtEn: z.boolean().default(false),
  utility: z.string().min(1).optional(),
  static: z.boolean().default(false),
  /** Upload the media objects only; leave D1 alone (rows already mirrored another way). */
  r2Only: z.boolean().default(false),
  dryRun: z.boolean().default(false),
});

function readArgs() {
  const { values } = parseArgs({
    options: {
      target: { type: 'string' },
      date: { type: 'string' },
      pages: { type: 'string', multiple: true },
      pdf: { type: 'string' },
      volume: { type: 'string' },
      issue: { type: 'string' },
      hijri: { type: 'string' },
      'headline-ur': { type: 'string' },
      'summary-ur': { type: 'string' },
      'headline-en': { type: 'string' },
      'summary-en': { type: 'string' },
      'mt-en': { type: 'boolean' },
      utility: { type: 'string' },
      static: { type: 'boolean' },
      'r2-only': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
    strict: true,
  });
  const parsed = Args.safeParse({
    target: values.target,
    date: values.date,
    pages: values.pages,
    pdf: values.pdf,
    volume: values.volume,
    issue: values.issue,
    hijri: values.hijri,
    headlineUr: values['headline-ur'],
    summaryUr: values['summary-ur'],
    headlineEn: values['headline-en'],
    summaryEn: values['summary-en'],
    mtEn: values['mt-en'],
    utility: values.utility,
    static: values.static,
    r2Only: values['r2-only'],
    dryRun: values['dry-run'],
  });
  if (!parsed.success) {
    console.error('Invalid arguments:');
    for (const issue of parsed.error.issues) console.error(`  --${issue.path.join('.')}: ${issue.message}`);
    process.exit(2);
  }
  if ((parsed.data.headlineEn == null) !== (parsed.data.summaryEn == null)) {
    console.error('Provide both --headline-en and --summary-en, or neither.');
    process.exit(2);
  }
  return parsed.data;
}

async function readWranglerConfig(): Promise<{ bucket: string; databaseId: string }> {
  const raw = await readFile(resolve(ROOT, 'wrangler.jsonc'), 'utf8');
  const json = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) as {
    r2_buckets?: { binding: string; bucket_name: string }[];
    d1_databases?: { binding: string; database_id: string }[];
  };
  const bucket = json.r2_buckets?.find((b) => b.binding === 'MEDIA')?.bucket_name;
  const databaseId = json.d1_databases?.find((d) => d.binding === 'DB')?.database_id;
  if (!bucket || !databaseId) throw new Error('wrangler.jsonc is missing the MEDIA bucket or DB database.');
  return { bucket, databaseId };
}

function openDb(target: Target, databaseId: string): { db: SeedDb; label: string } {
  if (target === 'local') {
    const { db, path } = localDb(ROOT);
    return { db, label: `local D1 (${basename(path)})` };
  }
  return { db: remoteDb(remoteCredsFromEnv(databaseId)), label: 'remote D1' };
}

async function loadUtility(date: string, file: string | undefined, now: number): Promise<NewUtility> {
  if (!file) return DEMO_UTILITY(date, now);
  const parsed = UtilityFile.parse(JSON.parse(await readFile(resolve(file), 'utf8')));
  const ms = (v: number | string) => (typeof v === 'number' ? v : Date.parse(v));
  const r = parsed.rates;
  return {
    date,
    ...parsed.prayers,
    prayerSource: parsed.prayerSource,
    goldMinor: r.gold.minor, goldUpdatedAt: ms(r.gold.updatedAt), goldSource: r.gold.source,
    silverMinor: r.silver.minor, silverUpdatedAt: ms(r.silver.updatedAt), silverSource: r.silver.source,
    petrolMinor: r.petrol.minor, petrolUpdatedAt: ms(r.petrol.updatedAt), petrolSource: r.petrol.source,
    dieselMinor: r.diesel.minor, dieselUpdatedAt: ms(r.diesel.updatedAt), dieselSource: r.diesel.source,
  };
}

/** `pnpm seed --static-only [--target remote]` — refresh slots, contacts and site config; touch nothing else. */
async function seedStaticOnly() {
  const { values } = parseArgs({
    options: { 'static-only': { type: 'boolean' }, target: { type: 'string' }, 'dry-run': { type: 'boolean' } },
    strict: true,
  });
  const target = z.enum(['local', 'remote']).default('local').parse(values.target);
  const now = Date.now();
  const { databaseId } = await readWranglerConfig();
  console.log(`\nStatic seed  ·  target: ${target}${values['dry-run'] ? '  ·  DRY RUN' : ''}`);
  console.log(`  ${AD_SLOTS.length} ad slots · ${EMERGENCY_CONTACTS.length} contacts · site config (${SITE_CONFIG(now).phones.length} phones)`);
  if (values['dry-run']) return console.log('\nDry run — nothing written.\n');

  const { db, label } = openDb(target, databaseId);
  console.log(`  writing ${label}`);
  for (const s of AD_SLOTS) await db.insert(adSlots).values(s).onConflictDoUpdate({ target: adSlots.slotId, set: s });
  await db.delete(emergencyContacts);
  for (const c of EMERGENCY_CONTACTS) await db.insert(emergencyContacts).values(c);
  const cfg = SITE_CONFIG(now);
  // Keep the live Vol/Issue if an edition has already set them.
  const { currentVolume: _v, currentIssue: _i, ...cfgWithoutIssue } = cfg;
  void _v; void _i;
  await db.insert(siteConfig).values(cfg).onConflictDoUpdate({ target: siteConfig.id, set: cfgWithoutIssue });
  console.log('\n✓ Static tables refreshed.\n');
}

async function main() {
  if (process.argv.includes('--static-only')) return seedStaticOnly();
  const args = readArgs();
  const date = assertIsoDate(args.date);
  const now = Date.now();
  const { bucket, databaseId } = await readWranglerConfig();

  console.log(`\nEdition ${date}  ·  Vol ${args.volume}  Issue ${args.issue}  ·  target: ${args.target}${args.dryRun ? '  ·  DRY RUN' : ''}`);

  // ---- derive ----
  const uploads: Upload[] = [];
  const pageRows: (typeof editionPages.$inferInsert)[] = [];
  let totalDerived = 0;

  for (let i = 0; i < PAGE_COUNT; i++) {
    const n = i + 1;
    const file = resolve(args.pages[i]!);
    const buf = await readFile(file);
    const d = await derivePage(buf, `page ${n} (${basename(file)})`);
    for (const w of d.warnings) console.warn(`  ⚠ ${w}`);

    uploads.push({ key: editionPageKey(date, n, 'orig', d.hash, d.origExt), contentType: contentTypeFor(`.${d.origExt}`), source: { path: file } });
    for (const v of d.variants) {
      uploads.push({ key: editionPageKey(date, n, v.variant, d.hash), contentType: 'image/webp', source: { buffer: v.buffer } });
      totalDerived += v.buffer.byteLength;
    }
    pageRows.push({ editionId: 0, pageNumber: n, hash: d.hash, width: d.width, height: d.height, origBytes: d.origBytes });

    const sizes = d.variants.map((v) => `${v.variant} ${v.width}w ${kb(v.buffer.byteLength)}`).join(' · ');
    console.log(`  page ${n}  ${d.width}×${d.height} ${kb(d.origBytes)}  →  ${sizes}`);
  }

  let pdfHash: string | null = null;
  let pdfBytes: number | null = null;
  if (args.pdf) {
    const file = resolve(args.pdf);
    const buf = await readFile(file);
    if (!buf.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error(`${basename(file)} is not a PDF`);
    pdfHash = contentHash(buf);
    pdfBytes = buf.byteLength;
    uploads.push({ key: editionPdfKey(date, pdfHash), contentType: 'application/pdf', source: { path: file } });
    console.log(`  pdf     ${kb(pdfBytes)}`);
  }
  console.log(`  ${uploads.length} objects → r2://${bucket}  (${kb(totalDerived)} of derivatives)`);

  const hijri = args.hijri ?? hijriFor(date);
  const utility = await loadUtility(date, args.utility, now);
  console.log(`  hijri   ${hijri}${args.hijri ? '' : '  (computed — confirm against the printed masthead)'}`);
  console.log(`  utility ${args.utility ? args.utility : 'design demo values (manual) — replace with --utility'}`);
  console.log(`  text    ur${args.headlineEn ? ` + en${args.mtEn ? ' (machine-translated)' : ''}` : ' only (English falls back to Urdu, labelled)'}`);
  if (args.static) console.log(`  static  ${AD_SLOTS.length} ad slots · ${EMERGENCY_CONTACTS.length} contacts · site config`);

  if (args.dryRun) {
    console.log('\nDry run — nothing written.\n');
    return;
  }

  // ---- R2 first ----
  const r2 = new R2Uploader(ROOT, bucket, args.target);
  try {
    let i = 0;
    for (const u of uploads) {
      i++;
      process.stdout.write(`\r  uploading ${i}/${uploads.length}  ${u.key.padEnd(70)}`);
      await r2.put(u);
    }
    process.stdout.write('\n');
  } finally {
    await r2.close();
  }

  if (args.r2Only) {
    console.log(`\n✓ ${uploads.length} objects uploaded for ${date}; D1 left untouched (--r2-only).\n`);
    return;
  }

  // ---- then D1 ----
  const { db, label } = openDb(args.target, databaseId);
  console.log(`  writing ${label}`);

  if (args.static) {
    for (const s of AD_SLOTS) {
      await db.insert(adSlots).values(s).onConflictDoUpdate({ target: adSlots.slotId, set: s });
    }
    await db.delete(emergencyContacts);
    for (const c of EMERGENCY_CONTACTS) await db.insert(emergencyContacts).values(c);
    const cfg = SITE_CONFIG(now);
    await db.insert(siteConfig).values(cfg).onConflictDoUpdate({ target: siteConfig.id, set: cfg });
  }

  await db.insert(utilityContent).values(utility).onConflictDoUpdate({ target: utilityContent.date, set: utility });

  // Replace any existing edition for this date (cascades to pages + translations).
  await db.delete(editions).where(eq(editions.date, date));
  const [inserted] = await db
    .insert(editions)
    .values({
      date,
      hijriDate: hijri,
      volume: args.volume,
      issue: args.issue,
      pdfHash,
      pdfBytes,
      status: 'published',
      publishedAt: isoToDate(date).getTime(),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: editions.id });
  const editionId = inserted!.id;

  for (const p of pageRows) await db.insert(editionPages).values({ ...p, editionId });

  await db.insert(editionTranslations).values({
    editionId, locale: 'ur', headline: args.headlineUr, summary: args.summaryUr, isMachineTranslated: false, updatedAt: now,
  });
  if (args.headlineEn && args.summaryEn) {
    await db.insert(editionTranslations).values({
      editionId, locale: 'en', headline: args.headlineEn, summary: args.summaryEn, isMachineTranslated: args.mtEn, updatedAt: now,
    });
  }

  // Keep the masthead's Vol/Issue in step with the newest edition.
  await db
    .update(siteConfig)
    .set({ currentVolume: args.volume, currentIssue: args.issue, updatedAt: now })
    .where(eq(siteConfig.id, 1));

  console.log(`\n✓ Edition ${date} published (id ${editionId}).\n`);
}

main().catch((err: unknown) => {
  console.error(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
