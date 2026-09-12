#!/usr/bin/env node
/**
 * Master Framework Benchmark Suite Runner for Breeze Framework
 * Orchestrates all benchmarking suites:
 *   1. Bundle Size, Compression (Gzip/Brotli) & V8 Startup Benchmark
 *   2. Server-Side Rendering (SSR) Throughput Benchmark
 *   3. DBMonster Frame-Callback Throughput & Stability Benchmark
 *   4. Krausest js-framework-benchmark DOM Lifecycle Benchmark
 *   5. v2 node micro-suites (10, portable)
 *   6. Page-load arrival Benchmark (desktop + emulated mobile)
 *   7. Workload-families Benchmark (wide / deep / form × 5 frameworks)
 *   8. Build-performance Benchmark (cold/warm/incremental scaling)
 *
 * Consolidates all metrics into benchmarks/results.json and prints summary reports.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { runBundleBenchmark } = require('./bundle-runner.js');
const { runSsrBenchmark } = require('./ssr-runner.js');
const { runDbMonsterBenchmark } = require('./dbmonster-runner.js');
const { runKrausestBenchmark } = require('./krausest-runner.js');

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       🌊  BREEZE FRAMEWORK COMPREHENSIVE BENCHMARK SUITE       ║');
  console.log('║       Running all empirical benchmarks across all frameworks   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log(`OS: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPUs: ${os.cpus()[0]?.model || 'Generic CPU'} (${os.cpus().length} threads)`);
  console.log(`Node.js: ${process.version}`);

  // Machine + dependency fingerprint — every number in results.json was
  // measured on THIS machine with THESE exact builds (see vendor/VERSIONS.md).
  // Chrome version is probed over CDP (chrome --version lies when a desktop
  // browser instance is already running — it just forwards to it).
  let chromeVersion = 'unknown';
  try {
    const probePort = 19437;
    const probeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-chrome-probe-'));
    const chromeBin = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const { spawn: sp } = require('child_process');
    const probe = sp(chromeBin, [
      '--headless=new', `--remote-debugging-port=${probePort}`, '--disable-gpu',
      '--no-first-run', '--no-default-browser-check', `--user-data-dir=${probeProfile}`
    ], { stdio: 'ignore' });
    const start = Date.now();
    while (Date.now() - start < 15000) {
      try {
        const res = await fetch(`http://127.0.0.1:${probePort}/json/version`);
        if (res.ok) {
          const info = await res.json().catch(() => ({}));
          if (info.Browser) { chromeVersion = info.Browser; break; }
        }
      } catch (_) {}
      await new Promise(r => setTimeout(r, 250));
    }
    try { probe.kill(); } catch (_) {}
    try { fs.rmSync(probeProfile, { recursive: true, force: true }); } catch (_) {}
  } catch (_) {}
  let vendorVersions = {};
  try {
    vendorVersions = require('./vendor/build-vendor.js').PINNED;
  } catch (_) {}

  const consolidatedResults = {
    metadata: {
      date: new Date().toISOString(),
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model || 'Multi-core CPU',
      cpuThreads: os.cpus().length,
      node: process.version,
      browser: `Google Chrome Headless (CDP) — ${chromeVersion}`,
      vendorVersions,
      note: 'All Chrome numbers are median-of-BZ_BENCH_RUNS on this CPU; absolute ms varies with machine load, relative ordering is the claim.'
    }
  };

  const BZ_RUNS = parseInt(process.env.BZ_BENCH_RUNS || '7', 10) || 7;
  const COOLDOWN_MS = parseInt(process.env.BZ_COOLDOWN_MS || '2500', 10) || 2500;

  async function coolDown(label) {
    if (global.gc) {
      try { global.gc(); } catch (_) {}
    }
    console.log(`⏳ [Thermal Pacing] Cooldown ${COOLDOWN_MS}ms after ${label} (protecting CPU thermal stability)...`);
    await new Promise(r => setTimeout(r, COOLDOWN_MS));
    if (global.gc) {
      try { global.gc(); } catch (_) {}
    }
  }

  // 1. Bundle Size & Startup Benchmark
  console.log('\n[Suite 1/13] Running Bundle & Startup Benchmark...');
  consolidatedResults.bundle = runBundleBenchmark();
  await coolDown('Suite 1 (Bundle & Startup)');

  // 2. SSR Throughput Benchmark (2,000 passes)
  console.log('\n[Suite 2/13] Running SSR Throughput Benchmark (2,000 passes)...');
  consolidatedResults.ssr = runSsrBenchmark(2000);
  await coolDown('Suite 2 (SSR Throughput)');

  // 3. DBMonster Frame-Callback Throughput Benchmark
  console.log('\n[Suite 3/13] Running DBMonster Frame-Callback Throughput Benchmark...');
  consolidatedResults.dbmonster = await runDbMonsterBenchmark();
  await coolDown('Suite 3 (DBMonster Throughput)');

  // 4. Krausest DOM Benchmark
  console.log(`\n[Suite 4/13] Running Krausest DOM Benchmark (${BZ_RUNS} runs)...`);
  consolidatedResults.krausest = await runKrausestBenchmark();
  await coolDown('Suite 4 (Krausest DOM)');

  // 5. v2 comfort + perf micro-suites (node-only, 10 suites)
  console.log('\n[Suite 5/13] Running v2 node benchmarks (10 suites)...');
  const v2 = {};
  v2.mount10k = require('./mount-10k-runner.js').runMount10k();
  v2.update1row = require('./update-1-row-runner.js').runUpdate1Row();
  v2.filterSearch = require('./filter-search-runner.js').runFilterSearch();
  v2.sort1k = require('./sort-1k-runner.js').runSort1k();
  v2.nestedList = require('./nested-list-runner.js').runNestedList();
  v2.formValidate = require('./form-validate-runner.js').runFormValidate(5);
  v2.routeMatch = require('./route-match-runner.js').runRouteMatch(25000);
  v2.hydrateString = require('./hydrate-string-runner.js').runHydrateString();
  v2.todoMvc = require('./todo-mvc-runner.js').runTodoMvc();
  v2.sustained = require('./sustained-updates-runner.js').runSustainedUpdates();
  consolidatedResults.v2 = v2;
  console.log('v2 results:', JSON.stringify(v2, null, 2));
  await coolDown('Suite 5 (v2 Node Micro-suites)');

  // 6. Page-load arrival (desktop + emulated mobile).
  console.log('\n[Suite 6/13] Running page-load arrival benchmark...');
  consolidatedResults.pageLoad = await require('./page-load-runner.js').runPageLoad();
  await coolDown('Suite 6 (Page-Load Arrival)');

  // 7. Workload families (wide / deep / form).
  console.log('\n[Suite 7/13] Running workload-families benchmark...');
  consolidatedResults.families = await require('./workload-families-runner.js').runWorkloadFamilies();
  await coolDown('Suite 7 (Workload Families)');

  // 8. Build performance (cold/warm/incremental scaling).
  console.log('\n[Suite 8/13] Running build-performance benchmark...');
  consolidatedResults.buildPerf = await require('./build-perf-runner.js').runBuildPerf();
  await coolDown('Suite 8 (Build Performance)');

  // 9. TodoMVC Interactive Flow Benchmark (cross-framework, 7 runs)
  console.log(`\n[Suite 9/13] Running TodoMVC Interactive Flow Benchmark (${BZ_RUNS} runs)...`);
  consolidatedResults.todomvc = await require('./todomvc-runner.js').runTodoMvcBenchmark(BZ_RUNS);
  await coolDown('Suite 9 (TodoMVC Interactive Flow)');

  // 10. 60 FPS Sustained Animation & Jank Stress Benchmark (150 frames)
  console.log('\n[Suite 10/13] Running 60 FPS Animation & Jank Stress Benchmark (150 frames)...');
  consolidatedResults.animation = await require('./animation-stress-runner.js').runAnimationStressBenchmark(150);
  await coolDown('Suite 10 (Animation & Jank Stress)');

  // 11. Multi-Cycle Memory Stress & Retained Heap Leak Benchmark (6 cycles x 25 updates)
  console.log('\n[Suite 11/13] Running Multi-Cycle Memory Stress & Retained Heap Leak Benchmark (6 cycles)...');
  consolidatedResults.memoryLeak = await require('./memory-leak-runner.js').runMemoryLeakBenchmark(6, 25);
  await coolDown('Suite 11 (Memory Stress & Leak)');

  // 12. Enterprise Data Grid Benchmark (5,000 rows x 6 cols = 30,000 cells, 5 iterations)
  console.log('\n[Suite 12/13] Running Enterprise Data Grid Benchmark (5 iterations)...');
  consolidatedResults.dataGrid = await require('./data-grid-runner.js').runDataGridBenchmark(5);
  await coolDown('Suite 12 (Enterprise Data Grid)');

  // 13. Scaled Multi-Module Compiler & Build Pipeline Benchmark (15 iterations)
  console.log('\n[Suite 13/13] Running Scaled Multi-Module Compiler & Build Pipeline Benchmark (15 iterations)...');
  consolidatedResults.buildScale = require('./build-scale-runner.js').runBuildScaleBenchmark(15);
  await coolDown('Suite 13 (Build Scale Pipeline)');

  // Save consolidated results
  const resultsPath = path.join(__dirname, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(consolidatedResults, null, 2), 'utf8');

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`🎉 ALL BENCHMARKS COMPLETED SUCCESSFULLY!`);
  console.log(`Consolidated reproducible results written to:`);
  console.log(`  ${resultsPath}`);
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n❌ Fatal error in benchmark suite:', err);
  process.exit(1);
});
