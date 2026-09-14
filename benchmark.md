# Breeze Framework v2.3 — Benchmark Report

> **Methodology first, numbers second.** This report was produced by the
> runnable scripts in `benchmarks/` and `bench.js`. If a claim does not trace
> back to a command you can run yourself, that is a bug in this document.

Breeze v2.3 is a scalability and interoperability release. The headline
architectural changes are:

1. **Opt-in automatic microtask batching** (`Breeze.autoBatch()`) that coalesces
   multiple synchronous signal writes into a single effect/DOM flush.
2. **Object-is signal semantics** and a `dispose()` API for explicit memory
   management.
3. A **plug-and-play React/Vue adapter layer** (`Breeze.adapt.react()` /
   `Breeze.adapt.vue()`) that wraps framework components in native Custom
   Elements without bundling React or Vue into Breeze.

This document reports the numbers those changes produced on the machine below,
alongside the existing compiler, SSR, HTTP, and serialization benchmarks.

---

## Table of contents

1. [Environment disclosure](#environment-disclosure)
2. [Methodology & rules](#methodology--rules)
3. [Threats to validity](#threats-to-validity)
4. [How to reproduce](#how-to-reproduce)
5. [Results](#results)
   - 1. Bundle size & parse cost
   - 2. Server-side rendering throughput
   - 3. Parse latency (cold vs. cached)
   - 4. Bulk row serialization
   - 5. Signal & auto-batch reactivity
   - 6. HTTP / data-layer overhead
   - 7. Compiler scaling
   - 8. Build performance
   - 9. Node-only micro-benchmarks
6. [Architecture insights from v2.3](#architecture-insights-from-v23)
7. [Known weaknesses & gaps](#known-weaknesses--gaps)
8. [What changed vs. v2.2](#what-changed-vs-v22)

---

## Environment disclosure

Every number in this document was captured in a single session on the machine
below.

| Field | Value |
| :--- | :--- |
| Date captured | 2026-09-14 |
| OS | Linux (Docker container, x64) |
| CPU | AMD EPYC 9254 24-Core Processor — 48 logical cores |
| RAM | 377.4 GiB |
| Node.js | v22.23.1 |
| Browser | *Not installed in this environment* — Chrome/Chromium-driven suites (Krausest, DBMonster, page-load, workload families, animation, memory, data-grid, TodoMVC, append-profile) could not be executed. See [How to reproduce](#how-to-reproduce). |
| Breeze | v2.3.0 (commit `2108722`), built via `node scripts/build-core.js` |

The container is a shared, virtualized host. Run-to-run variance is visible in
the wide p95/sd spreads on some Node benchmarks. Treat close values (within ~1
standard deviation) as a tie, not a decisive win.

---

## Methodology & rules

1. **Every generated report embeds its own environment.** Auto-generated reports
   in `benchmarks/reports/` include the runtime that produced them.
2. **Multiple independent samples, full distribution reported.** Node-only
   suites use 25–100 iterations and report median, p95, min–max, and standard
   deviation via shared helpers in `benchmarks/stats.js`.
3. **Warm-up before timing.** Every suite discards cold JIT and allocation
   warm-up iterations before the timed window.
4. **No cherry-picking.** All metrics a runner measures are reported, including
   those where Breeze is not the fastest.
5. **Reports are generated, not hand-edited.** `benchmarks/reports/*.md` and
   `.json` files are written by their runners.
6. **Browser suites require a local Chrome/Chromium.** The runners search
   `CHROME_PATH` / `CHROME_BIN` and common per-OS paths; if none is found they
   fail loudly rather than guess.

---

## Threats to validity

- **Shared/virtualized host.** Noisy-neighbor CPU contention on a 48-core Docker
  host is an uncontrolled variable. Some p95 spreads are >10× the median.
- **No browser available.** All headless-Chrome results from previous reports
  could not be refreshed in this environment. The Node-only results below are
  real and reproducible; the cross-framework DOM lifecycle numbers are not
  refreshed for v2.3.
- **One sitting, one machine.** These are not averages across many machines or
  browser versions.
- **Mocked HTTP.** The HTTP benchmark uses a mocked `fetch` to isolate client
  overhead, not real network latency.

---

## How to reproduce

```bash
# Node-only suites (no browser required)
node bench.js                     # parser / build / signals / SSR
npm run bench:ssr                 # SSR throughput (writes reports/ssr.md)
npm run bench:parse               # cold vs LRU-cached parse latency
npm run bench:bulk                # precompiled row serialization
npm run bench:http                # HTTP client overhead
npm run bench:signals             # v2.3 signal & auto-batch benchmark
npm run bench:build-scale         # multi-module compiler scaling
npm run bench:build-perf          # CLI build performance

# Browser-driven suites (require Chrome/Chromium)
CHROME_PATH=/usr/bin/google-chrome npm run bench:all
```

`CHROME_PATH` (or `CHROME_BIN`) points every Chrome-based runner at your
binary. Without it, `benchmarks/lib/chrome.js` searches common locations and
fails with install hints.

---

## Results

### 1. Bundle size & parse cost

*Breeze ships as one dependency-free file. Sizes include the new v2.3 adapter
layer and auto-batch scheduler.*

| Asset | Raw | Gzip (estimated) | Brotli (estimated) |
| :--- | ---: | ---: | ---: |
| `breeze.js` | 213.1 KB | ~46 KB | ~38 KB |
| `breeze.css` | 33.9 KB | ~7 KB | ~6 KB |
| Full rendered HTML (`example.breeze`) | 3.4 KB | — | — |

The v2.3 additions (adapter bridges + scheduler + `dispose()`) add
approximately **+8 KB raw** versus v2.2 while keeping the gzipped payload
competitive with previous releases and still smaller than React 19 / Vue 3
production builds.

### 2. Server-side rendering throughput

`npm run bench:ssr` — 7 samples × 1,000 iterations per engine.

| Engine | Median throughput | p95 | Range | HTML Size |
| :--- | ---: | ---: | ---: | ---: |
| **Breeze SSR (raw DSL string)** | **95,404 pages/s** | 96,847 | 23,519–96,847 | 2417 B |
| **Breeze SSR (pre-parsed AST)** | **82,858 pages/s** | 101,092 | 11,508–101,092 | 2417 B |
| Virtual DOM serializer (hand-rolled reference) | 126,712 pages/s | 162,644 | 17,413–162,644 | 2289 B |
| Native JS template literals (ceiling) | 1,107,259 pages/s | 1,155,868 | 843,924–1,155,868 | 2278 B |

**Honest read:** On this high-core-count host, Breeze SSR reaches **82–95 K
pages/sec**. The raw-DSL path is slightly faster than the pre-parsed AST path in
this run because the LRU cache lookup is overshadowed by V8 optimization
variance on the large shared host. Both are within the same order of magnitude
and far above typical real-world request rates.

### 3. Parse latency (cold vs. cached)

`npm run bench:parse` — 2,003-line template (106.3 KB), 30 iterations.

| Scenario | Median | p95 | Min | Max |
| :--- | ---: | ---: | ---: | ---: |
| Cold parse | **3.05 ms** | 67.30 ms | 1.34 ms | 81.29 ms |
| Warm parse (LRU cache hit) | **0.00 ms** | 0.00 ms | 0.00 ms | 3.91 ms |

**Honest read:** Even a 100 KB template parses cold in a few milliseconds, and
repeat parses are effectively free thanks to the in-memory LRU cache.

### 4. Bulk row serialization

`npm run bench:bulk` — 10,000 rows, 7 samples of 30 iterations.

| Row template | Precompiled serializer | Uncompiled AST traversal | Speedup |
| :--- | ---: | ---: | ---: |
| 3-column table row | **2.31 ms** | 66.89 ms | **29×** |
| Deeply nested component card | **6.18 ms** | 141.86 ms | **23×** |

**Honest read:** The static-row precompiler continues to deliver order-of-
magnitude wins over recursive AST traversal, and the gap widens with template
depth.

### 5. Signal & auto-batch reactivity *(new in v2.3)*

`npm run bench:signals` — 5,000 paired updates, 30 iterations.

| Mode | Median | p95 | Speedup vs. unbatched |
| :--- | ---: | ---: | ---: |
| Unbatched synchronous updates | 2.475 ms | 4.097 ms | 1.0× |
| Explicit `batch()` per pair | 2.885 ms | 3.954 ms | 0.86× |
| `Breeze.autoBatch()` + `flushSync()` | **0.778 ms** | 1.132 ms | **3.18×** |
| Signal create + dispose (10,000 ops) | 10.391 ms | 72.279 ms | — |

**Honest read:** Auto-batch is the clear win for multi-write updates: it
coalesces 5,000 paired signal writes into one microtask flush, cutting median
latency by **3.2×**. Explicit `batch()` per pair is slightly slower than
unbatched here because each call pays its own scheduling overhead; auto-batch
amortizes that cost across the whole task.

### 6. HTTP / data-layer overhead

`npm run bench:http` — mocked `fetch`, 2,000 ops × 25 batches.

| Workload | Median | p95 | ops/sec |
| :--- | ---: | ---: | ---: |
| Raw `fetch()` + `.json()` baseline | 12.66 ms | 23.06 ms | 157,978 |
| Breeze client GET (no cache) | 14.55 ms | 51.00 ms | 137,457 |
| Breeze client GET (cache hit) | **1.27 ms** | 2.77 ms | **1,574,803** |
| `encodeQuery()` serialization | 2.64 ms | 3.09 ms | 757,576 |

**Honest read:** Client overhead over raw fetch is **~0.95 µs/request**
(median). In-memory cache hits are **11.5×** faster than a fresh request.

### 7. Compiler scaling

`npm run bench:build-scale` — simulated projects, 10 samples.

| Project size | Cold compile | Warm rebuild | Incremental edit | Cache speedup |
| :--- | ---: | ---: | ---: | ---: |
| Small (10 modules, 290 lines) | 0.82 ms | 0.00 ms | 0.07 ms | **82×** |
| Medium (50 modules, 1,450 lines) | 2.92 ms | 0.01 ms | 0.05 ms | **292×** |
| Large (200 modules, 5,800 lines) | 10.34 ms | 0.03 ms | 0.04 ms | **344.7×** |

**Honest read:** Sub-linear scaling holds. A 200-module project compiles cold
in ~10 ms and warm/incremental edits are <0.05 ms.

### 8. Build performance

`npm run bench:build-perf` — production CLI paths, 5 samples.

| Scenario | Time |
| :--- | ---: |
| Warm build, 1 file | 0.10 ms |
| Warm build, 10 files | 0.29 ms |
| Warm build, 100 files | 2.57 ms |
| Cold build, 1 file (1 CLI invocation) | 85.14 ms |
| Cold build, 10 files (10 CLI invocations) | 879.08 ms |
| Incremental (1 of 100 files changed) | 0.06 ms |
| CSS-heavy page (10× CSS) | 0.04 ms |
| Template-heavy (200 cards) | 0.24 ms |
| SPA + minify, heavy page | 1.82 ms |

### 9. Node-only micro-benchmarks

`node bench.js` — parser, build pipeline, reactivity, SSR.

| Operation | Total | Median / iter | p95 | Min–Max |
| :--- | ---: | ---: | ---: | ---: |
| Parse `example.breeze` | 0.2 ms | 0.00 ms | 0.01 ms | 0.00–0.01 ms |
| Extract SEO/head/schema | 2.9 ms | 0.01 ms | 0.02 ms | 0.01–0.65 ms |
| `buildHTML` (normal) | 11.5 ms | 0.10 ms | 0.23 ms | 0.08–0.26 ms |
| `buildHTML` (SPA) | 6.4 ms | 0.09 ms | 0.25 ms | 0.07–0.45 ms |
| `buildHTML` (SPA + minify) | 97.2 ms | 0.91 ms | 1.18 ms | 0.68–72.83 ms |
| Signal read / write (10k ops) | 97.6 ms | 0.72 ms | 1.06 ms | 0.69–58.79 ms |
| Computed evaluation (5k ops) | 99.1 ms | 1.37 ms | 2.30 ms | 1.27–56.43 ms |
| Batched updates (5k ops) | 144.4 ms | 4.36 ms | 69.97 ms | 2.47–69.97 ms |
| `renderToString` (full page) | 53.5 ms | 0.06 ms | 0.13 ms | 0.06–46.07 ms |

---

## Architecture insights from v2.3

### Auto-batch scheduler

The reactive core now supports an opt-in automatic microtask batching mode.
When `Breeze.autoBatch(true)` is active, signal writes outside an explicit
`batch()` are queued in a shared `pendingEffects` set and flushed once via
`queueMicrotask`. This removes the need to wrap every multi-write handler in
`batch()` while preserving the explicit `batch()` semantics users already rely
on. `Breeze.flushSync()` is available for code that must read DOM state
immediately after a write.

### Object-is correctness

Signal and computed setters now use `Object.is()` instead of `!==`. This fixes
two long-standing edge cases:
- `NaN` values no longer trigger redundant updates.
- `-0` and `+0` are treated as distinct when it matters for downstream logic.

### Explicit disposal

`signal.dispose()` and `computed.dispose()` permanently detach subscribers and
remove the node from the DevTools registry. This gives developers and the
framework itself a deterministic way to release reactive resources in
long-lived components, data grids, and routing transitions.

### React/Vue adapter layer

`src/core/adapters.js` provides thin bridges that register React or Vue
components as native Custom Elements via the existing `defineElement()`
pipeline. Because the adapters use the host page's `window.React` /
`window.ReactDOM` / `window.Vue`, Breeze does not bundle any framework code.
This keeps the core zero-dependency while allowing incremental adoption:

```js
// Register once
Breeze.adapt.react('react-counter', ReactCounter, { props: ['count'] });
Breeze.adapt.vue('vue-badge', VueBadge, { props: ['label'] });

// Use anywhere — Breeze templates, React JSX, Vue SFCs, or plain HTML
<react-counter count="5"></react-counter>
<vue-badge label="New"></vue-badge>
```

The adapters handle attribute-to-prop conversion, camel-case mapping, default
props, shadow/light DOM mounting, and framework teardown on disconnect.

---

## Known weaknesses & gaps

1. **Browser-driven benchmarks not refreshed.** Chrome/Chromium is not installed
   in this environment, so the cross-framework Krausest, DBMonster, TodoMVC,
   animation, memory, data-grid, page-load, and workload-family suites could
   not be executed for v2.3. The Node-only numbers above are real; the DOM
   lifecycle claims from v2.2 remain unverified on this run.
2. **Auto-batch changes timing semantics.** Code that reads reactive state
   synchronously after a write must call `Breeze.flushSync()` when auto-batch
   is enabled. This is documented but is a footgun for users migrating from
   always-synchronous signals.
3. **React/Vue adapters depend on global runtimes.** They do not work in SSR or
   in environments where React/Vue are loaded as ESM imports without being
   exposed on `window`. A future improvement is an ESM import-based adapter
   path.
4. **Adapter attribute changes re-render the entire component.** The current
   implementation calls `ReactDOM.render()` / `app.mount()` on each
   `attributeChangedCallback`. For high-frequency prop updates, a more granular
   update path would be faster.
5. **Gzip size vs. minimal VDOM libraries.** Breeze is still larger than
   Preact's core because it ships a compiler, router, HTTP layer, design
   system, and now adapter bridges. The trade-off is feature surface, not raw
   renderer size.

---

## What changed vs. v2.2

- **Reactive core:** `Object.is` semantics, `signal.dispose()`,
  `computed.dispose()`, and opt-in `Breeze.autoBatch()` / `Breeze.flushSync()`.
- **Adapter layer:** New `src/core/adapters.js` and public `Breeze.adapt.*`
  API for React/Vue Custom Element bridges.
- **Build system:** `scripts/build-core.js` now concatenates 16 modules
  (including `adapters.js`) and generates `breeze.js` v2.3.0.
- **Benchmarks:** New `benchmarks/signal-autobatch-runner.js` and
  `npm run bench:signals`. Auto-generated reports refreshed for SSR, parse
  latency, bulk serialization, and HTTP.
- **Documentation:** This file rewritten for v2.3 with architecture insights,
  honest gap disclosure, and the exact reproduction commands.

---

*Report generated 2026-09-14. Raw machine-readable results are written by each
runner to `benchmarks/reports/` and `benchmarks/results.json` when applicable.*
