#!/usr/bin/env node
/**
 * Fast axe pass: WCAG rules only, no scroll-and-settle wait.
 *
 * The full a11y-audit.mjs waits for motion to finish on every page, which is
 * correct but slow across 93 long pages. This runs the axe rule set without
 * the settle step, so the structural and rule-based checks still cover every
 * route. Contrast is verified separately by validate-contrast.mjs, which
 * measures the settled painted backdrop rather than a mid-animation sample.
 */
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const inventory = JSON.parse(
  readFileSync(join(process.cwd(), 'src/data/route-inventory.json'), 'utf8')
);
const routes = inventory.routes.map((r) => r.route);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const targets = only ? routes.filter((r) => only.includes(r)) : routes;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const CONCURRENCY = 4;
let failures = 0;
let done = 0;

async function audit(route) {
  const page = await ctx.newPage();
  const rec = { route, serious: 0, minor: 0, structural: [] };
  try {
    await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
    /*
     * `runOnly` can be EITHER a rule list or a tag list, never both, and axe
     * throws `runOnly cannot be both rules and tags`. Chaining withRules() and
     * withTags() therefore failed the analyze() call, the catch below turned
     * that into a recorded "structural" problem, and every route that threw
     * was reported by its error text rather than being audited at all. Colour
     * contrast is switched off with disableRules() instead, which leaves the
     * tag list as the only runOnly constraint.
     */
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast']) // handled by validate-contrast.mjs
      .analyze();
    rec.serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    ).length;
    rec.minor = results.violations.filter(
      (v) => v.impact === 'minor' || v.impact === 'moderate'
    ).length;
    rec.structural = await page.evaluate(() => {
      const out = [];
      const vis = (el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      };
      const h1 = [...document.querySelectorAll('h1')].filter(vis);
      // Several <h1> on one page is valid HTML5 and the source does it too -
      // /products has three ("Products", the AppiWorks banner, "Marketplaces").
      // Only flag a MISSING h1; flagging extra ones would fight the source.
      if (h1.length < 1) out.push('no visible h1');
      if (!document.querySelector('main')) out.push('no main');
      if (!document.querySelector('header')) out.push('no header');
      if (!document.querySelector('footer')) out.push('no footer');
      if (document.documentElement.lang !== 'en-US') out.push('lang not en-US');
      const noAlt = [...document.querySelectorAll('img')].filter(
        (i) => i.getBoundingClientRect().width > 0 && !i.hasAttribute('alt')
      ).length;
      if (noAlt) out.push(`${noAlt} img without alt`);
      const nameless = [...document.querySelectorAll('a[href]')].filter((a) => {
        if (a.getBoundingClientRect().width === 0) return false;
        return !(a.textContent || '').trim() && !a.getAttribute('aria-label') &&
          !a.querySelector('img[alt]:not([alt=""])');
      }).length;
      if (nameless) out.push(`${nameless} links without a name`);
      return out;
    });
  } catch (e) {
    rec.structural.push(String(e).slice(0, 60));
  }
  await page.close();
  return rec;
}

const queue = [...targets];
async function worker() {
  while (queue.length) {
    const route = queue.shift();
    const rec = await audit(route);
    done++;
    if (rec.serious || rec.structural.length) {
      failures++;
      console.log(`✗ ${route}  serious=${rec.serious} structural=${rec.structural.join('; ') || '-'}`);
    }
    if (done % 20 === 0) console.log(`  ${done}/${targets.length}  failures=${failures}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await browser.close();

console.log(`\nroutes audited   : ${targets.length}`);
console.log(`with issues      : ${failures}`);
console.log(failures ? `\nFAIL: ${failures} route(s) with serious or structural issues.` : '\nPASS: no serious axe findings and no structural faults.');
process.exit(failures ? 1 : 0);
