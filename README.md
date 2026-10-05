# JivrusRemake

A faithful, production-ready reconstruction of the public Jivrus Technologies
website ([jivrus.com](https://www.jivrus.com/)), built as a static Astro site
with an added layer of modern motion design.

The goal was reproduction, not redesign: the original theme, palette, typography,
layout, copy, and URL structure are preserved. The only deliberate visual change
is motion.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:4321
```

```bash
npm run build        # static output in dist/
npm run preview      # serve dist/ locally
```

Requires **Node.js 22.12+** — Astro 7 refuses to build on earlier versions.
Developed and tested on Node 26. The project is fully static: `dist/` can be
deployed to any static host or CDN.

### Deploy to GitHub Pages

`.github/workflows/deploy-pages.yml` builds the site and publishes `dist/`,
gated on the route, link, and asset validators. Enable it once:

**Settings → Pages → Source → GitHub Actions**

The site then lives at `https://<user>.github.io/<repo>/`.

---

## What is covered

**93 routes** — every publicly discoverable page on the source site.

| Family | Count | Examples |
|---|---:|---|
| Resources | 40 | articles (AI, Google Workspace, small business, technical), guides, templates, academy, community |
| About | 22 | company, culture, history, team, partners, careers, internship programme |
| Legal | 15 | privacy, terms, GDPR, compliance (HIPAA/BAA/partner/student), security policies |
| Support | 10 | FAQ, support request, schedule a demo, book a meeting, feature request, feedback |
| Home | 2 | `/` and `/home` (both are live on the source) |
| Products | 1 | the product suite hub |
| Professional Services | 1 | |
| Customers | 1 | |
| Offers | 1 | |

`npm run validate:routes` fails the build if any discovered route is missing an
implementation, so the coverage claim is enforced, not asserted.

### How discovery worked

The source is a **Google Sites** application, not a conventional static site:

- `robots.txt` and `sitemap.xml` are not published — both return HTML.
- Class names are obfuscated in the served HTML, so parsing the raw markup is
  unreliable.

Discovery therefore combined:

1. **Recursive link crawl** from `/`, following every internal `href`.
2. **Navigation-payload mining** — Google's embedded page-list JSON names pages
   that no `<a href>` points at.
3. **Ancestor probing** — every section path (`/legal`, `/resources`, …) is a
   landing page even when nothing links to it. This found `/legal`, which a
   link-following crawl never reached and which took the inventory from 92 to
   93.

Three apparent targets were confirmed **not** to be pages: a Google Analytics
endpoint, a Google Sites editor path, and an external banner URL.

---

## Architecture

```
src/
├── components/
│   ├── BaseLayout chain: SiteHeader, SiteFooter, SocialRow
│   ├── HomeBody.astro        — the bespoke homepage body
│   ├── PageContent.astro     — data-driven renderer for all other routes
│   ├── BlockView.astro       — one extracted content block
│   ├── SectionStrip.astro    — the full-width magenta title bar
│   └── Breadcrumbs.astro
├── data/
│   ├── pages/<slug>.json     — one file per route: content, images, links, meta
│   ├── navigation.json       — header, dropdowns, footer, announcement
│   ├── route-inventory.json  — the discovery record used by the validator
│   └── image-map.json        — source CDN URL → local /images path
├── layouts/BaseLayout.astro  — head, SEO, JSON-LD, header/footer wiring
├── pages/
│   ├── index.astro           — `/`
│   ├── home.astro            — `/home`
│   ├── products.astro        — the product hub, with a real anchor index
│   └── [...route]/index.astro — every remaining route, from page data
├── scripts/motion.ts         — the single GSAP entry point
└── styles/global.css         — design tokens + primitives
```

### Why one data-driven renderer

92 of the 93 routes share the same grammar: a page heading, then continuous
content with `h2`/`h3` subheads, occasionally interrupted by a full-width
magenta title bar. `PageContent.astro` reproduces that grammar and each route
supplies its own content, so every page keeps its own copy and structure while
the presentation stays consistent and maintainable.

Pages whose layout genuinely differs get their own component rather than being
flattened into the template: the homepage, `/home`, and `/products`.

### Design tokens

Measured from the live site via computed styles, not guessed:

| Token | Value | Source |
|---|---|---|
| `--jivrus-magenta` | `#D01752` | headings, section bars, accents |
| `--jivrus-blush` | `#FAE8EE` | alternate section background |
| `--jivrus-blue` | `#0B5394` | links, secondary |
| `--jivrus-ink` | `#14213D` | body headings |
| `--jivrus-body` | `#212121` | body copy |
| Hero gradient | `#C90057 → #F90052 → #FF6845` | sampled from the hero |
| `--font-sans` | Roboto | headings + body |
| `--font-brand` | Comfortaa | brand wordmark |
| Section-strip `h1` | 60px | measured |
| Content `h1` / `h2` / `h3` | 34.67 / 24 / 17.33px | measured |

### Routing

URLs match the source exactly. Astro's rest parameter renders any depth from one
template, so `/legal/security-policies/data-policy` needs no special case.

`astro.config.mjs` sets `trailingSlash: 'ignore'` and `build.format: 'directory'`
so each route emits `dist/<path>/index.html` and serves at `/<path>`.

---

## Motion design

The one intentional departure from the source.

`src/scripts/motion.ts` is the single entry point. It provides:

- **Scroll reveals** — `data-reveal` elements fade and rise once on entry.
- **Staggered groups** — `data-stagger` containers cascade their children
  (`data-stagger-item`).
- **Hero intro** — `data-hero` elements animate on load.
- **Parallax** — `data-parallax="<depth>"` for scroll-linked movement.
- **Progress bar** — `data-progress` for reading position.

Rules it follows:

- **transform and opacity only**, so nothing triggers layout or paint.
- **`prefers-reduced-motion` disables everything.** The GSAP layer is skipped
  entirely, and a CSS media query neutralises CSS transitions. Content is fully
  visible either way — no reveal state is applied until JavaScript runs.
- Elements start visible in CSS. JavaScript pulls them back before animating, so
  the page never flashes a half-faded element, and it degrades correctly if the
  bundle fails to load.
- Stagger is 0.08s and duration 0.65s — fast enough to preserve usability.

---

## Accessibility

`npm run qa:a11y` runs axe-core (WCAG 2.0/2.1 A + AA) plus structural checks on
every route, and exits non-zero on any serious or critical finding.

Implemented:

- Skip link to `#main`
- Semantic landmarks (`header`, `nav`, `main`, `footer`)
- One `h1` per page — the source uses several `h1`s as in-page section headings;
  the document `h1` is the layout's and the rest are demoted to `h2`, which keeps
  the outline valid
- Dropdowns open on hover **and** `:focus-within`, and close on `Escape`
- Burger drawer toggles `aria-expanded` and restores focus
- Visible `:focus-visible` rings at 3:1
- Images carry alt text from the source
- Body copy is `#212121` on white (16.1:1) — well above the 4.5:1 requirement

---

## SEO

- Per-route `<title>` and meta description, taken from the source page's own
  title and `og:description`
- `<link rel="canonical">` on every page, pointing at the source URL
- Open Graph and Twitter card metadata
- JSON-LD: an `Organization` graph on every page, plus a `WebPage` /
  `CollectionPage` node for the route
- `sitemap-index.xml` generated at build time
- Crawlable static HTML — no client-side routing

---

## Performance

- Fully static HTML; no runtime framework on the page
- Astro code-splitting and scoped component CSS
- GSAP is the only animation dependency, tree-shaken to a single module
- Images are `loading="lazy"` below the fold
- Fonts load from Google Fonts with `preconnect` hints
- The motion bundle is deferred and only touches elements carrying its data
  attributes

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production static build |
| `npm run preview` | Serve `dist/` |
| `npm run check` | Astro/TypeScript diagnostics |
| `npm run validate:routes` | Every discovered route has an implementation |
| `npm run validate:links` | No broken internal links, assets, or anchors |
| `npm run validate:assets` | No missing local assets |
| `npm run qa:a11y` | axe-core + structural audit over all routes |
| `npm run qa:all` | All of the above |

Run the validators against `dist/`, so build first:

```bash
npm run build
npm run qa:all
```

---

## Deployment

`dist/` is a self-contained static site.

**Netlify / Vercel / Cloudflare Pages**

```
Build command:   npm run build
Publish directory: dist/
Node version:    20 or newer
```

**Any static host**

```bash
npm run build
rsync -av dist/ user@host:/var/www/jivrus/
```

No environment variables are required. If you add any, keep them in `.env`
(never committed — see `.gitignore`) and document them in `.env.example`.

---

## Content and asset provenance

- **Copy** is the source site's own public text, extracted per route.
- **Images** are downloaded from the source site's public image CDN at build
  time and re-hosted under `public/images/`, so the rebuilt site does not depend
  on a third-party host at runtime. `src/data/image-map.json` records the mapping.
- **Fonts** are loaded from Google Fonts, matching the source.

Content belongs to Jivrus Technologies. This repository is a reconstruction for
development and reference purposes.

---

## License

The source code in this repository is provided for reference. The Jivrus name,
copy, logos, and imagery remain the property of Jivrus Technologies.
