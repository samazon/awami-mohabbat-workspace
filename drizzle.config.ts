import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are generated here (`pnpm db:generate`) and APPLIED by wrangler
 * (`pnpm db:migrate:local` / `:remote`), which reads them from `migrations_dir`
 * in wrangler.jsonc. drizzle-kit never needs D1 credentials.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
});
