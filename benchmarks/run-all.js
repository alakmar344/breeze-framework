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
  console.log('\n[Suite 4/4] Running Krausest DOM Benchmark...');
  consolidatedResults.krausest = await runKrausestBenchmark();

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
