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

const { resolveChromePath, waitForCdp: waitForCdpAt } = require('./lib/chrome.js');
const { writeReport } = require('./lib/report.js');

async function main() {
  const args = process.argv.slice(2);
  const frameworks = args.includes('--react') ? ['breeze', 'react'] : ['breeze'];
  const runs = parseInt((args.find(a => a.startsWith('--runs=')) || '').split('=')[1] || '2', 10) || 2;

  await new Promise(r => server.listen(PORT, r));
  let resolvedChromePath;
  try {
    resolvedChromePath = resolveChromePath();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const chromeProc = spawn(resolvedChromePath, [
    '--headless=new', `--remote-debugging-port=${CDP_PORT}`, '--disable-gpu',
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${path.join(os.tmpdir(), 'chrome-append-profile')}`
  ]);
  chromeProc.on('error', e => console.error('Chrome launch failed: ' + e.message));

  const reportData = {};
  try {
    await waitForCdpAt(CDP_PORT, 20000);
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
      const gcMs = gcTotals.durUs / 1000 / runs;
      console.log(`    ${gcMs.toFixed(2).padStart(9)} ms  [GC total, ${Math.round(gcTotals.count / runs)}/run]`);
      ws.close();

      reportData[fw] = {
        clickHandlerMedianMs: +med(handlerMs).toFixed(2),
        gcMs: +gcMs.toFixed(2),
        gcEventsPerRun: Math.round(gcTotals.count / runs),
        topPhases: rows.map(r => ({ name: r.name, ms: +r.ms.toFixed(2) }))
      };
    }

    if (require.main === module) generateReport(reportData, runs);
  } finally {
    try { chromeProc.kill(); } catch (_) {}
    server.close();
  }
}

function generateReport(reportData, runs) {
  const fws = Object.keys(reportData);
  const phaseNames = [...new Set(fws.flatMap(fw => reportData[fw].topPhases.map(p => p.name)))].slice(0, 10);

  const headerCols = fws.map(fw => `${fw[0].toUpperCase()}${fw.slice(1)}`).join(' | ');
  const sep = fws.map(() => ':---:').join(' | ');

  const gcRow = `| **GC total (per append)** | ${fws.map(fw => `**${reportData[fw].gcMs} ms** (${reportData[fw].gcEventsPerRun}/run)`).join(' | ')} |`;
  const handlerRow = `| **Sync click-handler (median)** | ${fws.map(fw => `${reportData[fw].clickHandlerMedianMs} ms`).join(' | ')} |`;
  const phaseRows = phaseNames.map(name => {
    const cells = fws.map(fw => {
      const p = reportData[fw].topPhases.find(x => x.name === name);
      return p ? `${p.ms} ms` : '—';
    }).join(' | ');
    return `| ${name} | ${cells} |`;
  }).join('\n');

  const isComparison = fws.length > 1;

  writeReport('append-gc.md', {
    title: '📊 Benchmark Report: Bulk Append Trace Breakdown (GC / Script / Layout)',
    summary: isComparison
      ? `CDP trace breakdown of what happens during a 1,000-row bulk append (mounting 1,000 rows, then appending 1,000 more) across ${fws.join(' vs. ')}, ${runs} traced runs, phase totals meaned across runs.`
      : `CDP trace breakdown of what happens during a 1,000-row bulk append (mounting 1,000 rows, then appending 1,000 more) in Breeze, ${runs} traced runs, phase totals meaned across runs. Run with \`--react\` to add a React 19 comparison column.`,
    reproCommand: `node benchmarks/append-profile-runner.js --runs=${runs}${isComparison ? ' --react' : ''}`,
    body: `## Results (mean of ${runs} traced runs)\n\n| Phase | ${headerCols} |\n| :--- | ${sep} |\n${handlerRow}\n${gcRow}\n${phaseRows}\n\n## Reading these numbers\n\n- This report reflects the current codebase only — it is a snapshot, not a before/after comparison against any prior Breeze version. To see whether a change helped or hurt, run this script on two commits and diff the outputs yourself.\n- "GC total" counts every trace event matching a GC-related name/category during the append; it is not exclusively attributable to Breeze's own allocations (V8's GC scheduling is influenced by overall heap pressure from the whole page).\n- Phase names come directly from Chrome's \`devtools.timeline\`/\`v8.execute\` trace categories and are Chrome/V8-version-dependent — do not assume phase names are stable across Chrome versions.`
  });
}

if (require.main === module) {
  main().catch(e => { console.error('append-profile failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
}
module.exports = { main };
