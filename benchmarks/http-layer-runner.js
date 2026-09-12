#!/usr/bin/env node
/**
 * HTTP / data layer benchmark for Breeze (zero external deps).
 *
 * These numbers isolate the FRAMEWORK OVERHEAD of the client — every "fetch"
 * is an in-process mock that resolves immediately, so no network variance
 * leaks in. That is the fair way to measure the layer itself: we are not
 * benchmarking the network, we are benchmarking the code Breeze adds on top
 * of `fetch`. Results are reported as median/p95/min/max/sd over many
 * iterations via the shared stats helper.
 */

'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { summarize } = require('./stats.js');
const { createClient, encodeQuery, HttpCache } = require('../breeze-http.js');

// Instant mock fetch: returns a fresh JSON Response with no I/O.
const PAYLOAD = JSON.stringify({ id: 1, name: 'benchmark', items: [1, 2, 3, 4, 5], nested: { a: 1, b: 2 } });
async function mockFetch() {
  return new Response(PAYLOAD, { status: 200, headers: { 'content-type': 'application/json' } });
}
function rawFetchGet(url) {
  return mockFetch(url).then((r) => r.json());
}

// Run `perBatch` operations, measure wall time, repeat `samples` times.
async function timeOps(fn, perBatch, samples, warmup = 3) {
  for (let w = 0; w < warmup; w++) await runBatch(fn, perBatch);
  const out = [];
  for (let s = 0; s < samples; s++) {
    const t0 = performance.now();
    await runBatch(fn, perBatch);
    out.push(performance.now() - t0);
  }
  return out;
}
async function runBatch(fn, n) {
  for (let i = 0; i < n; i++) await fn(i);
}

function opsPerSec(medianMsForBatch, perBatch) {
  return Math.round((perBatch / medianMsForBatch) * 1000);
}

async function main() {
  const PER = 2000;   // requests per timed batch
  const SAMPLES = 25; // batches
  console.log('==============================================================');
  console.log('⚡️ BREEZE HTTP / DATA LAYER — FRAMEWORK OVERHEAD BENCHMARK');
  console.log(`Each timed batch = ${PER} operations, ${SAMPLES} batches, mock fetch (no network)\n`);

  // 1. Raw fetch baseline (no client at all).
  const rawStats = summarize(await timeOps(rawFetchGet, PER, SAMPLES));

  // 2. Client GET, no cache/dedup — pure request-pipeline overhead.
  const plain = createClient({ fetch: mockFetch, cache: 'no-store', dedupe: false });
  const clientStats = summarize(await timeOps((i) => plain.get('/api/item/' + i), PER, SAMPLES));

  // 3. Client GET with warm TTL cache (should be near-free after first hit).
  const cached = createClient({ fetch: mockFetch, cache: { ttl: 60000 } });
  await cached.get('/api/item'); // warm
  const cacheStats = summarize(await timeOps(() => cached.get('/api/item'), PER, SAMPLES));

  // 4. Query serialization throughput (pure, DOM-free).
  const params = { q: 'search terms', page: 3, size: 50, tags: ['a', 'b', 'c'], active: true, since: new Date('2024-01-01') };
  const qsStats = summarize(await timeOps(() => { encodeQuery(params); }, PER, SAMPLES));

  const rawMed = rawStats.median;
  const clientMed = clientStats.median;
  const overheadPerReqUs = ((clientMed - rawMed) / PER) * 1000; // microseconds

  const rows = [
    ['Raw fetch + json() baseline', rawStats, opsPerSec(rawStats.median, PER)],
    ['Breeze client GET (no cache)', clientStats, opsPerSec(clientStats.median, PER)],
    ['Breeze client GET (cache hit)', cacheStats, opsPerSec(cacheStats.median, PER)],
    ['encodeQuery() serialization', qsStats, opsPerSec(qsStats.median, PER)],
  ];

  console.log('Workload                         Median   p95     Min     Max     ops/sec');
  console.log('----------------------------------------------------------------------------');
  for (const [label, st, ops] of rows) {
    console.log(
      label.padEnd(32) +
      String(st.median + 'ms').padStart(8) +
      String(st.p95 + 'ms').padStart(8) +
      String(st.min + 'ms').padStart(8) +
      String(st.max + 'ms').padStart(8) +
      String(ops.toLocaleString()).padStart(12)
    );
  }
  console.log('----------------------------------------------------------------------------');
  console.log(`\nClient overhead over raw fetch: ~${overheadPerReqUs.toFixed(2)} µs/request (median).`);
  console.log(`Cache hit is ${(clientMed / cacheStats.median).toFixed(1)}x faster than a fresh client GET.`);

  const hw = {
    cpu: os.cpus()[0] ? os.cpus()[0].model : 'Unknown',
    cores: os.cpus().length,
    arch: os.arch(),
    node: process.version,
  };
  console.log(`\nSystem: ${hw.cpu} (${hw.cores} cores, ${hw.arch}) | Node ${hw.node}`);

  const report = {
    workload: 'http-layer',
    perBatch: PER,
    samples: SAMPLES,
    hardware: hw,
    results: {
      rawFetch: rawStats,
      clientGet: clientStats,
      cacheHit: cacheStats,
      encodeQuery: qsStats,
      overheadMicrosPerRequest: +overheadPerReqUs.toFixed(2),
    },
  };
  try {
    fs.mkdirSync(path.join(__dirname, 'reports'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'reports', 'http-layer.json'), JSON.stringify(report, null, 2));
    console.log('\n✅ Report written to benchmarks/reports/http-layer.json');
  } catch (_) {}
  return report;
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { main };
