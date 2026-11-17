// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The live domain has not been confirmed yet. Set SITE_URL in the
// Cloudflare Pages build settings (e.g. https://www.yourdomain.com).
// It drives canonical URLs, Open Graph URLs, the sitemap and robots.txt.
const SITE_URL = process.env.SITE_URL || 'https://example.com';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin') && !page.endsWith('/404'),
    }),
  ],
});
