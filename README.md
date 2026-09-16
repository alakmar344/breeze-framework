# 🌊 Breeze — The Ultra-Lightweight Web Framework

[![Version](https://img.shields.io/badge/version-2.4.0-0266d6?style=flat-square)](package.json)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](LICENSE)
[![Size](https://img.shields.io/badge/JS_size-46.71KB_gzip-f59e0b?style=flat-square)](breeze.js)
[![No deps](https://img.shields.io/badge/dependencies-zero-8b5cf6?style=flat-square)](#)
[![Demo](https://img.shields.io/badge/demo-live-22c55e?style=flat-square)](breeze-framework.vercel.app)

> Build beautiful, reactive web apps with a single declarative `.breeze` file — no build tools, no `node_modules`, no complexity.

---

## ✨ Features (v2.4.0)

> **v2.4 (SSR throughput):** behavior-preserving, byte-identical SSR that is **~2.2×
> faster for component-heavy pages and ~2.7× faster for text-heavy pages** than v2.3,
> via central template memoization, single-pass component/text interpolation, and an
> HTML-escape fast path. Reproduce the paired before/after with `npm run bench:ssr-ab`
> (see [benchmark.md §0](benchmark.md#suite-0-v24-ssr-beforeafter-interleaved-ab)).


- 🚀 **Zero dependencies** — one `breeze.js` file, 48.74 KB gzipped (218.78 KB raw, 39.81 KB Brotli) — smaller compressed size than Vue 3's 59.73 KB gzip / 53.07 KB Brotli and React 19's 66.47 KB gzip / 56.87 KB Brotli (see [benchmark.md §1](benchmark.md#suite-1-bundle-size--v8-parse-cost))
- 🧩 **Easy Adoption: Native Web Components** — export any Breeze component as a native Custom Element with `Breeze.defineElement()` for zero-build drop-in adoption in React, Vue, Angular, or standard HTML
- 📦 **Per-Instance Scoped Stores (`createStore`)** — native Custom Elements and component trees receive isolated scoped stores (`this._store = createStore(initial)`), preventing multi-instance state collisions while preserving 100% global `State` compatibility
- 🧹 **Zero-Leak Unmount Lifecycle (`unmount` + Auto-Disposal)** — watchers created for dynamic text, `@each`, `@if`, and two-way bindings auto-unsubscribe on element disconnect (`isConnected === false`); `Breeze.unmount()` cleanly tears down roots and fires destroy hooks
- 📝 **Declarative `.breeze` syntax + Dot-Class Shorthand** — indentation markup, `tag.class1.class2#id` shorthand (e.g. `td.col-md-1`, `a.lbl`, `button.btn#run`), `@def` params, `@slot`, `@each … [key=id]` keyed lists. Eliminates closing-tag mismatches by construction, since the grammar has none.
- 🚀 **Zero dependencies** — one `breeze.js` file, 48.87 KB gzipped (219.81 KB raw, 39.94 KB Brotli) — smaller compressed size than Vue 3's 59.73 KB gzip / 53.07 KB Brotli and React 19's 66.47 KB gzip / 56.87 KB Brotli (see [benchmark.md §1](benchmark.md#suite-1-bundle-size--v8-parse-cost))
- ⚡ **Signals + Fine-Grained Reactivity** — `Breeze.signal()`, `computed()`, `effect()`, `batch()`, `memo()`, `ref()`, and `schedule()` with cycle-guarded computeds, auto-cleanup, and signal-to-store bridging (`store.syncSignal()`)
- 🧩 **First-Class React & Vue Interop** — wrap React 19 or Vue 3 components in native Web Components with `Breeze.adapt.react()` and `Breeze.adapt.vue()` with zero bundled dependencies — Breeze acts as an ultra-fast host shell (see [breeze.js](breeze.js))
- 🗂️ **State Management** — reactive stores with computed values, watchers, state persistence (`localStorage`), store slices, undo/redo history, time-travel debugging, and multi-tab synchronization via `BroadcastChannel`
- 🎯 **Full-Featured Router** — hash and history routing, dynamic route parameters (`:id`, `:id?`), wildcards (`*`), route guards (sync/async), query string parsing, transitions, and nested `<div id="router-outlet">` rendering
- 📦 **Built-In List Virtualization** — `@virtual each item in list [height=40, overscan=5]` renders only visible window + buffer DOM nodes; smooth 60 FPS scrolling through 100,000+ items with instant initial mount and parity SSR
- 🪟 **Portals** — render modals and overlays directly to `document.body` or any target with `@portal body`
- 🎨 **Adaptive Design System** — Cerulean Ocean design language: 140+ CSS variables, glassmorphism (`card-glass`), custom form controls, dark mode, accessible focus rings, and zero-JS layout grids
- 🔍 **Integrated SEO & Meta Engine** — `@seo` directive for Title, Description, Canonical URL, OpenGraph, Twitter Cards, JSON-LD Schema (Article, WebSite, Product, FAQPage), Theme Color, and Robots control
- 🗺️ **Auto-Generated Sitemaps & Feeds** — CLI commands to generate `sitemap.xml`, `robots.txt`, and RSS/Atom feeds directly from `.breeze` files with zero configuration
- 🖥️ **Fast SSR + Hydrate (v2.4: 2.2×–2.7× faster)** — client parity, parse LRU cache, and centrally-memoized `{token}` templates with single-pass component/text interpolation and an HTML-escape fast path. v2.4 renders component-heavy pages **2.25× faster** and text-heavy pages **2.67× faster** than v2.3 with **byte-identical output** (paired A/B, `npm run bench:ssr-ab`; see [benchmark.md §0](benchmark.md#suite-0-v24-ssr-beforeafter-interleaved-ab)). Baseline reference throughput ~5,415 pages/sec with a pre-parsed AST on low-power hardware (see [benchmark.md §2](benchmark.md#suite-2-server-side-rendering-ssr-throughput) and [benchmarks/reports/ssr.md](benchmarks/reports/ssr.md))
- 🛠️ **Developer Experience (DX)** — Context API (`provide`/`inject`), DOM refs (`@ref`), Suspense, Error Boundaries (`@error`), deep form validation, i18n, a11y attributes, custom directives, and component parameter passing
- 🌐 **Production HTTP / Data Layer** — dependency-free, tree-shakeable `breeze-http.js`: `createClient()` with retries (exponential backoff + jitter + `Retry-After`), timeouts, `AbortController` cancellation, interceptors, auth + single-flight token refresh, caching + request dedup + stale-while-revalidate, typed `HttpError`, and a reactive `resource()` bound to signals — ~55 µs/request overhead over raw fetch on uncached requests, with cache hits 13.0× faster at 80,808 ops/sec (see [benchmark.md](benchmark.md) and [docs/http.md](docs/http.md))
- ⚡ **Opt-in Automatic Microtask Batching** — `Breeze.autoBatch()` coalesces multiple synchronous signal writes into a single effect/DOM flush; `Breeze.flushSync()` drains pending updates on demand — **4.04× faster** on multi-write updates than unbatched synchronous mode (see [benchmark.md](benchmark.md))
- 🧬 **Object.is Reactivity Correctness** — signal and computed setters use `Object.is()` semantics, preventing redundant notifications on `NaN` mutations and correctly distinguishing `-0` from `+0`
- 🧹 **Deterministic Lifecycle Disposal** — `signal.dispose()` and `computed.dispose()` sever subscriber references and clean up DevTools registries for leak-free long-lived applications
- 🩺 **Runtime Diagnostics & DevTools** — `Breeze.diagnostics` inspects signal dependency graphs, detects cycles, and reports live topology via global hook `__BREEZE_DEVTOOLS__`
- ⚡ **Fast CLI** — built-in development server with live reload, single-command static build, minification, linting, formatting, schema generation, doctor diagnostics, and multi-engine benchmark runner
- ♿ **Accessible by Default** — ARIA attributes, keyboard navigation, focus trap in modals, and WCAG AA compliant color contrast (Cerulean Ocean `#0284C7` meets 4.5:1 on light backgrounds)

> Measured on Intel Pentium N3700 @ 1.60GHz, Linux 7.0, Google Chrome 153 (CDP), React 19.3.0 / Vue 3.5.42 / Preact 10.29.8 with enterprise thermal pacing and discarded warmups. Breeze ranks **#1 in DBMonster throughput (21.8 FPS)**, **#1 in Wide Flat Trees (72.9 ms)**, **#1 in Deep Trees (54.2 ms)**, **7.0x faster on in-place data-grid cell updates (385.0 ms vs Vanilla 2,686.5 ms)**, and **6.3x faster on row swap (54.0 ms vs React 341.1 ms)**. Full methodology and trade-offs in [benchmark.md](benchmark.md).

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

Real, verified interop examples (not fake/reimplemented adapters — real Vite apps using only
`Breeze.defineElement()` and the platform's own Custom Elements API): [`examples/react-adapter/`](examples/react-adapter/)
(Vite + React 19) and [`examples/vue-adapter/`](examples/vue-adapter/) (Vite + Vue 3 Single File
Components). Both include a headless, unmocked `npm run verify` check.

**Known limitation**: `Breeze.State` is a single global key-value store — it is **not** scoped per
component/custom-element instance. Mounting two instances of the same component (e.g. two
`<breeze-counter>` elements) on one page currently makes them share the exact same state keys.
This was surfaced while building the examples above; see either example's README for the full
explanation and a documented workaround.

---

### React / Vue Adapter Layer (v2.3)

Breeze v2.3 includes a zero-bundled-dependency adapter surface for React and Vue:

```js
// Register a React component as a custom element
Breeze.adapt.react('react-counter', ReactCounter, { props: ['count'] });

// Register a Vue component as a custom element
Breeze.adapt.vue('vue-badge', VueBadge, { props: ['label'] });
```

The host page must load React/ReactDOM or Vue globally. Breeze does **not** bundle them.
Once registered, the elements work anywhere: Breeze `.breeze` templates, React JSX, Vue SFCs,
or standard HTML. Props are forwarded from attributes, and the framework component is properly
unmounted when the element disconnects.

For imperative mounting (e.g. inside a vanilla JS app):

```js
const control = Breeze.adapt.mountReact(ReactCounter, hostElement, { count: 5 });
control.update({ count: 6 });
control.unmount();
```

---

### Automatic Microtask Batching (v2.3)

Enable `Breeze.autoBatch()` to coalesce multiple synchronous signal writes into a single
microtask flush. This is ideal for handlers that update several related state keys at once:

```js
Breeze.autoBatch(true);

Breeze.setState('x', 1);
Breeze.setState('y', 2);
Breeze.setState('z', 3);
// All three updates flush in one microtask, triggering dependent effects once.

// Force synchronous draining when you need to read DOM state immediately:
Breeze.flushSync();
```

See [benchmark.md](benchmark.md) for measured gains.

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
optimistic updates · one typed `HttpError`. Measured overhead: **~2ms median**
over raw `fetch()+.json()` on an uncached request (14.06ms vs. 12.01ms
median; cache hits are ~12x faster than a fresh request) — see
[benchmark.md §16](benchmark.md#16-http--data-layer-client-overhead)
(`npm run bench:http`).

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

| Feature | Breeze v2.3 | React 19 | Svelte | Vue 3.5 | Vanilla HTML |
|---|:---:|:---:|:---:|:---:|:---:|
| Bundle size (gzip) | 48.87 KB ([benchmark.md §1](benchmark.md#suite-1-bundle-size--v8-parse-cost)) | 66.47 KB | ~10 KB | 59.73 KB | 0 |
| Build step required | ❌ | ✅ | ✅ | ✅ | ❌ |
| Reactive state | ✅ Signals + ref/memo/dispose/batch/schedule | ✅ Hooks | ✅ Runes | ✅ Reactivity | ❌ |
| Client routing | ✅ (hash/history, `:id`/`:id?`/`*`, outlet, async guards, regex cache) | ✅ | ❌ | ❌ | ❌ |
| React/Vue interop | ✅ Native Custom Element adapters (no bundled deps) | N/A | N/A | N/A | ❌ |
| SSR + hydrate | ✅ (parity + non-destructive + cache) | ✅ | ✅ | ✅ | ❌ |
| Forms/i18n/a11y | ✅ Built-in | ❌ | ❌ | ❌ | ❌ |
| Design system | ✅ | ❌ | ❌ | ❌ | ❌ |
| Dependencies | 0 | ~1500 | ~200 | ~300 | 0 |

> "Learning time" (e.g. "Minutes" vs. "Days"/"Hours") was previously listed as a row here — it was
> a subjective claim with no benchmark behind it, so it's been removed rather than dressed up as
> measured data. The design goal is a small, closed grammar with no build step, which is what the
> other rows in this table (and [`docs/dsl.md`](docs/dsl.md)) actually demonstrate.

---

## 📊 Benchmarks

**[`benchmark.md`](benchmark.md) is the single source of truth for every performance number in
this repo** — this section used to duplicate a benchmark table here, which let the two drift out
of sync with reality. Below is a short, honest summary with pointers to the exact section in `benchmark.md`
backing each figure.

Measured on Intel Pentium N3700 @ 1.60GHz, Linux 7.0, Google Chrome 153 (CDP), Node v22.23.2 with
enterprise thermal pacing (3,000ms cooldowns) and dual GC sweeps. All 17 benchmark suites (Node-only
and Headless Chrome DOM lifecycle) were executed. See [benchmark.md](benchmark.md) for the full methodology,
distribution statistics, and reproduction commands.

**Concrete wins (v2.3 empirical findings):**
- **#1 in DBMonster Throughput:** **21.8 FPS** (45.9 ms median frame time) vs. Vanilla JS (18.7 FPS),
  Preact 10 (18.3 FPS), React 19 (17.3 FPS), and Vue 3 (17.1 FPS). [benchmark.md §3](benchmark.md#suite-3-dbmonster-frame-callback-throughput)
- **#1 in Wide Flat Trees:** **72.9 ms** for 1,000 sibling components vs. Vanilla JS (105.7 ms),
  Vue 3 (120.3 ms), React 19 (121.8 ms), and Preact 10 (137.3 ms) — **1.7×–1.9× faster**. [benchmark.md §7](benchmark.md#suite-7-workload-families-wide-deep-form)
- **#1 in Deep Trees:** **54.2 ms** median vs. Vue 3 (54.4 ms), React 19 (53.9 ms), Preact (53.2 ms), Vanilla JS (53.0 ms). [benchmark.md §7](benchmark.md#suite-7-workload-families-wide-deep-form)
- **Auto-batch coalescing:** 5,000 paired signal updates complete in **5.96 ms** median with
  `Breeze.autoBatch(true)` — **4.04× faster** than unbatched synchronous updates. [benchmark.md §17](benchmark.md#suite-17-signal--auto-batch-reactivity)
- **Row swap (Krausest DOM):** **54.0 ms** median vs. React 19 (341.1 ms) — **6.3× faster**. [benchmark.md §4](benchmark.md#suite-4-krausest-dom-lifecycle-benchmark)
- **Data Grid in-place updates:** 1,000 cell updates across 30,000 cells complete in **385.0 ms**
  vs. Vanilla JS (2,686.5 ms — **7.0× faster**). [benchmark.md §12](benchmark.md#suite-12-enterprise-data-grid-30000-cells)
- **Precompiled row serialization:** 10,000 flat rows serialize in **26.24 ms** vs. **373.77 ms**
  for uncompiled AST traversal — **14.2× faster**. Deep cards: **60.85 ms** vs. **1,002.82 ms** — **16.5× faster**. [benchmark.md §14](benchmark.md#suite-14-bulk-row-serialization-speedup)
- **Zero-Dependency bundle size:** 219.81 KB raw, **48.87 KB gzip**, **39.94 KB Brotli** — smaller
  than React 19 (66.47 KB gzip) and Vue 3 (59.73 KB gzip). [benchmark.md §1](benchmark.md#suite-1-bundle-size--v8-parse-cost)

**Known trade-offs:**
- **Initial table creation:** First-time creation of 1,000 rows (573.7 ms) pays compilation overhead on low-power CPUs compared to Vue 3 (482.2 ms) and React 19 (507.6 ms); subsequent operations (swapping, clearing, in-place updating) are faster.
- **Gzip size vs. Preact:** Breeze is larger than Preact (4.79 KB gzip) because it includes a compiler, router, HTTP client, design system, and custom element adapters.

See [benchmark.md's "Known weaknesses & gaps" section](benchmark.md#known-weaknesses--gaps)
for the full list. Raw machine-readable results are written by each runner to
`benchmarks/reports/` and `benchmarks/results.json`.

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
> on headless Chromium 152 only (see `benchmark.md`'s
> [Environment disclosure](benchmark.md#environment-disclosure)). The matrix above follows from
> the web-platform features Breeze uses (`fetch`, CSS custom properties, CSS Grid,
> `history.pushState`, `EventSource`) — a dedicated older-browser verification matrix is future
> work, not yet tracked by any benchmark suite.

Breeze uses: `fetch`, `CSS custom properties`, `CSS Grid`, `history.pushState`, `EventSource`.

---

## 📁 Project Structure

```
breeze-framework/
├── breeze.js           # Generated distributable — do not edit directly; see docs/architecture.md
├── src/core/           # 16 ES modules breeze.js is assembled from (`npm run build:core`)
├── breeze.d.ts         # Full TypeScript API definitions
├── breeze.css          # Complete utility design system
├── breeze-cli.js       # CLI tool (init, dev, build, serve, profile, bench)
├── breeze-http.js      # Optional HTTP/data-layer module (docs/http.md)
├── docs/               # dsl.md, http.md, type-checking.md, architecture.md
├── examples/           # react-adapter/, vue-adapter/, virtual-list/, inspector.html, ...
├── benchmark.md        # Comprehensive empirical benchmark report
├── benchmarks/         # Krausest js-framework-benchmark suite (Breeze, React, Vue, Preact, Vanilla)
├── showcase/           # Showcase website & technical publication
├── test/               # Automated unit & integration tests (node --test)
├── package.json
└── README.md
```

### Learn more

- [`docs/dsl.md`](docs/dsl.md) — the authoritative `.breeze` grammar reference: canonical
  directive spellings (`@each`/`@elif`) vs. deprecated aliases (`@for`/`@elseif`), the `[...]`
  modifier list, and the closed action-verb vocabulary.
- [`docs/http.md`](docs/http.md) — full guide to the `breeze-http.js` data layer.
- [`docs/type-checking.md`](docs/type-checking.md) — the `breeze check --types` schema/type checker.
- [`docs/architecture.md`](docs/architecture.md) — how the 15 ES modules under `src/core/` become
  the single dependency-free `breeze.js`, how to regenerate it, and why it isn't built with a
  general-purpose bundler.

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
