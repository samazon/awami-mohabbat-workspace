// @ts-check
import { defineConfig, envField } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

export default defineConfig({
  // Fallback origin only (build-time). At runtime every absolute URL — canonical,
  // hreflang, OG, sitemap — is derived from the request, so the same build
  // serves awamimohabbat.com and the workers.dev preview correctly.
  site: process.env.SITE_URL ?? 'https://awamimohabbat.com',

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
