# Changelog

All notable changes to the Breeze Framework are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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
