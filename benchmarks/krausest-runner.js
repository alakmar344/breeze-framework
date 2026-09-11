#!/usr/bin/env node
/**
 * Krausest js-framework-benchmark Runner for Breeze Framework
 * Zero-dependency automated benchmark test harness controlling real Google Chrome
 * via Chrome DevTools Protocol (CDP) and native WebSockets.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(__dirname, 'vendor');

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];
const PORT = 4893;
const CDP_PORT = 9336;

// ── HTTP Static Server ───────────────────────────────────────────────
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  if (reqPath === '/breeze.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(path.join(rootDir, 'breeze.js')));
    return;
  }
  if (reqPath === '/breeze.css') {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end(fs.readFileSync(path.join(rootDir, 'breeze.css')));
    return;
  }
  if (reqPath.startsWith('/vendor/')) {
    const file = reqPath.replace('/vendor/', '');
    const fp = path.join(vendorDir, file);
    if (fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(fs.readFileSync(fp));
      return;
    }
  }

  for (const fw of frameworks) {
    if (reqPath === `/${fw}` || reqPath === `/${fw}/` || reqPath === `/${fw}/index.html`) {
      const fp = path.join(__dirname, fw, 'index.html');
      if (fs.existsSync(fp)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(fp));
        return;
      }
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

async function main() {
  await new Promise(r => server.listen(PORT, r));
  console.log(`\n================================================================`);
  console.log(`🏆 KRAUSEST JS-FRAMEWORK-BENCHMARK: HEADLESS CHROME RUNNER`);
  console.log(`================================================================`);
  console.log(`Local test server running on port ${PORT}`);

  const os = require('os');
  // Default 5 runs: on slow hardware each op costs seconds, so 10–30 runs
  // (recommended on fast machines) is left to BZ_BENCH_RUNS. Distributions
  // (median/p95/min/max/sd) are always reported — never a bare single shot.
  const RUNS = parseInt(process.env.BZ_BENCH_RUNS || '5', 10) || 5;
  const { summarize } = require('./stats.js');

  function resolveChromePath() {
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
    const candidates = [
      process.env.CHROME_BIN,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    ].filter(Boolean);
    for (const c of candidates) {
      try { if (fs.existsSync(c)) return c; } catch (_) {}
    }
    // PATH lookup
    try {
      const { execSync } = require('child_process');
      const cmd = process.platform === 'win32' ? 'where chrome' : 'which google-chrome || which chromium || which chromium-browser || which chrome';
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (out.length) return out[0];
    } catch (_) {}
    return candidates[1];
  }

  const chromePath = resolveChromePath();
  const profileDir = path.join(os.tmpdir(), 'chrome-krausest-profile');
  if (!fs.existsSync(chromePath)) {
    console.error(`Chrome not found at ${chromePath}. Set CHROME_PATH env var to your Chrome/Chromium binary.`);
    process.exit(1);
  }
  if (fs.existsSync(profileDir)) {
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) {}
  }

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--js-flags=--expose-gc',
    `--user-data-dir=${profileDir}`
  ]);
  console.log(`Launched Chrome (${chromePath}), waiting for CDP…`);
  chromeProc.on('error', (e) => console.error(`Chrome launch failed: ${e.message}`));

  // Poll CDP until Chrome is actually listening (fixed sleeps race on slow CPUs).
  async function waitForCdp(timeoutMs) {
    const start = Date.now();
    for (;;) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (res.ok) {
          const info = await res.json().catch(() => ({}));
          if (info.Browser) console.log(`Chrome ready: ${(info.Browser || '').split('/').slice(0, 2).join(' ')}`);
          return;
        }
      } catch (_) {}
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Chrome CDP not reachable on 127.0.0.1:${CDP_PORT} after ${timeoutMs}ms — is another Chrome holding the port/profile?`);
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }
  await waitForCdp(20000);

  const allResults = {};

  try {
    for (const fw of frameworks) {
    console.log(`\n----------------------------------------------------------------`);
    console.log(`Benchmarking Framework: [ ${fw.toUpperCase()} ]`);
    console.log(`----------------------------------------------------------------`);

    const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' }).then(r => r.json());
    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
    };

    await new Promise(r => ws.onopen = r);

    function send(method, params = {}) {
      return new Promise((resolve) => {
        const id = msgId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Performance.enable');

    // Helper: Execute an action in the browser and measure time until frame paint
    async function measureAction(actionExpression) {
      const expr = `
        new Promise(resolve => {
          const t0 = performance.now();
          ${actionExpression};
          requestAnimationFrame(() => {
            setTimeout(() => {
              const elapsed = performance.now() - t0;
              resolve(elapsed);
            }, 0);
          });
        })
      `;
      const res = await send('Runtime.evaluate', {
        expression: expr,
        awaitPromise: true,
        returnByValue: true
      });
      return res.result.result.value;
    }

    // Navigate to page
    await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${fw}/index.html` });
    await new Promise(r => setTimeout(r, 800));

    // Warmup (2 rounds, unmeasured variance stabilization)
    await measureAction(`document.getElementById('run').click()`);
    await measureAction(`document.getElementById('clear').click()`);
    await measureAction(`document.getElementById('run').click()`);
    await measureAction(`document.getElementById('clear').click()`);

    // Full distributions per workload (median/p95/min/max/sd/n + samples).
    // rAF callback ≠ guaranteed paint — identical timing method for every framework.
    async function measureDist(expr, { reset = null } = {}) {
      const samples = [];
      for (let r = 0; r < RUNS; r++) {
        samples.push(await measureAction(expr));
        if (reset) await measureAction(reset);
      }
      return summarize(samples);
    }
    const fmt = (d) => `${d.median.toFixed(2).padStart(8)} ms (p95 ${d.p95.toFixed(2)}, ${d.min.toFixed(2)}–${d.max.toFixed(2)}, sd ${d.sd.toFixed(2)}, n=${d.n})`;

    // Workload 1: Create 1,000 rows
    const create1kR = await measureDist(`document.getElementById('run').click()`, { reset: `document.getElementById('clear').click()` });
    const create1k = create1kR.median;
    console.log(`  ✔ Create 1,000 rows:      ${fmt(create1kR)}`);

    // Workload 2: Update every 10th row (needs rows present)
    await measureAction(`document.getElementById('run').click()`);
    const update10thR = await measureDist(`document.getElementById('update').click()`);
    const update10th = update10thR.median;
    console.log(`  ✔ Update every 10th row:  ${fmt(update10thR)}`);

    // Workload 3: Select a row (row 5)
    const selectRowR = await measureDist(`
      const lbl = document.querySelectorAll('.lbl')[4];
      if (lbl) lbl.click();
    `);
    const selectRow = selectRowR.median;
    console.log(`  ✔ Select row:             ${fmt(selectRowR)}`);

    // Workload 4: Swap rows (row 4 and 997)
    const swapRowsR = await measureDist(`document.getElementById('swaprows').click()`);
    const swapRows = swapRowsR.median;
    console.log(`  ✔ Swap rows 4 & 997:      ${fmt(swapRowsR)}`);

    // Workload 5: Delete row
    const deleteRowR = await measureDist(`
      const rm = document.querySelectorAll('.remove')[10];
      if (rm) rm.click();
    `);
    const deleteRow = deleteRowR.median;
    console.log(`  ✔ Delete single row:      ${fmt(deleteRowR)}`);

    // Workload 6: Append 1,000 rows
    const append1kR = await measureDist(`document.getElementById('add').click()`);
    const append1k = append1kR.median;
    console.log(`  ✔ Append 1,000 rows:      ${fmt(append1kR)}`);

    // Workload 7: Clear rows
    const clearRowsR = await measureDist(`document.getElementById('clear').click()`, { reset: `document.getElementById('run').click()` });
    const clearRows = clearRowsR.median;
    console.log(`  ✔ Clear rows:             ${fmt(clearRowsR)}`);
    await measureAction(`document.getElementById('clear').click()`);

    // Workload 8: Create 10,000 rows
    const create10kR = await measureDist(`document.getElementById('runlots').click()`, { reset: `document.getElementById('clear').click()` });
    const create10k = create10kR.median;
    console.log(`  ✔ Create 10,000 rows:     ${fmt(create10kR)}`);

    // Memory: post-GC retained heap (exposed via --js-flags=--expose-gc).
    // Pre-GC numbers swing 2× with collection timing; post-GC is the stable,
    // comparable figure. Both are recorded; tables quote post-GC.
    const perfPre = await send('Performance.getMetrics');
    let heapPreGcKB = 0;
    for (const m of perfPre.result.metrics) {
      if (m.name === 'JSHeapUsedSize') heapPreGcKB = parseFloat((m.value / 1024).toFixed(1));
    }
    await send('Runtime.evaluate', { expression: 'try { window.gc && window.gc(); } catch (e) {}' });
    await new Promise(r => setTimeout(r, 300));
    const perf = await send('Performance.getMetrics');
    let jsHeapKB = 0;
    for (const m of perf.result.metrics) {
      if (m.name === 'JSHeapUsedSize') jsHeapKB = (m.value / 1024).toFixed(1);
    }
    console.log(`  ✔ Retained JS Heap (post-GC): ${String(jsHeapKB).padStart(6)} KB (pre-GC ${heapPreGcKB} KB)`);

    // Cleanup page
    await measureAction(`document.getElementById('clear').click()`);

    allResults[fw] = {
      create1000: create1k,
      update10th: update10th,
      selectRow: selectRow,
      swapRows: swapRows,
      deleteRow: deleteRow,
      append1000: append1k,
      clearRows: clearRows,
      create10000: create10k,
      heapUsedKB: parseFloat(jsHeapKB),
      heapPreGcKB: heapPreGcKB,
      // Full distributions (median/p95/min/max/sd/n + samples) — flat medians
      // above stay backward-compatible; dist is the auditable record.
      dist: {
        create1000: create1kR,
        update10th: update10thR,
        selectRow: selectRowR,
        swapRows: swapRowsR,
        deleteRow: deleteRowR,
        append1000: append1kR,
        clearRows: clearRowsR,
        create10000: create10kR
      }
    };

    ws.close();
  }

  } finally {
    // Cleanup Chrome & Server
    try { chromeProc.kill(); } catch (_) {}
    server.close();
  }

  // Print comparison markdown table
  console.log(`\n================================================================`);
  console.log(`📊 FINAL KRAUSEST BENCHMARK RESULTS (HEADLESS CHROME)`);
  console.log(`================================================================\n`);

  console.log('| Benchmark Operation | Breeze | Vanilla JS | Preact 10 | Vue 3 | React 19 |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: |');
  const ops = [
    ['create1000', 'Create 1,000 rows (ms)'],
    ['update10th', 'Update every 10th row (ms)'],
    ['selectRow', 'Select row (ms)'],
    ['swapRows', 'Swap rows 4 & 997 (ms)'],
    ['deleteRow', 'Delete row (ms)'],
    ['append1000', 'Append 1,000 rows (ms)'],
    ['clearRows', 'Clear rows (ms)'],
    ['create10000', 'Create 10,000 rows (ms)'],
    ['heapUsedKB', 'Retained Memory (KB)']
  ];

  for (const [key, label] of ops) {
    const bz = allResults.breeze ? allResults.breeze[key] : 'N/A';
    const van = allResults.vanillajs ? allResults.vanillajs[key] : 'N/A';
    const pre = allResults.preact ? allResults.preact[key] : 'N/A';
    const vue = allResults.vue ? allResults.vue[key] : 'N/A';
    const rct = allResults.react ? allResults.react[key] : 'N/A';
    console.log(`| **${label}** | **${bz}** | ${van} | ${pre} | ${vue} | ${rct} |`);
  }

  const outJson = path.join(__dirname, 'results.json');
  fs.writeFileSync(outJson, JSON.stringify(allResults, null, 2), 'utf8');
  console.log(`\nRaw results saved to: ${outJson}\n`);

  return allResults;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Benchmark error:', err);
    process.exit(1);
  });
}

module.exports = { runKrausestBenchmark: main };

