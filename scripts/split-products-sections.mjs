// Split a long flat block run into one section per heading, preserving order.
//
// Why this exists: /products arrives as a SINGLE section of 261 blocks. PageContent
// called layoutFor() on the whole run at once, so one decision - "mostly images,
// use the card grid" - was applied to the entire page. Every section ended up in
// a four-column card grid, which scattered each section across cells and put the
// AppiWorks banner ahead of the Product Suite it belongs under.
//
// The source reads: Product Suite -> AppiWorks banner -> Core Products ->
// Client Platforms -> Marketplaces, each full width, in that order.
//
// Splitting at h2/h3 first lets each section pick its own layout, so the
// Product Suite stays prose, the core product logos stay a tile row, and
// nothing is hoisted out of position.

import { readFileSync, writeFileSync } from 'node:fs';

const PATH = '/home/jivinsardinem/projects/JivrusRemake/src/data/pages/products.json';
const doc = JSON.parse(readFileSync(PATH, 'utf8'));

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4']);
const LEAD_IN = new Set(['strip']);

for (const section of doc.sections) {
  const blocks = section.blocks ?? [];
  if (blocks.length < 40) continue; // only /products is this large

  // Walk the run and open a new section at each heading. A heading becomes the
  // FIRST block of its own section, so its position in the output is its
  // position in the source.
  const out = [];
  let cur = null;
  for (const b of blocks) {
    if (HEADINGS.has(b.tag)) {
      cur = { kind: 'grid', blocks: [b] };
      out.push(cur);
      continue;
    }
    if (!cur) {
      // blocks before the first heading (a hero image, typically)
      cur = { kind: 'grid', blocks: [] };
      out.push(cur);
    }
    cur.blocks.push(b);
  }

  const trimmed = out.filter((s) => s.blocks.length);
  console.log(`one ${blocks.length}-block section -> ${trimmed.length} sections`);
  for (const s of trimmed) {
    const h = s.blocks.find((b) => HEADINGS.has(b.tag));
    const imgs = s.blocks.filter((b) => b.tag === 'img').length;
    const lis = s.blocks.filter((b) => b.tag === 'li').length;
    console.log(
      `   ${String(s.blocks.length).padStart(3)} blocks  imgs=${String(imgs).padStart(2)} li=${String(lis).padStart(2)}  ${(h?.text || '(no heading)').trim().slice(0, 58)}`
    );
  }
  doc.sections = trimmed;
}

writeFileSync(PATH, JSON.stringify(doc, null, 1));
console.log('\nwrote', PATH);