# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page marketing website for the Polish folk band CHRUST, served by a small hardened Express app. There is no frontend framework and no bundler — the site is one long `public/index.html` styled with Bootstrap 5 plus a SCSS override file, with behaviour in `public/js/main.js`.

Live at <https://chrustfolkmusic.pl/>.

## Commands

- `npm start` — runs `node server.js`, serving `public/` statically. Honours `PORT` (default 3000) and `NODE_ENV=production` (which adds `upgrade-insecure-requests` to the CSP).
- There is no test suite (`npm test` just exits 1) and no lint/format tooling.

### Rebuilding the CSS (there is no build script)

`public/index.html` links `public/main.css`. That file is **generated** from `src/main.scss` and is committed. `sass` is deliberately *not* a dependency, so after any SCSS edit run:

```sh
npx --yes sass src/main.scss /tmp/out.css --no-source-map
npx --yes -p postcss-cli -p autoprefixer postcss /tmp/out.css --use autoprefixer --no-map -o public/main.css
```

**The autoprefixer step is not optional.** Plain `sass` emits 12 vendor-prefixed declarations; the committed CSS has 110. Skipping it silently strips `-webkit-`/`-moz-`/`-o-` prefixes from Bootstrap's own output. Do not hand-edit `public/main.css`.

Source maps are intentionally not generated: the old `public/main.css.map` embedded absolute `/Users/...` paths, and `server.js` 404s `.map` requests anyway.

## Architecture

- **Server** (`server.js`): `helmet` (explicit CSP) → `compression` → an extension blocklist → `express.static`. Notable details:
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
  - The served files are the `*_720.mp4` / `*_web.mp4` H.264 re-encodes (150 MB total), **not** the original masters, which stay on disk beside them. `public/video/*` is gitignored, so **the re-encoded files must be copied to the server manually** — they will never arrive via `git pull`.
  - Re-encode with `libx264 -crf 23 -preset slow -pix_fmt yuv420p -movflags +faststart`. Keep `+faststart`: without it the `moov` index sits after the media data and a player must round-trip to the end of the file before the first frame.
  - Do not reintroduce HEVC. `chrust_podjaworem.mp4` was HEVC and reported `videoWidth = 0` in Chrome; Firefox never decodes HEVC in MP4.
- **Styling** (`src/main.scss`): Bootstrap variable overrides first, custom rules next, and `@import "../node_modules/bootstrap/scss/bootstrap"` **last, on the final line**. Consequences:
  - `@extend .h1` works (extends resolve after the whole file is parsed).
  - `@include media-breakpoint-down(md)` does **not** — the mixin isn't defined yet. Responsive rules use raw `@media (max-width: 767.98px)` at Bootstrap's own breakpoint values.
- **Assets**: `public/img/`, `public/video/` (videos are gitignored — they must exist locally to test that section but never appear in `git status`).

## Gotchas discovered the hard way

- `.gitignore` **lists itself**, so it is untracked. Ignore rules added there exist only on this machine and never reach a clone.
- Section backgrounds are photographs. Keep them as **JPEG encoded 4:4:4**, not 4:2:0. These frames have a mean luma around 27/255, and 4:2:0 chroma subsampling bands visibly in the shadows — quality settings barely affect it, because the loss is in the chroma planes, not quantisation. `sips` only writes 4:2:0; use `ffmpeg -q:v 3 -pix_fmt yuvj444p`.
- Judge image re-encodes by **PSNR, not SSIM**, for the same reason: in near-black regions SSIM's local-variance denominator collapses and it reports ~0.78 for a visually identical image. Aim for ≥36 dB PSNR in RGB.
- Chrome's `--window-size` clamps to a 500 px minimum on macOS, so headless viewport testing below that silently lies. Drive `Emulation.setDeviceMetricsOverride` over CDP instead (Node 24 has a global `WebSocket`, so no packages needed).

## Version control

Commit as you work — don't let a session end with a pile of uncommitted changes. This repo commits directly to `main` (which tracks `origin/main`); do not create feature branches or open PRs unless asked.

- **Commit early and often.** After each self-contained unit of work (a section's copy updated, a style fixed, a bug resolved), stage and commit it. Don't batch unrelated changes into one commit.
- **Do not push unless asked.** Committing is automatic; `git push` is not. Leave commits local on `main` until Karol explicitly says to push, then `git push origin main`.
- **Write clean messages.** A short imperative subject line describing what changed and why it matters — `fix video carousel not pausing outgoing video`, not `minor changes` or `v2`. Add a body only when the subject can't carry the reasoning.
- **Watch for untracked work.** `.gitignore` excludes `public/video/*` and `*.scss` by pattern, though `src/main.scss` is tracked as an exception. Regenerated `public/main.css` is easy to leave behind — check `git status` before finishing.
