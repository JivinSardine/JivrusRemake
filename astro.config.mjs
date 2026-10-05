import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * The build serves two roots, so the base is configurable:
 *
 *   BASE_PATH=/            -> the production host, https://www.jivrus.com/
 *   BASE_PATH=/JivrusRemake -> GitHub Pages, https://<user>.github.io/JivrusRemake/
 *
 * Default is the production host, so a plain `npm run build` is unchanged.
 * The Pages workflow sets BASE_PATH so the same source deploys to the sub-path
 * without every asset reference breaking.
 */
const base = (process.env.BASE_PATH ?? '/').replace(/\/$/, '');

export default defineConfig({
  // `site` is the canonical origin and is used for the sitemap. It stays the
  // real Jivrus host because the reconstruction reproduces that site's URLs.
  site: 'https://www.jivrus.com',
  base: base || '/',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    // One HTML file per discovered route.
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  integrations: [
    sitemap({
      // The live site also answers on /jivrus/<path>; the canonical form is the
      // bare path, so that is what we emit and what pages declare as canonical.
      filter: (page) => !page.includes('/jivrus/'),
    }),
  ],
  vite: {
    build: {
      cssCodeSplit: true,
      assetsInlineLimit: 2048,
    },
  },
});
