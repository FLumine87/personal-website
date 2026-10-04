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
├── game.html         Puzzle game (client-side easter egg)
├── css/
│   └── style.css     Shared stylesheet
├── js/
│   └── gameLogic.js  Game rules (runs in the browser)
└── images/           Site assets
```

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
