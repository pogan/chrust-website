# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page marketing website for the Polish folk band CHRUST, served by a small hardened Express app. There is no frontend framework and no bundler — the site is one long `public/index.html` styled with Bootstrap 5 plus a SCSS override file, with behaviour in `public/js/main.js`.

Live at <https://chrustfolkmusic.pl/>.

## Commands

- `npm start` — runs `node chrust-website-express-app.js`, serving `public/` statically. Honours `PORT` (default 3000) and `NODE_ENV=production` (which adds `upgrade-insecure-requests` to the CSP).
- There is no test suite (`npm test` just exits 1) and no lint/format tooling.

### Rebuilding the CSS (there is no build script)

`public/index.html` links `public/main.css`. That file is **generated** from `src/main.scss` and is committed. `sass` is deliberately *not* a dependency, so after any SCSS edit run:

```sh
npx --yes sass src/main.scss /tmp/out.css --no-source-map
npx --yes -p postcss-cli -p autoprefixer postcss /tmp/out.css --use autoprefixer --no-map -o public/main.css
```

**The autoprefixer step is not optional.** Plain `sass` emits 12 vendor-prefixed declarations; the committed CSS has 110. Skipping it silently strips `-webkit-`/`-moz-`/`-o-` prefixes from Bootstrap's own output. Do not hand-edit `public/main.css`.

Source maps are intentionally not generated: the old `public/main.css.map` embedded absolute `/Users/...` paths, and the server 404s `.map` requests anyway.

The `/anatema` subpage has its **own** stylesheet on the same pipeline — `src/anatema.scss` → `public/anatema.css`, both committed, no Bootstrap import:

```sh
npx --yes sass src/anatema.scss /tmp/anatema.css --no-source-map
npx --yes -p postcss-cli -p autoprefixer postcss /tmp/anatema.css --use autoprefixer --no-map -o public/anatema.css
```

## Architecture

- **Server** (`chrust-website-express-app.js`): `helmet` (explicit CSP) → `compression` → an extension blocklist → `express.static`. Notable details:
  - `public/` doubles as the designers' asset folder and contains a **933 MB `chrust_backgrounds.psd`**. Requests for `.psd`/`.ai`/`.map`/etc. are 404'd *before* the static handler. Don't remove that guard.
  - `rest.bandsintown.com` lives in `script-src`, not `connect-src`, because the concerts widget fetches events over **JSONP** (it injects a `<script>`). Moving it breaks the concerts list silently.
  - `style-src` keeps `'unsafe-inline'` because Bootstrap's collapse/carousel JS writes `element.style` during transitions.
  - Images/video are `immutable` for a year; `index.html`, `main.css` and `js/main.js` have no content hash in their filenames, so they revalidate via ETag instead.
- **No inline scripts.** The CSP has no `'unsafe-inline'` for scripts and no inline event handlers (`onclick=`) survive. Anything new goes in `public/js/main.js`.
- **Single page, section-per-screen**: stacked full-viewport `<div class="row chrust cover …">` sections with ids `#fp #bio #oferta #concerts #merch #videos #links #members #history #contact`. Navbar links, the `data-next` down-arrows, and the Up/Down keyboard handler all just scroll to a section's `offsetTop` — there is no router. **Each arrow's `data-next` must name the next section in DOM order.**
- **i18n without a framework**: Polish is hardcoded in the HTML as the default. Translatable elements carry `data-ts="key"`; `public/translations.json` holds `pl`, `en`, `de`, `it` and `es` under `lang`. `applyLanguage(code)` rewrites each `[data-ts]` element's `innerHTML`, updates `document.documentElement.lang`, and syncs the navbar dropdown's label and `.active` entry. Listeners are attached only *after* the fetch resolves — an early click used to throw.
  - `innerHTML` is deliberate here: the JSON carries markup (`<span class='redhighlight'>`, `<a>`). It is same-origin and not user input; the CSP is the mitigation.
  - When adding copy: edit the Polish in `index.html`, add the same key to **all five** languages in `translations.json`, and give the element a `data-ts`. A missing key logs a warning and leaves the previous language's text in place.
  - The language selector is a Bootstrap dropdown (`#langChangeButton` / `#langMenu`). It is also a `.nav-link`, so `setNavListeners()` skips `.dropdown-toggle` — otherwise collapsing the mobile navbar would tear the dropdown off screen as it opened.
  - `#langMenu` is themed by hand through `--bs-dropdown-*` variables. `data-bs-theme="dark"` on the navbar does nothing because `$enable-dark-mode: false`, so Bootstrap never compiled those rules and the menu would render as a white box.
- **Video carousel** (`#videos`): five `<video preload="none" poster="…">` in a Bootstrap carousel. Playback is driven by `slide.bs.carousel` / `slid.bs.carousel` — **not** by click handlers on the arrows, because indicator dots and swipes must also pause the outgoing video. An `IntersectionObserver` pauses everything when the section scrolls out of view.
  - The served files are the `*_720.mp4` / `*_web.mp4` H.264 re-encodes, ~141 MB in total. They are **committed**, so `git pull` deploys them. The masters are **not** kept here — they live in `~/Video/CHRUST/TELEDYSKI/`. Never leave a master inside `public/`: `express.static` will happily serve an 883 MB file to anyone who guesses the URL.
  - `.gitignore` ignores `public/video/*` and then re-allows exactly `chrust_*_720.mp4` / `chrust_*_web.mp4`. **Keep that shape.** A master dropped into `public/video/` must stay ignored — `git add -A` once swallowed 1.29 GB of masters into this history, and GitHub hard-rejects any blob over 100 MB. If you add a re-encode under a new name, whitelist it explicitly rather than loosening the deny line.
  - Re-encode with `libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart`. Keep `+faststart`: without it the `moov` index sits after the media data and a player must round-trip to the end of the file before the first frame.
  - `chrust_woda_720.mp4` is the exception: CRF **25**, because at 23 it came out 57 MB and GitHub warns on every push above 50 MB. Always re-encode from the master in `~/Video/CHRUST/TELEDYSKI/` — never from the 720p file, which would stack a second generation of loss.
  - Do not reintroduce HEVC. `chrust_podjaworem.mp4` was HEVC and reported `videoWidth = 0` in Chrome; Firefox never decodes HEVC in MP4.
