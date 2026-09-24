import { and, eq, gte, sql } from 'drizzle-orm';
import type { Locale } from '@/i18n';
import { db } from '@/lib/db/client';
import { joinRequests } from '@/lib/db/schema';

/** How many submissions one sender may make per window before being refused. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export interface NewJoinRequest {
  name: string;
  address: string;
  profession: string;
  contact: string;
  locale: Locale;
  ipHash: string | null;
}

/**
 * A salted, truncated hash of the sender's IP. We store this instead of the
 * address so a flood can be rate-limited without keeping personal data.
 * `salt` should come from a secret; without one the hash is still not a
 * plaintext IP, but it is guessable — see JOIN_IP_SALT in the deploy notes.
 */
export async function hashIp(ip: string | undefined, salt: string): Promise<string | null> {
  if (!ip) return null;
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** True when this sender has already used up the window's allowance. */
export async function isRateLimited(ipHash: string | null): Promise<boolean> {
  if (!ipHash) return false;
  const since = Date.now() - RATE_WINDOW_MS;
  const [row] = await db()
    .select({ n: sql<number>`count(*)` })
    .from(joinRequests)
    .where(and(eq(joinRequests.ipHash, ipHash), gte(joinRequests.createdAt, since)));
  return Number(row?.n ?? 0) >= RATE_LIMIT;
}

export async function createJoinRequest(input: NewJoinRequest): Promise<number> {
  const [row] = await db()
    .insert(joinRequests)
    .values({ ...input, status: 'new', createdAt: Date.now() })
    .returning({ id: joinRequests.id });
  return row!.id;
}
