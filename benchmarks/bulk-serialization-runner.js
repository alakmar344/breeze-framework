#!/usr/bin/env node
/**
 * Bulk Serialization Benchmark: Precompiled Chunk Serializer vs AST Traversal.
 * Evaluates the performance multiplier of compileRowSerializer on 10,000 items.
 */

'use strict';

const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

function runBulkSerializationBench(iterations = 30, rowCount = 10000) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    id: i + 1,
    label: `Dynamic data table row #${i + 1}`,
    count: i * 7
  }));

  const template = `@each item in rows [key=id]
  tr.data-row
    td.col-id "{item.id}"
    td.col-label "{item.label}"
    td.col-count "{item.count}"`;

  const ast = Breeze.parse(template);
  const eachNode = ast[0];

  // 1. Precompiled Chunk String Serializer (v2.1+ / v2.2)
  const serializer = Breeze.testing.compileRowSerializer(
    eachNode.children,
    'item',
    'id',
    { withKeys: true }
  );

  // Warmup
  for (let w = 0; w < 5; w++) {
    serializer.render(rows.slice(0, 500), 0);
  }

  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    serializer.render(rows, 0);
  }
  const compiledMs = (performance.now() - t0) / iterations;

  // 2. Uncompiled Recursive AST Traversal Fallback
  const t1 = performance.now();
  for (let i = 0; i < iterations; i++) {
    let html = '';
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < eachNode.children.length; c++) {
        html += Breeze.testing.itemNodeToHtml(
          eachNode.children[c],
          'item',
          rows[r],
          r,
          rows[r].id
        );
      }
    }
  }
  const uncompiledMs = (performance.now() - t1) / iterations;

  const speedup = uncompiledMs / compiledMs;

  return {
    rowCount,
    iterations,
    compiledMs: +compiledMs.toFixed(2),
    uncompiledMs: +uncompiledMs.toFixed(2),
    speedup: +speedup.toFixed(1)
  };
}

if (require.main === module) {
  console.log('Running Bulk Serialization Benchmark (10,000 items)...');
  const res = runBulkSerializationBench();
  console.log(`- Precompiled Serializer: ${res.compiledMs} ms`);
  console.log(`- Uncompiled AST Traversal: ${res.uncompiledMs} ms`);
  console.log(`- Speedup: ${res.speedup}x`);
}

module.exports = { runBulkSerializationBench };
