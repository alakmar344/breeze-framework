#!/usr/bin/env node
/** v2 bench: todo-mvc — 1k push/toggle/remove ops via State store. */
'use strict';
const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runTodoMvc(cycles = 200) {
  Breeze._resetForTests();
  Breeze.setState('todos', []);
  const t0 = performance.now();
  for (let c = 0; c < cycles; c++) {
    Breeze.push('todos', { id: c, text: `Task ${c}`, done: false });
    const cur = Breeze.getState('todos');
    cur[cur.length - 1] = { ...cur[cur.length - 1], done: true };
    Breeze.setState('todos', cur);
    if (c % 5 === 4) Breeze.remove('todos', 0);
  }
  const ms = performance.now() - t0;
  return { msTotal: +ms.toFixed(2), finalCount: Breeze.getState('todos').length };
}
if (require.main === module) {
  const r = runTodoMvc();
  console.log(`todo-mvc: ${r.msTotal} ms for 200 cycles (final ${r.finalCount})`);
}
module.exports = { runTodoMvc };
