#!/usr/bin/env node
/** v2 bench: filter-search — filter 10k rows by query + render top 50 via SSR. */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runFilterSearch(iters = 20) {
  const rows = new Array(10000);
  for (let i = 0; i < 10000; i++) rows[i] = { id: i, label: `row ${i} ${i % 2 ? 'alpha' : 'beta'} tail` };
  const SRC = `@app "F"\n@section #s\n  @each r in out [key=id]\n    p "{r.label}"`;
  const ast = Breeze.parse(SRC);
  const t0 = performance.now();
  for (let k = 0; k < iters; k++) {
    const q = k % 2 ? 'alpha' : 'beta';
    const out = rows.filter(r => r.label.includes(q)).slice(0, 50);
    Breeze.renderToString(ast, { out });
  }
  const ms = (performance.now() - t0) / iters;
  return { msPerSearchRender: +ms.toFixed(2) };
}
if (require.main === module) {
  const r = runFilterSearch();
  console.log(`filter-search: ${r.msPerSearchRender} ms per filter+render50`);
}
module.exports = { runFilterSearch };
