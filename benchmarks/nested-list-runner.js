#!/usr/bin/env node
/** v2 bench: nested-list — 100 groups x 10 items SSR (nested each via flat render). */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runNestedList(iters = 10) {
  const groups = new Array(100);
  for (let g = 0; g < 100; g++) {
    const items = new Array(10);
    for (let i = 0; i < 10; i++) items[i] = { id: `${g}-${i}`, t: `g${g} i${i}` };
    groups[g] = { id: g, title: `Group ${g}`, items };
  }
  const flat = [];
  groups.forEach(g => g.items.forEach(it => flat.push(it)));
  const SRC = `@app "N"\n@section #s\n  @each it in flat [key=id]\n    p "{it.t}"`;
  const ast = Breeze.parse(SRC);
  const t0 = performance.now();
  for (let k = 0; k < iters; k++) Breeze.renderToString(ast, { flat });
  const ms = (performance.now() - t0) / iters;
  return { msPerRender1000: +ms.toFixed(2) };
}
if (require.main === module) {
  const r = runNestedList();
  console.log(`nested-list: ${r.msPerRender1000} ms per 1000-leaf render`);
}
module.exports = { runNestedList };
