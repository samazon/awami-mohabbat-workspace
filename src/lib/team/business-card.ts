import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { teamBusinessCards, teamMembers, type TeamBusinessCardRow } from '../db/schema';
import type { AnyDb } from '../columns/types';

/**
 * Business-card contacts for one team member, kept apart from the profile so
 * the public /team queries never touch them. Every write is parsed here;
 * Drizzle parameterises every statement.
 */

/** Optional text: empty input means "none". */
const opt = (inner: z.ZodType<string, string>, max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === '' ? null : v))
    .pipe(inner.nullable())
    .nullable()
    .optional();

/** Digits with the usual separators, 7–15 digits in all (local to full E.164). */
const phone = z
  .string()
  .regex(/^\+?[0-9][0-9 -]*[0-9]$/, 'phone: digits, spaces, - and a leading + only')
  .refine((v) => {
    const n = v.replace(/\D/g, '').length;
    return n >= 7 && n <= 15;
  }, 'phone: 7 to 15 digits');

export const BusinessCardInput = z.object({
  mobile: opt(phone, 20),
  phone2: opt(phone, 20),
  email: opt(z.email('email: not a valid address'), 120),
});
export type BusinessCardInput = z.input<typeof BusinessCardInput>;

export async function getBusinessCard(db: AnyDb, memberId: number): Promise<TeamBusinessCardRow | null> {
  const [row] = await db.select().from(teamBusinessCards).where(eq(teamBusinessCards.memberId, memberId)).limit(1);
  return row ?? null;
}

/** Create or replace the member's contacts. False when there is no such member. */
export async function saveBusinessCard(db: AnyDb, memberId: number, input: BusinessCardInput): Promise<boolean> {
  const v = BusinessCardInput.parse(input);
  const [m] = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.id, memberId)).limit(1);
  if (!m) return false;
  const row = { mobile: v.mobile ?? null, phone2: v.phone2 ?? null, email: v.email ?? null, updatedAt: Date.now() };
  await db.insert(teamBusinessCards).values({ memberId, ...row }).onConflictDoUpdate({ target: teamBusinessCards.memberId, set: row });
  return true;
}
