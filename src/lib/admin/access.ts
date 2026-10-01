import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { eq } from 'drizzle-orm';
import { adminUsers } from '../db/schema';
import type { AnyDb } from '../columns/types';

/**
 * Admin authentication: Cloudflare Access signs the visitor in, then this
 * module is the second, independent gate (deny by default, CWE-862):
 *
 *   1. The `Cf-Access-Jwt-Assertion` header must hold a token signed by our
 *      Access team's keys, for our application (aud), not expired.
 *   2. Its email must belong to an active row in admin_users.
 *
 * Anything missing, misconfigured or malformed is refused — never "let through
 * because Access is probably in front". Locally (astro dev only) a stand-in
 * identity replaces step 1; production builds compile that branch away.
 */

export interface AccessConfig {
  /** e.g. "awamimohabbat" for awamimohabbat.cloudflareaccess.com */
  teamDomain: string;
  /** The Access application's Audience (AUD) tag. */
  aud: string;
}

export interface AdminIdentity {
  id: number;
  email: string;
  name: string | null;
}

export type AuthResult = { ok: true; admin: AdminIdentity } | { ok: false; reason: 'not-configured' | 'no-token' | 'bad-token' | 'not-admin' };

const TEAM_DOMAIN = /^[a-z0-9-]{1,63}$/;
const jwksCache = new Map<string, JWTVerifyGetKey>();

const issuerFor = (teamDomain: string) => `https://${teamDomain}.cloudflareaccess.com`;

function jwksFor(teamDomain: string): JWTVerifyGetKey {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    // The host is fixed to Cloudflare's Access domain; only the validated team label varies (CWE-918).
    set = createRemoteJWKSet(new URL(`${issuerFor(teamDomain)}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}

/** Verify an Access token and return its email, lower-cased, or null. */
export async function verifyAccessToken(token: string, cfg: AccessConfig, keys?: JWTVerifyGetKey): Promise<string | null> {
  if (!TEAM_DOMAIN.test(cfg.teamDomain) || !cfg.aud) return null;
  try {
    const { payload } = await jwtVerify(token, keys ?? jwksFor(cfg.teamDomain), {
      issuer: issuerFor(cfg.teamDomain),
      audience: cfg.aud,
      algorithms: ['RS256'],
    });
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    return email.includes('@') ? email : null;
  } catch {
    return null;
  }
}

/** Step 2: the email must be an active admin. Records the visit. */
export async function adminForEmail(db: AnyDb, email: string, now = Date.now()): Promise<AdminIdentity | null> {
  const [row] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase())).limit(1);
  if (!row || !row.active) return null;
  await db.update(adminUsers).set({ lastSeenAt: now }).where(eq(adminUsers.id, row.id));
  return { id: row.id, email: row.email, name: row.name };
}

/** Both steps, for one request. `devEmail` is honoured only by the caller in dev. */
export async function authenticate(
  db: AnyDb,
  headers: Headers,
  cfg: AccessConfig | null,
  opts: { devEmail?: string | null; keys?: JWTVerifyGetKey } = {},
): Promise<AuthResult> {
  let email: string | null;
  if (opts.devEmail) {
    email = opts.devEmail.toLowerCase();
  } else {
    if (!cfg || !cfg.teamDomain || !cfg.aud) return { ok: false, reason: 'not-configured' };
    const token = headers.get('cf-access-jwt-assertion');
    if (!token) return { ok: false, reason: 'no-token' };
    email = await verifyAccessToken(token, cfg, opts.keys);
    if (!email) return { ok: false, reason: 'bad-token' };
  }
  const admin = await adminForEmail(db, email);
  return admin ? { ok: true, admin } : { ok: false, reason: 'not-admin' };
}
