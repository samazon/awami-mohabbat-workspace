import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/**
 * Drizzle over the D1 binding. Only src/lib/services/* may import this —
 * pages, components, actions and API routes go through the service layer.
 */
export const db = () => drizzle(env.DB, { schema });
export type Db = ReturnType<typeof db>;