- **Styling** (`src/main.scss`): Bootstrap variable overrides first, custom rules next, and `@import "../node_modules/bootstrap/scss/bootstrap"` **last, on the final line**. Consequences:
  - `@extend .h1` works (extends resolve after the whole file is parsed).
  - `@include media-breakpoint-down(md)` does **not** — the mixin isn't defined yet. Responsive rules use raw `@media (max-width: 767.98px)` at Bootstrap's own breakpoint values.
- **Assets**: `public/img/`, `public/video/`.

## The `/anatema` preorder subpage

A separate mini-site announcing the CHRUST vinyl **„ANATEMA!”** and taking preorders via Stripe. Deliberately unlinked from `index.html` — you reach it only if you have the URL.

- **Pages are static**: `public/anatema/index.html`, `public/anatema/regulamin/index.html`, `public/anatema/dziekujemy/index.html` — served by `express.static` (pretty URLs come from the `<dir>/index.html` layout, so links keep the trailing slash). Own stylesheet `public/anatema.css`, own behaviour `public/js/anatema.js` (still no inline scripts — same CSP). Dark, Apple-style, scroll-reveal.
- **Server logic** lives in `anatema.js` (root, next to the Express app), exporting `{ router, webhook }`:
  - `POST /anatema/checkout` — creates a Stripe Checkout session (price is fixed server-side at 180 zł brutto, VAT 23% **inclusive**; 20 zł InPost Paczkomat / 0 zł personal pickup; paczkomat code via `custom_fields`; PL shipping + phone). Returns `{ url }`; the page does `window.location = url`. No CSP change — the redirect is a top-level navigation, not a script/frame.
  - `POST /anatema/webhook` — mounted in `chrust-website-express-app.js` **before `compression()` and any body parser**, with `express.raw()`, because Stripe signature checks need the exact bytes. On `checkout.session.completed` it appends one JSON line to `data/anatema-orders.jsonl` (buyer name/email/phone/address/paczkomat/amount), deduped by session id.
- **Config**: `anatema.js` reads `.env` (via `dotenv`, loaded at the top of the Express app) — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_BASE_URL`. See `.env.example`. Without keys the pages still render and only `/anatema/checkout` returns 503. `.env` and `data/` are gitignored; so is `_anatema_input_data/` (raw briefing material).
- **VAT rate**: `anatema.js` creates its own Stripe `TaxRate` (23%, `inclusive: true`, marker `chrust_vat: 'pl23_incl'`) on first checkout and caches it. Do **not** set `STRIPE_TAX_RATE_ID` to a rate from another project unless it is also inclusive.
- **Seller of record** is *Dariusz Mrozek Art* (hardcoded in the footer, the regulamin, and the session metadata) — not the band. Invoice on email request only.

## Gotchas discovered the hard way

- `git filter-branch` ends with a `reset --hard` on the rewritten HEAD, which **deletes from the working tree** any tracked file that the rewrite removed. Purging `public/video/` from history once destroyed the only on-disk copies of the re-encodes. Copy anything large out of the repo before rewriting history.
- Section backgrounds are photographs. Keep them as **JPEG encoded 4:4:4**, not 4:2:0. These frames have a mean luma around 27/255, and 4:2:0 chroma subsampling bands visibly in the shadows — quality settings barely affect it, because the loss is in the chroma planes, not quantisation. `sips` only writes 4:2:0; use `ffmpeg -q:v 3 -pix_fmt yuvj444p`.
- Judge image re-encodes by **PSNR, not SSIM**, for the same reason: in near-black regions SSIM's local-variance denominator collapses and it reports ~0.78 for a visually identical image. Aim for ≥36 dB PSNR in RGB.
- Chrome's `--window-size` clamps to a 500 px minimum on macOS, so headless viewport testing below that silently lies. Drive `Emulation.setDeviceMetricsOverride` over CDP instead (Node 24 has a global `WebSocket`, so no packages needed).

## Version control

Commit as you work — don't let a session end with a pile of uncommitted changes. This repo commits directly to `main` (which tracks `origin/main`); do not create feature branches or open PRs unless asked.

- **Commit early and often.** After each self-contained unit of work (a section's copy updated, a style fixed, a bug resolved), stage and commit it. Don't batch unrelated changes into one commit.
- **Do not push unless asked.** Committing is automatic; `git push` is not. Leave commits local on `main` until Karol explicitly says to push, then `git push origin main`.
- **Write clean messages.** A short imperative subject line describing what changed and why it matters — `fix video carousel not pausing outgoing video`, not `minor changes` or `v2`. Add a body only when the subject can't carry the reasoning.
- **Watch for untracked work.** Regenerated `public/main.css` is easy to leave behind — check `git status` before finishing.
- **Never `git add -A` after touching `public/video/`.** Stage video paths by name. The whitelist in `.gitignore` is the safety net, not the plan.
