#!/usr/bin/env node
/** v2 bench: sustained-updates — 5k batched vs unbatched signal updates + heap delta. */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runSustainedUpdates(n = 5000) {
  Breeze._resetForTests();
  const a = Breeze.signal(0);
  const b = Breeze.signal(0);
  let runs = 0;
  const d = Breeze.effect(() => { runs++; void a.value; void b.value; });
  let t0 = performance.now();
  for (let i = 1; i <= n; i++) { a.value = i; b.value = i * 2; }
  const unbatchedMs = performance.now() - t0;
  const unbatchedRuns = runs;
  runs = 0;
  t0 = performance.now();
  Breeze.batch(() => {
    for (let i = 1; i <= n; i++) { a.value = 100000 + i; b.value = i; }
  });
  const batchedMs = performance.now() - t0;
  d();
  const heapKB = (typeof process !== 'undefined' && process.memoryUsage)
    ? Math.round(process.memoryUsage().heapUsed / 1024)
    : 0;
  return {
    unbatchedMs: +unbatchedMs.toFixed(2),
    unbatchedRuns,
    batchedMs: +batchedMs.toFixed(2),
    heapKB
  };
}
if (require.main === module) {
  const r = runSustainedUpdates();
  console.log(`sustained-updates: unbatched ${r.unbatchedMs} ms (${r.unbatchedRuns} runs) vs batched ${r.batchedMs} ms, heap ${r.heapKB} KB`);
}
module.exports = { runSustainedUpdates };
