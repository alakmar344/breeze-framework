#!/usr/bin/env node
/** v2 bench: update-1-row — surgical single signal update + watcher fan-out. */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runUpdate1Row(iters = 20000) {
  Breeze._resetForTests();
  const s = Breeze.signal(0);
  let calls = 0;
  const d = Breeze.effect(() => { calls++; void s.value; });
  const t0 = performance.now();
  for (let i = 1; i <= iters; i++) s.value = i;
  const ms = performance.now() - t0;
  d();
  return { ms: +ms.toFixed(2), opsPerSec: Math.round(iters / (ms / 1000)), effects: calls };
}
if (require.main === module) {
  const r = runUpdate1Row();
  console.log(`update-1-row: ${r.ms} ms for 20000 sets (${r.opsPerSec} ops/s, ${r.effects} effects)`);
}
module.exports = { runUpdate1Row };
