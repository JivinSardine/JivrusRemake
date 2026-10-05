#!/usr/bin/env node
/**
 * Link + asset validation.
 *
 * Crawls dist/ and checks every internal href, src, and #anchor against the
 * built output. Catches broken routes, dead anchors, and missing assets — the
 * three failure modes that survive a successful build.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const PROJ = process.cwd();
const DIST = join(PROJ, 'dist');

function htmlFiles(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full, `${base}/${entry}`));
    else if (entry === 'index.html') out.push({ file: full, route: base || '/' });
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const pages = htmlFiles(DIST);
const builtRoutes = new Set(pages.map((p) => p.route));
/**
 * The build may be published under a sub-path (GitHub Pages serves it from
 * /<repo>/), in which case every generated URL carries that prefix. Strip it
 * before resolving against dist/, so these validators describe the filesystem
 * rather than the deployment root.
 */
const BASE_PREFIX = (() => {
  const html = join(DIST, 'index.html');
  if (!existsSync(html)) return '';
  const m = readFileSync(html, 'utf8').match(/(?:href|src)="(\/(?!_astro|images|favicon|og-default)[^"/]+)/);
  const p = m?.[1];
  return p && p !== '/' ? p : '';
})();
const stripBase = (p) =>
  BASE_PREFIX && p.startsWith(BASE_PREFIX) ? p.slice(BASE_PREFIX.length) || '/' : p;
const assetExists = (p) => existsSync(join(DIST, stripBase(p).replace(/^\//, '')));
/**
 * Schemes and protocol-relative URLs that are not ours to resolve. A leading
 * "#" is deliberately NOT here: an in-page anchor is a real reference to an id
 * on this page, and it is checked below. Listing it made `external('#foo')`
 * true, so every anchor was skipped by the `continue` above and the
 * `href.startsWith('#')` branch below it could never run — the broken-anchor
 * check was dead code, and a link to a target that does not exist passed.
 */
const external = (u) => /^(https?:|mailto:|tel:|javascript:)/i.test(u);

/** id="..." values on a page, for anchor checking. */
function idsOf(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
}

const brokenLinks = [];
const brokenAssets = [];
const brokenAnchors = [];
let checkedLinks = 0;
let checkedAssets = 0;

for (const { file, route } of pages) {
  const html = readFileSync(file, 'utf8');
  const ids = idsOf(html);

  for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    const href = m[1];
    if (external(href)) continue;
    checkedLinks++;
    if (href.startsWith('#')) {
      if (href.length > 1 && !ids.has(href.slice(1))) {
        brokenAnchors.push(`${route} -> ${href} (no such id)`);
      }
      continue;
    }
    const [rawPath, hash] = href.split('#');
    const path = stripBase(rawPath);
    if (!path || path === '/') continue;
    let target = path.replace(/\/+$/, '') || '/';
    if (!builtRoutes.has(target)) {
      brokenLinks.push(`${route} -> ${href}`);
    } else if (hash && !idsOf(readFileSync(join(DIST, target, 'index.html'), 'utf8')).has(hash)) {
      brokenAnchors.push(`${route} -> ${href} (no such id on ${target})`);
    }
  }

  for (const m of html.matchAll(/<(?:img|script)\b[^>]*\ssrc="([^"]+)"/g)) {
    const src = m[1];
    if (external(src)) continue;
    checkedAssets++;
    if (!assetExists(src)) brokenAssets.push(`${route} -> ${src}`);
  }

  for (const m of html.matchAll(/<link\b[^>]*\shref="([^"]+)"/g)) {
    const href = m[1];
    if (external(href)) continue;
    checkedAssets++;
    if (!assetExists(href)) brokenAssets.push(`${route} -> ${href}`);
  }
}

console.log(`pages scanned : ${pages.length}`);
console.log(`links checked : ${checkedLinks}`);
console.log(`assets checked: ${checkedAssets}`);

const report = (label, list) => {
  if (!list.length) return;
  console.log(`\n${label} (${list.length}):`);
  [...new Set(list)].slice(0, 60).forEach((l) => console.log(`  ${l}`));
  if (list.length > 60) console.log(`  ... and ${list.length - 60} more`);
};
report('BROKEN INTERNAL LINKS', brokenLinks);
report('BROKEN ASSETS', brokenAssets);
report('BROKEN ANCHORS', brokenAnchors);

const total = brokenLinks.length + brokenAssets.length + brokenAnchors.length;
if (total) {
  console.error(`\nFAIL: ${total} broken reference(s).`);
  process.exit(1);
}
console.log('\nPASS: no broken links, assets, or anchors.');
