#!/usr/bin/env node
/**
 * Accessibility audit across every built route.
 *
 * Runs axe-core (WCAG 2.0/2.1 A + AA) plus structural checks that axe does not
 * cover: single-h1, landmark presence, image alt text, link accessible names,
 * and keyboard focusability of the primary navigation. Exits non-zero if any
 * route has a serious/critical violation.
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
let failures = 0;
const summary = [];

for (const route of targets) {
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });

    /*
     * Let motion finish before auditing. GSAP sets opacity during reveals, and
     * axe blends a mid-animation colour against the background, which reports
     * a false contrast failure on text that is actually 16:1. Audit the
     * settled state — that is what a visitor reads.
     */
    await page.evaluate(async () => {
      const step = Math.floor(window.innerHeight * 0.8);
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 1200));
    });
    await page.waitForTimeout(600);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const structural = await page.evaluate(() => {
      const issues = [];
      const h1s = [...document.querySelectorAll('h1')].filter((h) => {
        const r = h.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (h1s.length === 0) issues.push('no visible <h1>');
      if (h1s.length > 1) issues.push(`${h1s.length} visible <h1> elements`);
      if (!document.querySelector('main')) issues.push('no <main> landmark');
      if (!document.querySelector('header')) issues.push('no <header> landmark');
      if (!document.querySelector('footer')) issues.push('no <footer> landmark');
      if (document.documentElement.lang !== 'en-US') issues.push('html lang not en-US');

      const noAlt = [...document.querySelectorAll('img')]
        .filter((i) => i.getBoundingClientRect().width > 0 && !i.hasAttribute('alt'))
        .length;
      if (noAlt) issues.push(`${noAlt} <img> without alt attribute`);

      const nameless = [...document.querySelectorAll('a[href]')].filter((a) => {
        const r = a.getBoundingClientRect();
        if (r.width === 0) return false;
        // textContent, not innerText: a dropdown link hidden with
        // `visibility: hidden` has layout but no rendered text, so innerText
        // reads as empty and every dropdown would be reported as nameless.
        const label = (a.textContent || '').trim();
        return !label && !a.getAttribute('aria-label') && !a.querySelector('img[alt]:not([alt=""])');
      }).length;
      if (nameless) issues.push(`${nameless} links without an accessible name`);

      // every nav link must be keyboard reachable
      const unfocusable = [...document.querySelectorAll('.nav__link, .dropdown__link')].filter(
        (a) => a.getBoundingClientRect().width > 0 && a.tabIndex < 0
      ).length;
      if (unfocusable) issues.push(`${unfocusable} nav links not keyboard reachable`);

      return issues;
    });

    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    const minor = results.violations.filter((v) => v.impact === 'minor' || v.impact === 'moderate');

    if (serious.length || structural.length) {
      failures++;
      console.log(`\n✗ ${route}`);
      serious.forEach((v) => {
        console.log(`   [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
        const n = v.nodes[0];
        if (n) console.log(`       ${n.target.join(' ')}`);
      });
      structural.forEach((s) => console.log(`   [structure] ${s}`));
    } else if (minor.length) {
      console.log(`~ ${route}  (${minor.length} minor/moderate: ${minor.map((v) => v.id).join(', ')})`);
    } else {
      console.log(`✓ ${route}`);
    }
    summary.push({ route, serious: serious.length, minor: minor.length, structural: structural.length });
  } catch (e) {
    failures++;
    console.log(`✗ ${route}  ${String(e).slice(0, 100)}`);
  }
  await page.close();
}

await browser.close();

const clean = summary.filter((s) => !s.serious && !s.structural).length;
console.log(`\n${'='.repeat(60)}`);
console.log(`routes audited : ${summary.length}`);
console.log(`clean          : ${clean}`);
console.log(`with findings  : ${summary.length - clean}`);
console.log(failures ? `\nFAIL: ${failures} route(s) with serious/critical/structural issues.` : '\nPASS: no serious or critical issues.');
process.exit(failures ? 1 : 0);
