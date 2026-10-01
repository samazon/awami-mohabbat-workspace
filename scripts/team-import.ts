/**
 * One-time move of the team from src/content/team.ts (+ src/assets/team/*.webp)
 * into D1 + R2, so the admin panel can edit it.
 *
 *   pnpm team:import [--remote] [--dry-run]
 *
 * Refuses if team_members already has rows (it would duplicate people). Photos
 * are uploaded as they are (already sized) to team/<hash>.webp.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { teamMembers, TEAM_GROUPS, type TeamGroupKey } from '../src/lib/db/schema';
import { teamPhotoKey } from '../src/lib/media';
import { localDb, remoteCreds, remoteDb, type Target } from './d1';
import { contentHash } from './ingest';
import { R2Uploader } from './r2';
import { readWranglerConfig } from './wrangler-config';

const ROOT = resolve(import.meta.dirname, '..');
const { values } = parseArgs({ options: { remote: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false } } });
const target: Target = values.remote ? 'remote' : 'local';

type TeamMember = { name: string; nameUr: string; role?: string; place?: string; country?: string; photo?: string };
type Content = {
  ROLE_UR: Record<string, string>;
  PLACE_UR: Record<string, string>;
  chiefEditor: TeamMember;
  groups: { key: string; members: TeamMember[] }[];
};

/**
 * The content file imports each photo as an Astro image module, which Node
 * can't load. Rewrite those imports to plain file names in a temp copy and
 * import that instead.
 */
async function loadContent(): Promise<Content> {
  const src = await readFile(resolve(ROOT, 'src/content/team.ts'), 'utf8');
  const rewritten = src
    .replace(/^import (\w+) from '@\/assets\/team\/([a-z0-9-]+\.webp)';$/gm, "const $1 = '$2';")
    .replace(/^import type .*$/gm, '')
    .replace(/: ImageMetadata/g, ': string')
    .replace(/Record<Locale, string>/g, 'Record<string, string>');
  const dir = await mkdtemp(join(tmpdir(), 'team-import-'));
  const file = join(dir, 'team.ts');
  await writeFile(file, rewritten);
  try {
    return (await import(pathToFileURL(file).href)) as Content;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const photoFile = (m: TeamMember): string | null => (m.photo ? resolve(ROOT, 'src/assets/team', m.photo) : null);

async function main() {
  const { PLACE_UR, ROLE_UR, chiefEditor, groups } = await loadContent();
  const rows: { m: TeamMember; group: TeamGroupKey; order: number; featured: boolean }[] = [{ m: chiefEditor, group: 'executive', order: 0, featured: true }];
  for (const g of groups) {
    if (!(TEAM_GROUPS as readonly string[]).includes(g.key)) throw new Error(`Unknown group ${g.key}`);
    g.members.forEach((m, i) => rows.push({ m, group: g.key as TeamGroupKey, order: i + 1, featured: false }));
  }
  console.log(`\nTeam import · ${rows.length} members · target: ${target}${values['dry-run'] ? ' · DRY RUN' : ''}`);

  const prepared = [];
  for (const r of rows) {
    const file = photoFile(r.m);
    let photo = null;
    if (file) {
      const buf = await readFile(file);
      const meta = await sharp(buf).metadata();
      if (meta.format !== 'webp' || !meta.width || !meta.height) throw new Error(`${file}: expected a WebP`);
      photo = { buf, hash: contentHash(buf), width: meta.width, height: meta.height };
    }
    prepared.push({ ...r, photo });
  }
  console.log(`  ${prepared.filter((p) => p.photo).length} with photos`);
  if (values['dry-run']) return console.log('\nDry run — nothing written.\n');

  const { bucket, databaseId } = await readWranglerConfig(ROOT);
  const db = target === 'local' ? localDb(ROOT).db : remoteDb(await remoteCreds(ROOT, databaseId));
  const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)` }).from(teamMembers);
  if (Number(n) > 0) throw new Error(`team_members already has ${n} rows; refusing to import twice.`);

  const r2 = new R2Uploader(ROOT, bucket, target);
  try {
    for (const p of prepared) {
      if (p.photo) await r2.put({ key: teamPhotoKey(p.photo.hash, 'webp'), contentType: 'image/webp', source: { buffer: p.photo.buf } });
    }
  } finally {
    await r2.close();
  }
  const now = Date.now();
  for (const p of prepared) {
    await db.insert(teamMembers).values({
      groupKey: p.group,
      sortOrder: p.order,
      featured: p.featured,
      nameEn: p.m.name,
      nameUr: p.m.nameUr,
      roleEn: p.m.role ?? null,
      roleUr: p.m.role ? ROLE_UR[p.m.role] : null,
      placeEn: p.m.place ?? null,
      placeUr: p.m.place ? PLACE_UR[p.m.place] : null,
      country: p.m.country ?? null,
      photoHash: p.photo?.hash ?? null,
      photoExt: p.photo ? 'webp' : null,
      photoWidth: p.photo?.width ?? null,
      photoHeight: p.photo?.height ?? null,
      hidden: false,
      updatedAt: now,
    });
  }
  console.log(`\n✓ ${prepared.length} members imported.\n`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : 'Failed.');
  process.exit(1);
});
