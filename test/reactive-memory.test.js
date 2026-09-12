'use strict';
// Regression tests for reactive memory + diagnostics opt-in behavior.
//
// Historically every signal/computed/effect was registered into the DevTools
// node registry and NEVER released (signals have no dispose()), so a long-lived
// or signal-heavy app leaked unboundedly and could OOM. Tracking is now opt-in.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Breeze } = require('../breeze.js');

test('diagnostics tracking is OFF by default', () => {
  Breeze.diagnostics.disable();
  assert.equal(Breeze.diagnostics.isEnabled(), false);
});

test('signals created while tracking is off are not pinned in the registry', () => {
  Breeze.diagnostics.disable();               // ensure off + cleared
  for (let i = 0; i < 5000; i++) Breeze.signal(i);
  // Nothing should have been registered -> graph is empty.
  assert.equal(Breeze.diagnostics.graph().nodes.length, 0);
});

test('diagnostics can be enabled on demand and then records nodes', () => {
  Breeze.diagnostics.reset();                  // reset() implies enable()
  assert.equal(Breeze.diagnostics.isEnabled(), true);
  const a = Breeze.signal(1, 'a');
  const d = Breeze.computed(() => a.value * 2, 'd');
  void d.value;
  const g = Breeze.diagnostics.graph();
  assert.ok(g.nodes.find((n) => n.label === 'a'));
  assert.ok(g.nodes.find((n) => n.label === 'd'));
});

test('reactive behavior is identical whether or not tracking is on', () => {
  for (const enable of [false, true]) {
    if (enable) Breeze.diagnostics.reset(); else Breeze.diagnostics.disable();
    const s = Breeze.signal(1);
    const doubled = Breeze.computed(() => s.value * 2);
    let observed = 0;
    const stop = Breeze.effect(() => { observed = doubled.value; });
    assert.equal(observed, 2);
    s.value = 10;
    assert.equal(doubled.value, 20);
    assert.equal(observed, 20);
    stop();
  }
  Breeze.diagnostics.disable();
});

test('no unbounded registry growth under repeated signal creation (leak guard)', () => {
  Breeze.diagnostics.disable();
  // With the old always-on registry this pinned 300k node objects forever.
  for (let round = 0; round < 3; round++) {
    let arr = new Array(100000);
    for (let i = 0; i < 100000; i++) arr[i] = Breeze.signal(i);
    arr = null;
  }
  // Registry must remain empty; if this regresses, memory would grow without bound.
  assert.equal(Breeze.diagnostics.graph().nodes.length, 0);
});
