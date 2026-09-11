# 🚀 Breeze Framework Examples & Canonical Adapters

This directory showcases reference implementations, canonical third-party library adapters, and advanced features of Breeze Framework.

All examples run standalone in any modern browser without build steps, bundlers, or `node_modules`.

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
  - Integration pattern for canvas charting libraries (Chart.js, D3.js, Highcharts, Three.js).
  - One-way reactive signal binding using `Breeze.effect()`.
  - Dynamic dataset addition, randomization, and mode toggling (bar vs. line/area) with zero framework bloat.

### 4. [Third-Party DatePicker Two-Way Binding](./datepicker-adapter/index.html)
- **Path**: `examples/datepicker-adapter/index.html`
- **Features Demonstrated**:
  - Two-way reactive state synchronization with external UI widgets (Pikaday, Flatpickr, vanilla datepickers).
  - UI-to-signal propagation on date click events.
  - Signal-to-UI propagation via `Breeze.effect()`.
  - Quick-preset programmatic signal mutations (`+1 Day`, `+1 Week`, `+1 Month`).

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
