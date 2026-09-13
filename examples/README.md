# 🚀 Breeze Framework Examples & Canonical Adapters

This directory showcases reference implementations, canonical third-party library adapters, and advanced features of Breeze Framework.

Examples 1–4 run standalone in any modern browser without build steps, bundlers, or `node_modules`.
Examples 5–6 (`react-adapter`, `vue-adapter`) are real Vite apps with real `react`/`vue` npm
dependencies — see their own READMEs for `npm install` / `npm run dev` instructions.

---

## 📂 Example Index

### 1. [List Virtualization (1,000,000 Rows at 60 FPS)](./virtual-list/index.html)
- **Path**: `examples/virtual-list/index.html`
- **Features Demonstrated**:
  - Native `@virtual each item in items [height=40, overscan=5]` directive.
  - Constant memory footprint: clamps DOM nodes to $\le 16$ elements even when rendering a million items.
  - Live FPS and scroll position monitor with GPU-accelerated transforms (`translateY`).
  - Seamless fine-grained reactivity: mutating item properties updates in-place.

### 2. [Reactive Graph Inspector & DevTools](./inspector.html)
- **Path**: `examples/inspector.html`
- **Features Demonstrated**:
  - Live directed dependency graph (DAG) of Breeze signals, computeds, and effects.
  - Color-coded node taxonomy: Signals (blue), Computeds (purple), Effects (green), and Cycles (red).
  - Infinite loop & cyclic dependency detection via `Breeze.diagnostics.detectCycles()`.
  - Console-friendly tabular introspection via `Breeze.diagnostics.table()`.
  - Extension hook connectivity via `window.__BREEZE_DEVTOOLS__`.

### 3. [Third-Party Chart / Canvas Adapter](./chartjs-adapter/index.html)
- **Path**: `examples/chartjs-adapter/index.html`
- **Features Demonstrated**:
  - Integration *pattern* for wiring a hand-rolled canvas widget into Breeze's reactivity with `Breeze.effect()` — a template you can point at Chart.js, D3.js, Highcharts, Three.js, etc.
  - One-way reactive signal binding using `Breeze.effect()`.
  - Dynamic dataset addition, randomization, and mode toggling (bar vs. line/area) with zero framework bloat.
  - **Honesty note**: this example does not actually `import` Chart.js (or any charting library) from npm — the canvas drawing code is hand-rolled vanilla JS standing in for "some external canvas widget." For a genuine third-party-library integration with real, `npm install`-ed packages, see examples 5 and 6 below.

### 4. [Third-Party DatePicker Two-Way Binding](./datepicker-adapter/index.html)
- **Path**: `examples/datepicker-adapter/index.html`
- **Features Demonstrated**:
  - Two-way reactive state synchronization *pattern* for wiring an external UI widget into Breeze signals — a template you can point at Pikaday, Flatpickr, or any real vanilla-JS datepicker.
  - UI-to-signal propagation on date click events.
  - Signal-to-UI propagation via `Breeze.effect()`.
  - Quick-preset programmatic signal mutations (`+1 Day`, `+1 Week`, `+1 Month`).
  - **Honesty note**: like the chart adapter above, this is a hand-rolled vanilla-JS calendar widget demonstrating the two-way binding *pattern*, not an actual Pikaday/Flatpickr `npm install`. See examples 5 and 6 for real, installed-from-npm framework interop.

### 5. [React Adapter — Real Custom Element Interop](./react-adapter/README.md)
- **Path**: `examples/react-adapter/`
- **Features Demonstrated**:
  - A genuine Vite + React app with real `react`/`react-dom`/`vite` npm dependencies (`npm install && npm run dev` / `npm run build`).
  - A real `.breeze` component registered as a native Custom Element via `Breeze.defineElement()`, mounted directly in JSX (`<breeze-counter>`).
  - **Props in**: React passes a prop down as a plain DOM attribute, read by Breeze's `observedAttributes`.
  - **Events out**: Breeze dispatches a real `CustomEvent('bz-change')` on state changes, observed by React via `ref` + `addEventListener` (necessary because JSX event props don't understand custom DOM event names) and mirrored into `useState`.
  - A headless, unmocked `npm run verify` script that parses the real `.breeze` source and drives the real custom element inside jsdom.

### 6. [Vue Adapter — Real Custom Element Interop](./vue-adapter/README.md)
- **Path**: `examples/vue-adapter/`
- **Features Demonstrated**:
  - A genuine Vite + Vue 3 app with real `vue`/`vite`/`@vitejs/plugin-vue` npm dependencies (`npm install && npm run dev` / `npm run build`).
  - A real `.breeze` component (a counter + boolean toggle) registered as a native Custom Element via `Breeze.defineElement()`, mounted directly in a Vue SFC template (`<breeze-toggle-counter>`), using Vue's native `isCustomElement` compiler option.
  - **Props in**: Vue's `:count="initialCount"` binds down as a plain DOM attribute, read by Breeze's `observedAttributes`.
  - **Events out**: Breeze dispatches a real `CustomEvent('bz-change')` on state changes, observed directly with a plain `@bz-change="..."` template listener — Vue's compiler treats it as a native `addEventListener` call, no `ref` plumbing required (a nice contrast with the React example above).
  - A headless, unmocked `npm run verify` script that parses the real `.breeze` source and drives the real custom element inside jsdom.

---

## 🛠️ Canonical Adapter Design Patterns

### Pattern A: External Component Reactive Binding
When wrapping an external library that consumes data (e.g. charts, maps, data grids):
```javascript
// 1. Declare signals
const dataSignal = Breeze.signal([10, 20, 30]);

// 2. Initialize external instance
const widget = new ExternalWidget('#container');

// 3. Reactively sync via Breeze effect
const cleanup = Breeze.effect(() => {
  widget.setData(dataSignal.value);
});
```

### Pattern B: Two-Way Widget Synchronization
When wrapping an interactive input widget (e.g. rich text editors, datepickers, sliders):
```javascript
const valueSignal = Breeze.signal('2026-09-11');

// Widget -> Signal
widget.onChange(nextVal => {
  valueSignal.value = nextVal;
});

// Signal -> Widget
Breeze.effect(() => {
  if (widget.getValue() !== valueSignal.value) {
    widget.setValue(valueSignal.value);
  }
});
```
