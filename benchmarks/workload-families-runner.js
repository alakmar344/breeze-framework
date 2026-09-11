#!/usr/bin/env node
/**
 * Workload-families benchmark (answers: are we fast BEYOND big tables?).
 * Three shapes × five frameworks in headless Chrome via CDP:
 *   wide — 1 parent + 1,000 children, build + insert
 *   deep — 25 nested levels, build + insert
 *   form — 100 inputs, programmatic typing + per-input state update
 * Each workload is click-to-settle timing (rAF + drain), full distributions.
 * Idiomatic code per framework; see benchmarks/workloads/*.html.
 *
 * Usage: node benchmarks/workload-families-runner.js [--runs=N]
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { summarize } = require('./stats.js');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(__dirname, 'vendor');
const workloadsDir = path.join(__dirname, 'workloads');
const PORT = 4896;
const CDP_PORT = 9340;

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];
const workloads = [
  { id: 'wide', button: 'f-wide', label: 'Wide tree (1x1000)' },
  { id: 'deep', button: 'f-deep', label: 'Deep tree (25 levels)' },
  { id: 'form', button: 'f-form', label: 'Form typing (100 inputs)' }
];

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
      const fp = path.join(workloadsDir, `${fw}.html`);
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
  return candidates[1];
}

async function waitForCdp(timeoutMs) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      if (res.ok) return;
    } catch (_) {}
    if (Date.now() - start > timeoutMs) throw new Error(`CDP not reachable on :${CDP_PORT}`);
    await new Promise(r => setTimeout(r, 250));
  }
}

async function runWorkloadFamilies() {
  const args = process.argv.slice(2);
  const runsArg = args.find(a => a.startsWith('--runs='));
  const RUNS = parseInt((runsArg || '').split('=')[1] || '5', 10) || 5;

  await new Promise(r => server.listen(PORT, r));
  console.log('\n================================================================');
  console.log('🧬 WORKLOAD FAMILIES (wide / deep / form) — HEADLESS CHROME');
  console.log('================================================================');
  const chromeProc = spawn(resolveChromePath(), [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--js-flags=--expose-gc',
    `--user-data-dir=${path.join(os.tmpdir(), 'chrome-families-profile')}`
  ]);
  chromeProc.on('error', e => console.error('Chrome launch failed: ' + e.message));

  const results = {};
  try {
    await waitForCdp(20000);
    for (const fw of frameworks) {
      console.log(`\nFramework: [ ${fw.toUpperCase()} ]`);
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
      await new Promise(r => { ws.onopen = r; });
      const send = (method, params = {}) => new Promise((resolve) => {
        const id = msgId++;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
      const evalJs = async (expression, awaitPromise) => {
        const res = await send('Runtime.evaluate', { expression, awaitPromise: !!awaitPromise, returnByValue: true });
        if (res.result && res.result.exceptionDetails) {
          throw new Error('page eval failed: ' + JSON.stringify(res.result.exceptionDetails).slice(0, 200));
        }
        return res.result && res.result.result && res.result.result.value;
      };
      const measure = (expr) => evalJs(`new Promise(resolve => {
        const t0 = performance.now();
        ${expr};
        requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - t0), 50));
      })`, true);

      await send('Page.enable');
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${fw}/index.html` });
      await new Promise(r => setTimeout(r, 1000));
      results[fw] = {};
      for (const w of workloads) {
        const samples = [];
        for (let i = 0; i < RUNS; i++) {
          samples.push(await measure(`document.getElementById('${w.button}').click()`));
          await evalJs(`document.getElementById('f-clear').click()`);
          await new Promise(r => setTimeout(r, 200));
        }
        const dist = summarize(samples);
        results[fw][w.id] = dist;
        console.log(`  ✔ ${w.label.padEnd(26)} ${dist.median.toFixed(2).padStart(8)} ms (p95 ${dist.p95.toFixed(2)}, sd ${dist.sd.toFixed(2)}, n=${dist.n})`);
      }
      ws.close();
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    server.close();
  }
  return results;
}

if (require.main === module) {
  runWorkloadFamilies()
    .then(r => {
      console.log('\n| Workload | Breeze | Vanilla | Preact | Vue | React 19 |');
      console.log('| :--- | :---: | :---: | :---: | :---: | :---: |');
      for (const w of workloads) {
        const row = [w.label];
        for (const fw of frameworks) row.push(r[fw][w.id].median + ' ms');
        console.log(`| ${row.join(' | ')} |`);
      }
    })
    .catch(e => { console.error('families failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
}
module.exports = { runWorkloadFamilies };
