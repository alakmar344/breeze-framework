# Breeze ⇄ Vue — a genuine Custom Element interop example

This is a real [Vite](https://vitejs.dev/) + [Vue 3](https://vuejs.org/) app (using real Single
File Components). It does not reimplement Breeze in Vue, and it does not rewrite this Vue app "in
Breeze." Like the sibling `examples/react-adapter`, it demonstrates the one thing that actually
makes cross-framework interop real: the platform's own
[Custom Elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) API.

## What's real vs. what Breeze provides

| Piece | What it is |
|---|---|
| `vue`, `vite`, `@vitejs/plugin-vue` | Real npm packages, installed from the public registry — see `package.json`. Only dev/runtime dependencies of *this example*, not of core Breeze. |
| `<breeze-toggle-counter>` | A standard, native browser [`HTMLElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement) / Custom Element, produced by `customElements.define(...)`. Vue has zero special-case code for it beyond the one compiler hint below. |
| `Breeze.defineElement()` | The **only** Breeze-specific call in this whole example (see `src/breeze-toggle-counter.js`). It compiles a real `.breeze` template (`Breeze.parse()` / the Breeze `Renderer`) and wraps it in a native Custom Element class. |
| `isCustomElement` in `vite.config.js` | Standard, documented Vue configuration (not a Breeze concept) that tells Vue's SFC template compiler "`breeze-*` tags are native elements, not unresolved Vue components." Vue needs this for *any* custom element library, not specifically for Breeze. |
| Everything else in `src/App.vue`, `src/main.js` | Plain Vue — `<script setup>`, `ref()`, template syntax. Nothing Breeze-aware. |

`window.Breeze` itself is loaded exactly the way the root project's README documents ("Option B",
a plain `<script src="breeze.js">` tag) — see `index.html`. `scripts/copy-breeze.mjs` copies the
real repo-root `breeze.js` / `breeze.css` into this example's `public/vendor/` at `predev`/`prebuild`
time so the example is self-contained without forking Breeze's source. Nothing under the repo root
(`breeze.js`, `breeze-cli.js`, `breeze-http.js`, or any root config) is modified by this example.

## The component

`src/breeze-toggle-counter.js` defines a small, non-trivial `.breeze` component — a counter with
three actions (`-1`, `Reset`, `+1`) plus an independent boolean toggle — and registers it as
`<breeze-toggle-counter>` via `Breeze.defineElement(tagName, source, options)`. Its markup, its
`count`/`active` state, and its click handling are 100% Breeze's own DSL, compiler, and DOM
renderer. Vue never touches the inside of the element; it only ever sees a DOM node.

## Two-way data flow

**Props in — Vue → Breeze.** `App.vue`'s template renders
`<breeze-toggle-counter :count="initialCount" @bz-change="onBzChange">`. Because
`vite.config.js` registers `isCustomElement: tag => tag.startsWith('breeze-')` with
`@vitejs/plugin-vue`'s template compiler, Vue compiles `breeze-toggle-counter` as a plain DOM
element rather than trying to resolve it as a Vue component. Since `count` isn't an existing
property on the custom element instance, Vue's runtime falls back to `el.setAttribute('count', ...)`
— exactly the attribute Breeze's `observedAttributes: ['count']` option watches. On first connect,
`Breeze.defineElement`'s `connectedCallback` reads that attribute and seeds its own internal state
from it (see `breeze.js`).

**Events out — Breeze → Vue.** Every click inside the Breeze component runs entirely inside
Breeze's own action system (`decrement(count)`, `setState(count, 0)`, `increment(count)`,
`toggle(active)` in the `.breeze` source). The `connected()` hook passed to `defineElement` calls
`Breeze.watch('count', ...)` / `Breeze.watch('active', ...)` — Breeze's own public
state-subscription API — and re-broadcasts every change as a real, bubbling, composed
`CustomEvent('bz-change', { detail: { count, active } })` on the host element. The Vue template
observes this with a plain `@bz-change="onBzChange"` listener, which Vue's compiler turns directly
into `addEventListener('bz-change', onBzChange)` because the element is recognized as native (no
special-case Vue code for unknown event names). `onBzChange` mirrors the payload into genuine Vue
`ref()` state. **This is a real, worthwhile contrast with the React example**: React's JSX event
props only understand its own synthetic events for known DOM events, so React needs a `ref` +
manual `addEventListener` to hear `bz-change`; Vue's template compiler already treats `@bz-change`
on a native element as a native listener, so no extra plumbing is needed on the Vue side.

## A real, documented limitation

Breeze's state store (`State` in `breeze.js`) is a single global, keyed-by-string store — it is
**not** scoped per custom-element instance. If you mounted two `<breeze-toggle-counter>` elements
on the same page today, they would share the exact same `count`/`active` keys under the hood. This
example intentionally mounts only one instance so it doesn't paper over that. It's a real
characteristic of the current `Breeze.defineElement()` implementation, not a bug introduced by
this example.

There's a second, subtler limitation this example works around rather than hides: if the `.breeze`
template declared `@state count = 0` directly, `Renderer.render()` unconditionally runs
`State.set('count', 0)` for that node *during the same initial render* that follows attribute
seeding — which would clobber a `count` attribute passed in from the host page back to `0` on every
mount. `src/breeze-toggle-counter.js` avoids this by not declaring `@state count`/`@state active` in
the template at all, and instead seeding both keys via `defineElement`'s own `initialState` option
(combined with `observedAttributes` for the `count` override). Breeze's text bindings
(`{count}`/`{active}`) and built-in actions (`increment`/`decrement`/`setState`/`toggle`) only need
the key to exist in the global `State` store — they don't require a matching `@state` declaration —
so this is a legitimate use of the public API, not a workaround that reaches into Breeze internals.
See the comment above `TOGGLE_COUNTER_SOURCE` in `src/breeze-toggle-counter.js` for the full
explanation.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Production build:

```bash
npm run build     # outputs dist/, includes vendor/breeze.js + breeze.css
npm run preview
```

## Headless verification (no browser required)

```bash
npm run verify
```

This is a real, unmocked check (`verify.mjs`), not a hand-wave:

1. Parses the *actual* `.breeze` source string from `src/breeze-toggle-counter.js` with the real
   `Breeze.parse()` from the repo root's `breeze.js`, so a DSL syntax mistake fails loudly.
2. Boots a real [jsdom](https://github.com/jsdom/jsdom) document, `require()`s the repo root's real
   `breeze.js` into it (attaching `window.Breeze` exactly like a `<script>` tag would), registers
   the real custom element, mounts `<breeze-toggle-counter count="5">`, asserts the DOM rendered
   `5`, dispatches real `click` `MouseEvent`s on the rendered `+1` and `Toggle` buttons, and asserts
   that Breeze's own DOM re-renders correctly **and** that real `CustomEvent('bz-change', ...)`s are
   dispatched on the host element with the right `detail` for both the counter and the boolean
   toggle.

This script intentionally verifies the custom element on its own, without going through Vue's SFC
compiler — that's precisely the part of the design that makes it framework-agnostic. The Vue-specific
wiring (`isCustomElement`, `:count`, `@bz-change`) is exercised by actually running `npm run dev` /
`npm run build` against the real `@vitejs/plugin-vue` compiler.
