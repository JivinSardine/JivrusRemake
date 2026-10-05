#!/usr/bin/env node
/**
 * Verify the deployed Pages site, not the local build.
 *
 * A sub-path deployment can 200 while individual assets 404, so this asserts
 * on what the browser actually fetches: no response >= 400, no broken images,
 * and no root-absolute asset URL that escapes the project path.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LIVE = process.env.LIVE || 'https://jivinsardine.github.io/JivrusRemake';
const PREFIX = new URL(LIVE).pathname.replace(/\/$/, '');
const PROJ = '/home/jivinsardinem/projects/JivrusRemake';
const routes = JSON.parse(readFileSync(join(PROJ, 'src/data/route-inventory.json'), 'utf8')).routes.map(
  (r) => r.route
);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const targets = only ? routes.filter((r) => only.includes(r)) : routes;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

let bad = 0;
let escaped = 0;
let brokenTotal = 0;
let done = 0;

const queue = [...targets];
async function worker() {
  while (queue.length) {
    const route = queue.shift();
    const page = await ctx.newPage();
    const problems = [];
    page.on('response', (r) => {
      if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.url().slice(0, 70)}`);
    });
    page.on('pageerror', (e) => problems.push('JS ' + String(e).slice(0, 70)));
    try {
      await page.goto(LIVE + route, { waitUntil: 'networkidle', timeout: 45000 });
      await page.evaluate(async () => {
        const s = Math.floor(innerHeight * 0.9);
        for (let y = 0; y < document.body.scrollHeight; y += s) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 50));
        }
        scrollTo(0, 0);
        await new Promise((r) => setTimeout(r, 300));
      });
      const r = await page.evaluate((prefix) => {
        const imgs = [...document.querySelectorAll('img')];
        // An asset that points at the domain root instead of the project path.
        const escaped = imgs.filter((i) => {
          const s = i.getAttribute('src') || '';
          return s.startsWith('/') && !s.startsWith(prefix + '/');
        }).length;
        return {
          broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length,
          escaped,
        };
      }, PREFIX);
      brokenTotal += r.broken;
      escaped += r.escaped;
      if (problems.length || r.broken || r.escaped) {
        bad++;
        console.log(
          `✗ ${route.padEnd(50)} broken=${r.broken} escaped=${r.escaped} ${problems.slice(0, 2).join(' | ')}`
        );
      }
    } catch (e) {
      bad++;
      console.log(`✗ ${route.padEnd(50)} ${String(e).slice(0, 60)}`);
    }
    await page.close();
    done++;
    if (done % 20 === 0) console.error(`  ${done}/${targets.length} with problems: ${bad}`);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await browser.close();

console.log(`\nroutes checked  : ${targets.length}`);
console.log(`routes with problems: ${bad}`);
console.log(`broken images   : ${brokenTotal}`);
console.log(`root-escaped assets: ${escaped}`);
console.log(
  bad ? '\nFAIL: the deployed site has problems.' : '\nPASS: the deployed site is clean.'
);
process.exit(bad ? 1 : 0);
