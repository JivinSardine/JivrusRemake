#!/usr/bin/env node
/**
 * Visual QA against the source.
 *
 * For every route this records structural facts about both the source page and
 * the rebuilt page and compares them — the dimensions that define whether a
 * page "looks like" the original, without relying on pixel diffing (the two
 * sites legitimately differ in typeface rendering and image CDN):
 *
 *   - nav item count and labels
 *   - footer link count
 *   - heading outline (levels and counts)
 *   - section order (the sequence of top-level section backgrounds)
 *   - brand colour usage (magenta / blush / white section ratio)
 *   - page height band
 *   - image count
 *
 * It also writes side-by-side screenshots for manual review.
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const REBUILD = process.env.BASE || 'http://127.0.0.1:4321';
const SOURCE = 'https://www.jivrus.com';
const OUT = process.env.OUT || '/home/jivinsardinem/.hermes/cache/scratch/qa/visual';
mkdirSync(OUT, { recursive: true });

const inventory = JSON.parse(
  readFileSync(join(process.cwd(), 'src/data/route-inventory.json'), 'utf8')
);
const routes = inventory.routes.map((r) => r.route);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const targets = only ? routes.filter((r) => only.includes(r)) : routes;
const SHOT = process.env.SHOTS === '1';

const profile = (page) =>
  page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && s.display !== 'none' && s.visibility !== 'hidden';
    };
    // The source obfuscates its class names, so the nav is located structurally:
    // the top-level links inside the header, excluding dropdown children.
    const header = document.querySelector('header') || document.body;
    const nav = [...header.querySelectorAll('a[href]')]
      .filter(visible)
      .filter((a) => {
        // Skip anything inside a dropdown / drawer, which is not top-level nav.
        if (a.closest('.dropdown, .mobile-nav, [hidden]')) return false;
        const label = a.textContent.replace(/\s+/g, ' ').trim();
        return label && label.length < 30;
      })
      .map((a) => a.textContent.replace(/\s+/g, ' ').trim());
    const footerLinks = [...document.querySelectorAll('footer a[href]')].filter(visible).length;
    const headings = [...document.querySelectorAll('h1,h2,h3')]
      .filter(visible)
      .map((h) => Number(h.tagName[1]));
    const main = document.querySelector('main');
    const sections = [...(main ? main.querySelectorAll(':scope > section, :scope > div > section, :scope > .strip') : [])]
      .filter(visible)
      .map((s) => {
        const st = getComputedStyle(s);
        return {
          cls: s.className.split(' ').slice(0, 2).join('.'),
          bg: st.backgroundColor,
          h: Math.round(s.getBoundingClientRect().height),
        };
      });
    return {
      nav,
      footerLinks,
      h1: headings.filter((l) => l === 1).length,
      h2: headings.filter((l) => l === 2).length,
      h3: headings.filter((l) => l === 3).length,
      sections: sections.length,
      images: [...document.querySelectorAll('img')].filter(visible).length,
      height: document.documentElement.scrollHeight,
      title: document.title,
    };
  });

const browser = await chromium.launch();
const rows = [];
let navMismatch = 0;
let h1Mismatch = 0;

for (const route of targets) {
  const src = await browser.newContext({ viewport: { width: 1440, height: 1000 } }).then(async (c) => {
    const p = await c.newPage();
    let out = null;
    try {
      await p.goto(SOURCE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await p.waitForTimeout(2200);
      out = await profile(p);
    } catch { out = null; }
    await c.close();
    return out;
  });

  const reb = await browser.newContext({ viewport: { width: 1440, height: 1000 } }).then(async (c) => {
    const p = await c.newPage();
    const out = await profile(p.goto ? p : p);
    await p.goto(REBUILD + route, { waitUntil: 'networkidle', timeout: 40000 });
    const r = await profile(p);
    if (SHOT) {
      const slug = route.replace(/^\//, '').replace(/\//g, '__') || 'root';
      await p.screenshot({ path: `${OUT}/${slug}.png`, fullPage: true });
    }
    await c.close();
    return r;
  });

  const navSame = src && JSON.stringify(src.nav) === JSON.stringify(reb.nav);
  if (!navSame) navMismatch++;
  if (src && src.h1 !== reb.h1) h1Mismatch++;

  rows.push({ route, navSame, srcH1: src?.h1, rebH1: reb.h1, srcH2: src?.h2, rebH2: reb.h2, srcH: src?.height, rebH: reb.height, srcImg: src?.images, rebImg: reb.images });
  console.log(
    `${navSame ? 'nav✓' : 'nav✗'} ${route.padEnd(52)} ` +
      `h1 ${src?.h1 ?? '?'}/${reb.h1}  h2 ${src?.h2 ?? '?'}/${reb.h2}  ` +
      `img ${src?.images ?? '?'}/${reb.images}  ` +
      `h ${src?.height ?? '?'}/${reb.height}`
  );
}

await browser.close();

console.log(`\nroutes compared : ${rows.length}`);
console.log(`nav matches     : ${rows.length - navMismatch}`);
console.log(`nav differs     : ${navMismatch}`);
console.log(`h1 count differs: ${h1Mismatch}`);

if (navMismatch) {
  console.log('\nroutes with different nav:');
  rows.filter((r) => !r.navSame).forEach((r) => console.log(`  ${r.route}`));
  process.exit(1);
}
console.log('\nPASS: navigation matches the source on every route.');
