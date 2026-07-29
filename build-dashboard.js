#!/usr/bin/env node
/*
 * VisiLean -> Executive Dashboard builder
 * SJVN Khavda 200 MW (Plot 1) - KPI Green Energy
 *
 * Usage:  node build-dashboard.js
 * Fetches live data from the VisiLean PowerBI API, processes it (processor.js)
 * and injects data + processor into dashboard.template.html, producing:
 *   - index.html     standalone document (static hosting / iframe embedding)
 *   - dashboard.html fragment form (Claude artifact)
 * If the API is unreachable, falls back to ./data/*.json snapshots.
 */
const fs = require('fs');
const path = require('path');
const VLProc = require('./processor.js');

const DIR = __dirname;
const DATA_DIR = path.join(DIR, 'data');

// API endpoints come from env vars (CI) or visilean.config.json (local, gitignored)
// so the capability URLs are never committed to a public repository.
let cfg = {};
const cfgPath = path.join(DIR, 'visilean.config.json');
if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const TASKS_URL = process.env.VL_TASKS_URL || cfg.tasksUrl;
const CONSTRAINTS_URL = process.env.VL_CONSTRAINTS_URL || cfg.constraintsUrl;
if (!TASKS_URL || !CONSTRAINTS_URL) {
  console.error('Missing API URLs: set VL_TASKS_URL / VL_CONSTRAINTS_URL env vars or create visilean.config.json with {"tasksUrl": "...", "constraintsUrl": "..."}');
  process.exit(1);
}

async function getJson(url, cacheFile) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, cacheFile), JSON.stringify(j));
    console.log('Fetched live:', cacheFile, Array.isArray(j) ? j.length + ' records' : '');
    return j;
  } catch (e) {
    const p = path.join(DATA_DIR, cacheFile);
    if (fs.existsSync(p)) {
      console.warn('API fetch failed (' + e.message + ') - using cached ' + cacheFile);
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    throw e;
  }
}

async function main() {
  const [tasks, constraintsRaw] = await Promise.all([
    getJson(TASKS_URL, 'tasks.json'),
    getJson(CONSTRAINTS_URL, 'constraints.json'),
  ]);

  const data = VLProc.buildData(tasks, constraintsRaw, new Date());

  const tpl = fs.readFileSync(path.join(DIR, 'dashboard.template.html'), 'utf8');
  const procSrc = fs.readFileSync(path.join(DIR, 'processor.js'), 'utf8').replace(/<\//g, '<\\/');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const out = tpl.replace('"__DATA__"', json).replace('/*__PROCESSOR__*/', procSrc);

  // fragment form (used for the Claude artifact, which supplies its own document shell)
  fs.writeFileSync(path.join(DIR, 'dashboard.html'), out);
  // standalone document form (for static hosting / iframe embedding)
  const doc = '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="robots" content="noindex">\n</head>\n<body>\n' + out + '\n</body>\n</html>\n';
  fs.writeFileSync(path.join(DIR, 'index.html'), doc);
  console.log('Wrote dashboard.html + index.html  (' + data.tasks.length + ' activities, ' + data.tracker.length + ' procurement packages, as of ' + data.asOf + ')');
}

main().catch(e => { console.error(e); process.exit(1); });
