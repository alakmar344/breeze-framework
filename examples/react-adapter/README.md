# Breeze ⇄ React — a genuine Custom Element interop example

This is a real [Vite](https://vitejs.dev/) + [React](https://react.dev/) 19 app. It does not
reimplement Breeze in React, and it does not rewrite this React app "in Breeze." It demonstrates
the one thing that actually makes cross-framework interop real: the platform's own
[Custom Elements](https://developer.mozilla.org/en-US/docs/Web/API/Web_components) API.

## What's real vs. what Breeze provides

| Piece | What it is |
|---|---|
| `react`, `react-dom`, `vite`, `@vitejs/plugin-react` | Real npm packages, installed from the public registry — see `package.json`. Only dev/runtime dependencies of *this example*, not of core Breeze. |
| `<breeze-counter>` | A standard, native browser [`HTMLElement`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement) / Custom Element, produced by `customElements.define(...)`. React has zero special-case code for it. |
| `Breeze.defineElement()` | The **only** Breeze-specific call in this whole example (see `src/breeze-counter.js`). It compiles a real `.breeze` template (`Breeze.parse()` / the Breeze `Renderer`) and wraps it in a native Custom Element class. |
| Everything else in `src/App.jsx`, `src/main.jsx` | Plain React — `useState`, `useEffect`, `useRef`, JSX. Nothing Breeze-aware. |

`window.Breeze` itself is loaded exactly the way the root project's README documents ("Option B",
a plain `<script src="breeze.js">` tag) — see `index.html`. `scripts/copy-breeze.mjs` copies the
real repo-root `breeze.js` / `breeze.css` into this example's `public/vendor/` at `predev`/`prebuild`
time so the example is self-contained without forking Breeze's source. Nothing under the repo root
(`breeze.js`, `breeze-cli.js`, `breeze-http.js`, or any root config) is modified by this example.

## The component

`src/breeze-counter.js` defines a small, non-trivial `.breeze` component — a counter with three
actions (`-1`, `Reset`, `+1`) — and registers it as `<breeze-counter>` via
`Breeze.defineElement(tagName, source, options)`. Its markup, its `count`/`step` state, and its
click handling are 100% Breeze's own DSL, compiler, and DOM renderer. React never touches the
inside of the element; it only ever sees a DOM node.

## Two-way data flow

**Props in — React → Breeze.** `App.jsx` renders `<breeze-counter ref={counterRef} count={initialCount}></breeze-counter>`.
JSX lowers that straight to `setAttribute('count', ...)` on the underlying custom element (this is
just how JSX handles unknown/hyphenated tag names — no special casing needed). Breeze's
`observedAttributes: ['count']` option makes `attributeChangedCallback` fire, and on first connect
the element seeds its internal state from that attribute (see `connectedCallback` in
`Breeze.defineElement`, `breeze.js`).

**Events out — Breeze → React.** Every click inside the Breeze component runs entirely inside
Breeze's own action system (`decrement(count)`, `setState(count, 0)`, `increment(count)` in the
`.breeze` source). The `connected()` hook passed to `defineElement` calls `Breeze.watch('count', ...)`
— Breeze's own public state-subscription API — and re-broadcasts every change as a real, bubbling,
composed `CustomEvent('bz-change', { detail: { count } })` on the host element. React observes this
with a `ref` + `el.addEventListener('bz-change', handler)` inside a `useEffect`, and mirrors it into
genuine React state (`useState`). This `ref` + `addEventListener` pattern is necessary and is the
whole point of the example: React's JSX event props (`onClick`, etc.) only understand React's own
synthetic events for known DOM events, so a prop like `onBzChange={...}` would silently do nothing
for a custom, non-standard event name — `addEventListener` is the documented, correct way to listen
for custom-element events from React.

## A real, documented limitation

Breeze's state store (`State` in `breeze.js`) is a single global, keyed-by-string store — it is
**not** scoped per custom-element instance. If you mounted two `<breeze-counter>` elements on the
same page today, they would share the exact same `count`/`step` keys under the hood. This example
intentionally mounts only one instance so it doesn't paper over that. It's a real characteristic of
the current `Breeze.defineElement()` implementation, not a bug introduced by this example.

There's a second, subtler limitation this example works around rather than hides: if the `.breeze`
template declares `@state count = 0` directly, `Renderer.render()` unconditionally runs
`State.set('count', 0)` for that node *during the same initial render* that follows attribute
seeding — which clobbers a `count` attribute passed in from the host page back to `0` on every
mount. `src/breeze-counter.js` avoids this by not declaring `@state count`/`@state step` in the
template at all, and instead seeding both keys via `defineElement`'s own `initialState` option
(combined with `observedAttributes` for the `count` override). Breeze's text bindings (`{count}`)
and built-in actions (`increment`/`decrement`/`setState`) only need the key to exist in the global
`State` store — they don't require a matching `@state` declaration — so this is a legitimate use of
the public API, not a workaround that reaches into Breeze internals. See the comment above
`COUNTER_SOURCE` in `src/breeze-counter.js` for the full explanation.

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

1. Parses the *actual* `.breeze` source string from `src/breeze-counter.js` with the real
   `Breeze.parse()` from the repo root's `breeze.js`, so a DSL syntax mistake fails loudly.
2. Boots a real [jsdom](https://github.com/jsdom/jsdom) document, `require()`s the repo root's real
   `breeze.js` into it (attaching `window.Breeze` exactly like a `<script>` tag would), registers
   the real custom element, mounts `<breeze-counter count="5">`, asserts the DOM rendered `5`,
   dispatches a real `click` `MouseEvent` on the rendered `+1` button, and asserts both that
   Breeze's own DOM re-rendered to `6` **and** that a real `CustomEvent('bz-change', { detail:
   { count: 6 } })` was dispatched on the host element.
