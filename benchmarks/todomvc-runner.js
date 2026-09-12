#!/usr/bin/env node
/**
 * Suite 1: Full-Stack TodoMVC Interactive App Benchmark
 * Measures realistic multi-step user flows across all 5 frameworks
 * in headless Chrome via Chrome DevTools Protocol (CDP).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { performance } = require('perf_hooks');
const { summarize } = require('./stats.js');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(__dirname, 'vendor');
const todomvcDir = path.join(__dirname, 'todomvc');

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];
const PORT = 4897;
const CDP_PORT = 9341;

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
      const fp = path.join(todomvcDir, `${fw}.html`);
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

async function runTodoMvcBenchmark(runsArg) {
  const RUNS = runsArg || Number(process.env.BZ_BENCH_RUNS) || 7;
  await new Promise(r => server.listen(PORT, r));

  const chromeBin = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tmpProfile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'breeze-cdp-todomvc-'));

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
      console.log(`\n[TodoMVC] Benchmarking: ${fw.toUpperCase()}`);
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

      async function measureAction(expr) {
        const fullExpr = `
          new Promise(resolve => {
            const t0 = performance.now();
            ${expr};
            requestAnimationFrame(() => {
              setTimeout(() => {
                resolve(performance.now() - t0);
              }, 0);
            });
          })
        `;
        const res = await send('Runtime.evaluate', { expression: fullExpr, awaitPromise: true, returnByValue: true });
        return res.result.result.value;
      }

      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${fw}/index.html` });
      await new Promise(r => setTimeout(r, 500));

      // Warmup
      await measureAction(`document.getElementById('btn-create').click()`);
      await measureAction(`document.getElementById('btn-clear-all').click()`);

      const steps = [
        { key: 'create100', btn: 'btn-create', label: 'Create 100 items' },
        { key: 'toggle50', btn: 'btn-toggle', label: 'Toggle 50 completed' },
        { key: 'filterActive', btn: 'btn-filter-active', label: 'Filter active' },
        { key: 'filterCompleted', btn: 'btn-filter-completed', label: 'Filter completed' },
        { key: 'filterAll', btn: 'btn-filter-all', label: 'Filter all' },
        { key: 'edit20', btn: 'btn-edit', label: 'Edit 20 items' },
        { key: 'clearCompleted', btn: 'btn-clear-completed', label: 'Clear completed' }
      ];

      const metrics = {};
      const totals = [];

      for (let r = 0; r < RUNS; r++) {
        await measureAction(`document.getElementById('btn-clear-all').click()`);
        let runTotal = 0;
        for (const s of steps) {
          if (!metrics[s.key]) metrics[s.key] = [];
          const ms = await measureAction(`document.getElementById('${s.btn}').click()`);
          metrics[s.key].push(ms);
          runTotal += ms;
        }
        totals.push(runTotal);
      }

      results[fw] = {
        totalScenario: summarize(totals)
      };
      for (const s of steps) {
        results[fw][s.key] = summarize(metrics[s.key]);
        console.log(`  ✔ ${s.label.padEnd(24)}: ${results[fw][s.key].median.toFixed(2).padStart(6)} ms`);
      }
      console.log(`  ⭐ Total User Story Flow   : ${results[fw].totalScenario.median.toFixed(2).padStart(6)} ms`);

      ws.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`).catch(() => {});
      // Enterprise practice: thermal cooldown pause between framework runs to prevent CPU throttling
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
    await new Promise(r => server.close(r));
  }

  return results;
}

if (require.main === module) {
  runTodoMvcBenchmark().then(res => {
    console.log('\nFinal TodoMVC Results:', JSON.stringify(res, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('TodoMVC runner error:', err);
    process.exit(1);
  });
}

module.exports = { runTodoMvcBenchmark };
