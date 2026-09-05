import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://hajime-jp.co.jp',
  output: 'static',
  build: {
    format: 'directory'
  }
});
