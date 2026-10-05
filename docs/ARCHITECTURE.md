# Architecture

How the Jivrus reconstruction is put together, and why.

---

## 1. The shape of the problem

The source site is a **Google Sites** application. That single fact drives most
of the decisions here:

| Property | Consequence |
|---|---|
| No `sitemap.xml` or `robots.txt` | routes must be discovered by crawling |
| Class names are obfuscated | parsing the served HTML is unreliable; the rendered DOM is the source of truth |
| Same content at `/x` and `/jivrus/x` | paths need normalising or every route is duplicated |
| Images served from a per-load-signed CDN | image URLs must be captured in-browser, never re-fetched |
| Section paths render a landing page with no inbound link | link-following alone under-reports the site |

A conventional static-crawler approach would have found 92 routes and silently
broken every image. Both of those were caught and fixed — see §5.

---

## 2. Layers

```
discover ──▶ extract ──▶ model ──▶ render ──▶ build ──▶ verify
   │            │          │         │         │         │
 routes      DOM +      page JSON  Astro     static    3 validators
 + nav      computed   per route  templates   HTML     + axe audit
```

Each stage writes a durable artefact, so any stage can be re-run without
redoing the ones before it.

### discover
Recursive crawl of internal links, plus mining of Google's embedded navigation
payload for pages no `<a href>` references, plus ancestor probing for section
landing pages. Output: `src/data/route-inventory.json`.

### extract
A headless browser renders each route and walks the **rendered** DOM, reading
computed styles at the same time. Output: one record per route holding the
ordered content blocks (tag, text, href/src, computed size and colour), images,
links, metadata, and theme values.

### model
`build_data.py` turns the raw records into page data: it strips the site-wide
chrome (nav and footer text repeat on every page), drops the page's own title
heading (the layout renders it), demotes extra `h1`s to `h2`, groups blocks into
sections, and assigns anchor slugs to headings. Output:
`src/data/pages/<slug>.json`.

### render
One data-driven route renderer for 92 routes, plus bespoke pages where the
source layout genuinely differs (`/`, `/home`, `/products`).

### build
Astro static build → `dist/`.

### verify
`validate-routes`, `validate-links`, `validate-assets`, and an axe-based
accessibility audit. All four run against `dist/`, so a validator can never pass
against a build that isn't the shipped one.

---

## 3. Why one renderer for most routes

Inspecting the 93 routes, the source uses a small number of page shapes:

- **Continuous content** (the large majority: legal, articles, guides, company,
  support) — a page heading, then prose with `h2`/`h3` subheads, sometimes a
  full-width magenta bar between topics.
- **Card/grid runs** — testimonials, customer logos, partner logos, product tiles.
- **Listing runs** — the internship programme, article indexes.

`PageContent.astro` renders all three. `BlockView.astro` renders one extracted
block and decides the element from the source tag, preserving the source's own
semantics and colours.

Where a page's layout genuinely differs, it gets its own `.astro` file rather
than being forced through the template. Flattening `/products` — a hub with a
marketplace index, a product table, and an anchor index — into the generic
content renderer would have lost its structure, so it is a real page.

**The rule:** shared *presentation*, per-route *content and structure*. Every
route still renders its own copy; nothing is templated into sameness.

---

## 4. Data model

```ts
// src/types.ts
Block   { tag, text, href, src, alt }        // one extracted element
Section { kind, title?, blocks[] }           // a content run, or a title bar
PageData{ route, slug, family, isContainer,
          title, description, h1, ogImage,
          sections[], blocks[], images[], links[] }
```

One file per route under `src/data/pages/`. The file name is the slug
(`/` → `root`, `/legal/gdpr` → `legal__gdpr`), and `[...route]/index.astro`
maps the slug back to a URL path.

This shape means a page's content is diffable, reviewable, and independent of
the templates that render it.

---

## 5. Three real problems and their fixes

**Under-reported route count.** A link-following crawl found 92 routes. The
breadcrumb component builds a link to each section ancestor, and
`/legal/privacy-policy` pointed at `/legal` — which 404'd in the rebuild. It
turned out `/legal` is a real page serving 200; nothing links to it. Probing
every ancestor of every known route found it. 92 → 93.

**Dead footer anchors.** The source footer links to `/products#form-builder` and
six siblings. The current `/products` page had been reorganised and no longer
has those headings, so the links were dead on the source too. Rather than invent
sections, the footer was re-anchored to headings that actually exist on the page
and `BlockView` now emits `id` on `h2`/`h3`/`h4`.

