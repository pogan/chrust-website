# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page marketing website for the Polish folk band CHRUST, served by a minimal Express app. There is no frontend framework or bundler — the site is one long `public/index.html` styled with Bootstrap 5 + a SCSS override file, plus a small inline `<script>` block for interactivity.

## Commands

- `npm start` — runs `node chrust-website-express-app.js`, serving `public/` statically on port 3000 (no env vars, no build step).
- There is no real test suite (`npm test` just exits with an error) and no lint/format tooling configured.
- There is no CSS build script. `src/main.scss` must be compiled externally (e.g. an editor's Sass compiler, since `sass` is not an npm dependency) and the output copied into `public/main.css`, which is what `public/index.html` actually links to. The `css/` directory holds another copy of the compiled output — when editing styles, edit `src/main.scss` and make sure the recompiled CSS ends up in **both** `css/main.css` and `public/main.css` (they're expected to be identical); `public/main.css` is the one that matters for the served site.

## Architecture

- **Server**: `chrust-website-express-app.js` just does `express.static('public')` plus a `/` route. All real content lives under `public/`.
- **Single page, section-per-screen**: `public/index.html` is one page made of stacked full-viewport `<div class="row chrust cover ...">` sections, each with an `id` (`#fp`, `#bio`, `#oferta`, `#concerts`, `#merch`, `#videos`, `#links`, `#members`, `#history`, `#contact`). The navbar links, `data-next` arrow-down buttons, and the inline script's keyboard (Up/Down arrow) handler all navigate between these sections by scrolling to their `offsetTop` — there's no router.
- **i18n without a framework**: Polish text is hardcoded directly in the HTML (the default language). Any element that needs to be translatable carries `data-ts="some-key"`. `public/translations.json` holds only the `en` (and structurally `pl`) strings keyed the same way; it's fetched at runtime, and the flag-icon button toggles `currentLang` and rewrites each `[data-ts]` element's `innerHTML` from `translations.lang[currentLang][key]`. When adding/editing user-facing copy: update the Polish text in `index.html`, add/update the matching key in `translations.json` under `en`, and make sure the element has a `data-ts` attribute if it should be translated.
- **Video carousel**: the `#videos` section is a Bootstrap carousel of `<video>` elements. The inline script's `stopAllVideos()`/`next-video` attribute wiring exists specifically to pause the outgoing video and play the incoming one — Bootstrap's carousel alone doesn't manage playback.
- **Styling**: `src/main.scss` sets Bootstrap variable overrides (`$primary`, etc.) before importing Bootstrap, then adds custom rules nested under `.chrust.cover` per-section background images (e.g. `&.fp`, `&.bio`) and shared components like `.arrow-down`.
- **Assets**: images in `public/img/`, videos in `public/video/` (video files are gitignored — they must exist locally to test the video section but won't show up in `git status`/diffs).
- **External embeds**: the concerts section embeds a Bandsintown widget script; the site otherwise has no external JS dependencies besides the Bootstrap bundle loaded from a CDN in `<head>`.

## Version control

Commit as you work — don't let a session end with a pile of uncommitted changes. This repo commits directly to `main` (which tracks `origin/main`); do not create feature branches or open PRs unless asked.

- **Commit early and often.** After each self-contained unit of work (a section's copy updated, a style fixed, a bug resolved), stage and commit it. Don't batch unrelated changes into one commit.
- **Do not push unless asked.** Committing is automatic; `git push` is not. Leave commits local on `main` until Karol explicitly says to push, then `git push origin main`.
- **Write clean messages.** A short imperative subject line describing what changed and why it matters — `fix video carousel not pausing outgoing video`, not `minor changes` or `v2`. Add a body only when the subject can't carry the reasoning.
- **Watch for untracked work.** `.gitignore` excludes `public/video/*` and `*.scss` by pattern, though `src/main.scss` is tracked as an exception. Recompiled CSS (`css/main.css`, `public/main.css`) is easy to leave behind — check `git status` before finishing.
