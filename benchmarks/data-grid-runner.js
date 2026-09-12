#!/usr/bin/env node
/**
 * Suite 4: Enterprise Data Grid Benchmark (5,000 rows x 6 cols = 30,000 cells)
 * Measures realistic operational throughput:
 * - Initial 5,000-row table creation
 * - Multi-column Sort (salary desc, name asc)
 * - Text Search Filter (~1,600 rows)
 * - Reset Filter (back to 5,000 rows)
 * - Batch Cell Update (in-place modification of 1,000 rows)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { summarize } = require('./stats.js');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(__dirname, 'vendor');
const gridDir = path.join(__dirname, 'datagrid');

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];
const actions = ['render', 'sort', 'filter', 'reset', 'update'];
const PORT = 4900;
const CDP_PORT = 9344;

const server = http.createServer((req, res) => {
  const reqPath = req.url.split('?')[0];
  if (reqPath === '/breeze.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(path.join(rootDir, 'breeze.js')));
    return;
  }
  if (reqPath.startsWith('/vendor/')) {
    const fp = path.join(vendorDir, reqPath.replace('/vendor/', ''));
    if (fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      res.end(fs.readFileSync(fp));
      return;
    }
  }
  for (const fw of frameworks) {
    if (reqPath === `/${fw}` || reqPath === `/${fw}/` || reqPath === `/${fw}/index.html`) {
      const fp = path.join(gridDir, `${fw}.html`);
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

async function runDataGridBenchmark(iterations = 5) {
  iterations = Number(process.env.BZ_BENCH_RUNS) || iterations || 5;
  await new Promise(r => server.listen(PORT, r));

  const chromeBin = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tmpProfile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'breeze-cdp-grid-'));

  const chromeProc = spawn(chromeBin, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${tmpProfile}`
  ]);

  async function waitForCdp(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
        if (res.ok) return;
      } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error('CDP timed out');
  }

  await waitForCdp();

  const results = {};

  try {
    for (const fw of frameworks) {
      console.log(`\n[Data Grid 5k] Benchmarking: ${fw.toUpperCase()}`);
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
        return new Promise(res => {
          const id = msgId++;
          pending.set(id, res);
          ws.send(JSON.stringify({ id, method, params }));
        });
      }

      await send('Page.enable');
      await send('Runtime.enable');

      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${fw}/index.html` });
      await new Promise(r => setTimeout(r, 600));

      // Wait until ready
      for (let i = 0; i < 50; i++) {
        const ready = await send('Runtime.evaluate', {
          expression: 'window.__framework_ready === true',
          returnByValue: true
        });
        if (ready.result && ready.result.result && ready.result.result.value) break;
        await new Promise(r => setTimeout(r, 100));
      }

      async function runAction(action) {
        const evalRes = await send('Runtime.evaluate', {
          expression: `new Promise(res => window.__runGridAction('${action}', res))`,
          awaitPromise: true,
          returnByValue: true
        });
        return (evalRes.result && evalRes.result.result && evalRes.result.result.value) || 0;
      }

      // Warmup pass
      await runAction('render');
      await runAction('reset');

      const actionSamples = { render: [], sort: [], filter: [], reset: [], update: [] };

      for (let it = 1; it <= iterations; it++) {
        for (const act of actions) {
          const dur = await runAction(act);
          actionSamples[act].push(dur);
          await new Promise(r => setTimeout(r, 100));
        }
      }

      const fwSummary = {};
      let totalTime = 0;
      for (const act of actions) {
        const s = summarize(actionSamples[act]);
        fwSummary[act] = s;
        totalTime += s.median;
        console.log(`  ✔ ${act.padEnd(8)}: ${s.median.toFixed(1).padStart(7)} ms (p95 ${s.p95.toFixed(1).padStart(6)} ms, min ${s.min.toFixed(1)} ms)`);
      }
      fwSummary.totalGridPipelineMs = +totalTime.toFixed(1);
      console.log(`  ✔ TOTAL   : ${totalTime.toFixed(1).padStart(7)} ms`);

      results[fw] = fwSummary;

      ws.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`);
      // Enterprise practice: thermal cooldown pause between framework runs to prevent CPU throttling
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }

  return results;
}

if (require.main === module) {
  runDataGridBenchmark(3).then(results => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('       SUITE 4: ENTERPRISE DATA GRID (5k ROWS) RESULTS         ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}

module.exports = { runDataGridBenchmark };
