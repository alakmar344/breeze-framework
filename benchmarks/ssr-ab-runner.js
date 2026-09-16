#!/usr/bin/env node
/**
 * SSR A/B Runner — noise-robust before/after comparison for the SSR engine.
 * ─────────────────────────────────────────────────────────────────────────
 * Why this exists: the plain throughput runners (ssr-runner.js, etc.) take a
 * handful of wall-clock samples per engine, one engine after another. On a
 * shared / virtualized / thermally-throttled host the between-sample variance
 * can exceed the median (sd > median is common on CI boxes), so a single
 * before-run vs a single after-run tells you almost nothing — the host may
 * simply have been busier during one of them.
 *
 * This runner removes that confound by loading BOTH builds into ONE process
 * and INTERLEAVING their trials (A, B, A, B, …). Any host-load spike now hits
 * both builds within microseconds of each other, so it cancels out of the
 * paired delta. We report the min (the GC-/noise-free floor — the most stable
 * statistic) and the median, plus a correctness gate that asserts both builds
 * emit byte-identical HTML before any timing is trusted.
 *
 * Baseline resolution (the "before" build):
 *   - BZ_BASELINE       — path to a breeze.js file, OR
 *   - BZ_BASELINE_REF   — a git ref; `git show <ref>:breeze.js` is extracted
 *                         (default: the v2.3.0 release tip, 0343add)
 * Candidate (the "after" build):
 *   - BZ_CANDIDATE      — path to a breeze.js file (default: ../breeze.js)
 *
 * Usage:
 *   node benchmarks/ssr-ab-runner.js
 *   BZ_BASELINE_REF=v2.3.0 node benchmarks/ssr-ab-runner.js
 *   BZ_TRIALS=600 node benchmarks/ssr-ab-runner.js
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');
const DEFAULT_BASELINE_REF = process.env.BZ_BASELINE_REF || '0343add'; // v2.3.0 tip
const TRIALS = parseInt(process.env.BZ_TRIALS || '400', 10);
const WARMUP = parseInt(process.env.BZ_WARMUP || '30', 10);

function loadBaseline() {
  if (process.env.BZ_BASELINE && fs.existsSync(process.env.BZ_BASELINE)) {
    return require(path.resolve(process.env.BZ_BASELINE)).Breeze;
  }
  // Extract the baseline build from git so no stale binary needs to live in-repo.
  const tmp = path.join(os.tmpdir(), `breeze-baseline-${DEFAULT_BASELINE_REF.replace(/[^\w.-]/g, '_')}.js`);
  try {
    const src = execSync(`git show ${DEFAULT_BASELINE_REF}:breeze.js`, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    fs.writeFileSync(tmp, src);
    return require(tmp).Breeze;
  } catch (err) {
    console.error(`\n✖ Could not resolve baseline build from ref "${DEFAULT_BASELINE_REF}".`);
    console.error('  Set BZ_BASELINE=/path/to/old/breeze.js or BZ_BASELINE_REF=<git ref>.');
    console.error('  ' + (err && err.message ? err.message.split('\n')[0] : err));
    process.exit(2);
  }
}

function loadCandidate() {
  const p = process.env.BZ_CANDIDATE ? path.resolve(process.env.BZ_CANDIDATE) : path.join(ROOT, 'breeze.js');
  return require(p).Breeze;
}

const pctl = (s, p) => { const a = s.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };

// ── Workloads: (name, sourceString, state) ──────────────────────────────
function makeWorkloads() {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i, name: 'Item ' + i, value: i * 3 }));

  let componentSrc = '@def Card(title, body)\n  card [shadow]\n    h3 "{title}"\n    p "{body}"\n';
  for (let i = 0; i < 300; i++) componentSrc += `Card("Title ${i}", body="Body content ${i}")\n`;

  let textSrc = '';
  for (let i = 0; i < 1000; i++) textSrc += `section\n  h2 "Heading {title} #${i}"\n  p "Body {desc} row ${i} value {count}"\n`;

  const pageSrc = [
    '@nav "Breeze SSR"',
    '  a "Home" [href=/]',
    '  a "Dashboard" [href=/dashboard]',
    '@section #profile',
    '  h1 "User Profile: {username}"',
    '  p "Current dynamic count: {count}"',
    '@section #items',
    '  @each item in items',
    '    div.item-card',
    '      strong "{item.title}"',
    '      p "{item.desc}"',
    '      span.badge "{item.badge}"',
    '@footer',
    '  p "Rendered by Breeze SSR"'
  ].join('\n');

  return [
    { name: 'component-heavy (300 comps)', src: componentSrc, state: {} },
    { name: 'text-heavy (1k sections)', src: textSrc, state: { title: 'Hi', desc: 'lorem ipsum dolor', count: 42 } },
    {
      name: 'mixed page (nav+profile+feed)', src: pageSrc, state: {
        username: 'Alex Rivera', count: 10,
        items: Array.from({ length: 10 }, (_, i) => ({
          title: `Notification event #${i + 1}`,
          desc: `Detailed payload summary for event id ${i * 42} with metadata`,
          badge: i % 2 === 0 ? 'Critical' : 'Standard'
        }))
      }
    },
    { name: 'static-row table (5k rows)', src: '@each row in rows\n  tr\n    td "{row.id}"\n    td "{row.name}"\n    td "{row.value}"\n', state: { rows } }
  ];
}

function run() {
  const OLD = loadBaseline();
  const NEW = loadCandidate();

  console.log('\n================================================================');
  console.log('🧪  SSR A/B — interleaved before/after (paired, noise-robust)');
  console.log(`Baseline: ${process.env.BZ_BASELINE || (DEFAULT_BASELINE_REF + ' (git)')}  v${OLD.version}`);
  console.log(`Candidate: ${process.env.BZ_CANDIDATE || 'breeze.js'}  v${NEW.version}`);
  console.log(`Trials: ${TRIALS} interleaved (warmup ${WARMUP}) | Node ${process.version}`);
  console.log(`CPU: ${(os.cpus()[0] || {}).model || 'unknown'} × ${os.cpus().length}`);
  console.log('================================================================\n');

  const results = [];
  for (const wl of makeWorkloads()) {
    const aOld = OLD.parse(wl.src);
    const aNew = NEW.parse(wl.src);
    const hOld = OLD.renderToString(aOld, wl.state);
    const hNew = NEW.renderToString(aNew, wl.state);
    const identical = hOld === hNew;

    for (let w = 0; w < WARMUP; w++) { OLD.renderToString(aOld, wl.state); NEW.renderToString(aNew, wl.state); }

    const so = [], sn = [];
    for (let i = 0; i < TRIALS; i++) {
      let t = performance.now(); OLD.renderToString(aOld, wl.state); so.push(performance.now() - t);
      t = performance.now(); NEW.renderToString(aNew, wl.state); sn.push(performance.now() - t);
    }
    const oMin = pctl(so, 0), nMin = pctl(sn, 0);
    const oMed = pctl(so, 0.5), nMed = pctl(sn, 0.5);
    const oP95 = pctl(so, 0.95), nP95 = pctl(sn, 0.95);
    const speedup = oMed / nMed;
    results.push({ name: wl.name, bytes: hNew.length, identical, oMin, nMin, oMed, nMed, oP95, nP95, speedup });

    const gate = identical ? '✓ identical' : '✗ OUTPUT DIFFERS';
    console.log(`${wl.name}  [${gate}, ${hNew.length} B]`);
    console.log(`   min    ${oMin.toFixed(3)} → ${nMin.toFixed(3)} ms  (${((oMin - nMin) / oMin * 100).toFixed(1)}% faster)`);
    console.log(`   median ${oMed.toFixed(3)} → ${nMed.toFixed(3)} ms  (${((oMed - nMed) / oMed * 100).toFixed(1)}% faster, ${speedup.toFixed(2)}×)`);
    console.log(`   p95    ${oP95.toFixed(3)} → ${nP95.toFixed(3)} ms  (${((oP95 - nP95) / oP95 * 100).toFixed(1)}% faster)`);
    console.log('');
  }

  console.log('| Workload | Output | v2.3 median | v2.4 median | Speedup | v2.3 p95 | v2.4 p95 |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: | :---: |');
  for (const r of results) {
    console.log(`| ${r.name} | ${r.identical ? 'identical' : 'DIFF'} | ${r.oMed.toFixed(3)} ms | ${r.nMed.toFixed(3)} ms | **${r.speedup.toFixed(2)}×** | ${r.oP95.toFixed(3)} ms | ${r.nP95.toFixed(3)} ms |`);
  }
  console.log('');

  const allIdentical = results.every(r => r.identical);
  if (!allIdentical) {
    console.error('✖ Correctness gate FAILED: at least one workload produced different HTML.');
    process.exitCode = 1;
  }

  try {
    const outDir = path.join(__dirname, 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'ssr-ab.json'), JSON.stringify({
      baselineVersion: OLD.version, candidateVersion: NEW.version,
      node: process.version, cpu: (os.cpus()[0] || {}).model, cores: os.cpus().length,
      trials: TRIALS, results
    }, null, 2));
    console.log('📄 Report written: benchmarks/reports/ssr-ab.json');
  } catch (_) {}

  return results;
}

if (require.main === module) run();
module.exports = { run };
