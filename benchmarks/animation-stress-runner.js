#!/usr/bin/env node
/**
 * Suite 2: 60 FPS Sustained Animation & Jank Stress Benchmark
 * Measures high-frequency RAF frame duration, dropped frames (>16.67ms budget),
 * and frame pacing stability across all 5 frameworks in headless Chrome via CDP.
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
const animDir = path.join(__dirname, 'animation');

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];
const PORT = 4898;
const CDP_PORT = 9342;

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
      const fp = path.join(animDir, `${fw}.html`);
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

async function runAnimationStressBenchmark(framesCount = 100) {
  await new Promise(r => server.listen(PORT, r));

  const chromeBin = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tmpProfile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'breeze-cdp-anim-'));

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
      console.log(`\n[Animation Stress] Benchmarking: ${fw.toUpperCase()}`);
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

      // Warmup 20 frames
      await send('Runtime.evaluate', {
        expression: `new Promise(res => window.__startAnimation(20, res))`,
        awaitPromise: true,
        returnByValue: true
      });

      // Measured animation run
      const evalRes = await send('Runtime.evaluate', {
        expression: `new Promise(res => window.__startAnimation(${framesCount}, res))`,
        awaitPromise: true,
        returnByValue: true
      });

      const frameTimes = evalRes.result.result.value || [];
      const stats = summarize(frameTimes);
      const dropped = frameTimes.filter(t => t > 16.67).length;
      const jankPct = +((dropped / frameTimes.length) * 100).toFixed(1);
      const effectiveFps = +(1000 / (stats.median || 16.67)).toFixed(1);

      results[fw] = {
        frames: frameTimes.length,
        frameStats: stats,
        droppedFrames: dropped,
        jankPct,
        effectiveFps
      };

      console.log(`  ✔ Median Frame Time : ${stats.median.toFixed(2).padStart(6)} ms (p95 ${stats.p95.toFixed(2)} ms, max ${stats.max.toFixed(2)} ms)`);
      console.log(`  ✔ Effective FPS     : ${effectiveFps.toFixed(1).padStart(6)} fps`);
      console.log(`  ✔ Dropped Frames    : ${String(dropped).padStart(6)} / ${frameTimes.length} (${jankPct}% jank)`);

      ws.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`).catch(() => {});
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
    await new Promise(r => server.close(r));
  }

  return results;
}

if (require.main === module) {
  runAnimationStressBenchmark().then(res => {
    console.log('\nFinal Animation Stress Results:', JSON.stringify(res, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('Animation runner error:', err);
    process.exit(1);
  });
}

module.exports = { runAnimationStressBenchmark };
