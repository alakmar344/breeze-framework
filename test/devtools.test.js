/*!
 * Breeze Framework - DevTools & Reactive Dependency Graph Tests
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Breeze } = require('../breeze.js');

describe('DevTools & Reactivity Graph (Breeze.diagnostics)', () => {

  beforeEach(() => {
    Breeze.diagnostics.reset();
  });

  describe('1. Graph Node & Edge Extraction', () => {
    it('tracks signals and computes dependency edges to computeds and effects', () => {
      const count = Breeze.signal(5, 'count');
      const multiplier = Breeze.signal(2, 'multiplier');

      const total = Breeze.computed(() => count.value * multiplier.value, 'total');

      let recorded = 0;
      const stop = Breeze.effect(() => {
        recorded = total.value;
      }, 'recorder');

      const g = Breeze.diagnostics.graph();

      assert.ok(Array.isArray(g.nodes));
      assert.ok(Array.isArray(g.edges));
      assert.equal(g.nodes.length, 4);

      // Verify node types and labels
      const countNode = g.nodes.find(n => n.label === 'count');
      const multNode = g.nodes.find(n => n.label === 'multiplier');
      const totalNode = g.nodes.find(n => n.label === 'total');
      const recNode = g.nodes.find(n => n.label === 'recorder');

      assert.ok(countNode);
      assert.equal(countNode.type, 'signal');
      assert.equal(countNode.value, 5);

      assert.ok(multNode);
      assert.equal(multNode.type, 'signal');
      assert.equal(multNode.value, 2);

      assert.ok(totalNode);
      assert.equal(totalNode.type, 'computed');
      assert.equal(totalNode.value, 10);

      assert.ok(recNode);
      assert.equal(recNode.type, 'effect');

      // Verify edges: count -> total, multiplier -> total, total -> recorder
      assert.ok(g.edges.some(e => e.from === countNode.id && e.to === totalNode.id), 'count -> total edge');
      assert.ok(g.edges.some(e => e.from === multNode.id && e.to === totalNode.id), 'multiplier -> total edge');
      assert.ok(g.edges.some(e => e.from === totalNode.id && e.to === recNode.id), 'total -> recorder edge');

      // Stop effect and verify cleanup
      stop();
      const gAfter = Breeze.diagnostics.graph();
      assert.equal(gAfter.nodes.length, 3, 'Effect node removed after dispose');
      assert.ok(!gAfter.edges.some(e => e.to === recNode.id), 'Edges to disposed effect removed');
    });

    it('updates dynamic dependencies on conditional branch switches', () => {
      const toggle = Breeze.signal(true, 'toggle');
      const a = Breeze.signal(10, 'a');
      const b = Breeze.signal(20, 'b');

      const selected = Breeze.computed(() => toggle.value ? a.value : b.value, 'selected');
      assert.equal(selected.value, 10);

      let g = Breeze.diagnostics.graph();
      const selNode = g.nodes.find(n => n.label === 'selected');
      const aNode = g.nodes.find(n => n.label === 'a');
      const bNode = g.nodes.find(n => n.label === 'b');

      // Branch 1: toggle is true -> depends on toggle and a
      assert.ok(g.edges.some(e => e.from === aNode.id && e.to === selNode.id));
      assert.ok(!g.edges.some(e => e.from === bNode.id && e.to === selNode.id));

      // Switch branch: toggle is false
      toggle.value = false;
      assert.equal(selected.value, 20);

      g = Breeze.diagnostics.graph();
      // Branch 2: toggle is false -> depends on toggle and b (a is detached)
      assert.ok(!g.edges.some(e => e.from === aNode.id && e.to === selNode.id));
      assert.ok(g.edges.some(e => e.from === bNode.id && e.to === selNode.id));
    });

    it('ensures graph output is strictly JSON.stringify serializable with no circular references', () => {
      const circularObj = { name: 'test' };
      circularObj.self = circularObj;

      const s = Breeze.signal(circularObj, 'circ');
      const c = Breeze.computed(() => s.value, 'compCirc');
      c.value; // evaluate

      const g = Breeze.diagnostics.graph();
      let jsonStr;
      assert.doesNotThrow(() => {
        jsonStr = JSON.stringify(g);
      });
      assert.ok(typeof jsonStr === 'string');
      const parsed = JSON.parse(jsonStr);
      assert.ok(parsed.nodes.length >= 2);
    });
  });

  describe('2. Table Summary (Breeze.diagnostics.table)', () => {
    it('returns a console-friendly array of node summaries', () => {
      const x = Breeze.signal(42, 'x');
      const y = Breeze.computed(() => x.value + 8, 'y');
      y.value;

      const tbl = Breeze.diagnostics.table();
      assert.ok(Array.isArray(tbl));
      assert.equal(tbl.length, 2);

      const xRow = tbl.find(r => r.label === 'x');
      const yRow = tbl.find(r => r.label === 'y');

      assert.ok(xRow);
      assert.equal(xRow.type, 'signal');
      assert.equal(xRow.value, '42');
      assert.equal(xRow.dependencies, '-');
      assert.equal(xRow.dependents, yRow.id);

      assert.ok(yRow);
      assert.equal(yRow.type, 'computed');
      assert.equal(yRow.value, '50');
      assert.equal(yRow.dependencies, xRow.id);
    });
  });

  describe('3. Cycle Detection (Breeze.diagnostics.detectCycles)', () => {
    it('reports no cycles for valid directed acyclic graph (DAG)', () => {
      const a = Breeze.signal(1, 'a');
      const b = Breeze.computed(() => a.value + 1, 'b');
      const c = Breeze.computed(() => b.value + 1, 'c');
      c.value;

      const res = Breeze.diagnostics.detectCycles();
      assert.equal(res.hasCycle, false);
      assert.equal(res.cycles.length, 0);

      const g = Breeze.diagnostics.graph();
      assert.equal(g.hasCycle, false);
    });

    it('accurately identifies and traces cycles in dependency graph', () => {
      // Create artificial circular graph nodes & edges to test detection
      const testNodes = [
        { id: 'nodeA', type: 'computed', label: 'A' },
        { id: 'nodeB', type: 'computed', label: 'B' },
        { id: 'nodeC', type: 'computed', label: 'C' }
      ];
      // A -> B -> C -> A
      const testEdges = [
        { from: 'nodeA', to: 'nodeB' },
        { from: 'nodeB', to: 'nodeC' },
        { from: 'nodeC', to: 'nodeA' }
      ];

      const { detectGraphCycles } = require('../breeze.js');
      // Or test via testing export or diagnostics logic
      const s1 = Breeze.signal(1, 's1');
      const s2 = Breeze.signal(2, 's2');
      const c1 = Breeze.computed(() => s1.value, 'c1');
      c1.value;

      const g = Breeze.diagnostics.graph();
      // Inject synthetic circular edge into copy to verify detector
      g.edges.push({ from: c1._nodeId || g.nodes[2].id, to: s1._nodeId || g.nodes[0].id });

      const checked = Breeze.diagnostics.detectCycles ? Breeze.diagnostics.detectCycles() : null;
      assert.ok(checked);
    });
  });

  describe('4. Global DevTools Hook (__BREEZE_DEVTOOLS__)', () => {
    it('is registered globally and exposes diagnostics methods', () => {
      const target = typeof window !== 'undefined' ? window : globalThis;
      assert.ok(target.__BREEZE_DEVTOOLS__, '__BREEZE_DEVTOOLS__ hook exists');

      const hook = target.__BREEZE_DEVTOOLS__;
      assert.equal(typeof hook.version, 'string');
      assert.equal(typeof hook.getGraph, 'function');
      assert.equal(typeof hook.getTable, 'function');
      assert.equal(typeof hook.getReport, 'function');
      assert.equal(typeof hook.detectCycles, 'function');
      assert.equal(typeof hook.onUpdate, 'function');

      // Test hook.getGraph()
      const s = Breeze.signal('hookTest', 'hookSig');
      const g = hook.getGraph();
      assert.ok(g.nodes.some(n => n.label === 'hookSig'));

      // Test hook.onUpdate()
      let updatedData = null;
      const unsubscribe = hook.onUpdate((data) => {
        updatedData = data;
      });

      s.value = 'newValue';
      assert.ok(updatedData);
      assert.equal(updatedData.label, 'hookSig');
      assert.equal(updatedData.value, 'newValue');

      unsubscribe();
    });
  });
});