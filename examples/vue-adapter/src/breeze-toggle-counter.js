// ── The ONLY Breeze-specific code in this whole example ───────────────
//
// Everything below this module is plain Vue. This file is the seam: it
// defines a real `.breeze` component and registers it as a native Custom
// Element via `Breeze.defineElement()`. Once registered, `<breeze-toggle-
// counter>` is just a standard DOM element — Vue (or React, or Angular, or
// a <script> tag with zero framework) can use it without knowing anything
// about Breeze's compiler, renderer, or reactivity.

// A genuine, non-trivial `.breeze` component: a counter with three actions
// PLUS an internal boolean toggle, all owned and re-rendered by Breeze's own
// reactivity — a little more than a bare counter, while sticking to Breeze
// action primitives (`increment`/`decrement`/`setState`/`toggle`) that are
// actually implemented against flat, top-level state keys (see
// `Renderer.runAction` in breeze.js).
//
// NOTE: this deliberately does NOT declare `@state count = 0` in the
// template. `Renderer.render()` (breeze.js) processes a `state` AST node by
// unconditionally calling `State.set(key, literalDefault)` at render time
// (see the `case 'state':` branch in `Renderer.renderNode`) — that runs
// *after* `defineElement()`'s `connectedCallback` has already seeded `count`
// from the `count` attribute, so a literal `@state count = 0` in the
// template would silently clobber an attribute-provided initial value back
// to 0 on every mount. Breeze's `{count}`/`{active}` text bindings and its
// built-in actions only need the key to exist in the global `State` store —
// they don't require a matching `@state` declaration first (see
// `State.getPath` / `State.set` in breeze.js). So this example seeds
// `count`/`active` purely through `Breeze.defineElement()`'s own
// `initialState` + `observedAttributes` mechanism below, which is the real,
// documented seeding path and doesn't race against the template's own
// render pass.
export const TOGGLE_COUNTER_SOURCE = `
div.bz-panel
  span.bz-panel-badge "Native Custom Element (Breeze-powered)"
  h3.bz-panel-title "Breeze Toggle Counter"
  p.bz-panel-value "{count}"
  div.bz-panel-controls
    button.bz-panel-btn "−1" [@click -> decrement(count)]
    button.bz-panel-btn "Reset" [@click -> setState(count, 0)]
    button.bz-panel-btn.bz-panel-btn-primary "+1" [@click -> increment(count)]
  div.bz-panel-toggle-row
    span.bz-panel-toggle-label "Highlighted: {active}"
    button.bz-panel-toggle [@click -> toggle(active)] "Toggle"
`.trim();

let registered = false;

/**
 * Registers `<breeze-toggle-counter>` as a native Custom Element backed by
 * the `.breeze` source above. Safe to call more than once
 * (`Breeze.defineElement` itself no-ops if the tag is already registered; we
 * also short-circuit locally to skip re-building the template string).
 *
 * Two-way interop contract with the host page (Vue, in this example):
 *   IN  — the `count` attribute seeds Breeze's internal `count` state the
 *         first time the element is connected to the DOM (see
 *         `observedAttributes` below, handled inside breeze.js itself).
 *   OUT — every time Breeze's internal `count` or `active` state changes
 *         (whether from a user click on a Breeze-rendered button, or
 *         something else setting the state), this dispatches a real,
 *         bubbling, composed DOM `CustomEvent('bz-change')` on the host
 *         element, so ANY listener (`addEventListener`, a Vue template's
 *         native `@bz-change`, a React ref, plain HTML `onbz-change`, ...)
 *         can observe it — no Breeze-specific glue required on the
 *         listening side.
 */
export function registerBreezeToggleCounter() {
  if (registered) return;

  if (typeof window === 'undefined' || !window.Breeze) {
    throw new Error(
      '[breeze-toggle-counter] window.Breeze is not defined. Make sure /vendor/breeze.js ' +
        'is loaded via a <script> tag in index.html before this module runs.'
    );
  }

  window.Breeze.defineElement('breeze-toggle-counter', TOGGLE_COUNTER_SOURCE, {
    observedAttributes: ['count'],
    initialState: { count: 0, active: false },
    connected() {
      // `connected` runs with `this` bound to the host HTMLElement, every
      // time the element is connected to the document (per breeze.js).
      // Guard so we only attach the state -> DOM-event bridge once per
      // instance, even if the element is removed and re-inserted.
      if (this._bzChangeWatchBound) return;
      this._bzChangeWatchBound = true;

      // Breeze.watch() is Breeze's own public state-subscription API
      // (breeze.d.ts / breeze.js). We use it purely to re-broadcast
      // Breeze's internal reactivity as a standard platform primitive
      // (CustomEvent) that has nothing Breeze-specific about it.
      const broadcast = () => {
        this.dispatchEvent(
          new CustomEvent('bz-change', {
            detail: {
              count: window.Breeze.getState('count'),
              active: window.Breeze.getState('active')
            },
            bubbles: true,
            composed: true
          })
        );
      };
      window.Breeze.watch('count', broadcast);
      window.Breeze.watch('active', broadcast);
    }
  });

  registered = true;
}

// NOTE on a real, documented limitation (not papered over): Breeze's state
// store (`State`) is a single global keyed-by-string store, not scoped per
// custom-element instance. That means if you mounted TWO
// `<breeze-toggle-counter>` elements on the same page, they would currently
// share the exact same `count`/`active` state under the hood. This example
// intentionally mounts only one instance. See this example's README for the
// full explanation.
