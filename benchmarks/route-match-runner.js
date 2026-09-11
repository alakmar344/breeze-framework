#!/usr/bin/env node
/** v2 bench: route-match — 50k _matchPattern calls (params, optional, wildcard). */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runRouteMatch(iters = 50000) {
  Breeze._resetForTests();
  Breeze.route('/users/:id', () => {});
  Breeze.route('/u/:id?', () => {});
  Breeze.route('/files/*', () => {});
  const R = Breeze.router;
  const paths = ['/users/42?tab=info', '/u/', '/u/99', '/files/a/b/c', '/nope'];
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) {
    const p = paths[i % paths.length];
    for (const pat of ['/users/:id', '/u/:id?', '/files/*']) R._matchPattern(pat, p);
  }
  const ms = performance.now() - t0;
  return { msTotal: +ms.toFixed(2), perMatchUs: +((ms / (iters * 3)) * 1000).toFixed(3) };
}
if (require.main === module) {
  const r = runRouteMatch();
  console.log(`route-match: ${r.msTotal} ms total, ${r.perMatchUs} us/match`);
}
module.exports = { runRouteMatch };
