import { ACCESS_AUD, ACCESS_TEAM_DOMAIN, DEV_ADMIN_EMAIL } from 'astro:env/server';
import { db } from '@/lib/db/client';
import { adminAudit } from '@/lib/db/schema';
import { authenticate, type AuthResult } from '@/lib/admin/access';

/** Cloudflare Access + the admin_users check, for one request. */
export function authenticateRequest(headers: Headers): Promise<AuthResult> {
  return authenticate(
    db(),
    headers,
    ACCESS_TEAM_DOMAIN && ACCESS_AUD ? { teamDomain: ACCESS_TEAM_DOMAIN, aud: ACCESS_AUD } : null,
    // Compiled away in production builds: import.meta.env.DEV is a constant false there.
    { devEmail: import.meta.env.DEV ? DEV_ADMIN_EMAIL : null },
  );
}

/** Who did what to which record. Never field values (rule 09). */
export async function audit(adminId: number, action: string, target?: string) {
  await db().insert(adminAudit).values({ adminId, action, target: target ?? null, at: Date.now() });
  console.log(JSON.stringify({ event: 'admin_action', adminId, action, target: target ?? null, outcome: 'ok' }));
}
