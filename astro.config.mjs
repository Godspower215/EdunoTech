// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Live domain: edunotech.com.ng (confirmed 2026-11-17). SITE_URL can override it
// Cloudflare Pages build settings (e.g. https://www.yourdomain.com).
// It drives canonical URLs, Open Graph URLs, the sitemap and robots.txt.
const SITE_URL = process.env.SITE_URL || 'https://edunotech.com.ng';

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
