# FLumine's Personal Website

A lightweight static personal website hosted on GitHub Pages.

## Overview

This site is a pure static website — plain HTML, CSS and JavaScript, with no build
step and no server-side runtime. It is served directly by GitHub Pages.

## Structure

```
.
├── index.html        Home page
├── about.html        About page
├── blog.html         Blog / writing index
├── easter-egg.html   Puzzle game (hidden — see below)
├── css/
│   └── style.css     Shared stylesheet
├── js/
│   └── gameLogic.js  Game rules (runs in the browser)
├── tools/
│   └── build-images.py  Regenerates responsive image tiers
└── images/           Generated site assets (see below)
```

## The hidden game

`easter-egg.html` is not linked from the navigation. It is reached by pressing
and holding the avatar on the About page for five seconds; a ring fills up as
feedback and releasing early cancels. Right-click and the mobile long-press
callout are suppressed on that element so the gesture is not interrupted.

## Images

Every bitmap ships in several widths plus a WebP version, and the markup uses
`srcset`/`sizes` so a browser downloads only the file it actually needs:

| Asset | Tiers | Typical download |
|---|---|---|
| Background (`light`, `dark`) | 1920, 2560 | 85 KB |
| Avatar (`head`) | 150, 300 | 4.7 KB |
| Album photos | 320, 640, 960 | 6–20 KB each |
| Inline photo (`sunrise`) | 320, 640, 1280 | 20 KB |

A 1x display gets the small tier; a 2x display automatically gets the larger one.

### Regenerating

Put full-resolution originals in `images/src/` (git-ignored) and run:

```bash
python3 tools/build-images.py          # generate all tiers
python3 tools/build-images.py --check   # report only, write nothing
python3 tools/build-images.py --force   # rebuild even if up to date
```

Tier definitions live in the `RULES` dict at the top of the script. After
changing them, update the matching `srcset`/`sizes` attributes in the HTML.

## Local preview

Because the site uses relative paths, open it through a local HTTP server rather
than the `file://` protocol:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000/>.

## Deployment

Pushing to `main` publishes the site through GitHub Pages. No build step is
required — the repository root is the published directory.

## Notes

- All internal links are relative so the site works correctly under the
  `/personal-website/` sub-path used by GitHub Pages project sites.
- The dark/light theme preference is stored in `localStorage`.
