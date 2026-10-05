/**
 * URL helper for base-path deployments.
 *
 * The site is built once and served from two different roots:
 *   - https://www.jivrus.com/            (base = "/")
 *   - https://<user>.github.io/<repo>/   (base = "/<repo>")
 *
 * Astro's `base` setting handles the assets it generates (CSS, JS, fonts) and
 * the routes it links to, but every href that comes from page data or a
 * component is a plain string. Those are root-absolute, so on a sub-path host
 * they would point at the domain root and 404. `withBase` prefixes them the
 * same way Astro does, so one build works on both.
 *
 * `import.meta.env.BASE_URL` is set by Astro from the `base` config at build
 * time: "/" normally, "/JivrusRemake" on GitHub Pages.
 */

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

/** Prefix a root-relative path with the deployment base. Leaves others alone. */
export function withBase(href: string): string {
  if (!href) return href;
  if (ABSOLUTE.test(href)) return href;
  if (!href.startsWith('/')) return href;
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + href;
}
