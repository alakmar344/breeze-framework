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

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const profileDir = 'C:\\Users\\proma\\AppData\\Local\\Temp\\chrome-krausest-profile';
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

    // Warmup
    await measureAction(`document.getElementById('run').click()`);
    await measureAction(`document.getElementById('clear').click()`);

    // Workload 1: Create 1,000 rows
    const create1k = await measureAction(`document.getElementById('run').click()`);
    console.log(`  ✔ Create 1,000 rows:      ${create1k.toFixed(2).padStart(6)} ms`);

    // Workload 2: Update every 10th row
    const update10th = await measureAction(`document.getElementById('update').click()`);
    console.log(`  ✔ Update every 10th row:  ${update10th.toFixed(2).padStart(6)} ms`);

    // Workload 3: Select a row (row 5)
    const selectRow = await measureAction(`
      const lbl = document.querySelectorAll('.lbl')[4];
      if (lbl) lbl.click();
    `);
    console.log(`  ✔ Select row:             ${selectRow.toFixed(2).padStart(6)} ms`);

    // Workload 4: Swap rows (row 4 and 997)
    const swapRows = await measureAction(`document.getElementById('swaprows').click()`);
    console.log(`  ✔ Swap rows 4 & 997:      ${swapRows.toFixed(2).padStart(6)} ms`);

    // Workload 5: Delete row
    const deleteRow = await measureAction(`
      const rm = document.querySelectorAll('.remove')[10];
      if (rm) rm.click();
    `);
    console.log(`  ✔ Delete single row:      ${deleteRow.toFixed(2).padStart(6)} ms`);

    // Workload 6: Append 1,000 rows
    const append1k = await measureAction(`document.getElementById('add').click()`);
    console.log(`  ✔ Append 1,000 rows:      ${append1k.toFixed(2).padStart(6)} ms`);

    // Workload 7: Clear rows
    const clearRows = await measureAction(`document.getElementById('clear').click()`);
    console.log(`  ✔ Clear rows:             ${clearRows.toFixed(2).padStart(6)} ms`);

    // Workload 8: Create 10,000 rows
    const create10k = await measureAction(`document.getElementById('runlots').click()`);
    console.log(`  ✔ Create 10,000 rows:     ${create10k.toFixed(2).padStart(6)} ms`);

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

  // Cleanup Chrome & Server
  chromeProc.kill();
  server.close();

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
}

main().catch(err => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
