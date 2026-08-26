# CHRUST — Band Website

Production website for [CHRUST](https://chrustfolkmusic.pl/), a Polish Slavic-folk/rock/electronic band (FRYDERYK 2026-nominated, Polish Eurovision preselection finalist). Live at **https://chrustfolkmusic.pl/**.

A single-page marketing site: hero, band bio, booking info, upcoming shows, merch, a music-video carousel, streaming/social links, member profiles, a history timeline, and contact — each rendered as a full-viewport section on one scrolling page, served by a small, deliberately hardened Express app.

## Why this repo is worth a look

It's a "plain HTML site," but the parts that aren't plain are where the interesting decisions live:

- **A real, explicit Content-Security-Policy**, not `helmet()`'s defaults. Every directive is commented with *why* it's there — e.g. the concerts widget is allowed under `script-src` rather than `connect-src` because it fetches events via JSONP (a `<script>` injection, not `fetch`), and `style-src 'unsafe-inline'` is scoped to Bootstrap writing `element.style` during transitions, not to inline `<script>` (there are none — CSP forbids them, and none of the JS uses `onclick=`).
- **A request-time extension blocklist ahead of `express.static`**, because `public/` doubles as the design team's asset folder and holds source files (e.g. a 933 MB `.psd`) that must never be reachable by URL — `.psd`/`.ai`/`.map`/`.zip`/etc. are 404'd before the static handler ever sees them.
- **Deliberate caching strategy**: images/video/fonts are served `immutable` for a year; `index.html`, `main.css` and `main.js` carry no content hash, so they revalidate via ETag instead — a normal deploy still reaches everyone.
- **A `.gitignore` "deny-then-allow" shape for video**: `public/video/*` is ignored, with named exceptions for the exact re-encoded files the site serves. That's what stops someone's `git add -A` from re-committing an 800+ MB master alongside the ~140 MB of web-ready `.mp4`s that are meant to ship.
- **Zero-framework i18n**: Polish is hardcoded as the default copy in the HTML; translatable elements carry `data-ts="key"` attributes, and a small loader (`public/js/main.js`) fetches `public/translations.json` (PL/EN/DE/IT/ES) and rewrites `innerHTML` per key once the fetch resolves — with console warnings for missing keys/languages instead of silent failures.
- **JSON-LD structured data** (`MusicGroup` schema) in the `<head>` for SEO/rich-result eligibility — members, albums, awards, and social profiles are machine-readable, not just visual.

## Tech stack

- **Runtime**: Node.js, [Express 5](https://expressjs.com/)
- **Security**: [Helmet](https://helmetjs.github.io/) (custom CSP, no `x-powered-by`)
- **Compression**: [compression](https://www.npmjs.com/package/compression) (gzip/br)
- **Frontend**: static HTML + [Bootstrap 5](https://getbootstrap.com/) (loaded from jsDelivr with Subresource Integrity) + vanilla JS — no frontend framework, no bundler, no client-side router
- **Styling**: SCSS (`src/main.scss`) compiled to a committed `public/main.css` — see build note below
- **Third-party integrations**: Bandsintown widget (JSONP) for the shows list, Google Fonts

There is no database, no server-side rendering, and no contact form handler — the app's only job is to serve static files safely. The "contact" section is a `mailto:`/`tel:` link plus a JSON-LD `email`/`telephone`, so there's nothing to secure server-side there.

## Architecture

```
chrust-website-express-app.js   Express entrypoint: helmet → compression → extension
                                 blocklist → express.static, with cache headers set per
                                 file type
public/index.html               The entire site: one page, ten stacked sections
public/js/main.js               Keyboard/arrow section navigation, video-carousel
                                 pause/play logic (IntersectionObserver), i18n loader
public/translations.json        pl / en / de / it / es copy, keyed by data-ts attribute
public/img/, public/video/      Site assets (video re-encodes committed at ~140 MB total;
                                 raw masters are deliberately kept out of the repo)
src/main.scss                   Bootstrap variable overrides + custom rules; compiled
                                 output is public/main.css (sass is not a dependency —
                                 see below)
```

Navigation has no router: each section has an id, and both the navbar links and the on-screen down-arrows scroll to a target section's `offsetTop`. The video carousel is driven off Bootstrap's `slide.bs.carousel` events (so indicator dots and swipe gestures pause the outgoing video correctly, not just the arrow buttons) and an `IntersectionObserver` stops all playback once the section scrolls out of view.

## Getting started

```bash
npm install
npm start        # node chrust-website-express-app.js, serves public/ on :3000
```

Environment variables (all optional, no `.env` file is used or required):

| Variable     | Default | Effect                                                        |
|--------------|---------|----------------------------------------------------------------|
| `PORT`       | `3000`  | Port the server listens on                                     |
| `NODE_ENV`   | —       | `production` adds `upgrade-insecure-requests` to the CSP       |

There's no test suite or lint config configured (`npm test` is a placeholder) — this is a small, low-churn marketing site rather than an application with business logic to unit test.

### Rebuilding the CSS

`public/main.css` is generated from `src/main.scss` and committed (there is no build step wired into `npm start`). `sass` is intentionally not a project dependency, so after editing the SCSS:

```bash
npx --yes sass src/main.scss /tmp/out.css --no-source-map
npx --yes -p postcss-cli -p autoprefixer postcss /tmp/out.css --use autoprefixer --no-map -o public/main.css
```

The autoprefixer pass matters: plain `sass` output is missing most of the vendor-prefixed declarations Bootstrap itself relies on. Don't hand-edit `public/main.css`.

## Deployment

The app is a plain `node chrust-website-express-app.js` process; there's no framework-specific deploy tooling checked into this repo (no PM2/nginx config committed here — those live on the host). `trust proxy` is enabled, so it's expected to run behind a reverse proxy/TLS terminator in production.

## License

Private/unlicensed — all rights reserved by the band. Site design and implementation by Karol Konop.
