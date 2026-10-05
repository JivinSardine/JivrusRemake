/**
 * Definitive contrast check.
 *
 * axe's colour-contrast rule samples the rendered colour, which is unreliable
 * mid-animation (GSAP sets opacity during reveals, so axe blends a transient
 * colour against the background). This measures the *declared* text colour
 * against the *actually painted* backdrop — sampled from a screenshot, which is
 * what makes the gradient hero measurable — so a real failure is distinguishable
 * from a measurement artifact.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';

const BASE = process.env.BASE || 'http://127.0.0.1:4321';
const inventory = JSON.parse(
  readFileSync(join(process.cwd(), 'src/data/route-inventory.json'), 'utf8')
);
const routes = inventory.routes.map((r) => r.route);
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const targets = only ? routes.filter((r) => only.includes(r)) : routes;

const lum = ([r, g, b]) => {
  const c = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const bad = [];
let checked = 0;

for (const route of targets) {
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 40000 });
    const shot = await page.screenshot({ type: 'png' });
    const img = PNG.sync.read(shot);
    const at = (x, y) => {
      const px = Math.max(0, Math.min(img.width - 1, Math.round(x)));
      const py = Math.max(0, Math.min(img.height - 1, Math.round(y)));
      const i = (py * img.width + px) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
    /**
     * Median colour of a small patch. A single pixel can land on a glyph and
     * report the text colour as its own background; the median over a patch
     * reflects the surrounding surface.
     */
    const patch = (x, y) => {
      const rows = [];
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const px = Math.round(x) + dx;
          const py = Math.round(y) + dy;
          if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
          const i = (py * img.width + px) * 4;
          rows.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
        }
      }
      if (!rows.length) return at(x, y);
      const med = (c) => {
        const v = rows.map((r) => r[c]).sort((a, b) => a - b);
        return v[Math.floor(v.length / 2)];
      };
      return [med(0), med(1), med(2)];
    };

    const nodes = await page.evaluate(() => {
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none') continue;
        const fg = s.color.match(/[\d.]+/g);
        if (!fg) return;
        // find the nearest opaque background, and note gradient ancestors
        let gradient = false;
        let bg = null;
        let n = el;
        while (n && n !== document.documentElement) {
          const bi = getComputedStyle(n).backgroundImage;
          if (bi && bi !== 'none' && bi.includes('gradient')) gradient = true;
          if (!bg) {
            const m = getComputedStyle(n).backgroundColor.match(/rgba?\(([^)]+)\)/);
            if (m) {
              const p = m[1].split(',').map(Number);
              if (p.length < 4 || p[3] > 0) bg = p.slice(0, 3);
            }
          }
          n = n.parentElement;
        }
        /*
         * A header positioned over the hero is a SIBLING of the gradient, not
         * a descendant, so the ancestor walk finds nothing and falls through to
         * the white body. Use the real hit-test stack instead: it reports what
         * is actually painted at this point, which is the true backdrop.
         */
        const stack = document.elementsFromPoint(
          r.left + 2,
          r.top + Math.min(4, r.height / 2)
        );
        for (const node of stack) {
          // Skip the element itself and anything inside it.
          if (node === el || el.contains(node)) continue;
          const bi = getComputedStyle(node).backgroundImage;
          if (bi && bi !== 'none' && bi.includes('gradient')) {
            gradient = true;
            break;
          }
          if (bg) continue;
          const m = getComputedStyle(node).backgroundColor.match(/rgba?\(([^)]+)\)/);
          if (m) {
            const p = m[1].split(',').map(Number);
            if (p.length < 4 || p[3] > 0) {
              bg = p.slice(0, 3);
              // Do not break: a gradient may still sit further down the stack.
            }
          }
        }
        const size = parseFloat(s.fontSize);
        const bold = parseInt(s.fontWeight, 10) >= 700;
        const key = el.tagName + '|' + s.color + '|' + s.fontSize + '|' + gradient;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          tag: el.tagName,
          cls: String(el.className).slice(0, 45),
          color: s.color,
          fg: fg.slice(0, 3).map(Number),
          bg: bg || [255, 255, 255],
          gradient,
          // sample inside the box, clear of the glyphs
          sx: r.left + 3,
          sy: r.top + Math.min(4, r.height / 2),
          need: size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5,
          size: s.fontSize,
          text: (el.textContent || '').trim().slice(0, 42),
        });
      }
      return out;
    });

    for (const n of nodes) {
      /*
       * Over a gradient, only the painted pixel is the true backdrop. Average a
       * small patch rather than a single pixel: one sample can land on a glyph
       * and report the text's own colour as its background.
       */
      const bg = n.gradient ? patch(n.sx, n.sy) : n.bg;
      const L1 = lum(n.fg);
      const L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      checked++;
      if (ratio < n.need) {
        bad.push({
          route, tag: n.tag, cls: n.cls, color: n.color,
          bg: `rgb(${bg.map(Math.round).join(',')})`,
          ratio: Number(ratio.toFixed(2)), need: n.need, size: n.size, text: n.text,
        });
      }
    }
  } catch (e) {
    bad.push({ route, error: String(e).slice(0, 70) });
  }
  await page.close();
}

await browser.close();

console.log(`routes scanned          : ${targets.length}`);
console.log(`text nodes measured     : ${checked}`);
console.log(`below WCAG AA threshold : ${bad.length}`);
if (bad.length) {
  console.log(`\nFAILURES (${bad.length}):`);
  bad.forEach((b) => console.log('  ', JSON.stringify(b)));
  console.error('\nFAIL: real contrast failures present.');
  process.exit(1);
}
console.log('\nPASS: every measured text node meets WCAG AA contrast against its painted backdrop.');
