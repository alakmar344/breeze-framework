#!/usr/bin/env node
/**
 * Suite 3: Multi-Cycle Memory Stress & Retained Heap Leak Benchmark
 * Measures heap baseline, peak heap during 25 state updates across 1,000 components,
 * final heap after unmount + forced GC, retained delta (leak check), and bytes/component.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const vendorDir = path.join(__dirname, 'vendor');
const memDir = path.join(__dirname, 'memory');

const frameworks = ['breeze', 'vanillajs', 'preact', 'vue', 'react'];
const PORT = 4899;
const CDP_PORT = 9343;

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
      const fp = path.join(memDir, `${fw}.html`);
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

async function runMemoryLeakBenchmark(cyclesCount = 5, updatesPerCycle = 25) {
  await new Promise(r => server.listen(PORT, r));

  const chromeBin = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const tmpProfile = fs.mkdtempSync(path.join(require('os').tmpdir(), 'breeze-cdp-mem-'));

  const chromeProc = spawn(chromeBin, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--js-flags=--expose-gc',
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
      console.log(`\n[Memory Stress] Benchmarking: ${fw.toUpperCase()}`);
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
      await send('HeapProfiler.enable');

      await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/${fw}/index.html` });
      await new Promise(r => setTimeout(r, 800));

      // Wait until ready
      for (let i = 0; i < 50; i++) {
        const ready = await send('Runtime.evaluate', {
          expression: 'window.__framework_ready === true',
          returnByValue: true
        });
        if (ready.result && ready.result.result && ready.result.result.value) break;
        await new Promise(r => setTimeout(r, 100));
      }

      // Initial forced GC
      await send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 200));
      await send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 200));

      async function getUsedHeap() {
        const res = await send('Runtime.evaluate', {
          expression: 'performance.memory ? performance.memory.usedJSHeapSize : 0',
          returnByValue: true
        });
        return (res.result && res.result.result && res.result.result.value) || 0;
      }

      const baselineBytes = await getUsedHeap();
      let maxPeakBytes = baselineBytes;

      process.stdout.write('  Cycles: ');
      for (let cycle = 1; cycle <= cyclesCount; cycle++) {
        process.stdout.write(`[${cycle}/${cyclesCount}] `);
        // Mount 1,000 components
        await send('Runtime.evaluate', { expression: 'window.__mount1000()', returnByValue: true });
        await new Promise(r => setTimeout(r, 100));

        // Update state
        await send('Runtime.evaluate', { expression: `window.__runUpdates(${updatesPerCycle})`, returnByValue: true });
        await new Promise(r => setTimeout(r, 100));

        const peak = await getUsedHeap();
        if (peak > maxPeakBytes) maxPeakBytes = peak;

        // Unmount
        await send('Runtime.evaluate', { expression: 'window.__unmountAll()', returnByValue: true });
        await new Promise(r => setTimeout(r, 100));

        // Force GC after each unmount
        await send('HeapProfiler.collectGarbage');
        await new Promise(r => setTimeout(r, 100));
      }
      console.log('');

      // Final GC
      await send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 200));
      await send('HeapProfiler.collectGarbage');
      await new Promise(r => setTimeout(r, 200));

      const finalBytes = await getUsedHeap();

      const baselineMB = +(baselineBytes / (1024 * 1024)).toFixed(2);
      const peakMB = +(maxPeakBytes / (1024 * 1024)).toFixed(2);
      const finalMB = +(finalBytes / (1024 * 1024)).toFixed(2);
      const retainedKB = +((finalBytes - baselineBytes) / 1024).toFixed(1);
      const bytesPerComp = +Math.max(0, (maxPeakBytes - baselineBytes) / 1000).toFixed(0);

      results[fw] = {
        cycles: cyclesCount,
        updatesPerCycle,
        baselineMB,
        peakMB,
        finalMB,
        retainedKB,
        bytesPerComponent: bytesPerComp
      };

      console.log(`  ✔ Baseline Heap   : ${baselineMB.toFixed(2).padStart(6)} MB`);
      console.log(`  ✔ Peak Heap (1k)  : ${peakMB.toFixed(2).padStart(6)} MB (${bytesPerComp} B/comp)`);
      console.log(`  ✔ Final Post-GC   : ${finalMB.toFixed(2).padStart(6)} MB`);
      console.log(`  ✔ Retained Delta  : ${retainedKB >= 0 ? '+' : ''}${retainedKB.toFixed(1).padStart(6)} KB ${Math.abs(retainedKB) < 500 ? '(No leak detected)' : '(Retained heap detected)'}`);

      ws.close();
      await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`);
    }
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }

  return results;
}

if (require.main === module) {
  runMemoryLeakBenchmark(5, 25).then(results => {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('       SUITE 3: MULTI-CYCLE MEMORY STRESS & LEAK RESULTS       ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error('Benchmark failed:', err);
    process.exit(1);
  });
}

module.exports = { runMemoryLeakBenchmark };
