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
  const RUNS = parseInt(process.env.BZ_BENCH_RUNS || '3', 10) || 3;

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

  console.log(`Launching Google Chrome (${chromePath})…`);
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`
  ]);

  await new Promise(r => setTimeout(r, 2000));

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

    const median = (arr) => {
      const s = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(s.length / 2);
      return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    };
    const stddev = (arr) => {
      if (arr.length < 2) return 0;
      const m = arr.reduce((a, b) => a + b, 0) / arr.length;
      return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1));
    };
    // Median-of-RUNS with rAF+setTimeout paint timing (note: rAF callback ≠ guaranteed paint)
    async function measureMedian(expr, { reset = null } = {}) {
      const samples = [];
      for (let r = 0; r < RUNS; r++) {
        samples.push(await measureAction(expr));
        if (reset) await measureAction(reset);
      }
      return { median: median(samples), sd: stddev(samples), samples };
    }

    // Workload 1: Create 1,000 rows
    const create1kR = await measureMedian(`document.getElementById('run').click()`, { reset: `document.getElementById('clear').click()` });
    const create1k = create1kR.median;
    console.log(`  ✔ Create 1,000 rows:      ${create1k.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${create1kR.sd.toFixed(2)})`);

    // Workload 2: Update every 10th row (needs rows present)
    await measureAction(`document.getElementById('run').click()`);
    const update10thR = await measureMedian(`document.getElementById('update').click()`);
    const update10th = update10thR.median;
    console.log(`  ✔ Update every 10th row:  ${update10th.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${update10thR.sd.toFixed(2)})`);

    // Workload 3: Select a row (row 5)
    const selectRowR = await measureMedian(`
      const lbl = document.querySelectorAll('.lbl')[4];
      if (lbl) lbl.click();
    `);
    const selectRow = selectRowR.median;
    console.log(`  ✔ Select row:             ${selectRow.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${selectRowR.sd.toFixed(2)})`);

    // Workload 4: Swap rows (row 4 and 997)
    const swapRowsR = await measureMedian(`document.getElementById('swaprows').click()`);
    const swapRows = swapRowsR.median;
    console.log(`  ✔ Swap rows 4 & 997:      ${swapRows.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${swapRowsR.sd.toFixed(2)})`);

    // Workload 5: Delete row
    const deleteRowR = await measureMedian(`
      const rm = document.querySelectorAll('.remove')[10];
      if (rm) rm.click();
    `);
    const deleteRow = deleteRowR.median;
    console.log(`  ✔ Delete single row:      ${deleteRow.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${deleteRowR.sd.toFixed(2)})`);

    // Workload 6: Append 1,000 rows
    const append1kR = await measureMedian(`document.getElementById('add').click()`);
    const append1k = append1kR.median;
    console.log(`  ✔ Append 1,000 rows:      ${append1k.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${append1kR.sd.toFixed(2)})`);

    // Workload 7: Clear rows
    const clearRowsR = await measureMedian(`document.getElementById('clear').click()`, { reset: `document.getElementById('run').click()` });
    const clearRows = clearRowsR.median;
    console.log(`  ✔ Clear rows:             ${clearRows.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${clearRowsR.sd.toFixed(2)})`);
    await measureAction(`document.getElementById('clear').click()`);

    // Workload 8: Create 10,000 rows
    const create10kR = await measureMedian(`document.getElementById('runlots').click()`, { reset: `document.getElementById('clear').click()` });
    const create10k = create10kR.median;
    console.log(`  ✔ Create 10,000 rows:     ${create10k.toFixed(2).padStart(6)} ms (median of ${RUNS}, sd ${create10kR.sd.toFixed(2)})`);

    // Memory metrics
    const perf = await send('Performance.getMetrics');
    let jsHeapKB = 0;
    for (const m of perf.result.metrics) {
      if (m.name === 'JSHeapUsedSize') jsHeapKB = (m.value / 1024).toFixed(1);
    }
    console.log(`  ✔ Retained JS Heap:       ${jsHeapKB.padStart(6)} KB`);

    // Cleanup page
    await measureAction(`document.getElementById('clear').click()`);

    allResults[fw] = {
      create1000: parseFloat(create1k.toFixed(2)),
      update10th: parseFloat(update10th.toFixed(2)),
      selectRow: parseFloat(selectRow.toFixed(2)),
      swapRows: parseFloat(swapRows.toFixed(2)),
      deleteRow: parseFloat(deleteRow.toFixed(2)),
      append1000: parseFloat(append1k.toFixed(2)),
      clearRows: parseFloat(clearRows.toFixed(2)),
      create10000: parseFloat(create10k.toFixed(2)),
      heapUsedKB: parseFloat(jsHeapKB)
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

  console.log('| Benchmark Operation | Breeze | Vanilla JS | Preact | Vue 3 | React 18 |');
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

