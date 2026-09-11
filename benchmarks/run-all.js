#!/usr/bin/env node
/**
 * Master Framework Benchmark Suite Runner for Breeze Framework
 * Orchestrates all benchmarking suites:
 *   1. Engine & Reactivity Micro-benchmarks
 *   2. Bundle Size, Compression (Gzip/Brotli) & V8 Startup Benchmark
 *   3. Server-Side Rendering (SSR) Throughput Benchmark
 *   4. DBMonster Continuous 60 FPS Animation & Frame Stability Benchmark
 *   5. Krausest js-framework-benchmark DOM Lifecycle Benchmark
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

  const consolidatedResults = {
    metadata: {
      date: new Date().toISOString(),
      platform: `${os.type()} ${os.release()} ${os.arch()}`,
      cpu: os.cpus()[0]?.model || 'Multi-core CPU',
      node: process.version,
      browser: 'Google Chrome (Headless CDP)'
    }
  };

  // 1. Bundle Size & Startup Benchmark
  console.log('\n[Suite 1/4] Running Bundle & Startup Benchmark...');
  consolidatedResults.bundle = runBundleBenchmark();

  // 2. SSR Throughput Benchmark
  console.log('\n[Suite 2/4] Running SSR Throughput Benchmark...');
  consolidatedResults.ssr = runSsrBenchmark(1000);

  // 3. DBMonster 60 FPS Stress Benchmark
  console.log('\n[Suite 3/4] Running DBMonster Continuous Animation Benchmark...');
  consolidatedResults.dbmonster = await runDbMonsterBenchmark();

  // 4. Krausest DOM Benchmark
  console.log('\n[Suite 4/5] Running Krausest DOM Benchmark...');
  consolidatedResults.krausest = await runKrausestBenchmark();

  // 5. v2 comfort + perf micro-suites (node-only, 10 suites)
  console.log('\n[Suite 5/5] Running v2 node benchmarks (10 suites)...');
  const v2 = {};
  v2.mount10k = require('./mount-10k-runner.js').runMount10k();
  v2.update1row = require('./update-1-row-runner.js').runUpdate1Row();
  v2.filterSearch = require('./filter-search-runner.js').runFilterSearch();
  v2.sort1k = require('./sort-1k-runner.js').runSort1k();
  v2.nestedList = require('./nested-list-runner.js').runNestedList();
  v2.formValidate = require('./form-validate-runner.js').runFormValidate(3);
  v2.routeMatch = require('./route-match-runner.js').runRouteMatch(20000);
  v2.hydrateString = require('./hydrate-string-runner.js').runHydrateString();
  v2.todoMvc = require('./todo-mvc-runner.js').runTodoMvc();
  v2.sustained = require('./sustained-updates-runner.js').runSustainedUpdates();
  consolidatedResults.v2 = v2;
  console.log('v2 results:', JSON.stringify(v2, null, 2));

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
