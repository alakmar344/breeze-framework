# 🌊 Breeze — The Ultra-Lightweight Web Framework

[![Version](https://img.shields.io/badge/version-1.1.0-6366f1?style=flat-square)](package.json)
[![License](https://img.shields.io/badge/license-MIT-10b981?style=flat-square)](LICENSE)
[![Size](https://img.shields.io/badge/JS_size-~24.6KB-f59e0b?style=flat-square)](breeze.js)
[![No deps](https://img.shields.io/badge/dependencies-zero-8b5cf6?style=flat-square)](#)
[![Demo](https://img.shields.io/badge/demo-live-22c55e?style=flat-square)](breeze-framework.vercel.app)

> Build beautiful, reactive web apps with a single declarative `.breeze` file — no build tools, no `node_modules`, no complexity.

---

## ✨ Features

- 🚀 **Zero dependencies** — one `breeze.js` file, ~24.6 KB gzipped (113.2 KB raw, 20.7 KB Brotli; v1.1.0 shipped file with if/elif/else chains, component params, SSR parity, portable router, non-destructive hydrate)
- 📝 **Declarative `.breeze` syntax** — clean indentation-based markup, `@def` components with params, and `@slot` projections
- ⚡ **Fine-grained reactive signals** — `Breeze.signal()`, `computed()`, disposable `effect()`, and nested `batch()` with cycle-guarded store computeds
- 🔁 **Keyed reconciliation** — template-cloned list diffing (`@each item in list [key=id]`) with append fast-path, duplicate-key warnings, structural fallback
- 🛣️ **Client router** — Hash & History modes, `:id`/`:id?`/`*` patterns, outlet rendering, sync+async guards, decoded params/query
- 🖥️ **Zero-dependency SSR & Hydration** — `Breeze.renderToString()` with client parity (chains/components/ids/attrs) and non-destructive `Breeze.hydrate()`
- 🛠️ **In-browser DevTools HUD** — press `Ctrl+Shift+B` for live render metrics and state inspector
- 🎨 **Complete design system** — 50+ utility classes, dark mode, responsive primitives, `color-mix` fallbacks, reduced-motion
- 📊 **Empirical Multi-Suite Benchmarks (v1.1.0 rerun, median-of-2)** — 4.1× faster updates than React 18, 6.6× faster row deletion, 31.6 FPS DBMonster (2.3× React), 11.7× leaner heap — see `benchmark.md` (v1.0.0 baselines: 4.6×/64×/58.3 FPS/8.1×)

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

// Fetch (auto-parses JSON)
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

| Feature | Breeze | React | Svelte | Vue | Vanilla HTML |
|---|:---:|:---:|:---:|:---:|:---:|
| Bundle size | ~24.6 KB gzip | ~45 KB | ~10 KB | ~35 KB | 0 |
| Build step required | ❌ | ✅ | ✅ | ✅ | ❌ |
| Reactive state | ✅ Signals (disposable effects) | ✅ Hooks | ✅ Runes | ✅ Reactivity | ❌ |
| Client routing | ✅ (hash/history, `:id`/`:id?`/`*`, outlet, async guards) | ✅ | ❌ | ❌ | ❌ |
| Design system | ✅ | ❌ | ❌ | ❌ | ❌ |
| Learning time | Minutes | Days | Hours | Hours | N/A |
| Dependencies | 0 | ~1500 | ~200 | ~300 | 0 |

---

## 📊 Public Multi-Suite Benchmarks

Automated headless Google Chrome runs via Chrome DevTools Protocol (CDP) and Node.js v24 measuring DOM manipulation latency, animation FPS, SSR throughput, and memory consumption:

| Benchmark Operation | 🌊 Breeze | Vanilla JS | Preact 10 | Vue 3 | React 18 |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Create 1,000 rows** | **539.0 ms** | 893.9 ms | 794.3 ms | 573.2 ms | 580.4 ms |
| **Update every 10th row** | **12.4 ms** | 48.3 ms | 116.1 ms | 72.6 ms | 56.7 ms |
| **Select active row** | **12.7 ms** | 25.5 ms | 53.4 ms | 32.8 ms | 14.1 ms |
| **Delete single row** | **1.10 ms** | 117.4 ms | 97.1 ms | 81.1 ms | 71.1 ms |
| **DBMonster (Continuous 60 FPS)** | **58.3 FPS** | 20.8 FPS | 20.0 FPS | 18.3 FPS | 20.0 FPS |
| **Create 10,000 rows** | **5,482 ms** | 6,596 ms | 7,271 ms | 5,814 ms | 6,735 ms |
| **Retained Memory Heap** | **2,425 KB** | 1,813 KB | 15,475 KB | 17,240 KB | 19,622 KB |

*Detailed methodology, hardware specifications, and reproduction instructions in [benchmark.md](benchmark.md).*

```bash
# Run all framework benchmarks locally
npm run bench:all
```

---

## 🌐 Browser Support

| Browser | Minimum version |
|---|---|
| Chrome / Edge | 88+ |
| Firefox | 85+ |
| Safari | 14+ |
| iOS Safari | 14+ |

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