**Every image broken.** The first extraction truncated the long image-URL
tokens, so all 891 image URLs 403'd. Re-reading the DOM fixed the tokens — and
they *still* 403'd, because Google signs each asset URL per page load: a URL
valid at 10:00 is dead at 10:01. No out-of-band download can work. The fix is to
capture the bytes the renderer fetches while the page is open, and rewrite the
page data to the local copy in the same pass. The built site depends on no
third-party host at runtime.

---

## 6. Design tokens

Every value is measured from the live site's computed styles, not chosen:

- `--jivrus-magenta: #D01752` — the brand colour, used for headings and the
  full-width section bars
- `--jivrus-blush: #FAE8EE` — the alternate section background
- `--jivrus-blue: #0B5394`, `--jivrus-ink: #14213D`, `--jivrus-body: #212121`
- Hero gradient sampled from the rendered hero
- Roboto (headings and body) and Comfortaa (brand), as the source loads them
- Type scale: 60px section bars, 34.67/24/17.33px h1/h2/h3, 16px body

`src/styles/global.css` holds the tokens and the primitives (container,
section, strip, button, card, grid, prose, breadcrumbs). Components add only
their own layout.

---

## 7. Motion

`src/scripts/motion.ts` is the only animation entry point.

- Data attributes opt elements in: `data-reveal`, `data-stagger` +
  `data-stagger-item`, `data-hero`, `data-parallax`, `data-progress`.
- transform and opacity only — no layout or paint on the main thread.
- `prefers-reduced-motion: reduce` skips the GSAP layer entirely; a CSS media
  query neutralises CSS transitions as well.
- Elements are visible in CSS by default. JavaScript pulls them back before
  animating, so a failed bundle or a no-JS visitor still sees the full page.
- `ScrollTrigger.refresh()` runs on `load`, because late-loading images change
  section heights and stale trigger positions cause the classic "jumpy scroll".

---

## 8. Verification strategy

Each check is a script that exits non-zero on failure, so the build can be
gated on them:

| Script | Catches |
|---|---|
| `validate-routes.mjs` | a discovered route with no implementation |
| `validate-links.mjs` | broken internal links, missing assets, dead `#anchors` |
| `validate-assets.mjs` | referenced-but-absent or empty files; images still on the CDN |
| `validate-images.mjs` | any `<img>` that does not actually decode in a browser |
| `validate-responsive.mjs` | horizontal overflow; nav failing to collapse at small widths |
| `validate-contrast.mjs` | text below the WCAG AA ratio against its painted backdrop |
| `a11y-audit-fast.mjs` | serious/critical axe rules and structural faults on every route |
| `visual-qa.mjs` | navigation, heading outline and page height drifting from the source |

Two things worth recording, because both initially produced false failures:

- **Contrast must be measured on the settled page.** GSAP sets opacity during
  reveals; axe blended a mid-animation colour against the background and
  reported 4.2:1 on text that is actually 16.1:1. `validate-contrast.mjs`
  scrolls the page, waits for motion to finish, and samples the *painted*
  backdrop from a screenshot — resolving it through `elementsFromPoint`,
  because a header positioned over the hero is a sibling of the gradient rather
  than a descendant, and an ancestor walk would find nothing.
- **Accessible names must be read with `textContent`, not `innerText`.** A
  dropdown hidden with `visibility: hidden` has layout but no rendered text, so
  `innerText` reads as empty and all 23 dropdown links looked nameless. They
  were labelled all along.

`qa:all` runs the deterministic checks. The browser-driven ones
(`validate-images`, `validate-responsive`, `validate-contrast`,
`a11y-audit-fast`, `visual-qa`) need a running preview:

```bash
npm run build
npm run preview &          # serves dist/ on :4321
BASE=http://127.0.0.1:4321 npm run validate:images
BASE=http://127.0.0.1:4321 npm run validate:responsive
BASE=http://127.0.0.1:4321 npm run validate:contrast
BASE=http://127.0.0.1:4321 npm run qa:a11y
BASE=http://127.0.0.1:4321 npm run qa:visual
```

---

## 9. Known limitations

- **Google Sites UI is not reproduced.** The live site is a Sites app; the
  rebuild is a static reproduction of its content, structure, and visual design,
  not an emulation of Google's editor chrome.
- **Some content is inherently dynamic on the source** — a testimonial wall, a
  customer-logo grid, and the partner badges are static in the rebuild. The copy
  and layout are preserved; there is no live feed behind them.
- **No public sitemap exists on the source**, so route discovery cannot be
  cross-checked against an authoritative list. Coverage is established by
  exhausting every discovery method available (crawl, nav payload, ancestor
  probing) and by the routes asserting each other's existence.
- **Forms that post to Google Sites' backend are present as interfaces only.**
  Submitting would require the source site's private endpoints; inventing one
  would be worse than an honest non-submitting form.
