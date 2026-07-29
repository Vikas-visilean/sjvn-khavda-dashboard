# SJVN Khavda 200 MW (Plot 1) — Executive Dashboard

Self-contained executive review dashboard for the SJVN Khavda 200 MW solar
project, generated from the VisiLean PowerBI API and published via GitHub Pages.

- **Live dashboard:** served from this repo's GitHub Pages deployment (`index.html`)
- **Refresh:** the `Refresh dashboard` workflow rebuilds from the live API daily
  (02:30 UTC / 08:00 IST), on every push, and on manual dispatch
- **Embedding:** the page sends no frame-blocking headers, so it can be embedded
  in an iframe

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
