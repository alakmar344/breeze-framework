#!/usr/bin/env node
/**
 * Page-load benchmark (answers: how does the app ARRIVE, not just mutate?).
 * Loads equivalent 50-card pages in Breeze / Vanilla / Preact / Vue / React,
 * waits until 50 .card nodes exist (uniform readiness for every framework),
 * then reads Navigation-timing-style metrics via Performance.getMetrics:
 * DomContentLoaded, FirstMeaningfulPaint, ScriptDuration, LayoutDuration.
 *
 * Two modes per framework:
 *   desktop  — default viewport, no throttling
 *   mobile   — EMULATED Moto G4 (360x640, DPR 3) + 4x CPU throttle. This is an
 *              approximation, NOT a real device (see benchmark.md §8).
 *
 * Transfer bytes are measured server-side (raw file bytes; gzip in §4).
 * Usage: node benchmarks/page-load-runner.js [--runs=N] [--mobile-only|--desktop-only]
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
const pageDir = path.join(__dirname, 'pageload');
const PORT = 4898;
const CDP_PORT = 9342;

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];

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
  if (reqPath.startsWith('/pageload/')) {
    const fp = path.join(pageDir, reqPath.replace('/pageload/', ''));
    if (fs.existsSync(fp)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(fp));
      return;
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

function pageBytes(fw) {
  const html = fs.readFileSync(path.join(pageDir, `${fw}.html`));
  let js = 0;
  const src = html.toString();
  const vendorMatch = [...src.matchAll(/src="(\/vendor\/[^"]+|\/breeze\.js)"/g)].map(m => m[1]);
  for (const v of vendorMatch) {
    const fp = v === '/breeze.js' ? path.join(rootDir, 'breeze.js') : path.join(vendorDir, v.replace('/vendor/', ''));
    if (fs.existsSync(fp)) js += fs.statSync(fp).size;
  }
  return { htmlBytes: html.length, jsBytes: js };
}

async function runPageLoad() {
  const args = process.argv.slice(2);
  const runsArg = args.find(a => a.startsWith('--runs='));
  const RUNS = parseInt((runsArg || '').split('=')[1] || '3', 10) || 3;
  const modes = args.includes('--mobile-only') ? ['mobile']
    : args.includes('--desktop-only') ? ['desktop'] : ['desktop', 'mobile'];

  await new Promise(r => server.listen(PORT, r));
  const chromeProc = spawn(resolveChromePath(), [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu',
    '--no-first-run', '--no-default-browser-check', '--js-flags=--expose-gc',
    `--user-data-dir=${path.join(os.tmpdir(), 'chrome-pageload-profile')}`
  ]);
  chromeProc.on('error', e => console.error('Chrome launch failed: ' + e.message));

  const results = {};
  try {
    await waitForCdp(20000);
    for (const mode of modes) {
      results[mode] = {};
      console.log(`\n==== page-load [${mode}] ====`);
      if (mode === 'mobile') {
        console.log('(emulated Moto G4 360x640 DPR3 + 4x CPU throttle — approximation, not a real device)');
      }
      for (const fw of frameworks) {
        const bytes = pageBytes(fw);
        const dcl = [], fmp = [], script = [], layout = [];
        for (let i = 0; i < RUNS; i++) {
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
          await send('Page.enable');
          await send('Runtime.enable');
          await send('Performance.enable');
          if (mode === 'mobile') {
            await send('Emulation.setDeviceMetricsOverride', {
              width: 360, height: 640, deviceScaleFactor: 3, mobile: true
            });
            await send('Emulation.setCPUThrottlingRate', { rate: 4 });
          }
          const t0 = Date.now();
          await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/pageload/${fw}.html?nocache=${Date.now()}` });
          // Uniform readiness: 50 .card nodes present (all frameworks alike).
          let ready = false;
          for (let a = 0; a < 100 && !ready; a++) {
            await new Promise(r => setTimeout(r, 100));
            try {
              const check = await send('Runtime.evaluate', {
                expression: `document.querySelectorAll('.card').length`,
                returnByValue: true
              });
              if (check.result && check.result.result && check.result.result.value >= 50) ready = true;
            } catch (_) {}
          }
          const navMs = Date.now() - t0;
          // Wait for FirstMeaningfulPaint to be computed (it lags DOM readiness),
          // then read metrics. All timestamps are seconds-since-boot — make them
          // navigation-relative via NavigationStart.
          let metrics = {};
          for (let a = 0; a < 50; a++) {
            const perf = await send('Performance.getMetrics');
            if (perf && perf.result && perf.result.metrics) {
              metrics = {};
              for (const m of perf.result.metrics) metrics[m.name] = m.value;
            }
            if (metrics.FirstMeaningfulPaint > 0) break;
            await new Promise(r => setTimeout(r, 100));
          }
          const tNav = metrics.NavigationStart || 0;
          const rel = (v) => (v != null && v > 0 && tNav > 0 ? (v - tNav) * 1000 : navMs);
          dcl.push(rel(metrics.DomContentLoaded));
          fmp.push(rel(metrics.FirstMeaningfulPaint));
          script.push((metrics.ScriptDuration || 0) * 1000);
          layout.push(((metrics.LayoutDuration || 0) + (metrics.RecalcStyleDuration || 0)) * 1000);
          try { await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`, { method: 'PUT' }); } catch (_) {}
          ws.close();
        }
        results[mode][fw] = {
          domContentLoadedMs: summarize(dcl),
          firstMeaningfulPaintMs: summarize(fmp),
          scriptMs: summarize(script),
          layoutStyleMs: summarize(layout),
          htmlBytes: bytes.htmlBytes,
          jsBytes: bytes.jsBytes
        };
        const r = results[mode][fw];
        console.log(`  ✔ ${fw.padEnd(10)} DCL ${r.domContentLoadedMs.median.toFixed(1)} ms | FMP ${r.firstMeaningfulPaintMs.median.toFixed(1)} ms | script ${r.scriptMs.median.toFixed(1)} ms | layout ${r.layoutStyleMs.median.toFixed(1)} ms | ${(bytes.htmlBytes + bytes.jsBytes) / 1024 < 1024 ? ((bytes.htmlBytes + bytes.jsBytes) / 1024).toFixed(1) + ' KB' : 'big'} transfer`);
      }
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    server.close();
  }
  return results;
}

if (require.main === module) {
  runPageLoad()
    .then(r => {
      console.log('\npage-load results (medians):');
      for (const mode of Object.keys(r)) {
        console.log(` [${mode}]`);
        for (const fw of Object.keys(r[mode])) {
          const d = r[mode][fw];
          console.log(`  ${fw}: DCL ${d.domContentLoadedMs.median}ms, FMP ${d.firstMeaningfulPaintMs.median}ms, script ${d.scriptMs.median}ms`);
        }
      }
    })
    .catch(e => { console.error('page-load failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
}
module.exports = { runPageLoad };
