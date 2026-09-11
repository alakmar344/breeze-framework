#!/usr/bin/env node
/**
 * DBMonster Benchmark Runner for Breeze Framework
 * Measures frame-callback throughput (reported in FPS units), frame times, and
 * dropped frames across Breeze, Vanilla JS, Preact 10, Vue 3, and React 19 in
 * headless Google Chrome. Headless CDP has no vsync, so FPS here means
 * processed frame callbacks per second — not display refresh rate.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(__dirname, 'vendor');
const dbmonsterDir = path.join(__dirname, 'dbmonster');

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];
const PORT = 4894;
const CDP_PORT = 9337;

// Static file server
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  if (reqPath === '/breeze.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(fs.readFileSync(path.join(rootDir, 'breeze.js')));
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
  if (reqPath.startsWith('/dbmonster/')) {
    const file = reqPath.replace('/dbmonster/', '');
    const fp = path.join(dbmonsterDir, file);
    if (fs.existsSync(fp)) {
      const ext = path.extname(fp);
      const ct = ext === '.css' ? 'text/css' : (ext === '.js' ? 'application/javascript' : 'text/html');
      res.writeHead(200, { 'Content-Type': ct });
      res.end(fs.readFileSync(fp));
      return;
    }
  }

  res.writeHead(404);
  res.end('Not Found');
});

async function runDbMonsterBenchmark() {
  await new Promise(r => server.listen(PORT, r));
  console.log('\n================================================================');
  console.log('👾 DBMONSTER FRAME-CALLBACK THROUGHPUT BENCHMARK (FPS = callbacks/sec, headless — no vsync)');
  console.log('================================================================');
  console.log(`Test server running on http://127.0.0.1:${PORT}`);

  const os = require('os');
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
    try {
      const { execSync } = require('child_process');
      const cmd = process.platform === 'win32' ? 'where chrome' : 'which google-chrome || which chromium || which chromium-browser || which chrome';
      const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      if (out.length) return out[0];
    } catch (_) {}
    return candidates[1];
  }

  const chromePath = resolveChromePath();
  const profileDir = path.join(os.tmpdir(), 'chrome-dbmonster-profile');
  if (!fs.existsSync(chromePath)) {
    console.error(`Chrome not found at ${chromePath}. Set CHROME_PATH env var.`);
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

  const results = {};

  try {
    for (const fw of frameworks) {
      console.log(`Benchmarking DBMonster: [ ${fw.toUpperCase()} ] ...`);
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

      // Navigate to framework page
      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/dbmonster/${fw}.html` });

      // Poll for window.__DBMONSTER_RESULTS__
      let metric = null;
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise(r => setTimeout(r, 200));
        const check = await send('Runtime.evaluate', {
          expression: 'window.__DBMONSTER_RESULTS__',
          returnByValue: true
        });
        if (check.result && check.result.result && check.result.result.value) {
          metric = check.result.result.value;
          break;
        }
      }

      // Memory: post-GC retained heap (stable) + pre-GC (for the record).
      // GC timing swings single-shot heap readings ~2×, so tables quote post-GC.
      const perfPre = await send('Performance.getMetrics');
      let heapPreGcKB = 0;
      if (perfPre && perfPre.result && perfPre.result.metrics) {
        for (const m of perfPre.result.metrics) {
          if (m.name === 'JSHeapUsedSize') heapPreGcKB = parseFloat((m.value / 1024).toFixed(1));
        }
      }
      await send('Runtime.evaluate', { expression: 'try { window.gc && window.gc(); } catch (e) {}' });
      await new Promise(r => setTimeout(r, 300));
      const perf = await send('Performance.getMetrics');
      let jsHeapKB = 0;
      if (perf && perf.result && perf.result.metrics) {
        for (const m of perf.result.metrics) {
          if (m.name === 'JSHeapUsedSize') jsHeapKB = parseFloat((m.value / 1024).toFixed(1));
        }
      }

      ws.close();

      if (metric) {
        const { summarize } = require('./stats.js');
        const frames = summarize(metric.frameMs || []);
        results[fw] = {
          fps: metric.fps,
          avgFrameTimeMs: metric.avgFrameTime,
          droppedFrames: metric.droppedFrames,
          totalElapsedMs: metric.totalElapsed,
          heapUsedKB: jsHeapKB,
          heapPreGcKB: heapPreGcKB,
          // Distribution over the 99 sampled frames (median/p95/min/max/sd).
          frameMs: frames
        };
        console.log(`  ✔ ${metric.fps} callbacks/s | Avg frame: ${metric.avgFrameTime} ms (median ${frames.median}, p95 ${frames.p95}) | Dropped: ${metric.droppedFrames} | Heap post-GC: ${jsHeapKB} KB (pre-GC ${heapPreGcKB} KB)`);
      } else {
        console.warn(`  ⚠ Timed out waiting for DBMonster benchmark on ${fw}`);
      }
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    server.close();
  }

  console.log('\n| Framework | Frame callbacks/s (FPS) | Mean Frame Time (ms) | Dropped Frames (>16.6ms) | Heap post-GC (KB) |');
  console.log('| :--- | :---: | :---: | :---: | :---: |');
  for (const fw of frameworks) {
    const d = results[fw];
    if (d) {
      console.log(`| **${fw}** | **${d.fps} FPS** | ${d.avgFrameTimeMs} ms | ${d.droppedFrames} / 99 | ${d.heapUsedKB} KB |`);
    }
  }
  console.log('');

  return results;
}

if (require.main === module) {
  runDbMonsterBenchmark().catch(err => {
    console.error('DBMonster benchmark failed:', err);
    process.exit(1);
  });
}

module.exports = { runDbMonsterBenchmark };
