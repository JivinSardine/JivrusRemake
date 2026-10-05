#!/usr/bin/env node
/**
 * Route completeness check.
 *
 * Compares the routes discovered on the live site (src/data/route-inventory.json)
 * with what this build actually produces (dist/). Fails loudly if any discovered
 * route is missing — the project is not complete until this passes.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PROJ = process.cwd();
const DIST = join(PROJ, 'dist');
const inventory = JSON.parse(readFileSync(join(PROJ, 'src/data/route-inventory.json'), 'utf8'));

/** Every .html file in dist, normalised back to a route path. */
function builtRoutes(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...builtRoutes(full, `${base}/${entry}`));
    } else if (entry === 'index.html') {
      out.push(base || '/');
    }
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const built = new Set(builtRoutes(DIST));
const discovered = inventory.routes.map((r) => r.route);
const missing = discovered.filter((r) => !built.has(r));
const extra = [...built].filter((r) => r !== '/sitemap-index.xml' && !discovered.includes(r));

console.log(`discovered on source : ${discovered.length}`);
console.log(`built in dist/      : ${built.size}`);
console.log(`missing             : ${missing.length}`);
console.log(`extra (not in crawl): ${extra.length}`);

if (missing.length) {
  console.log('\nMISSING ROUTES:');
  for (const m of missing) console.log(`  ${m}`);
}
if (extra.length) {
  console.log('\nEXTRA ROUTES:');
  for (const e of extra) console.log(`  ${e}`);
}

if (missing.length) {
  console.error(`\nFAIL: ${missing.length} discovered route(s) have no implementation.`);
  process.exit(1);
}
console.log(`\nPASS: all ${discovered.length} discovered routes are implemented.`);
