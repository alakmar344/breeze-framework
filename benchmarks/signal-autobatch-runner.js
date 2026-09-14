#!/usr/bin/env node
/**
 * Breeze v2.3 Signal & Auto-Batching Micro-Benchmark
 * Measures the overhead of signal notifications and the batching win of
 * Breeze.autoBatch() vs manual batch() vs unbatched synchronous updates.
 */

'use strict';

const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function bench(name, fn, iterations = 100) {
  const warmup = Math.min(10, Math.max(3, Math.floor(iterations * 0.1)));
  for (let w = 0; w < warmup; w++) fn();

  const samples = [];
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  const ms = performance.now() - start;
  samples.sort((a, b) => a - b);
  const median = samples[Math.floor(samples.length / 2)].toFixed(3);
  const p95 = samples[Math.floor(samples.length * 0.95)].toFixed(3);
  const min = samples[0].toFixed(3);
  const max = samples[samples.length - 1].toFixed(3);
  console.log(`${name.padEnd(45)} ${ms.toFixed(1)}ms total  (median: ${median}ms, p95: ${p95}ms, range: [${min}–${max}])`);
  return { ms, median: parseFloat(median), p95: parseFloat(p95), min: parseFloat(min), max: parseFloat(max) };
}

function runSignalAutobatchBenchmark(iterations = 30) {
  console.log('\n⚡ Breeze v2.3 Signal & Auto-Batching Benchmark\n');

  const n = 5000;

  // 1. Unbatched synchronous updates (baseline)
  const unbatched = bench('Unbatched signal updates (5k sets)', () => {
    Breeze._resetForTests();
    const a = Breeze.signal(0);
    const b = Breeze.signal(0);
    let runs = 0;
    Breeze.effect(() => { const _ = a.value + b.value; runs++; });
    for (let i = 0; i < n; i++) {
      a.value = i;
      b.value = i * 2;
    }
  }, iterations);

  // 2. Explicit batch()
  const explicitBatch = bench('Explicit batch() updates (5k pairs)', () => {
    Breeze._resetForTests();
    const a = Breeze.signal(0);
    const b = Breeze.signal(0);
    let runs = 0;
    Breeze.effect(() => { const _ = a.value + b.value; runs++; });
    for (let i = 0; i < n; i++) {
      Breeze.batch(() => {
        a.value = i;
        b.value = i * 2;
      });
    }
  }, iterations);

  // 3. Auto batch
  const autoBatch = bench('AutoBatch() updates (5k pairs)', () => {
    Breeze._resetForTests();
    Breeze.autoBatch(true);
    const a = Breeze.signal(0);
    const b = Breeze.signal(0);
    let runs = 0;
    Breeze.effect(() => { const _ = a.value + b.value; runs++; });
    for (let i = 0; i < n; i++) {
      a.value = i;
      b.value = i * 2;
    }
    Breeze.flushSync();
    Breeze.autoBatch(false);
  }, iterations);

  // 4. Signal creation + disposal throughput
  const disposal = bench('Signal create + dispose throughput (10k)', () => {
    for (let i = 0; i < 10000; i++) {
      const s = Breeze.signal(i);
      s.dispose();
    }
  }, iterations);

  console.log('\n📊 Summary');
  console.log(`  Unbatched median:        ${unbatched.median} ms`);
  console.log(`  Explicit batch median:   ${explicitBatch.median} ms  (${(unbatched.median / explicitBatch.median).toFixed(2)}x faster)`);
  console.log(`  AutoBatch median:        ${autoBatch.median} ms  (${(unbatched.median / autoBatch.median).toFixed(2)}x faster)`);

  return { unbatched, explicitBatch, autoBatch, disposal };
}

if (require.main === module) {
  runSignalAutobatchBenchmark();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runSignalAutobatchBenchmark };
}
