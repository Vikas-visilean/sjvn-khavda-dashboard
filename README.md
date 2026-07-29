# SJVN Khavda 200 MW (Plot 1) — Executive Dashboard

Self-contained executive review dashboard for the SJVN Khavda 200 MW solar
project, generated from the VisiLean PowerBI API and published via GitHub Pages.

- **Live dashboard:** served from this repo's GitHub Pages deployment (`index.html`)
- **Refresh:** the `Refresh dashboard` workflow rebuilds from the live API daily
  (02:30 UTC / 08:00 IST), on every push, and on manual dispatch
- **Embedding:** the page sends no frame-blocking headers, so it can be embedded
  in an iframe

## Refresh button (live data)

The header has a **Refresh** button with three behaviors, in order:

1. **Direct live refresh** — if API endpoints are configured in the browser, the
   page fetches both VisiLean endpoints, reprocesses the WBS client-side
   (`processor.js` is embedded in the page) and re-renders with a new data date.
   Configure endpoints one of these ways:
   - query/hash params on the embed URL:
     `index.html?tasksUrl=<url>&constraintsUrl=<url>` (also `#tasksUrl=…` — hash
     params never reach server logs). Saved to `localStorage` after first use.
   - browser console: `setVisiLeanApi('<tasks url>', '<constraints url>')`
   - auto-refresh on load happens whenever endpoints are configured
     (disable with `?live=0`); add `?refresh=<minutes>` for periodic refresh.

   ⚠️ Direct refresh requires the VisiLean API to allow this page's origin —
   the API is CORS-allowlisted (e.g. `https://web.visilean.net` is allowed).
   Ask VisiLean to add the hosting origin (e.g.
   `https://vikas-visilean.github.io`) to the allowlist.

2. **Newer-build check** — if live fetch isn't possible, the button checks
   whether CI has published a newer build and reloads if so.

3. **Guidance** — otherwise it explains why and links to the rebuild workflow.

## How it works

`build-dashboard.js` fetches the tasks/history and constraint-log endpoints,
derives the WBS structure (stages, feeders, supply packages, engineering
groups, execution work packages), and injects a compact dataset into
`dashboard.template.html`, producing `index.html`.

The API endpoint URLs are **not** stored in this repository — they are supplied
via the `VL_TASKS_URL` and `VL_CONSTRAINTS_URL` repository secrets (CI) or a
local `visilean.config.json` (gitignored):

```json
{ "tasksUrl": "…", "constraintsUrl": "…" }
```

Build locally with:

```bash
node build-dashboard.js
```

## Method

Progress is duration-weighted: each activity contributes its planned duration
in days. Plan % prorates each activity linearly between planned start and
finish as of the data date. SPI = cumulative actual ÷ cumulative plan.
