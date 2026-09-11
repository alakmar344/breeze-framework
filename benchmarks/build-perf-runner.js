#!/usr/bin/env node
/**
 * Build-performance benchmark (answers: how fast is the DEVELOPMENT loop?).
 * Measures Breeze production builds across project shapes — this is Breeze-only
 * scaling (no fabricated cross-framework numbers; comparing against Vite/Next
 * toolchains fairly requires their stacks installed — documented as future work
 * in benchmark.md §8):
 *   1-file / 10-file / 100-file projects (identical pages, N buildHTML calls)
 *   cold build  — fresh node process per build (real CLI reality)
 *   warm build  — in-process, module cache hot
 *   incremental — 1 of 100 files changed, rebuild changed file only
 *   css-heavy / template-heavy single pages
 *   + minification on/off delta
 * Full distributions (median/p95/min/max/sd, n=5).
 *
 * Usage: node benchmarks/build-perf-runner.js [--runs=N]
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { performance } = require('perf_hooks');
const { summarize } = require('./stats.js');

const rootDir = path.resolve(__dirname, '..');

function makePage(title, cards) {
  let s = `@app "${title}"\n\n@theme {\n  primary: #6366f1\n}\n\n@section #main [pad-xl]\n  h1 "${title}"\n`;
  for (let i = 0; i < cards; i++) {
    s += `  card [shadow]\n    h3 "Card ${i}"\n    p "Body text for card ${i} with content."\n`;
  }
  return s;
}

function setupProject(dir, files, cardsPerFile) {
  fs.mkdirSync(dir, { recursive: true });
  const names = [];
  for (let i = 0; i < files; i++) {
    const name = `page${i}.breeze`;
    fs.writeFileSync(path.join(dir, name), makePage(`Page ${i}`, cardsPerFile));
    names.push(name);
  }
  fs.writeFileSync(path.join(dir, 'breeze.css'), fs.readFileSync(path.join(rootDir, 'breeze.css'), 'utf8'));
  fs.writeFileSync(path.join(dir, 'breeze.js'), fs.readFileSync(path.join(rootDir, 'breeze.js'), 'utf8'));
  return names;
}

function timeIt(fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

async function runBuildPerf() {
  const args = process.argv.slice(2);
  const runsArg = args.find(a => a.startsWith('--runs='));
  const RUNS = parseInt((runsArg || '').split('=')[1] || '5', 10) || 5;
  const { buildHTML } = require('../breeze-cli.js');

  console.log('\n================================================================');
  console.log('🔨 BUILD PERFORMANCE (Breeze production builds, scaling + loop)');
  console.log('================================================================');

  const results = {};
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-build-perf-'));

  // Warm builds: 1 / 10 / 100 files (in-process).
  for (const n of [1, 10, 100]) {
    const dir = path.join(workRoot, `proj-${n}`);
    const names = setupProject(dir, n, 5);
    const sources = names.map(f => fs.readFileSync(path.join(dir, f), 'utf8'));
    const css = fs.readFileSync(path.join(dir, 'breeze.css'), 'utf8');
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
      samples.push(timeIt(() => {
        for (const src of sources) buildHTML({ breezeSource: src, css, js: '', doSpa: false, doMinify: false });
      }));
    }
    results[`warm-${n}-files`] = summarize(samples);
    const d = results[`warm-${n}-files`];
    console.log(`  ✔ Warm build, ${String(n).padStart(3)} files: ${d.median.toFixed(2).padStart(8)} ms total (p95 ${d.p95.toFixed(2)}, sd ${d.sd.toFixed(2)}, n=${d.n})`);
  }

  // Cold builds: fresh node process per file via the real CLI (N invocations).
  for (const n of [1, 10]) {
    const dir = path.join(workRoot, `proj-${n}`);
    const names = fs.readdirSync(dir).filter(f => f.endsWith('.breeze')).slice(0, n);
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
      const t0 = performance.now();
      for (const name of names) {
        const r = spawnSync(process.execPath, [path.join(rootDir, 'breeze-cli.js'), 'build', name], {
          cwd: dir, stdio: 'pipe', encoding: 'utf8'
        });
        if (r.status !== 0) throw new Error('CLI build failed: ' + (r.stderr || '').slice(0, 200));
      }
      samples.push(performance.now() - t0);
    }
    results[`cold-${n}-files`] = summarize(samples);
    const d = results[`cold-${n}-files`];
    console.log(`  ✔ Cold build, ${String(n).padStart(3)} files (${n} CLI invocations): ${d.median.toFixed(2).padStart(8)} ms total (p95 ${d.p95.toFixed(2)}, sd ${d.sd.toFixed(2)}, n=${d.n})`);
  }

  // Incremental: 1 changed file out of 100 (rebuild that file only).
  {
    const dir = path.join(workRoot, 'proj-100');
    const src = fs.readFileSync(path.join(dir, 'page42.breeze'), 'utf8');
    const css = fs.readFileSync(path.join(dir, 'breeze.css'), 'utf8');
    const samples = [];
    for (let i = 0; i < RUNS; i++) {
      const changed = src + `\n  p "Edit ${i}"\n`;
      samples.push(timeIt(() => buildHTML({ breezeSource: changed, css, js: '', doSpa: false, doMinify: false })));
    }
    results['incremental-1-of-100'] = summarize(samples);
    const d = results['incremental-1-of-100'];
    console.log(`  ✔ Incremental (1 of 100 files): ${d.median.toFixed(2).padStart(8)} ms (p95 ${d.p95.toFixed(2)}, sd ${d.sd.toFixed(2)}, n=${d.n})`);
  }

  // Heavy pages: css-heavy (10x CSS) and template-heavy (200 cards).
  {
    const css10x = fs.readFileSync(path.join(rootDir, 'breeze.css'), 'utf8').repeat(10);
    const tplHeavy = makePage('Heavy', 200);
    const cssSamples = [], tplSamples = [], minSamples = [];
    for (let i = 0; i < RUNS; i++) {
      cssSamples.push(timeIt(() => buildHTML({ breezeSource: makePage('C', 5), css: css10x, js: '', doSpa: false, doMinify: false })));
      tplSamples.push(timeIt(() => buildHTML({ breezeSource: tplHeavy, css: '', js: '', doSpa: false, doMinify: false })));
      const js = fs.readFileSync(path.join(rootDir, 'breeze.js'), 'utf8');
      minSamples.push(timeIt(() => buildHTML({ breezeSource: tplHeavy, css: css10x, js, doSpa: true, doMinify: true })));
    }
    results['css-heavy'] = summarize(cssSamples);
    results['template-heavy-200-cards'] = summarize(tplSamples);
    results['spa-min-heavy'] = summarize(minSamples);
    console.log(`  ✔ CSS-heavy page (10x CSS):      ${results['css-heavy'].median.toFixed(2).padStart(8)} ms`);
    console.log(`  ✔ Template-heavy (200 cards):    ${results['template-heavy-200-cards'].median.toFixed(2).padStart(8)} ms`);
    console.log(`  ✔ SPA+min heavy page:            ${results['spa-min-heavy'].median.toFixed(2).padStart(8)} ms`);
  }

  try { fs.rmSync(workRoot, { recursive: true, force: true }); } catch (_) {}
  return results;
}

if (require.main === module) {
  runBuildPerf()
    .then(() => {})
    .catch(e => { console.error('build-perf failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
}
module.exports = { runBuildPerf };
