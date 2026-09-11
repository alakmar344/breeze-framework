#!/usr/bin/env node
/** v2 bench: sort-1k — sort 1k rows + SSR render (reorder path). */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runSort1k(iters = 20) {
  const base = new Array(1000);
  for (let i = 0; i < 1000; i++) base[i] = { id: i, v: (i * 2654435761) % 100000 };
  const SRC = `@app "S"\n@section #s\n  @each r in rows [key=id]\n    p "{r.id} {r.v}"`;
  const ast = Breeze.parse(SRC);
  const t0 = performance.now();
  for (let k = 0; k < iters; k++) {
    const rows = base.slice().sort((a, b) => (k % 2 ? a.v - b.v : b.v - a.v));
    Breeze.renderToString(ast, { rows });
  }
  const ms = (performance.now() - t0) / iters;
  return { msPerSortRender: +ms.toFixed(2) };
}
if (require.main === module) {
  const r = runSort1k();
  console.log(`sort-1k: ${r.msPerSortRender} ms per sort+render`);
}
module.exports = { runSort1k };
