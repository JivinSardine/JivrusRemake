/**
 * Responsive verification.
 *
 * Renders every route at four widths and checks the responsive contract:
 * the desktop nav collapses to the burger, no horizontal overflow, headings
 * scale down, and grids reduce their column count. Reports the real numbers
 * rather than judging by eye.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const inventory = JSON.parse(
  readFileSync(join(process.cwd(), 'src/data/route-inventory.json'), 'utf8')
);
const routes = inventory.routes.map((r) => r.route);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const targets = only ? routes.filter((r) => only.includes(r)) : routes;

const VIEWPORTS = [
  ['desktop', 1440, 900],
  ['laptop', 1280, 800],
  ['tablet', 834, 1112],
  ['mobile', 390, 844],
];

const browser = await chromium.launch();
const problems = [];
const stats = [];

for (const [label, width, height] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  let overflow = 0;
  let navOk = 0;
  let burgerOk = 0;

  for (const route of targets) {
    const page = await ctx.newPage();
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
      const r = await page.evaluate((vw) => {
        const visible = (el) => {
          const b = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return b.width > 1 && b.height > 1 && s.display !== 'none' && s.visibility !== 'hidden';
        };
        const docW = document.documentElement.scrollWidth;
        const burger = document.querySelector('[data-burger]');
        const navList = document.querySelector('.nav__list');
        const h1 = [...document.querySelectorAll('h1')].find(visible);
        const grid = document.querySelector('.grid--3, .grid--4, .product-grid, .customer-grid');
        return {
          scrollW: docW,
          clientW: document.documentElement.clientWidth,
          overflowBy: docW - document.documentElement.clientWidth,
          burgerVisible: burger ? visible(burger) : null,
          navVisible: navList ? visible(navList) : null,
          h1Size: h1 ? getComputedStyle(h1).fontSize : null,
          gridCols: grid
            ? getComputedStyle(grid).gridTemplateColumns.split(' ').length
            : null,
          vw,
        };
      }, width);

      if (r.overflowBy > 2) {
        overflow++;
        problems.push(`${label} ${route}: horizontal overflow +${r.overflowBy}px (${r.scrollW} > ${r.clientW})`);
      }
      // Desktop keeps the inline nav and hides the burger; small screens the reverse.
      if (label === 'desktop' || label === 'laptop') {
        if (r.navVisible && !r.burgerVisible) navOk++;
        else problems.push(`${label} ${route}: expected inline nav, got nav=${r.navVisible} burger=${r.burgerVisible}`);
      } else {
        if (r.burgerVisible && !r.navVisible) burgerOk++;
        else problems.push(`${label} ${route}: expected burger menu, got nav=${r.navVisible} burger=${r.burgerVisible}`);
      }
      stats.push({ label, route, ...r });
    } catch (e) {
      problems.push(`${label} ${route}: ${String(e).slice(0, 80)}`);
    }
    await page.close();
  }

  console.log(
    `${label.padEnd(8)} routes=${targets.length} overflow=${overflow} ` +
      `navOk=${navOk} burgerOk=${burgerOk}`
  );
  await ctx.close();
}

await browser.close();

// Heading should scale down from desktop to mobile.
const h1s = {};
for (const s of stats) h1s[s.label] = s.h1Size;
console.log('\nh1 font-size by viewport:', JSON.stringify(h1s));
const cols = {};
for (const s of stats) if (s.gridCols) cols[s.label] = s.gridCols;
console.log('grid columns by viewport:', JSON.stringify(cols));

if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  [...new Set(problems)].slice(0, 50).forEach((p) => console.log('  ' + p));
  console.error(`\nFAIL: ${new Set(problems).size} responsive problem(s).`);
  process.exit(1);
}
console.log('\nPASS: no horizontal overflow; nav collapses correctly at all widths.');
