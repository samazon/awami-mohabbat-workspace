// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  // Used for canonical URLs, hreflang alternates and OG tags. Swap for the real
  // domain when DNS is pointed; until then the workers.dev preview is fine.
  site: process.env.SITE_URL ?? 'https://awami-mohabbat.workers.dev',

  output: 'server',
  adapter: cloudflare({
    // Local image imports (the wordmark) are optimised with sharp at build time.
    // At runtime nothing is transformed — page scans come pre-derived from R2.
    imageService: 'compile',
  }),
  integrations: [react()],

  i18n: {
    defaultLocale: 'ur',
    locales: ['ur', 'en'],
    routing: {
      // Urdu is unprefixed (/, /archive); English is /en/...
      prefixDefaultLocale: false,
    },
  },

  env: {
    schema: {
      // Where R2 objects are served from. In dev it's the in-app /media route
      // (reads the R2 binding); in prod it's the R2 custom domain.
      CDN_BASE: envField.string({ context: 'server', access: 'public', default: '/media' }),
    },
  },

  // No sessions on the public site → the adapter provisions no KV namespace.
  session: false,

  // A newspaper homepage is one document; no speculative prefetch traffic on metered connections.
  prefetch: false,

  build: {
    inlineStylesheets: 'always',
  },
});
