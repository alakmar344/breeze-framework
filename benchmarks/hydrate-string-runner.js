#!/usr/bin/env node
/** v2 bench: hydrate-string — SSR string build + parse cache hit cost. */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runHydrateString(iters = 100) {
  const SRC = `@app "H"\n@state name = "Ada"\n@section #s [pad-lg]\n  h1 "{name}"\n  p "static"\n  button "Go" [primary]`;
  Breeze.parse(SRC);
  let t0 = performance.now();
  for (let i = 0; i < iters; i++) Breeze.parse(SRC);
  const parseCachedMs = (performance.now() - t0) / iters;
  t0 = performance.now();
  for (let i = 0; i < iters; i++) Breeze.parse(SRC, { noCache: true });
  const parseFreshMs = (performance.now() - t0) / iters;
  t0 = performance.now();
  for (let i = 0; i < iters; i++) Breeze.renderToString(SRC, { name: `N${i}` });
  const ssrMs = (performance.now() - t0) / iters;
  return {
    parseCachedMs: +parseCachedMs.toFixed(3),
    parseFreshMs: +parseFreshMs.toFixed(3),
    ssrMs: +ssrMs.toFixed(3)
  };
}
if (require.main === module) {
  const r = runHydrateString();
  console.log(`hydrate-string: parse cached ${r.parseCachedMs} ms, fresh ${r.parseFreshMs} ms, SSR ${r.ssrMs} ms`);
}
module.exports = { runHydrateString };
