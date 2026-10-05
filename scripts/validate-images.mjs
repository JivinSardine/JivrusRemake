/** Verify every <img> in the built site actually loads. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const inv = JSON.parse(readFileSync('src/data/route-inventory.json', 'utf8'));
const routes = inv.routes.map((r) => r.route);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const targets = only ? routes.filter((r) => only.includes(r)) : routes;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
let totalImgs = 0, broken = 0, pagesWithImgs = 0;
const bad = [];
for (const route of targets) {
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 30000 });
    await p.evaluate(async () => {
      const s = Math.floor(innerHeight * 0.9);
      for (let y = 0; y < document.body.scrollHeight; y += s) { scrollTo(0, y); await new Promise(r => setTimeout(r, 90)); }
      scrollTo(0, 0); await new Promise(r => setTimeout(r, 300));
    });
    const r = await p.evaluate(() => {
      const imgs = [...document.querySelectorAll('img')];
      return {
        n: imgs.length,
        broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
      };
    });
    totalImgs += r.n;
    if (r.n) pagesWithImgs++;
    if (r.broken.length) { broken += r.broken.length; bad.push([route, r.broken.slice(0, 2)]); }
  } catch (e) { bad.push([route, [String(e).slice(0, 60)]]); }
  await p.close();
}
await b.close();
console.log(`routes          : ${targets.length}`);
console.log(`pages with imgs : ${pagesWithImgs}`);
console.log(`img tags total  : ${totalImgs}`);
console.log(`broken images   : ${broken}`);
if (bad.length) { console.log('\nDETAIL:'); bad.slice(0, 10).forEach(([r, u]) => console.log(`  ${r}: ${u.join(', ').slice(0, 110)}`)); }
console.log(broken ? '\nFAIL: broken images present.' : '\nPASS: every image loads.');
process.exit(broken ? 1 : 0);
