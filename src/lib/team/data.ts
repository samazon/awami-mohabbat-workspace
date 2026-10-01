import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { TEAM_GROUPS, teamMembers, type TeamGroupKey, type TeamMemberRow } from '../db/schema';
import type { AnyDb } from '../columns/types';

/**
 * Team reads and writes, shared by the public /team page, the admin panel,
 * the import script and the tests. Every write is parsed here; Drizzle
 * parameterises every statement.
 */

export const GROUP_TITLES: Record<TeamGroupKey, { ur: string; en: string }> = {
  executive: { ur: 'ایگزیکٹو بورڈ', en: 'Executive board' },
  advisory: { ur: 'مشاورتی بورڈ', en: 'Advisory board' },
  reporting: { ur: 'رپورٹنگ', en: 'Reporting' },
  digital: { ur: 'آئی ٹی و ڈیجیٹل میڈیا', en: 'IT & Digital Media' },
  international: { ur: 'بین الاقوامی نمائندے', en: 'International representatives' },
};

const text = (max: number) => z.string().trim().min(1).max(max);
/** Optional text: empty input means "none". */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const MemberInput = z.object({
  groupKey: z.enum(TEAM_GROUPS),
  nameEn: text(120),
  nameUr: text(120),
  roleEn: optText(80),
  roleUr: optText(80),
  placeEn: optText(80),
  placeUr: optText(80),
  country: z
    .string()
    .trim()
    .toLowerCase()
    .transform((v) => (v === '' ? null : v))
    .pipe(z.string().regex(/^[a-z]{2}$/, 'two-letter country code, e.g. be').nullable())
    .nullable()
    .optional(),
  featured: z.boolean().default(false),
  hidden: z.boolean().default(false),
});

export const PhotoRef = z.object({
  hash: z.string().regex(/^[a-f0-9]{16,64}$/),
  ext: z.enum(['webp', 'jpg']),
  width: z.number().int().min(100).max(2000),
  height: z.number().int().min(100).max(2500),
});

export type MemberRow = TeamMemberRow;

export async function listMembers(db: AnyDb, { includeHidden = false } = {}): Promise<MemberRow[]> {
  const q = db.select().from(teamMembers);
  const rows = await (includeHidden ? q : q.where(eq(teamMembers.hidden, false))).orderBy(
    asc(teamMembers.groupKey),
    asc(teamMembers.sortOrder),
    asc(teamMembers.id),
  );
  // Groups in page order, not alphabetical.
  return rows.sort((a, b) => TEAM_GROUPS.indexOf(a.groupKey) - TEAM_GROUPS.indexOf(b.groupKey));
}

export async function getMember(db: AnyDb, id: number): Promise<MemberRow | null> {
  const [row] = await db.select().from(teamMembers).where(eq(teamMembers.id, id)).limit(1);
  return row ?? null;
}

const nextOrder = async (db: AnyDb, group: TeamGroupKey) => {
  const [r] = await db
    .select({ max: sql<number | null>`max(${teamMembers.sortOrder})` })
    .from(teamMembers)
    .where(eq(teamMembers.groupKey, group));
  return (r?.max == null ? 0 : Number(r.max)) + 1;
};

/** Only one featured member: setting it on one clears it everywhere else. */
const clearOtherFeatured = (db: AnyDb, keepId: number) =>
  db.update(teamMembers).set({ featured: false }).where(and(eq(teamMembers.featured, true), ne(teamMembers.id, keepId)));

export async function createMember(
  db: AnyDb,
  raw: z.input<typeof MemberInput>,
  photo?: z.input<typeof PhotoRef> | null,
  now = Date.now(),
): Promise<number> {
  const m = MemberInput.parse(raw);
  const p = photo ? PhotoRef.parse(photo) : null;
  const [row] = await db
    .insert(teamMembers)
    .values({
      ...m,
      roleEn: m.roleEn ?? null,
      roleUr: m.roleUr ?? null,
      placeEn: m.placeEn ?? null,
      placeUr: m.placeUr ?? null,
      country: m.country ?? null,
      sortOrder: await nextOrder(db, m.groupKey),
      photoHash: p?.hash ?? null,
      photoExt: p?.ext ?? null,
      photoWidth: p?.width ?? null,
      photoHeight: p?.height ?? null,
      updatedAt: now,
    })
    .returning({ id: teamMembers.id });
  if (m.featured) await clearOtherFeatured(db, row!.id);
  return row!.id;
}

/**
 * Update a member. `photo`: a new photo replaces the old, `null` removes it,
 * `undefined` keeps it. Moving groups puts the member at the end of the new one.
 */
export async function updateMember(
  db: AnyDb,
  id: number,
  raw: z.input<typeof MemberInput>,
  photo?: z.input<typeof PhotoRef> | null,
  now = Date.now(),
): Promise<boolean> {
  const m = MemberInput.parse(raw);
  const current = await getMember(db, id);
  if (!current) return false;
  const photoSet =
    photo === undefined
      ? {}
      : photo === null
        ? { photoHash: null, photoExt: null, photoWidth: null, photoHeight: null }
        : (() => {
            const p = PhotoRef.parse(photo);
            return { photoHash: p.hash, photoExt: p.ext, photoWidth: p.width, photoHeight: p.height };
          })();
  await db
    .update(teamMembers)
    .set({
      ...m,
      roleEn: m.roleEn ?? null,
      roleUr: m.roleUr ?? null,
      placeEn: m.placeEn ?? null,
      placeUr: m.placeUr ?? null,
      country: m.country ?? null,
      ...(m.groupKey !== current.groupKey ? { sortOrder: await nextOrder(db, m.groupKey) } : {}),
      ...photoSet,
      updatedAt: now,
    })
    .where(eq(teamMembers.id, id));
  if (m.featured) await clearOtherFeatured(db, id);
  return true;
}

export async function deleteMember(db: AnyDb, id: number): Promise<boolean> {
  const res = await db.delete(teamMembers).where(eq(teamMembers.id, id)).returning({ id: teamMembers.id });
  return res.length > 0;
}

/** Swap a member with its neighbour in the group. */
export async function moveMember(db: AnyDb, id: number, dir: 'up' | 'down'): Promise<boolean> {
  const m = await getMember(db, id);
  if (!m) return false;
  const siblings = (await listMembers(db, { includeHidden: true })).filter((x) => x.groupKey === m.groupKey);
  const i = siblings.findIndex((x) => x.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  const other = siblings[j];
  if (!other) return false;
  // Re-number the whole group first so ties (equal sort_order) can't block a swap.
  for (const [k, s] of siblings.entries()) {
    const order = k === i ? j + 1 : k === j ? i + 1 : k + 1;
    if (s.sortOrder !== order) await db.update(teamMembers).set({ sortOrder: order }).where(eq(teamMembers.id, s.id));
  }
  return true;
}
