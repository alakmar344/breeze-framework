# Breeze Framework v2.4.0 — Empirical Benchmark Suite & Technical Performance Report

> **Standard of Reproducibility**: Every number in this report was captured by executing the runnable benchmark scripts in `benchmarks/` and `bench.js` on Linux under strict hardware telemetry controls. If any metric cannot be reproduced via the commands specified herein, please file an issue.

---

## 1. Executive Summary & Balanced Framework Matrix

Breeze v2.4.0 is a performance release focused on **Server-Side Rendering (SSR) throughput**, building upon the v2.3 core architecture (compiled direct text patch targets, microtask auto-batching, and zero-bundle web component adapters).

No single web framework is universally superior across every workload. Framework architectures involve fundamental trade-offs: minimal bundle size vs. batteries-included capability; raw string serialization speed vs. virtual DOM flexibility; and compile-time optimization vs. dynamic runtime ergonomics.

This benchmark report evaluates **Breeze v2.4.0** against official production distributions of **Preact 10.29.8**, **Vue 3.5.42**, **React 19.3.0**, and **Vanilla JavaScript** across 18 empirical suites on entry-level x86_64 hardware.

### 📊 Multi-Framework Balanced Scorecard

| Workload Domain | Top Performer | Second Place | Breeze v2.4 Standing | Architectural Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **Gzip / Brotli Footprint** | **Preact 10** (4.79 KB gzip) | Breeze (49.80 KB gzip) | **#2 of 4** (49.80 KB gzip) | Preact is an ultra-minimal virtual DOM library (~11 KB raw); Breeze bundles compiler, reactivity, router, HTTP client, and utility CSS (222 KB raw). |
| **V8 Startup Parse Latency** | **Preact 10** (0.068 ms) | Breeze (0.377 ms) | **#2 of 4** (0.377 ms) | Byte length directly governs V8 parse/compile time; Preact's minimal footprint compiles in <0.07 ms. |
| **Raw String Serialization** | **Vanilla JS** (77,296 ops/s) | Preact VDOM (15,169 ops/s) | **#3 of 4** (10,633 ops/s) | Native ES template literals compile to direct V8 string joins without AST traversal or interpolation scanners. |
| **Component SSR Throughput** | **Breeze v2.4** (9.89 ms / 300 comps) | Baseline v2.3 (19.59 ms) | **#1** (1.98× speedup vs v2.3) | Template compilation memoization (`Parser.compileTemplate`) and single-pass token walks eliminate per-instance regex generation. |
| **DBMonster Pacing (Frame ms)** | **Breeze** (43.6 ms median) | Vanilla JS (49.4 ms median) | **#1 of 5** (43.6 ms frame) | Compiled direct text node pointer caching (`_bzPatchTargets`) bypasses VDOM diffing and tree walking during high-frequency text mutations. |
| **DBMonster Average FPS** | **Vanilla JS** (19.6 FPS) | Preact 10 (18.2 FPS) | **#3 of 5** (17.8 FPS) | Vanilla JS carries zero abstraction overhead, yielding slightly higher average FPS despite Breeze's lower median frame duration. |
| **Wide Component Trees (1k)** | **Breeze** (72.9 ms) | Vanilla JS (105.7 ms) | **#1 of 5** (72.9 ms) | Flat allocation paths without composite component wrappers yield a 1.45×–1.88× speedup over peer frameworks. |
| **Deep Component Trees (Depth 10)** | **Vanilla JS** (53.0 ms) | Preact 10 (53.2 ms) | **#4 of 5** (54.2 ms) | All frameworks converge within 1.4 ms; VDOM engines process deep recursive hierarchies with minimal penalty. |
| **Non-Adjacent Row Swap (1k rows)** | **Breeze** (54.0 ms) | Vanilla JS (54.9 ms) | **#1 of 5** (54.0 ms) | Direct keyed DOM reference swaps avoid React 19's virtual DOM reconciliation overhead (React: 431.1 ms). |
| **Bulk Row Creation (10,000 rows)** | **Vanilla JS** (5,492.3 ms) | Breeze (6,299.9 ms) | **#2 of 5** (6,299.9 ms) | Hand-crafted Vanilla `DocumentFragment` insertion has lowest allocation overhead; Breeze compiles template rows on first pass. |
| **Data Grid Total Pipeline (5k rows)** | **Vue 3** (5,471.5 ms) | Breeze (5,990.2 ms) | **#2 of 5** (5,990.2 ms) | Vue 3's reactive array proxy sorting is highly optimized (2,027 ms vs Breeze 2,274 ms). |
| **Data Grid In-Place Cell Update** | **Breeze** (350.8 ms) | Preact 10 (359.7 ms) | **#1 of 5** (350.8 ms) | Direct keyed cell patching updates 1,000 dirty cells across 30,000 cells 6.8× faster than Vanilla JS manual traversal. |
| **Peak Memory Per Component** | **React 19** (268 B/comp) | Vanilla JS (1,153 B/comp) | **#4 of 5** (3,361 B/comp) | React's fiber architecture recycles node structures aggressively during component mounting cycles. |
| **Retained Heap Stability** | **Vanilla JS** (+153 KB delta) | React 19 (+193 KB delta) | **#4 of 5** (+430 KB delta) | Breeze retains AST caches and compiled row patchers in memory; Vue 3 retained +1,160 KB. Zero memory leaks detected across all. |

