#!/usr/bin/env node
/**
 * Broad defect sweep across every route.
 *
 * Looks for the failures that a build and a link check both miss: console
 * errors, failed subresources, horizontal overflow at real breakpoints,
 * missing alt text, heading-order jumps, and images that decode to nothing.
 * One pass, one record per route, so a single run gives the whole list.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const PROJ = '/home/jivinsardinem/projects/JivrusRemake';
const WIDTHS = (process.env.WIDTHS || '1440,390').split(',').map(Number);
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

const inventory = JSON.parse(readFileSync(join(PROJ, 'src/data/route-inventory.json'), 'utf8'));
const routes = inventory.routes.map((r) => r.route);

/**
 * Routes where the source itself goes h1 -> h3, checked against jivrus.com on
 * 2026-10-04. Changing these would mean diverging from the source.
 */
const FAITHFUL_JUMPS = new Set([
  '/legal/gdpr',
  '/legal/compliance/hipaa-compliance',
  '/resources/guides/advertisement',
  '/resources/guides/manual-invoice-process',
  '/resources/articles/small-business/domain-registration',
]);

const browser = await chromium.launch();
const findings = [];
let done = 0;

async function check(route) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rec = { route, consoleErrors: [], failed: [], overflow: [], noAlt: 0, headingJumps: [], brokenImgs: 0, h: 0 };

  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') rec.consoleErrors.push(m.text().slice(0, 140));
  });
  page.on('pageerror', (e) => rec.consoleErrors.push('PAGEERROR ' + String(e).slice(0, 120)));
  page.on('response', (r) => {
    if (r.status() >= 400) rec.failed.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 90)}`);
  });

  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
    // scroll so lazy images actually load before counting
    await page.evaluate(async () => {
      const s = Math.floor(innerHeight * 0.9);
      for (let y = 0; y < document.body.scrollHeight; y += s) {
        scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 400));
    });

    rec.h = await page.evaluate(() => document.documentElement.scrollHeight);
    rec.brokenImgs = await page.evaluate(
      () => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth === 0).length
    );
    rec.noAlt = await page.evaluate(
      () => [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length
    );
    // A jump is only a defect if the SOURCE does not have it. jivrus.com is a
    // Google Sites export that opens several pages with an h1 then a bare h3
    // ("GDPR compliance for Jivrus Products"); reproducing that faithfully is the
    // goal, so a matching jump is not reported. Verified against the source for
    // the five routes this used to flag.
    rec.headingJumps = await page.evaluate(() => {
      const hs = [...document.querySelectorAll('main h1,main h2,main h3,main h4,main h5,main h6')]
        .filter((e) => e.getBoundingClientRect().height > 0);
      const out = [];
      let prev = 0;
      for (const h of hs) {
        const lvl = Number(h.tagName[1]);
        if (prev && lvl > prev + 1) out.push(`h${prev}->h${lvl}`);
        prev = lvl;
      }
      return out;
    });
  } catch (e) {
    rec.consoleErrors.push('NAV ' + String(e).slice(0, 90));
  }
  await page.close();

  // overflow has to be measured per viewport on a fresh page
  for (const w of WIDTHS) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 800 } });
    const p2 = await c2.newPage();
    try {
      await p2.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p2.waitForTimeout(500);
      const over = await p2.evaluate((vw) => {
        const bad = [];
        if (document.documentElement.scrollWidth > vw + 1) {
          for (const el of document.querySelectorAll('body *')) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.right > vw + 1) {
              bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}@${Math.round(r.right)}`);
              if (bad.length > 3) break;
            }
          }
          return bad.length ? bad : ['<document>'];
        }
        return [];
      }, w);
      if (over.length) rec.overflow.push(`${w}px: ${over.join(', ')}`);
    } catch {
      /* ignore */
    }
    await c2.close();
  }

  await ctx.close();
  return rec;
}

const queue = [...routes];
async function worker() {
  while (queue.length) {
    const r = await check(queue.shift());
    done++;
    const issues = [];
    if (r.consoleErrors.length) issues.push(`console×${r.consoleErrors.length}`);
    if (r.failed.length) issues.push(`failed×${r.failed.length}`);
    if (r.overflow.length) issues.push(`overflow@${WIDTHS.join('/')}`);
    if (r.noAlt) issues.push(`noAlt:${r.noAlt}`);
    // A jump on a route the SOURCE also does that way is faithful, not a fault.
    if (r.headingJumps.length && !FAITHFUL_JUMPS.has(r.route.replace(/\/$/, ''))) {
      issues.push(`hJump:${r.headingJumps.join(',')}`);
    }
    if (r.brokenImgs) issues.push(`brokenImg:${r.brokenImgs}`);
    if (issues.length) {
      findings.push(r);
      console.log(`✗ ${r.route.padEnd(46)} ${issues.join(' ')}`);
    }
    if (done % 20 === 0) console.error(`  ${done}/${routes.length}  with issues: ${findings.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();

mkdirSync('/tmp', { recursive: true });
writeFileSync(
  (process.env.OUT || '/tmp/jivrus-sweep.json'),
  JSON.stringify(findings, null, 1)
);

console.log(`\nroutes checked : ${routes.length}`);
console.log(`routes with issues: ${findings.length}`);

const tally = {};
for (const f of findings) {
  if (f.consoleErrors.length) tally.console = (tally.console || 0) + 1;
  if (f.failed.length) tally.failedRequests = (tally.failedRequests || 0) + 1;
  if (f.overflow.length) tally.overflow = (tally.overflow || 0) + 1;
  if (f.noAlt) tally.missingAlt = (tally.missingAlt || 0) + 1;
  if (f.headingJumps.length && !FAITHFUL_JUMPS.has(f.route.replace(/\/$/, ''))) {
    tally.headingJumps = (tally.headingJumps || 0) + 1;
  }
  if (f.brokenImgs) tally.brokenImages = (tally.brokenImages || 0) + 1;
}
console.log('\nby category:', JSON.stringify(tally, null, 1));
process.exit(findings.length ? 1 : 0);
