#!/usr/bin/env node
/** v2 bench: mount-10k — renderToString with 10,000 rows (pre-parsed AST vs raw DSL). */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function buildRows(n) {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = { id: i + 1, label: `Item ${i + 1} label text` };
  return rows;
}
const SRC = `@app "Mount"\n@section #m\n  @each row in rows [key=id]\n    p "{row.id} {row.label}"`;

function runMount10k(iters = 5) {
  const rows = buildRows(10000);
  const ast = Breeze.parse(SRC);
  // warm
  Breeze.renderToString(ast, { rows: rows.slice(0, 100) });
  let t0 = performance.now();
  for (let i = 0; i < iters; i++) Breeze.renderToString(ast, { rows });
  const astMs = (performance.now() - t0) / iters;
  t0 = performance.now();
  for (let i = 0; i < iters; i++) Breeze.renderToString(SRC, { rows });
  const rawMs = (performance.now() - t0) / iters;
  return { astMs: +astMs.toFixed(2), rawMs: +rawMs.toFixed(2), rows: 10000 };
}
if (require.main === module) {
  const r = runMount10k();
  console.log(`mount-10k: AST ${r.astMs} ms/render, raw ${r.rawMs} ms/render (${r.rows} rows)`);
}
module.exports = { runMount10k };
