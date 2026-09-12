# 🌊 Breeze — The Ultra-Lightweight Web Framework

[![Version](https://img.shields.io/badge/version-2.2.0-0266d6?style=flat-square)](package.json)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](LICENSE)
[![Size](https://img.shields.io/badge/JS_size-~34.1KB-f59e0b?style=flat-square)](breeze.js)
[![No deps](https://img.shields.io/badge/dependencies-zero-8b5cf6?style=flat-square)](#)
[![Demo](https://img.shields.io/badge/demo-live-22c55e?style=flat-square)](breeze-framework.vercel.app)

> Build beautiful, reactive web apps with a single declarative `.breeze` file — no build tools, no `node_modules`, no complexity.

---

## ✨ Features (v2.2.0)

- 🚀 **Zero dependencies** — one `breeze.js` file, ~34.1 KB gzipped (148.6 KB raw, 28.2 KB Brotli; roughly half of React 19's 66.5 KB)
- 🧩 **Easy Adoption: Native Web Components** — export any Breeze component as a native Custom Element with `Breeze.defineElement()` for zero-build drop-in adoption in React, Vue, Angular, or standard HTML
- 📝 **Declarative `.breeze` syntax + Dot-Class Shorthand** — indentation markup, `tag.class1.class2#id` shorthand (e.g. `td.col-md-1`, `a.lbl`, `button.btn#run`), `@def` params, `@slot`, `@each … [key=id]` keyed lists. Eliminates closing-tag mismatches by construction, since the grammar has none.
- ⚡ **Fine-grained signals** — disposable `effect()`, `ref()/memo()`, nested `batch()`, recursion depth limit (`MAX_UPDATE_DEPTH = 100`), rAF `schedule()`/`tick()`, cycle-guarded store
- 📜 **Built-in List Virtualization** — `@virtual each item in items [height=40, overscan=5]` renders 1,000,000 items at 60 FPS while clamping DOM memory to $\le 16$ active nodes with $O(1)$ window calculation arithmetic
- 🔍 **DevTools & Reactive Graph Diagnostics** — serializable DAG inspection via `Breeze.diagnostics.graph()`, cycle detection via `Breeze.diagnostics.detectCycles()`, `window.__BREEZE_DEVTOOLS__`, and interactive SVG inspector (`examples/inspector.html`)
- 🔒 **Static Template Type Checking** — `breeze check --types` validates `.breeze` templates against TypeScript and JSON schemas with Levenshtein typo suggestions
- 🔁 **Precompiled row serializers + LIS reconciliation** — static row templates compile into high-speed chunked string serializers (8.4×–35× faster row serialization, 93% GC pause reduction; see [benchmarks/reports/bulk-serialization.md](benchmarks/reports/bulk-serialization.md) and [benchmarks/reports/append-gc.md](benchmarks/reports/append-gc.md)); minimal-move LIS reordering
- 🛡️ **Hardened Robustness & Security** — automatic XSS URL sanitization for `href`/`src`/`action`, hydration tag mismatch detection & self-healing, centralized `reportError()`, `errorBoundary()`
- 🛣️ **Outlet router** — hash/history, `:id`/`:id?`/`*`, `Breeze.outlet()`, sync+async guards, compiled-regex cache (7.5× faster matching)
- 🖥️ **Ultra-Fast SSR + Hydrate** — client parity, parse LRU cache (11×), precompiled `{token}` templates, **4,500–5,500 pages/sec** throughput (see [benchmarks/reports/ssr.md](benchmarks/reports/ssr.md))
- 🎨 **Cerulean Ocean Design System & Modern UI** — distinctive `--bz-primary: #0266d6` palette with WCAG AA (5.42:1) and AAA (8.43:1 on white, 15.81:1 on dark) compliance, glassmorphic cards (`.bz-card-glass`), toggle switches (`.bz-switch`), pill badges (`.bz-badge-blueberry`), glowing buttons (`.bz-btn-glow`), stat cards, segmented tabs, 50+ utilities
- 🌐 **Production HTTP / Data Layer** — dependency-free, tree-shakeable `breeze-http.js`: `createClient()` with retries (exponential backoff + jitter + `Retry-After`), timeouts, `AbortController` cancellation, interceptors, auth + single-flight token refresh, caching + request dedup + stale-while-revalidate, typed `HttpError`, and a reactive `resource()` bound to signals — **~1.2 µs/request** overhead over raw `fetch` (see [docs/http.md](docs/http.md))
- 🧰 **Full Comfort Kit** — `store()` slices, `provide/inject` context, `suspense()`, `portal()`, `errorBoundary()`, `forms`, `i18n`, `a11y` live/focus/trap, `directive()`, `testing` helpers, `codeframe` diagnostics
- 🛠️ **Production CLI** — `init` (templates), `dev` (live reload, auto-port, CORS), `build` (watch, SSG, Gzip/Brotli, asset copying), `serve`/`preview`, `generate` (component/page/route/store/service/test), `lint` (`--fix`), `format` (`--check`), `check` (`--types`), `doctor`, `clean`
- 🛠️ **In-browser DevTools HUD** — press `Ctrl+Shift+B` for live render metrics and state inspector

> Measured 2026-09-11 (Pentium N3700, Chrome 153, React 19.3.0 / Vue 3.5.42 / Preact 10.29.8):
> fastest in 7 of 8 Krausest ops (append goes to Vue), 56.9 frame callbacks/s (3.0× React),
> substantially leaner post-GC heap — see `benchmark.md`.

---

## ⚡ Quick Start

### Option A — One Command (fastest)

```bash
npx breeze-framework init my-app
cd my-app
npm run dev
```

The CLI scaffolds a complete, ready-to-run project with all necessary files and copies the runtime. Open <http://localhost:3000> in your browser — edit `app.breeze` and the page reloads live.

### Option B — CDN (minimal setup)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My App</title>
  <link rel="stylesheet" href="https://unpkg.com/breeze-framework/breeze.css">
</head>
<body>
  <div id="app"></div>
  <script src="https://unpkg.com/breeze-framework/breeze.js"></script>
  <script>Breeze.init('app.breeze', '#app');</script>
</body>
</html>
```

Then write your `app.breeze`:

```
@app "My App"

@theme {
  primary: #6366f1
  bg: #ffffff
  text: #1f2937
}

@nav [sticky]
  link "Home" -> #home
  link "About" -> #about

@section #home [hero, center, pad-xl]
  h1 "Hello, World!"
  p "My first Breeze app."
  button "Learn More" [primary, @click -> navigate(#about)]

@section #about [pad-lg, light]
  h2 "About"
  p "Built with the Breeze Framework."

@footer [dark]
  p "© 2026 My App"
```

---

## 📖 Syntax Reference

### App Declaration

```
@app "My Application Title"
```

Sets the page `<title>`.

---

### Theme

```
@theme {
  primary:   #6366f1
  secondary: #8b5cf6
  accent:    #f59e0b
  bg:        #ffffff
  text:      #1f2937
  radius:    8px
  font:      "Inter, sans-serif"
}
```

Maps to CSS custom properties (`--bz-primary`, `--bz-bg`, etc.) on `:root`.

---

### State

```
@state count = 0
@state username = "Alice"
@state isOpen = false
```

Creates reactive state entries. Reference them in text with `{count}`.

---

### Navigation

```
@nav [sticky]
  link "Home"    -> #home
  link "About"   -> #about
  link "Contact" -> #contact
```

Renders `<nav class="bz-nav bz-sticky">`. Child `link` items become `<a class="bz-nav-link">` with smooth-scroll navigation and active-state tracking.

---

### Sections

```
@section #hero [hero, center, pad-xl]
  h1 "Welcome"
  p "Subtitle text"
```

| Modifier | Effect |
|---|---|
| `hero` | Full-height hero with gradient background |
| `center` | Flex-column, centre-aligned children |
| `pad-sm/md/lg/xl` | Vertical padding |
| `grid-2/3/4` | CSS Grid layout |
| `dark` | Dark background variant |
| `light` | Light (off-white) background |
| `fade-in` | Entrance animation |

---

### Elements

Any HTML tag works as a Breeze element:

```
h1 "Page Title"
h2 "Section Heading"
p  "Body text with {state} bindings"
div [flex, gap-md]
  span "item one"
  span "item two"
```

---

### Buttons

```
button "Click Me" [primary]
button "Cancel"   [outline]
button "Delete"   [danger, @click -> emit(deleteItem)]
```

| Variant | Class applied |
|---|---|
| `primary` | `bz-primary` — indigo |
| `secondary` | `bz-secondary` — purple |
| `accent` | `bz-accent` — amber |
| `success` | `bz-success` — green |
| `warning` | `bz-warning` — yellow |
| `danger` | `bz-danger` — red |
| `outline` | Transparent with border |
| `ghost` | Text only |

---

### Cards

```
card [shadow, hover-lift]
  h3 "Card Title"
  p "Card description text."
```

---

### Reactive Bindings

```
@state score = 42

p "Your score is: {score}"
```

When `score` changes (via `Breeze.setState('score', 99)` or an action), every bound element updates automatically.

---

### Event Actions (Modifiers)

Attach actions with `@eventname -> action(args)` inside `[...]`:

```
button "+" [primary, @click -> increment(count)]
button "-" [secondary, @click -> decrement(count)]
button "Reset" [accent, @click -> setState(count, 0)]
button "Go" [primary, @click -> navigate(#about)]
button "Ping" [ghost, @click -> emit(ping)]
```

| Action | Description |
|---|---|
| `navigate(#id)` | Smooth-scroll and push hash route |
| `setState(key, val)` | Set a state value |
| `increment(key)` | Numeric `+1` |
| `decrement(key)` | Numeric `-1` |
| `toggle(key)` | Boolean flip |
| `emit(eventName)` | Fire on the global event bus |

---

### Forms & Inputs

```
form
  input    [type=text,  placeholder="Your name"]
  input    [type=email, placeholder="Email"]
  textarea [placeholder="Message…"]
  button   "Submit" [primary]
```

HTML attributes are set via `key=value` modifiers.

---

### Attribute Modifiers

Any unknown `key=value` modifier is applied as an HTML attribute:

```
img [src="/logo.png", alt="Logo", width=120]
a   [href="https://example.com", target=_blank]
```

---

### Animations

Apply entrance animations as modifiers:

```
h1 "Title" [fade-in]
p  "Subtitle" [slide-up]
card [zoom-in, hover-lift]
```

| Class | Keyframe |
|---|---|
| `fade-in` | Opacity 0→1 |
| `slide-up` | Translates up + fade |
| `slide-left` | Slides from right |
| `slide-right` | Slides from left |
| `zoom-in` | Scale 0.9→1 + fade |
| `bounce` | Bounce effect |
| `pulse` | Repeating pulse |

---

### Dot-Class & ID Shorthand Syntax

Breeze supports standard CSS selector shorthand on tags:

```
button.btn.primary#submit-btn "Submit Form"
td.col-md-1 "{row.id}"
a.lbl "{row.label}"
card.card-glass.shadow
```

- Any class matching a Breeze token (e.g. `primary`, `card-glass`, `shadow`) resolves to its framework token (`bz-primary`, etc.).
- Any custom or external class (e.g. `col-md-1`, `lbl`, `btn-default`) is preserved verbatim without unwanted prefixes.

---

### Easy Adoption: Native Web Components

Adopt Breeze progressively into existing React, Vue, Angular, or legacy HTML projects without build pipelines:

```js
// Define standard Web Component
Breeze.defineElement('breeze-counter', `
@state count = 0
div.card-glass.shadow
  span.badge-blueberry "Web Component"
  h3 "Count: {count}"
  button.btn-blueberry.btn-glow "+1" [@click -> count++]
`, { observedAttributes: ['count'] });
```

Use it directly in standard HTML, JSX, or Vue templates:

```html
<breeze-counter count="10"></breeze-counter>
```

---

### Blueberry Blue Design System & Modern UI Suite

Breeze v2.1 introduces the **Blueberry Blue** aesthetic palette alongside modern UI component primitives:

| Component | Class | Description |
|---|---|---|
| Glassmorphic Card | `.bz-card-glass` | Elevated card with 16px backdrop blur, subtle luminous border, and shadow |
| Toggle Switch | `.bz-switch` | Accessible checkbox toggle switch bound to state |
| Pill Badge | `.bz-badge-blueberry` | Pill-shaped status badge with blueberry border and light tint |
| Glowing Button | `.bz-btn-blueberry`, `.bz-btn-glow` | Vibrant blueberry gradient button with luminous focus/hover glow |
| Stat Metric Card | `.bz-stat-card` | Numeric dashboard metric card with uppercase label |
| Segmented Tabs | `.bz-tabs` | Pill-style segmented tab controller |

CSS Tokens:
- `--bz-blueberry: #3b82f6`
- `--bz-blueberry-dark: #1d4ed8`
- `--bz-blueberry-light: #eff6ff`
- `--bz-blueberry-glow: rgba(59, 130, 246, 0.35)`

---

### Robustness & Security Hardening

Borrowing battle-tested resilience patterns from React 19 and Vue 3.5:

- **Recursion Guard (`MAX_UPDATE_DEPTH = 100`)**: Halts runaway reactive update cascades before stack overflow, logging clear diagnostics via `reportError()`.
- **Automatic URL Sanitization**: Protects `href`, `src`, and `action` against dangerous `javascript:`, `vbscript:`, and `data:text/html` payloads.
- **Hydration Mismatch Recovery**: Gracefully aligns mismatched SSR nodes (such as ad injector insertions or SSR whitespace drifts) without desynchronizing sibling DOM trees.
- **Cycle Guarded Computed**: Computed getters that reference themselves fail with informative cycle warnings rather than silent crashes.

---

## 🔧 JavaScript API

```js
// Boot from a .breeze file
await Breeze.init('app.breeze', '#app');

// Mount from string
Breeze.mount(source, '#app');

// Reactive state
const counter = Breeze.state('count', 0);
counter.set(5);
counter.get();           // 5
counter.watch(v => console.log('changed to', v));

// Direct state access
Breeze.setState('count', 10);
Breeze.getState('count');   // 10

// Watch
Breeze.watch('count', (newVal, oldVal) => {});

// Computed
Breeze.computed('doubled', ['count'], n => n * 2);

// Routing
Breeze.route('#about', path => console.log('navigated to', path));
Breeze.navigate('#about');

// Event bus
Breeze.on('my-event', data => console.log(data));
Breeze.emit('my-event', { value: 42 });

// DOM helpers
Breeze.query('#app');
Breeze.queryAll('.bz-card');

// Fetch (auto-parses JSON) — legacy one-liner, kept for back-compat
const data = await Breeze.fetch('/api/posts');

// Plugin
Breeze.plugin('myPlugin', {
  install(api) { /* runs at registration time */ },
  actions: {
    myAction(action, event, el) { /* custom action handler */ }
  }
});
```

---

## 🌐 HTTP / Data Layer

Breeze ships a production-grade, **dependency-free** data layer in
`breeze-http.js`. It is a separate, tree-shakeable module built entirely on web
standards (`fetch`, `Headers`, `URL`, `AbortController`) so the core stays tiny
— load it and it installs itself onto `Breeze`. Full guide:
[`docs/http.md`](docs/http.md).

```js
// Simple cases are tiny
const users = await Breeze.http.get('/api/users');
await Breeze.http.post('/api/users', { name: 'Ada' });   // auto JSON body

// Complex cases are still one call
const api = Breeze.createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 10_000,
  retry: { attempts: 3 },                 // exponential backoff + jitter + Retry-After
  cache: { ttl: 30_000, swr: 300_000 },   // TTL + stale-while-revalidate + dedup
  auth: () => localStorage.getItem('token'),
  onUnauthorized: refreshSession,          // single-flight 401 refresh + retry
});

const page = await api.get('/orders', { params: { status: 'open', page: 2 } });

// Typed errors — branch on code, never string-match messages
try { await api.get('/x'); }
catch (e) { if (e.code === 'HTTP' && e.status === 404) notFound(); }

// Reactive async state bound to Breeze signals
const orders = Breeze.resource(({ signal }) => api.get('/orders', { signal }), { initialData: [] });
orders.data.value; orders.loading.value; orders.error.value;
orders.refetch(); orders.mutate(list => [...list, draft]);   // optimistic
```

Highlights: GET/POST/PUT/PATCH/DELETE · JSON/text/binary/stream · 204 & empty
bodies · query serialization · timeouts · `AbortController` cancellation ·
configurable retries with exponential backoff + jitter + `Retry-After` ·
request/response/error interceptors · auth + single-flight token refresh ·
in-memory caching, request dedup/coalescing, and stale-while-revalidate ·
optimistic updates · one typed `HttpError`. Measured overhead: **~1.2 µs per
request** over raw `fetch` (`npm run bench:http`).

---

## 🛠️ CLI Reference

### `breeze init [name]` / `breeze create [name]`

Scaffold a new project with all necessary files and runtimes:

```bash
breeze init my-app
cd my-app
npm run dev
```

Instantly creates and populates:
- `index.html` — bootstrapper
- `app.breeze` — starter template
- `package.json` — project manifest
- `breeze.js` & `breeze.css` — runtime (ready to use)
- `.gitignore` — sensible defaults

The project is **immediately runnable** — no manual copying of runtime files required.

---

### `breeze dev [dir] [port]`

Start a development server with **live reload** (default port: 3000):

```bash
breeze dev              # serve current directory on :3000
breeze dev 4000        # serve current directory on :4000
breeze dev showcase    # serve the 'showcase' directory on :3000
breeze dev showcase 5000  # serve 'showcase' on :5000 (args in any order)
```

Features:
- Serves all static files with correct MIME types
- Watches `.html`, `.breeze`, `.css`, `.js` for changes
- Injects a **Server-Sent Events** live-reload script into HTML responses
- SPA fallback — unknown paths serve `index.html`
- Directory argument is optional; numeric args are treated as port numbers

---

### `breeze build [file] [flags]`

Build to `dist/index.html`:

```bash
breeze build app.breeze
breeze build app.breeze --spa --minify
```

| Flag | Description |
|---|---|
| `--spa` | Inline `breeze.js` for a fully self-contained file |
| `--minify` | Minify HTML, CSS, and JS output |

Reports file sizes after build.

---

### `breeze serve [dir] [port]`

Serve a static directory (default: `dist`, port: `8080`):

```bash
breeze serve
breeze serve dist 9000
```

---

## 🎨 CSS Utility Classes

### Layout

| Class | Description |
|---|---|
| `.bz-center` | Flex column, centred |
| `.bz-flex` | `display: flex` with `gap` |
| `.bz-grid-2/3/4` | CSS Grid columns |
| `.bz-wrap` | `max-width` container, centred |
| `.bz-pad-sm/md/lg/xl` | Padding scale |
| `.bz-gap-sm/md/lg` | Gap scale |

### Color / Theme

| Class | Description |
|---|---|
| `.bz-dark` | Dark background section |
| `.bz-light` | Off-white background section |
| `.bz-primary/secondary/accent` | Brand colour text/bg |

### Effects

| Class | Description |
|---|---|
| `.bz-shadow` | Medium box shadow |
| `.bz-hover-lift` | Lifts card on hover |
| `.bz-hover-glow` | Glow on hover |
| `.bz-hover-scale` | Scales on hover |
| `.bz-rounded` | Border radius |

---

## 🆚 Comparison

| Feature | Breeze v2.1 | React 19 | Svelte | Vue 3.5 | Vanilla HTML |
|---|:---:|:---:|:---:|:---:|:---:|
| Bundle size | ~34.1 KB gzip | ~66 KB gzip | ~10 KB | ~60 KB gzip | 0 |
| Build step required | ❌ | ✅ | ✅ | ✅ | ❌ |
| Reactive state | ✅ Signals + ref/memo/dispose/batch/schedule | ✅ Hooks | ✅ Runes | ✅ Reactivity | ❌ |
| Client routing | ✅ (hash/history, `:id`/`:id?`/`*`, outlet, async guards, regex cache) | ✅ | ❌ | ❌ | ❌ |
| SSR + hydrate | ✅ (parity + non-destructive + cache) | ✅ | ✅ | ✅ | ❌ |
| Forms/i18n/a11y | ✅ Built-in | ❌ | ❌ | ❌ | ❌ |
| Design system | ✅ | ❌ | ❌ | ❌ | ❌ |
| Learning time | Minutes | Days | Hours | Hours | N/A |
| Dependencies | 0 | ~1500 | ~200 | ~300 | 0 |

---

## 📊 Public Multi-Suite Benchmarks

Measured 2026-09-12 on an Intel Pentium N3700, headless Chrome 153 via CDP
(median-of-7 with p95/min/max/sd; enterprise thermal pacing; latest releases: React 19.3.0, Vue 3.5.42, Preact 10.29.8).
Absolute ms are slow on this chip — ordering is the claim:

| Benchmark Workload | 🌊 Breeze | Vanilla JS | Preact 10 | Vue 3.5 | React 19 | Verdict |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Swap rows 4 & 997 (Krausest)** | **4.0 ms** | 35.1 ms | 62.7 ms | 58.3 ms | 403.0 ms | 🌊 **100.8× faster than React 19** |
| **Select active row** | **10.2 ms** | 11.2 ms | 26.5 ms | 13.5 ms | 13.2 ms | 🌊 **Fastest of all 5** |
| **Clear 1,000 rows** | **32.8 ms** | 29.0 ms | 41.2 ms | 37.3 ms | 46.0 ms | 🌊 **1.4× faster than React 19** |
| **Retained Memory (Krausest)** | **1,006.7 KB** | 655.4 KB | 761.2 KB | 1,618.2 KB | 14,156.0 KB | 🌊 **14.1× leaner than React 19** |
| **DBMonster frame throughput** | **17.0 FPS** | 13.0 FPS | 13.7 FPS | 12.8 FPS | 13.1 FPS | 🌊 **#1 overall throughput** |
| **Enterprise Data Grid (30k cells)**| **5,260.6 ms** | 12,538.2 ms | 6,500.8 ms | 5,785.2 ms | 6,167.7 ms | 🌊 **#1 overall pipeline win** |
| **Data Grid 5k Sort** | **328.9 ms** | 2,802.9 ms | 2,705.6 ms | 2,199.1 ms | 2,452.6 ms | 🌊 **7.5× faster than React 19** |
| **Data Grid Search Filter** | **439.7 ms** | 664.6 ms | 601.8 ms | 562.6 ms | 632.3 ms | 🌊 **Fastest of all 5** |
| **TodoMVC Total Flow (7 runs)** | 188.1 ms | 148.0 ms | **113.8 ms** | 104.0 ms | 141.5 ms | High-frequency reactivity flow |
| **Memory Stress Retained Delta (6 cyc)**| **+424.8 KB** | +151.9 KB | +230.7 KB | +1,165.5 KB | +193.3 KB | 🟢 **Zero leaks (Vue retains +1.16MB)** |
| **Compiler Scaling (200 modules)** | **64.72 ms cold / 0.23 ms warm (89,617 lines/sec)** | — | — | — | — | ⚡ **281.4× warm cache speedup** |

*Full methodology, machine fingerprint, per-op variance, historical baselines and honest losses in [benchmark.md](benchmark.md). Raw machine output: `benchmarks/results.json`.*

```bash
# Run all 13 framework benchmarks locally
npm run bench:all

# Or run individual independent benchmark suites:
npm run bench:todomvc      # TodoMVC interactive flow benchmark
npm run bench:animation    # 60 FPS animation & jank stress benchmark
npm run bench:memory       # Multi-cycle memory stress & heap leak benchmark
npm run bench:datagrid     # Enterprise 30,000-cell data grid benchmark
npm run bench:build-scale  # Scaled multi-module compiler pipeline
```

---

## 🌐 Browser Support

| Browser | Minimum version |
|---|---|
| Chrome / Edge | 88+ |
| Firefox | 85+ |
| Safari | 14+ |
| iOS Safari | 14+ |

> Compatibility targets, not benchmark evidence: performance in `benchmark.md` was measured
> on Chrome 153 only. The matrix above follows from the web-platform features Breeze uses
> (`fetch`, CSS custom properties, CSS Grid, `history.pushState`, `EventSource`) — a
> dedicated older-browser verification matrix is future work, tracked in `benchmark.md` §8.

Breeze uses: `fetch`, `CSS custom properties`, `CSS Grid`, `history.pushState`, `EventSource`.

---

## 📁 Project Structure

```
breeze-framework/
├── breeze.js           # Core framework (signals, parser, renderer, router, SSR, profiler)
├── breeze.d.ts         # Full TypeScript API definitions
├── breeze.css          # Complete utility design system
├── breeze-cli.js       # CLI tool (init, dev, build, serve, profile, bench)
├── benchmark.md        # Comprehensive empirical benchmark report
├── benchmarks/         # Krausest js-framework-benchmark suite (Breeze, React, Vue, Preact, Vanilla)
├── showcase/           # Showcase website & technical publication
├── test/               # Automated unit & integration tests (node --test)
├── package.json
└── README.md
```

---

## 🛠️ CLI Reference

The Breeze CLI is a zero-dependency toolkit for rapid development, code generation, diagnostics, and production compilation.

```bash
# Global syntax
breeze <command> [options]
```

### Commands

| Command | Arguments / Flags | Description |
| :--- | :--- | :--- |
| `init` (alias `create`) | `[name] [--template minimal\|counter\|default] [--force]` | Scaffold a new ready-to-run project with runtime & type definitions |
| `dev` | `[dir] [--port 3000] [--host localhost] [--open] [--cors]` | Start live reload server with SSE, port collision recovery, and fallback runtime |
| `build` | `[file] [--out-dir dist] [--minify] [--spa] [--watch] [--clean]` | Compile to static HTML with SSG, Brotli/Gzip auto-compression, and asset copying |
| `serve` (alias `preview`) | `[dir] [--port 8080] [--host localhost] [--open]` | Static production preview server with Brotli/Gzip content negotiation |
| `generate` (alias `g`) | `<kind> <name> [dir] [--force]` | Scaffold `component`, `page`, `route`, `store`, `service`, or `test` |
| `lint` | `[target] [--fix]` | Inspect `.breeze` files for tab indentation, formatting, or directive issues |
| `format` (alias `fmt`) | `[targets...] [--check]` | Normalize indentation to 2 spaces; `--check` validates for CI workflows |
| `check` | `[target] [--types] [--schema types.ts] [--strict]` | Strict parse + SSR smoke test, or static type-checking against schema |
| `doctor` (alias `info`) | — | Inspect system environment, Node.js version, and project health checks |
| `clean` | `[--all]` | Clean build output (`dist/`, `.breeze/`, compressed bundles) |
| `profile` | `[file]` | Benchmark parser throughput, SSR speed, and memory usage |
| `bench` | — | Run full framework performance benchmark suite |
| `help` | `[command]` | Display help manual for any command |

### Examples

```bash
# 1. Create a project with counter template
breeze init my-app --template counter

# 2. Start dev server on port 4000 and open browser
breeze dev --port 4000 --open

# 3. Generate a new component and unit test
breeze generate component UserCard
breeze generate test UserCard

# 4. Run static type checking against TypeScript schema
breeze check --types --schema types.ts

# 5. Format all templates or verify in CI
breeze format
breeze format --check

# 6. Production build with minification and watch mode
breeze build app.breeze --minify --out-dir dist-prod --watch

# 7. Preview production build
breeze preview dist-prod --port 9000
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and test them
4. Open a pull request

Please keep the zero-dependency rule — **no `npm install` for core files**.

---

## 🔧 Troubleshooting

### Elements render in the wrong place

**Cause:** Tabs used for indentation instead of spaces.

Breeze uses **2 spaces per level**. Tabs and spaces mixed together cause silent nesting errors.

**Fix:** Check your `.breeze` file — editor settings or pasted code may have introduced tabs. Convert all indentation to 2-space sequences.

---

### `--minify` produces broken output

**Fixed in v1.0.1+:** Earlier versions had a bug where minified HTML collapsed whitespace inside `<script>` tags, breaking inlined JavaScript (particularly trailing `//` comments).

If upgrading from an older version, rebuild with `--spa --minify`.

---

### Parser warnings about malformed directives

Breeze emits clear, line-numbered warnings if your `.breeze` syntax is off:

```
[Breeze] Line 12: tab indentation detected.
[Breeze] Line 15: Malformed @state: "@state count = [1,2,3]". Expected: @state name = value
[Breeze] Line 8: @theme block is missing a closing "}"
```

Fix the indicated line; the parser tries to recover but invalid syntax may cause partial or incorrect output.

---

## 📄 License

[MIT](LICENSE) © 2026 Breeze Framework Contributors
