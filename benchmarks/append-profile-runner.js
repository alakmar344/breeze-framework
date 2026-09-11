#!/usr/bin/env node
/**
 * Append profiler for Breeze (answers: where do bulk-append ms go?).
 * Uses CDP Tracing (devtools.timeline + v8.execute + GC) around one
 * 1,000-row append on the Krausest Breeze page, then aggregates trace
 * slices by phase: script evaluation, layout, layer update, paint, GC.
 * Optionally profiles the React 19 page too for context (--react).
 *
 * Usage: node benchmarks/append-profile-runner.js [--react] [--runs=N]
 * Requires: headless Chrome (CHROME_PATH respected).
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(__dirname, 'vendor');
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
  for (const fw of ['breeze', 'react']) {
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

async function main() {
  const args = process.argv.slice(2);
  const frameworks = args.includes('--react') ? ['breeze', 'react'] : ['breeze'];
  const runs = parseInt((args.find(a => a.startsWith('--runs=')) || '').split('=')[1] || '2', 10) || 2;

  await new Promise(r => server.listen(PORT, r));
  const chromeProc = spawn(resolveChromePath(), [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu',
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(os.tmpdir(), 'chrome-append-profile')}`
  ]);
  chromeProc.on('error', e => console.error('Chrome launch failed: ' + e.message));

  try {
    await waitForCdp(20000);
    for (const fw of frameworks) {
      console.log(`\nProfiling append on [ ${fw.toUpperCase()} ] (${runs} traced runs)`);
      const tab = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new`, { method: 'PUT' }).then(r => r.json());
      const ws = new WebSocket(tab.webSocketDebuggerUrl);
      let msgId = 1;
      const pending = new Map();
      const traceChunks = [];
      let tracingCompleteResolve = null;
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.method === 'Tracing.dataCollected') {
          traceChunks.push(data.params.value || []);
        } else if (data.method === 'Tracing.tracingComplete') {
          if (tracingCompleteResolve) tracingCompleteResolve();
        } else if (data.id && pending.has(data.id)) {
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
          throw new Error('page eval failed: ' + JSON.stringify(res.result.exceptionDetails).slice(0, 300));
        }
        return res.result && res.result.result && res.result.result.value;
      };

      await send('Page.enable');
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${fw}/index.html` });
      await new Promise(r => setTimeout(r, 1200));
      // Baseline state: 1,000 rows present, then settle.
      await evalJs(`document.getElementById('run').click()`);
      await new Promise(r => setTimeout(r, 1500));

      const phaseTotals = {};
      const gcTotals = { count: 0, durUs: 0 };
      let handlerMs = [];
      for (let i = 0; i < runs; i++) {
        traceChunks.length = 0;
        await send('Tracing.start', {
          traceConfig: {
            includedCategories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-v8.gc'],
            excludedCategories: ['*']
          }
        });
        // Time just the synchronous click handler via performance.now() around dispatch.
        const t = await evalJs(`new Promise(resolve => {
          const btn = document.getElementById('add');
          const t0 = performance.now();
          btn.click();
          const handlerMs = performance.now() - t0;
          requestAnimationFrame(() => setTimeout(() => resolve(handlerMs), 600));
        })`, true);
        handlerMs.push(t);
        const done = new Promise(r => { tracingCompleteResolve = r; });
        await send('Tracing.end');
        await done;
        const events = traceChunks.flat();
        for (const ev of events) {
          if (typeof ev.dur !== 'number' || ev.dur < 0) continue;
          const name = ev.name || '(unknown)';
          const cat = ev.cat || '';
          if (/gc|GC|Heap|MinorGC|MajorGC/.test(name) || /disabled-by-default-v8.gc/.test(cat)) {
            gcTotals.count++;
            gcTotals.durUs += ev.dur;
            continue;
          }
          phaseTotals[name] = (phaseTotals[name] || 0) + ev.dur;
        }
        // Reset to baseline row count for the next traced run.
        await evalJs(`document.getElementById('clear').click()`);
        await new Promise(r => setTimeout(r, 800));
        await evalJs(`document.getElementById('run').click()`);
        await new Promise(r => setTimeout(r, 1200));
      }

      const med = (arr) => {
        const s = [...arr].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
      };
      console.log(`  click-handler (sync JS, median of ${runs}): ${med(handlerMs).toFixed(2)} ms`);
      const rows = Object.entries(phaseTotals)
        .map(([name, us]) => ({ name, ms: us / 1000 / runs }))
        .sort((a, b) => b.ms - a.ms)
        .slice(0, 14);
      console.log('  trace phases per append (mean ms):');
      for (const r of rows) console.log(`    ${r.ms.toFixed(2).padStart(9)} ms  ${r.name}`);
      console.log(`    ${(gcTotals.durUs / 1000 / runs).toFixed(2).padStart(9)} ms  [GC total, ${Math.round(gcTotals.count / runs)}/run]`);
      ws.close();
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    server.close();
  }
}

if (require.main === module) {
  main().catch(e => { console.error('append-profile failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
}
module.exports = { main };
