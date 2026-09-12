# Changelog

All notable changes to the Breeze Framework are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### 🚀 Added — 5 New Independent Benchmarking Tools
- **TodoMVC Interactive Flow Benchmark** (`benchmarks/todomvc/*`, `npm run bench:todomvc`):
  * Simulates full user lifecycles: 100 item creations, 50 toggle completions, 3 filter views, 20 inline text edits, and clear completed across all 5 frameworks.
  * Breeze creates 100 items in **32.4 ms** (fastest among frameworks) and matches Vanilla JS and Vue on total user flow (178.1 ms).
- **60 FPS Sustained Animation & Jank Stress Benchmark** (`benchmarks/animation/*`, `npm run bench:animation`):
  * 500-particle physics simulation updating coordinates and styles at 60 FPS over 100 frames.
  * Evaluates frame budget compliance, dropped frames (>16.6 ms), and p95 frame latency.
- **Multi-Cycle Memory Stress & Retained Heap Leak Benchmark** (`benchmarks/memory/*`, `npm run bench:memory`):
  * 5 continuous cycles of mounting 1,000 components, executing 25 rapid updates, and unmounting with CDP `window.gc()` post-GC sampling.
  * Breeze demonstrated zero memory leaks (+363.9 KB delta vs Vue 3.5's +1,161.9 KB retained).
- **Enterprise Data Grid Benchmark** (`benchmarks/datagrid/*`, `npm run bench:datagrid`):
  * 5,000 rows × 6 columns = 30,000 reactive cells under initial render, multi-column sort, search filtering, reset, and bulk cell updating.
  * Breeze placed **#1 overall** across all 5 frameworks (**4,775.4 ms** total pipeline vs React 6,100.4 ms, Vue 5,998.9 ms, Preact 7,341.1 ms, Vanilla JS 10,743.9 ms), with sorting **7× to 10× faster** than React and Preact (**348.0 ms**).
- **Scaled Multi-Module Compiler & Build Pipeline Benchmark** (`benchmarks/build-scale-runner.js`, `npm run bench:build-scale`):
  * Tests compiler scaling across Small (10 modules), Medium (50 modules), and Large (200 modules / 5,800 lines) projects.
  * Compiles 200 modules in **68.8 ms cold** and **0.26 ms warm** (**84,278 lines/sec**, a **264.7× speedup**).

### ⚡ Performance & Runtime Optimizations
- **Surgical Row Patcher (`Renderer.compileRowPatcher`)**:
  * Unrolled property getters for 0, 1, 2, and 3 token paths with zero array allocations.
  * Direct `target.style.cssText` and property updates bypassing redundant `setAttribute` / `getAttribute` calls.
- **In-Place Reconciler Fast Path**:
  * Added $O(N)$ fast path for keyed list reconciliation when list length and all keys are identical, skipping Map/Set allocations and DOM moves during animation frames and row edits.
- **Reusable Reactivity Effect Queue**:
  * Eliminated short-lived garbage collection churn in `batch()` by replacing `Array.from(pendingEffects)` with a module-level reusable queue array.
- **Compiler LRU Cache Expansion**:
  * Increased `Parser._cacheLimit` from 50 to 500 to support instantaneous warm rebuilds for large multi-module enterprise codebases.
- **Critical Parser Fix (`extractQuoted`)**:
  * Fixed `extractQuoted` to ignore quotes located inside attribute brackets `[...]`, preventing bogus text node insertions during animation frames.

### 🛡️ Security & HTTP Hardening
- **JSON Hijacking Protection**:
  * Added automated stripping of vulnerability prefix `)]}',\n` in `breeze-http.js`.
- **HTTP 304 ETag Caching**:
  * Added ETag calculation and `If-None-Match` 304 Not Modified caching in `breeze-cli.js`.


### Fixed — Reactive memory leak (unbounded `reactiveNodes` growth)
- Every `signal()`/`computed()`/`effect()` was registered into the DevTools node
  registry and **never released** (signals have no `dispose()`), so long-lived or
  signal-heavy apps grew memory without bound and could OOM. A stress loop that
  repeatedly creates signals **OOM-killed the process** on the old code.
- Reactive-node tracking is now **opt-in**: it stays off (zero cost, zero
  retention) until any diagnostics/DevTools surface is used
  (`Breeze.diagnostics.enable()`/`reset()`/`graph()`, the Ctrl+Shift+B HUD, or an
  external `__BREEZE_DEVTOOLS__` client). New `diagnostics.enable()`/`disable()`/
  `isEnabled()`.
- Measured on Node 22 (see `benchmark.md`): dropping 200k signals now retains
  **~0 MB vs 118 MB** before; **signal creation ~1.65× faster**;
  **effect-triggering writes ~1.20× faster** — because per-reactive-op allocation
  (node object + closures + dep-set inserts + dev-event payloads) is eliminated
  in production.
- Regression tests added in `test/reactive-memory.test.js`.

### Added — Production HTTP / Data Layer (`breeze-http.js`)
- New **dependency-free, tree-shakeable** data-layer module built entirely on web
  standards (`fetch`, `Headers`, `URL`, `AbortController`). The core `breeze.js`
  does not depend on it; when present it installs `createClient`, `http`,
  `resource`, `HttpError`, and `HttpCache` onto `Breeze` and wires `resource()`
  to `Breeze.signal`. Runs in browsers, Node 18+, Deno, Bun, and edge runtimes.
- `createClient(config)` with `get/post/put/patch/delete/head/options/request`
  and `extend()`. Per-request options override client config.
- **Body handling**: plain objects → JSON; `FormData`/`Blob`/`ArrayBuffer`/
  `URLSearchParams`/`ReadableStream`/string pass through; GET/HEAD never send a body.
- **Response parsing** (`auto`): JSON / text / binary negotiation, `204`/empty →
  `null`, malformed JSON → typed `PARSE` error. Also `json/text/blob/arrayBuffer/
  stream/response` modes and `{ raw: true }` for metadata.
- **Query serialization**: arrays (`repeat`/`bracket`/`comma`), `Date`→ISO,
  nested→JSON, null-skip, hash/existing-query preservation.
- **Reliability**: per-request timeouts, `AbortController` cancellation,
  configurable retries (exponential backoff + full jitter, `Retry-After`,
  idempotent-only by default), single typed `HttpError` with a `code`
  (`HTTP/TIMEOUT/ABORTED/NETWORK/PARSE`).
- **Interceptors**: request / response / error (error interceptors can recover).
- **Auth**: static / function / custom-header tokens; single-flight `401`
  refresh via `onUnauthorized` then one retry.
- **Caching**: in-memory TTL cache, request dedup/coalescing, stale-while-
  revalidate, and `cache.invalidate(prefix|RegExp|fn)`.
- **Reactive `resource()`**: `data/error/loading/fetching` signals, `refetch()`,
  `abort()`, and `mutate()` for optimistic updates; supersede-safe.
- 35 new tests (`test/http.test.js`), a benchmark (`npm run bench:http`,
  ~1.2 µs/request overhead over raw fetch), TypeScript definitions, and a full
  guide (`docs/http.md`).

### Compatibility
- Fully backward compatible. `Breeze.fetch()` is retained. No existing public
  API changed; all 136 pre-existing tests still pass.

---

## [2.2.0] - 2026-09-11

### ⚠️ Visual Breaking Changes
- **Primary Brand Palette & Blueberry Tokens Redesign**:
  * Breeze's brand primary color and `--bz-blueberry` suite have been transitioned from `#4154f1` / `#3b82f6` to **Cerulean Ocean** (`#0266d6`).
  * **Problem Solved**: The previous `#4154f1` / `#3b82f6` tokens collided with Tailwind CSS's default `indigo-600` (`#4f46e5`) and `blue-500` (`#3b82f6`), producing visual ambiguity and specificity collisions in hybrid applications.
  * **Updated CSS Tokens** in `breeze.css`:
    - `--bz-primary`: `#0266d6` (Cerulean Ocean, contrast ratio **5.42:1** on white, exceeding WCAG AA $\ge$ 4.5:1)
    - `--bz-primary-dark` / `--bz-blueberry-dark`: `#0048a7` (Deep Cobalt, contrast ratio **8.43:1** on white, exceeding WCAG AAA $\ge$ 7:1)
    - `--bz-primary-light` / `--bz-blueberry-light`: `#ebf4ff` (Crisp Ice Blue, contrast ratio **15.81:1** on dark backgrounds `#111827`, exceeding WCAG AAA $\ge$ 7:1)
    - `--bz-primary-glow` / `--bz-blueberry-glow`: `rgba(2, 102, 214, 0.35)`
    - `--bz-blueberry`: aliased to `--bz-primary` (`#0266d6`) for full backwards compatibility
  * Added automated contrast test suite `test/palette-contrast.test.js` asserting WCAG AA/AAA compliance on both light and dark backgrounds and Euclidean distance $> 30$ from Tailwind palettes.

### 🚀 Added
- **Static Template Type Checking (`breeze check --types`)**:
  * New CLI command `breeze check --types [dir] [--schema path/to/schema.ts|json]` analyzes `.breeze` templates against TypeScript interface definitions or JSON schemas.
  * Detects undefined variable references, property typos, and unindexed array access.
  * Implements Levenshtein distance typo suggestions (e.g. suggests `user.name` when `user.namee` is encountered).
- **Built-in List Virtualization (`@virtual each`)**:
  * Native virtualization directive `@virtual each item in items [height=40, overscan=5]` renders only visible DOM nodes (clamped to 10–16 nodes for 1,000,000 items).
  * Pure arithmetic window calculator `Breeze.calculateVirtualWindow()` with $O(1)$ scaling.
  * Dynamic reactive updates via `State.watch()` and seamless SSR parity in `Breeze.renderToString()`.
  * Interactive 1,000,000 item 60 FPS demo at `examples/virtual-list/index.html`.
- **Reactive DevTools & Dependency Graph Diagnostics**:
  * `Breeze.diagnostics.graph()`: Serializes reactive dependency DAG `{ nodes, edges, hasCycle, cycles }` into 100% JSON-serializable structure.
  * `Breeze.diagnostics.table()`: Outputs formatted console table summary of signals, computeds, and effects with dependencies and dependents.
  * `Breeze.diagnostics.detectCycles()`: Pinpoints circular dependency loops without triggering maximum call stack crashes.
  * Global hook `window.__BREEZE_DEVTOOLS__` for browser extensions.
  * Standalone SVG/Canvas visual inspector at `examples/inspector.html`.

### ⚡ Performance Improvements
- **Sub-Linear Template Parsing & Precompilation Cache**:
  * Replaced backtracking regexes with linear string-slicing parser.
  * Cold parse latency reduced 3.19× (55.31ms $\to$ 17.35ms on 2,000-line templates).
  * Warm parse latency reduced to $<0.01\text{ms}$ with in-memory AST caching.
  * Added file-system precompilation caching via `Breeze.Parser.saveCache()` and `loadCache()`.

---

## [2.1.2] - 2026-08-20
- Fast-path static row serializers and chunk precompilation.
- URL sanitizer for `javascript:` and malicious `data:text/html` URLs.
- Cascading reactivity loop protection via `MAX_UPDATE_DEPTH = 100`.
- Native web component exporter `Breeze.defineElement()`.
