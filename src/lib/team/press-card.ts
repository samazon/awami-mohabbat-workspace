import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { teamMembers, teamPressCards, type TeamMemberRow, type TeamPressCardRow } from '../db/schema';
import type { AnyDb } from '../columns/types';

/**
 * Press-card details for one team member, kept apart from the profile so the
 * public /team queries never touch them. Every write is parsed here; Drizzle
 * parameterises every statement.
 */

/** Optional text: empty input means "none". */
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'not a real date');

export const PressCardInput = z.object({
  cnic: optText(15).pipe(z.string().regex(/^\d{5}-\d{7}-\d$/, 'CNIC must look like 35401-1234567-1').nullable().optional()),
  station: optText(60),
  address: optText(160),
  cardNo: optText(12).pipe(z.string().regex(/^[A-Za-z0-9/-]+$/, 'letters, digits, / and - only').nullable().optional()),
  validUntil: optText(10).pipe(isoDate.nullable().optional()),
});
export type PressCardInput = z.input<typeof PressCardInput>;

/** Suggested card number: paper, year of issue, member serial — AM-2026-024. */
export const suggestCardNo = (memberId: number, year: number) => `AM-${year}-${String(memberId).padStart(3, '0')}`;

/**
 * 12 chars from an alphabet without look-alikes (no 0/o, 1/l/i): ~59 bits,
 * enough that guessing one is hopeless, short enough for a small QR.
 */
const TOKEN_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const VERIFY_TOKEN = /^[a-z0-9]{12}$/;
export function newVerifyToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

export async function getPressCard(db: AnyDb, memberId: number): Promise<TeamPressCardRow | null> {
  const [row] = await db.select().from(teamPressCards).where(eq(teamPressCards.memberId, memberId)).limit(1);
  return row ?? null;
}

/**
 * Create or replace the member's card details. The verify token is minted
 * once and then kept, so a reprinted card scans to the same page. False when
 * there is no such member.
 */
export async function savePressCard(db: AnyDb, memberId: number, input: PressCardInput): Promise<boolean> {
  const v = PressCardInput.parse(input);
  const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, memberId)).limit(1);
  if (!m) return false;
  const row = {
    cnic: v.cnic ?? null,
    station: v.station ?? null,
    address: v.address ?? null,
    cardNo: v.cardNo ?? null,
    validUntil: v.validUntil ?? null,
    updatedAt: Date.now(),
  };
  const token = newVerifyToken();
  await db
    .insert(teamPressCards)
    .values({ memberId, verifyToken: token, ...row })
    // Rows from before tokens existed get one on their next save; others keep theirs.
    .onConflictDoUpdate({ target: teamPressCards.memberId, set: { ...row, verifyToken: sql`coalesce(${teamPressCards.verifyToken}, ${token})` } });
  return true;
}

export interface VerifiedCard {
  member: TeamMemberRow;
  card: TeamPressCardRow;
}

/** The card behind a QR code, or null for an unknown or malformed token. */
export async function getPressCardByToken(db: AnyDb, token: string): Promise<VerifiedCard | null> {
  if (!VERIFY_TOKEN.test(token)) return null;
  const [row] = await db
    .select({ member: teamMembers, card: teamPressCards })
    .from(teamPressCards)
    .innerJoin(teamMembers, eq(teamMembers.id, teamPressCards.memberId))
    .where(eq(teamPressCards.verifyToken, token))
    .limit(1);
  return row ?? null;
}