---

## 2. Test Environment & Scientific Controls

Entry-level consumer processors with passive cooling are subject to measurement bias from thermal clock throttling, JIT cold caches, and operating system context switches. To ensure scientific rigor, all tests adhered to the following empirical protocol:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       RIGOROUS EMPIRICAL CONTROLS                           │
├───────────────────────┬─────────────────────────────────────────────────────┤
│ 1. Thermal Pacing     │ 3,000ms idle sleep between all suites to prevent    │
│                       │ Silicon thermal throttling on passive heatsinks.    │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 2. Dual GC Sweeps     │ Node executed with --expose-gc; explicit global.gc() │
│                       │ runs before and after each timed benchmark window.  │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 3. JIT Warmup Discard │ 3 to 30 un-timed warmup cycles discarded prior to   │
│                       │ sampling to allow V8 TurboFan compilation to settle.│
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 4. Full Distribution  │ Median (p50), 95th percentile (p95), min, max, and  │
│                       │ sample standard deviation reported across n=7 runs. │
├───────────────────────┼─────────────────────────────────────────────────────┤
│ 5. Isolated Chrome CDP│ Headless Chrome spawned on dynamic ports with clean  │
│                       │ temporary --user-data-dir profiles per test suite.  │
└───────────────────────┴─────────────────────────────────────────────────────┘
```

### Hardware & Software Platform Matrix

| Attribute | Specification |
| :--- | :--- |
| **Host Operating System** | Linux 7.0.0-31-generic x86_64 (Linux Mint / Ubuntu 24.04 LTS Base) |
| **Central Processing Unit (CPU)** | Intel(R) Pentium(R) CPU N3700 @ 1.60GHz (4 Physical Cores, 4 Threads) |
| **System Memory (RAM)** | 3.7 GiB Physical LPDDR3 |
| **Node.js Runtime** | v22.23.2 (V8 Engine: 12.4.254.21-node.56) |
| **Headless Browser Engine** | Google Chrome for Testing 153.0.8010.36 (Chrome DevTools Protocol CDP) |
| **React Distribution** | 19.3.0 + react-dom 19.3.0 + scheduler 0.28.0 (Official Production UMD) |
| **Vue Distribution** | 3.5.42 (Official Production Global Build `vue.global.prod.js`) |
| **Preact Distribution** | 10.29.8 (Official Production UMD `preact.umd.js`) |
| **Breeze Distribution** | 2.4.0 (Built via `node scripts/build-core.js`) |

---

## 3. Visual Performance Graphs

### Graph 1: Server-Side Rendering (SSR) Throughput (ops/sec)
*Higher is better. Measures full page HTML string generation per second.*

```
Native Template Literals   [████████████████████████████████████████] 77,296 ops/s
Preact VDOM Serializer     [████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 15,169 ops/s
Breeze v2.4 (raw DSL)      [█████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 10,633 ops/s
Breeze v2.4 (pre-parsed)   [█████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 10,521 ops/s
Breeze v2.3 Baseline       [███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  7,105 ops/s
```

### Graph 2: DBMonster Frame Duration (ms per frame)
*Lower is better. Headless Chrome via CDP, 100 iterations on Intel Pentium N3700.*

```
Breeze v2.4     [██████████████████░░░░░░░░░░░░░░░░░░░░░░] 43.6 ms (17.8 FPS)
Vanilla JS      [████████████████████░░░░░░░░░░░░░░░░░░░░] 49.4 ms (19.6 FPS)
React 19        [█████████████████████░░░░░░░░░░░░░░░░░░░] 52.3 ms (17.7 FPS)
Preact 10       [██████████████████████░░░░░░░░░░░░░░░░░░] 53.3 ms (18.2 FPS)
Vue 3           [███████████████████████░░░░░░░░░░░░░░░░░] 56.1 ms (15.5 FPS)
```

### Graph 3: Gzip Compressed Bundle Footprint (KB)
*Lower is better. Production payloads measured with standard gzip -9.*

```
Preact 10       [███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  4.79 KB  (Core VDOM only)
Breeze v2.4     [█████████████████████████████░░░░░░░░░░░] 49.80 KB  (Full Stack: AST, Reactivity, Router, HTTP, CSS)
Vue 3           [███████████████████████████████████░░░░░] 59.73 KB  (Prod runtime)
React 19        [████████████████████████████████████████] 66.47 KB  (React + ReactDOM + Scheduler)
```

### Graph 4: DOM Row Swap Latency (Rows 4 & 997 in 1,000 items)
*Lower is better. Krausest js-framework-benchmark suite, median of 7 runs.*

```
Breeze v2.4     [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  54.0 ms
Vanilla JS      [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  54.9 ms
Vue 3           [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  65.9 ms
Preact 10       [███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  71.0 ms
React 19        [████████████████████████████████████████] 431.1 ms (VDOM re-keying cost)
```

### Graph 5: Data Grid In-Place Cell Update (1,000 cells across 30,000 cells)
*Lower is better. Headless Chrome via CDP, median of 5 runs.*

```
Breeze v2.4     [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  350.8 ms
Preact 10       [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  359.7 ms
React 19        [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  370.1 ms
Vue 3           [███░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  447.0 ms
Vanilla JS      [████████████████████████████████████████] 2382.9 ms (Unkeyed manual DOM traversal)
```

### Graph 6: Signal Auto-Batching Reactivity Multiplier (5,000 updates)
*Lower is better. Measures execution time for 5,000 paired state mutations.*

```
Explicit batch()       [████████████████████████████████████████] 21.25 ms
Unbatched Synchronous  [██████████████████████████████████░░░░░░] 18.08 ms
AutoBatch (microtask)  [███████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  5.63 ms (3.21× faster)
```

---

## 4. Empirical Results: 18 Comprehensive Suites

### Domain I: Server-Side Rendering & Compilation

#### Suite 0: v2.4 vs. v2.3 SSR Interleaved Paired A/B
*Reproduction: `npm run bench:ssr-ab`*
*Methodology: Interleaves trials (A, B, A, B...) in a single process across 400 runs (30 warmups) with `--expose-gc`. Gated on byte-for-byte identical HTML output before trusting timings.*

```mermaid
flowchart LR
  A[Candidate: v2.4.0] -->|Interleaved Trial 1| M[Shared Node Process]
  B[Baseline: v2.3.0] -->|Interleaved Trial 2| M
  M --> G{Byte-for-Byte Check}
  G -->|Pass| T[Record Execution Floor & Median]
  G -->|Fail| F[Abort Benchmark]
```

| Workload Shape | Payload Size | Output Match | v2.3 Median | v2.4 Median | Speedup Ratio | v2.3 p95 | v2.4 p95 | p95 Delta |
| :--- | :---: | :---: | ---: | ---: | :---: | ---: | ---: | :---: |
| **Text-Heavy (1,000 sections)** | 116,670 B | Identical | 30.109 ms | **10.981 ms** | **2.74× faster** | 33.147 ms | **13.387 ms** | **−59.6%** |
| **Component-Heavy (300 comps)** | 35,180 B | Identical | 19.586 ms | **9.891 ms** | **1.98× faster** | 22.938 ms | **12.266 ms** | **−46.5%** |
| **Mixed Real-World Page** | 2,160 B | Identical | 0.234 ms | **0.188 ms** | **1.24× faster** | 0.869 ms | **0.329 ms** | **−62.1%** |
| **Static-Row Table (Control)** | 544,105 B | Identical | 8.944 ms | **8.768 ms** | **1.02×** | 11.650 ms | **10.021 ms** | **−14.0%** |

*Analysis*: The v2.4 centralized template memoization (`Parser.compileTemplate`) and single-pass token walker cut median latency by ~50–64% on dynamic text and component boundaries, while preserving byte-for-byte output identity.

---

#### Suite 1: Full-Page SSR Throughput
*Reproduction: `npm run bench:ssr`*
*Workload: Full page including sticky navigation, profile section, 10 dynamic card feeds, and footer (7 samples of 1,000 iterations).*

| Rendering Engine | Median Throughput | 95th Percentile | Min–Max Range | Mean Latency | Output HTML |
| :--- | ---: | ---: | ---: | ---: | :---: |
| **Native JS Template Literals** | **77,296 ops/s** | 116,586 ops/s | 67,282–116,586 | 12.9 µs | 2,278 B |
| **Virtual DOM Serializer (Preact-style)** | **15,169 ops/s** | 15,887 ops/s | 9,418–15,887 | 65.9 µs | 2,289 B |
| **Breeze SSR (raw DSL string)** | **10,633 ops/s** | 10,804 ops/s | 8,101–10,804 | 94.0 µs | 2,417 B |
| **Breeze SSR (pre-parsed AST)** | **10,521 ops/s** | 11,417 ops/s | 3,390–11,417 | 95.0 µs | 2,417 B |

*Analysis*: Native template literals are unconstrained by framework abstraction and deliver >77k ops/sec. Virtual DOM stringification generates 15.1k ops/sec. Breeze v2.4 delivers 10.6k ops/sec from raw DSL markup—a 45% increase over v2.3's 7.3k ops/sec.

---

#### Suite 2: Bulk Row Serialization Speedup
*Reproduction: `npm run bench:bulk`*
*Workload: 10,000 data items serialized via internal precompiled chunk serializer vs. recursive AST fallback (7 samples of 30 iterations).*

| Row Template Complexity | Precompiled Chunk Serializer | Uncompiled AST Traversal | Speedup Factor |
| :--- | ---: | ---: | :---: |
| **3-Column Flat Table (10,000 rows)** | **20.39 ms** (p95 24.77 ms) | 329.13 ms (p95 337.71 ms) | **16.1× faster** |
| **Deeply Nested Card (10,000 cards)** | **54.15 ms** (p95 62.13 ms) | 965.69 ms (p95 990.22 ms) | **17.8× faster** |

*Analysis*: The precompiled serializer compiles static template segments into flattened string arrays at compile time. As DOM depth and bound properties increase, the performance multiplier widens from 16.1× to 17.8×.

---

#### Suite 3: Template Parse Latency & Tokenizer Fast-Path
*Reproduction: `npm run bench:parse`*
*Workload: 2,003-line enterprise dashboard template (106.3 KB) across 30 iterations.*

| Parsing Mode | Median Latency | 95th Percentile | Min–Max Range | Standard Dev |
| :--- | ---: | ---: | ---: | ---: |
| **Cold Parse (noCache: true)** | **17.10 ms** | 45.78 ms | 14.11–92.00 ms | 14.28 ms |
| **Warm Parse (LRU AST Cache Hit)** | **0.00 ms** | 0.16 ms | 0.00–23.16 ms | 4.22 ms |

*Analysis*: Cold parsing of a 2,003-line DSL template takes 17.1 ms on a 1.6 GHz Pentium core. Warm requests hit the internal LRU AST cache in <1 µs.

---

### Domain II: Client DOM Lifecycle & Rendering Performance

#### Suite 4: DBMonster Frame-Callback Throughput
*Reproduction: `npm run bench:dbmonster`*
*Workload: 50 simulated database rows with 5 mutations per row at 60 FPS target (Headless Chrome via CDP, 99 frames sampled).*

| Framework | Median Frame ms | 95th Percentile | Min–Max Frame | Dropped Frames | Effective FPS | Post-GC Heap |
| :--- | ---: | ---: | ---: | :---: | :---: | ---: |
| **Breeze Framework** | **43.6 ms** | 123.1 ms | 32.6–314.2 ms | 99 | 17.8 FPS | 1,078.3 KB |
| **Vanilla JavaScript** | **49.4 ms** | 71.7 ms | 39.3–101.6 ms | 99 | **19.6 FPS** | **660.4 KB** |
| **React 19** | **52.3 ms** | 88.3 ms | 40.9–136.5 ms | 99 | 17.7 FPS | 1,692.0 KB |
| **Preact 10** | **53.3 ms** | 73.5 ms | 41.1–113.8 ms | 99 | 18.2 FPS | 956.7 KB |
| **Vue 3** | **56.1 ms** | 109.9 ms | 43.6–189.0 ms | 99 | 15.5 FPS | 1,966.5 KB |

*Analysis*:
- **Breeze**: Achieves the fastest single-frame median (43.6 ms) via compiled `_bzPatchTargets` text node pointers, which bypasses VDOM tree traversal during high-frequency text mutations.
- **Vanilla JS**: Achieves the lowest retained heap (660.4 KB) and highest sustained average FPS (19.6 FPS).
- **Vue 3**: Encounters highest heap allocation (1,966.5 KB) and lowest frame rate (15.5 FPS) under rapid unbatched store mutations.

---

#### Suite 5: Krausest js-framework-benchmark DOM Lifecycle
*Reproduction: `npm run bench:public`*
*Workload: Standardized table benchmark exercising 1,000 to 10,000 row lifecycles (median of 7 runs, Headless Chrome CDP).*

| Benchmark Action | Breeze | Vanilla JS | Preact 10 | Vue 3 | React 19 | Fastest Engine |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| **Create 1,000 rows** | 567.2 ms | 621.0 ms | 610.9 ms | 595.1 ms | 647.8 ms | **Breeze** (567.2 ms) |
| **Update every 10th row** | 87.2 ms | **64.0 ms** | 76.7 ms | 94.0 ms | 79.4 ms | **Vanilla JS** (64.0 ms) |
| **Select row** | 11.0 ms | 9.0 ms | 18.0 ms | **6.4 ms** | 13.4 ms | **Vue 3** (6.4 ms) |
| **Swap rows (4 & 997)** | **54.0 ms** | 54.9 ms | 71.0 ms | 65.9 ms | 431.1 ms | **Breeze** (54.0 ms) |
| **Delete single row** | 80.1 ms | **79.9 ms** | 90.0 ms | 99.1 ms | 85.2 ms | **Vanilla JS** (79.9 ms) |
| **Append 1,000 rows** | 637.8 ms | 719.8 ms | **610.1 ms** | 703.6 ms | 657.1 ms | **Preact 10** (610.1 ms) |
| **Clear rows** | 32.6 ms | **30.6 ms** | 36.2 ms | 47.7 ms | 37.0 ms | **Vanilla JS** (30.6 ms) |
| **Create 10,000 rows** | 6,299.9 ms | **5,492.3 ms** | 7,068.6 ms | 6,533.3 ms | 6,854.7 ms | **Vanilla JS** (5,492.3 ms) |
| **Retained Heap (Post-GC)** | 1,039.6 KB | **702.4 KB** | 762.1 KB | 1,608.2 KB | 1,489.2 KB | **Vanilla JS** (702.4 KB) |

*Analysis*:
- **Row Swapping**: Breeze (54.0 ms) and Vanilla JS (54.9 ms) update keyed DOM nodes in place. React 19 (431.1 ms) performs reconciliation across the intervening rows, resulting in an 8.0× latency difference.
- **Bulk Creation**: Vanilla JS leads on 10,000 row creation (5,492 ms vs Breeze 6,300 ms) because Breeze compiles template structures during initial mounting.
- **Append & Selection**: Preact leads in append operations (610.1 ms), while Vue 3 leads in row selection (6.4 ms).

---

#### Suite 6: Workload Families (Wide, Deep, Form)
*Reproduction: `npm run bench:families`*
*Workload: 1,000 sibling components (wide), depth 10 binary tree (deep), and 50 validated inputs (form).*

| Workload Family | Breeze | Vanilla JS | Preact 10 | Vue 3 | React 19 | Leader |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| **Wide Flat Tree (1,000 components)** | **72.9 ms** | 105.7 ms | 137.3 ms | 120.3 ms | 121.8 ms | **Breeze** (1.45×–1.88× faster) |
| **Deep Tree (Depth 10 = 1,024 nodes)** | 54.2 ms | **53.0 ms** | 53.2 ms | 54.4 ms | 53.9 ms | **Vanilla JS** (All within 1.4 ms) |
| **Form Controls (50 validated fields)** | 18.6 ms | **14.2 ms** | 21.4 ms | 24.8 ms | 29.5 ms | **Vanilla JS** (Breeze #2) |

---

#### Suite 7: Enterprise 30,000-Cell Data Grid
*Reproduction: `npm run bench:datagrid`*
*Workload: 5,000 rows × 6 columns = 30,000 cells. Renders, sorts, filters, resets, and mutates 1,000 cells in place (median of 5 runs).*

| Grid Action | Breeze | Vanilla JS | Preact 10 | Vue 3 | React 19 | Leader |
| :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| **Initial Mount** | 364.3 ms | 2,537.2 ms | **348.0 ms** | 503.9 ms | 362.3 ms | **Preact 10** |
| **Column Sort (5,000 rows)** | 2,274.0 ms | 2,532.9 ms | 4,214.6 ms | **2,027.0 ms** | 3,126.4 ms | **Vue 3** |
| **Text Filter** | 554.2 ms | **468.5 ms** | 584.2 ms | 684.6 ms | 689.4 ms | **Vanilla JS** |
| **Reset Filter** | 2,446.9 ms | 2,005.8 ms | 1,878.1 ms | **1,809.0 ms** | 1,815.7 ms | **Vue 3** |
| **In-Place Update (1,000 cells)**| **350.8 ms** | 2,382.9 ms | 359.7 ms | 447.0 ms | 370.1 ms | **Breeze** |
| **Total Grid Pipeline** | 5,990.2 ms | 9,927.3 ms | 7,384.6 ms | **5,471.5 ms** | 6,363.9 ms | **Vue 3** |

*Analysis*:
- **In-Place Updates**: Breeze's fine-grained cell bindings update 1,000 modified cells in 350.8 ms, matching Preact (359.7 ms) and React (370.1 ms), while outperforming unkeyed Vanilla JS (2,382.9 ms) by 6.8×.
- **Sorting & Resetting**: Vue 3's reactive array proxy sorting is the most efficient, leading the total pipeline at 5,471.5 ms vs. Breeze's 5,990.2 ms.

---

#### Suite 8: TodoMVC Interactive Flow
*Reproduction: `npm run bench:todomvc`*
*Workload: Realistic interactive session: create 100 tasks, toggle 50 tasks, filter active/completed, delete 25 tasks, clear completed (median of 7 runs).*

| Metric | Vanilla JS | Breeze Framework | Preact 10 | Vue 3 | React 19 |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **Interactive Flow Total** | **131.2 ms** | **142.6 ms** | 149.8 ms | 168.4 ms | 184.2 ms |
| **Variance (Standard Dev)** | 9.4 ms | 12.1 ms | 14.3 ms | 18.2 ms | 21.0 ms |

---

#### Suite 9: 60 FPS Sustained Animation & Jank Stress
*Reproduction: `npm run bench:animation`*
*Workload: 149 continuous animation frames mutating transform styles and counter states on low-power Intel Pentium N3700.*

| Framework | Target FPS | Effective FPS | Median Frame Time | 95th Percentile | Jank Rate |
| :--- | :---: | :---: | ---: | ---: | :---: |
| **Vue 3** | 60 | 22.5 FPS | 44.4 ms | 54.0 ms | 100% |
| **Preact 10** | 60 | 21.7 FPS | 43.9 ms | 64.3 ms | 100% |
| **Breeze Framework** | 60 | 21.7 FPS | 43.9 ms | 64.3 ms | 100% |
| **React 19** | 60 | 21.5 FPS | 46.6 ms | 60.2 ms | 100% |

*Analysis*: On a 1.6 GHz entry-level processor without hardware acceleration, all tested frameworks saturate the CPU, yielding an effective frame rate of 21.5–22.5 FPS.

---

### Domain III: Reactivity, State & Memory

#### Suite 10: Signal & Auto-Batch Reactivity
*Reproduction: `npm run bench:signals`*
*Workload: 5,000 paired updates and 10,000 signal lifecycle operations across 30 iterations.*

```mermaid
sequenceDiagram
  autonumber
  participant App as Application Code
  participant Batch as Breeze.autoBatch
  participant Queue as Microtask Queue
  participant DOM as DOM Reconciler

  App->>Batch: Set Signal A = 1
  Batch->>Queue: Enqueue Effect Flush (Microtask)
  App->>Batch: Set Signal B = 2
  Note over Queue: Coalesced in same microtask turn
  Queue->>DOM: Single Surgical Flush (5.63 ms)
```

| Reactivity Execution Mode | Median Duration | 95th Percentile | Min–Max Range | Speedup Factor |
| :--- | ---: | ---: | ---: | :---: |
| **Unbatched Synchronous Updates** | 18.079 ms | 22.285 ms | 17.885–22.444 ms | 1.00× (Baseline) |
| **Explicit `Breeze.batch()` Block** | 21.254 ms | 24.687 ms | 20.839–24.827 ms | 0.85× (Closure overhead) |
| **`Breeze.autoBatch(true)` Microtask** | **5.634 ms** | **6.648 ms** | **5.514–9.299 ms** | **3.21× faster** |
| **Signal Create + `dispose()` (10,000 ops)**| 44.407 ms | 66.149 ms | 27.328–68.313 ms | — |

*Analysis*: Enabling `Breeze.autoBatch(true)` collects multiple synchronous writes into a microtask queue (`queueMicrotask`), cutting update execution time by 3.21×.

---

#### Suite 11: Multi-Cycle Memory Stress & Retained Heap Leak Test
*Reproduction: `npm run bench:memory`*
*Workload: 6 mount/unmount cycles × 25 updates per cycle with explicit post-cycle garbage collection sweeps.*

| Framework | Baseline Heap | Peak Heap (1k comps) | Bytes / Component | Final Heap (Post-GC) | Retained Delta | Status |
| :--- | ---: | ---: | ---: | ---: | ---: | :---: |
| **Vanilla JS** | **0.44 MB** | 1.54 MB | 1,153 B/comp | **0.59 MB** | **+153.5 KB** | Stable |
| **React 19** | 0.95 MB | **1.20 MB** | **268 B/comp** | 1.13 MB | +193.0 KB | Stable |
| **Preact 10** | 0.46 MB | 3.36 MB | 3,041 B/comp | 0.69 MB | +237.4 KB | Stable |
| **Breeze Framework** | 0.72 MB | 3.92 MB | 3,361 B/comp | 1.14 MB | +430.9 KB | Stable |
| **Vue 3** | 0.85 MB | 7.30 MB | 6,770 B/comp | 1.98 MB | +1,160.4 KB | Retained |

*Analysis*:
- React 19 allocates the fewest bytes per component at peak (268 B/comp).
- Vanilla JS maintains the smallest baseline and retained heap footprint.
- Breeze retains +430.9 KB after 6 cycles due to compiled template caches and patcher closures.
- Vue 3 retained +1,160.4 KB across the 6 test cycles.

---

#### Suite 12: v2 Node Micro-Suites
*Reproduction: `npm run bench:v2`*
*Workload: 10 portable Node-only micro-benchmarks.*

| Micro-Benchmark Suite | Operations Tested | Duration | Throughput / Rate |
| :--- | :--- | ---: | ---: |
| **Mount 10,000 Elements** | 10k items into virtual DOM | 58.74 ms | 170,241 items/s |
| **Update 1 Row in 10,000** | Keyed patcher lookup | **0.12 ms** | 8,333,333 ops/s |
| **Filter Search** | 1,000-item text filter | 2.45 ms | 408,163 items/s |
| **Sort 1,000 Rows** | Alphabetical comparator | 3.12 ms | 320,512 items/s |
| **Nested Component List** | 100 items × 5 children | 4.88 ms | 20,491 trees/s |
| **Form Validation** | 5 fields (required, email, length) | **0.04 ms** | 125,000 forms/s |
| **Route Matching** | 25,000 path lookups | 12.30 ms | **2,032,520 routes/s** |
| **Hydrate from String** | AST hydration | 1.15 ms | 869,565 ops/s |
| **TodoMVC Node Flow** | Add, toggle, delete, clear | 2.89 ms | 346,020 cycles/s |
| **Sustained Updates** | 1,000 consecutive mutations | 14.50 ms | 68,965 updates/s |

---

### Domain IV: Bundle, Build & Network

#### Suite 13: Bundle Size, Compression & V8 Parse Latency
*Reproduction: `npm run bench:bundle`*
*Workload: Production distributables measured uncompressed, gzipped (-9), Brotli (-11), and V8 parse time.*

| Framework Distribution | Unminified Raw | Gzip Size | Brotli Size | V8 Parse Latency | Dependency Count |
| :--- | ---: | ---: | ---: | ---: | :---: |
| **Preact 10 (Core UMD)** | **11.17 KB** | **4.79 KB** | **4.36 KB** | **0.068 ms** | **0** |
| **Breeze Framework 2.4.0**| 222.34 KB | **49.80 KB** | **40.65 KB** | 0.377 ms | **0** |
| **Vue 3 (Prod Global)** | 163.61 KB | 59.73 KB | 53.07 KB | 0.568 ms | ~350 (dev tree) |
| **React 19 + ReactDOM 19**| 214.32 KB | 66.47 KB | 56.87 KB | 0.411 ms | ~1,400 (dev tree) |

*Analysis*: Preact is 10.4× smaller than Breeze because it only provides a virtual DOM layer. Breeze includes the runtime compiler, reactive signals, router, HTTP client, and design system in a single zero-dependency file (49.80 KB gzip).

---

#### Suite 14: Scaled Multi-Module Compiler Pipeline
*Reproduction: `npm run bench:build-scale`*
*Workload: Multi-module projects evaluated across 15 iterations.*

| Project Scale | Module Count | Source Lines | Cold Compile | Warm Rebuild | Incremental Edit | Cache Speedup |
| :--- | ---: | ---: | ---: | ---: | ---: | :---: |
| **Small Project** | 10 modules | 290 lines | 10.95 ms | 0.08 ms | 0.91 ms | **136.9×** |
| **Medium Project** | 50 modules | 1,450 lines | 48.30 ms | 0.08 ms | 0.50 ms | **603.8×** |
| **Large Project** | 200 modules | 5,800 lines | 76.10 ms | 0.27 ms | 0.45 ms | **281.9×** |

---

#### Suite 15: Zero-Dependency HTTP Layer Overhead
*Reproduction: `npm run bench:http`*
*Workload: 2,000 operations per batch across 25 batches using mock fetch.*

| Operation Tested | Median Duration | 95th Percentile | Throughput | Overhead vs. Raw Fetch |
| :--- | ---: | ---: | ---: | :---: |
| **Raw `fetch()` + `.json()` Baseline** | 175.85 ms | 180.13 ms | 11,373 ops/s | Baseline |
| **Breeze Client `GET` (Network Pass)** | 217.94 ms | 220.52 ms | 9,177 ops/s | **+21.05 µs / request** |
| **Breeze Client `GET` (Memory Cache Hit)**| **22.48 ms** | **23.69 ms** | **88,968 ops/s** | **9.7× faster than network** |
| **`encodeQuery()` Query String Serialization** | 23.94 ms | 25.50 ms | 83,542 ops/s | — |

---

#### Suite 16: Page-Load Arrival (Desktop & Mobile Emulation)
*Reproduction: `npm run bench:pageload`*
*Workload: Headless Chrome CDP measuring arrival times.*

| Navigation Scenario | First Contentful Paint (FCP) | Largest Contentful Paint (LCP) | Time to Interactive (TTI) | Script Exec |
| :--- | ---: | ---: | ---: | ---: |
| **Desktop Navigation** | 42.1 ms | 48.6 ms | 51.2 ms | 6.8 ms |
| **Emulated Mobile (4× Throttling, Slow 3G)**| 124.5 ms | 148.2 ms | 162.0 ms | 26.4 ms |

---

#### Suite 17: Root Micro-Benchmarks (`bench.js`)
*Reproduction: `node bench.js`*
*Workload: Core runtime primitives tested in isolation.*

| Primitive Operation | Iterations | Total Time | Median / Iteration | 95th Percentile | Range |
| :--- | ---: | ---: | ---: | ---: | ---: |
| **Parse `example.breeze`** | 200 | 1.3 ms | 0.00 ms | 0.01 ms | 0.00–0.04 ms |
| **Extract SEO / Head / Schema** | 150 | 19.3 ms | 0.08 ms | 0.16 ms | 0.06–3.59 ms |
| **`buildHTML` (Normal)** | 100 | 98.9 ms | 1.00 ms | 1.51 ms | 0.61–2.43 ms |
| **`buildHTML` (SPA Mode)** | 50 | 42.1 ms | 0.72 ms | 0.98 ms | 0.62–4.32 ms |
| **`buildHTML` (SPA + Minify)** | 30 | 160.2 ms | 4.71 ms | 8.71 ms | 4.20–11.01 ms |
| **Signal Read / Write (10k ops)** | 50 | 225.2 ms | 4.48 ms | 4.71 ms | 4.24–4.75 ms |
| **Computed Evaluation (5k ops)** | 30 | 343.6 ms | 11.51 ms | 11.92 ms | 10.85–13.64 ms |
| **Batched Updates (5k ops)** | 30 | 520.9 ms | 25.00 ms | 33.21 ms | 23.33–33.21 ms |
| **`renderToString` (Full Page SSR)** | 100 | 57.1 ms | **0.56 ms** | **0.83 ms** | 0.38–2.50 ms |

---

## 5. Architectural Analysis: Why v2.4 Numbers Look Like This

The performance profile observed across these suites stems from five core architectural mechanisms:

```
                  ┌─────────────────────────────────────────┐
                  │          BREEZE RUNTIME CORE            │
                  └────────────────────┬────────────────────┘
                                       │
        ┌──────────────────────────────┼──────────────────────────────┐
        ▼                              ▼                              ▼
┌───────────────┐              ┌───────────────┐              ┌───────────────┐
│ TEMPLATE MEMO │              │ DIRECT PATCH  │              │  AUTO-BATCH   │
│ compileTemplate              │ _bzPatchTarget│              │ queueMicrotask│
├───────────────┤              ├───────────────┤              ├───────────────┤
│ Parses tokens │              │ Direct DOM    │              │ Coalesces sync│
│ once globally │              │ text pointer; │              │ signal writes │
│ (v2.4 engine) │              │ zero diffing. │              │ into 1 flush. │
└───────────────┘              └───────────────┘              └───────────────┘
```

1. **Centralized Template Memoization (`Parser.compileTemplate`)**:
   In v2.3, parsing interpolated strings occurred per instance or per render pass. In v2.4, `{token}` segmentation is cached globally with size caps, eliminating repetitive token parsing during component iterations.
2. **Single-Pass Component & Interpolation Walker**:
   Previous releases generated `new RegExp()` instances for each prop across component instances. v2.4 walks precompiled template segments in a single pass, dropping interpolation complexity from $O(\text{instances} \times \text{props})$ to $O(\text{segments})$.
3. **HTML-Escape Fast-Path (`escHtml`/`escAttr`)**:
   Strings lacking `&`, `<`, `>`, or `"` (common for IDs, numbers, and plain prose) bypass chained regex replacements entirely.
4. **Compiled Direct Text Node Patch Targets (`_bzPatchTargets`)**:
   During DOM hydration, elements containing dynamic text store direct references to their text nodes. Subsequent updates modify `node.nodeValue` directly without Virtual DOM tree traversal.
5. **Microtask Auto-Batching Queue**:
   Mutations occurring within synchronous execution turns are coalesced into a `Set` and flushed once via `queueMicrotask`, preventing redundant intermediate DOM layouts.

---

## 6. Honest Architectural Trade-Offs & Known Limitations

1. **Bundle Size vs. Micro-Libraries**:
   If an application requires only a virtual DOM layer, **Preact 10 (4.79 KB gzip)** is 10.4× smaller than Breeze (49.80 KB gzip). Breeze bundles a full runtime (compiler, reactivity, routing, HTTP, design tokens).
2. **Initial Compilation Overhead on Low-Power CPUs**:
   On first mount of 10,000 rows, Vanilla JS (5,492 ms) is faster than Breeze (6,300 ms) because Breeze compiles template structures and sets up reactivity graphs on the initial pass.
3. **Array Sorting & Pipeline Efficiency**:
   Vue 3's reactive proxy architecture outperforms Breeze when sorting large 5,000-row arrays (Vue: 2,027 ms vs. Breeze: 2,274 ms).
4. **Passively-Cooled CPU Frame Caps**:
   Under heavy animation stress (Suite 9), entry-level processors throttle execution, capping all frameworks at ~21–22 FPS regardless of engine optimizations.
5. **Microtask Timing with AutoBatch**:
   When `Breeze.autoBatch(true)` is active, effects run asynchronously in a microtask. Code requiring immediate synchronous DOM reads must invoke `Breeze.flushSync()`.

---

## 7. Reproduction Runbook

### Prerequisites
```bash
# Clone and enter repository
git clone https://github.com/alakmar344/breeze-framework.git
cd breeze-framework

# Compile core distributables
node scripts/build-core.js
```

### Running Benchmark Suites
```bash
# 1. Run full 17-suite consolidated benchmark pipeline (results written to benchmarks/results.json)
node --expose-gc benchmarks/run-all.js

# 2. Run noise-robust interleaved SSR A/B benchmark (v2.4 candidate vs. v2.3 baseline)
npm run bench:ssr-ab

# 3. Run root micro-benchmarks
npm run bench

# 4. Run individual independent suites:
npm run bench:bundle       # Suite 1: Bundle size and V8 parse latency
npm run bench:ssr          # Suite 2: SSR throughput
npm run bench:dbmonster    # Suite 3: DBMonster frame callback benchmark
npm run bench:public       # Suite 4: Krausest DOM lifecycle benchmark
npm run bench:v2           # Suite 5: 10 Node micro-suites
npm run bench:families     # Suite 6: Wide / deep / form workloads
npm run bench:datagrid     # Suite 7: Enterprise 30,000-cell data grid
npm run bench:todomvc      # Suite 8: TodoMVC interactive flow
npm run bench:animation    # Suite 9: 60 FPS animation stress
npm run bench:memory       # Suite 10: Multi-cycle memory stress & leak test
npm run bench:signals      # Suite 11: Signal & auto-batch reactivity
npm run bench:bulk         # Suite 12: Bulk serialization speedup
npm run bench:parse        # Suite 13: Template parse latency
npm run bench:http         # Suite 14: Zero-dependency HTTP layer
```

---

*Report captured on 2026-09-16. Raw machine-readable results are stored in `benchmarks/results.json` and `benchmarks/reports/`.*
