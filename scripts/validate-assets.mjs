#!/usr/bin/env node
/**
 * Asset validation.
 *
 * Complements validate-links.mjs: checks that every local asset referenced by
 * the built site exists AND is non-empty, that the local image map covers the
 * page data, and reports any image still pointing at the source CDN (a runtime
 * dependency this project intends to avoid).
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PROJ = process.cwd();
const DIST = join(PROJ, 'dist');
const PAGEDIR = join(PROJ, 'src/data/pages');

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

/**
 * A sub-path deployment (GitHub Pages serves from /<repo>/) prefixes every
 * generated URL. Strip it so these checks describe the filesystem.
 */
const BASE_PREFIX = (() => {
  const f = join(DIST, 'index.html');
  if (!existsSync(f)) return '';
  const m = readFileSync(f, 'utf8').match(/(?:href|src)="(\/(?!_astro|images|favicon|og-default)[^"/]+)/);
  const b = m?.[1];
  return b && b !== '/' ? b : '';
})();
const stripBase = (p) =>
  BASE_PREFIX && p.startsWith(BASE_PREFIX) ? p.slice(BASE_PREFIX.length) || '/' : p;
const problems = [];

// ---- 1. every referenced local asset exists and is non-empty ---------------
let referenced = 0;
for (const page of readdirSync(DIST, { withFileTypes: true })) {
  if (!page.isFile()) continue;
}
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

for (const file of walk(DIST).filter((f) => f.endsWith('.html'))) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\/[^"]+)"/g)) {
    const ref = m[1].split('#')[0].split('?')[0];
    if (!ref || ref === '/') continue;
    referenced++;
    const target = join(DIST, stripBase(ref).replace(/^\//, ''));
    const isDirPage = existsSync(join(target, 'index.html'));
    if (!existsSync(target) && !isDirPage) {
      problems.push(`missing: ${ref} (referenced by ${file.slice(DIST.length)})`);
    } else {
      const p = isDirPage && !statSync(target).isFile() ? join(target, 'index.html') : target;
      if (statSync(p).size === 0) problems.push(`empty: ${ref}`);
    }
  }
}

// ---- 2. images in the page data -------------------------------------------
const imageMap = existsSync(join(PROJ, 'src/data/image-map.json'))
  ? JSON.parse(readFileSync(join(PROJ, 'src/data/image-map.json'), 'utf8'))
  : {};

let pageImages = 0;
let localImages = 0;
let externalImages = 0;
for (const f of readdirSync(PAGEDIR).filter((x) => x.endsWith('.json'))) {
  const d = JSON.parse(readFileSync(join(PAGEDIR, f), 'utf8'));
  const urls = [
    ...(d.images || []).map((i) => i.src),
    ...(d.sections || []).flatMap((s) => (s.blocks || []).map((b) => b.src)),
    d.ogImage || '',
  ].filter(Boolean);
  for (const u of urls) {
    pageImages++;
    if (u.startsWith('http')) {
      externalImages++;
      if (!imageMap[u]) problems.push(`image not localised: ${u.slice(0, 70)} (in ${f})`);
    } else {
      localImages++;
      if (!existsSync(join(PROJ, 'public', u.replace(/^\//, '')))) {
        problems.push(`local image missing on disk: ${u} (in ${f})`);
      }
    }
  }
}

console.log(`assets referenced in built HTML : ${referenced}`);
console.log(`image refs in page data        : ${pageImages}`);
console.log(`  localised to /images/        : ${localImages}`);
console.log(`  still on the source CDN      : ${externalImages}`);
console.log(`files in public/images/        : ${existsSync(join(PROJ, 'public/images')) ? readdirSync(join(PROJ, 'public/images')).length : 0}`);

if (problems.length) {
  const uniq = [...new Set(problems)];
  console.log(`\nPROBLEMS (${uniq.length}):`);
  uniq.slice(0, 40).forEach((p) => console.log(`  ${p}`));
  if (uniq.length > 40) console.log(`  ... and ${uniq.length - 40} more`);
  console.error(`\nFAIL: ${uniq.length} asset problem(s).`);
  process.exit(1);
}
console.log('\nPASS: every referenced asset exists and is non-empty.');
