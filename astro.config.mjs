import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://hajime-jp.co.jp',
  output: 'static',
  adapter: cloudflare({
    remoteBindings: true,
  }),
  integrations: [
    sitemap({
      filter: (page) =>
        !page.includes('/404') &&
        !page.includes('/contact/thanks'),
    }),
  ],
  build: {
    format: 'directory'
  }
});
