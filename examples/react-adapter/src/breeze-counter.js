// ── The ONLY Breeze-specific code in this whole example ───────────────
//
// Everything below this module is plain React. This file is the seam:
// it defines a real `.breeze` component and registers it as a native
// Custom Element via `Breeze.defineElement()`. Once registered,
// `<breeze-counter>` is just a standard DOM element — React (or Vue, or
// Angular, or a <script> tag with zero framework) can use it without
// knowing anything about Breeze's compiler, renderer, or reactivity.

// A genuine, non-trivial `.breeze` component: a counter with three actions
// and its own internal state that Breeze itself owns and re-renders
// reactively.
//
// NOTE: this deliberately does NOT declare `@state count = 0` / `@state step
// = 1` in the template. `Renderer.render()` (breeze.js) processes a `state`
// AST node by unconditionally calling `State.set(key, literalDefault)` at
// render time (see the `case 'state':` branch in Renderer.renderNode) — that
// runs *after* `defineElement()`'s `connectedCallback` has already seeded
// `count` from the `count` attribute, so a literal `@state count = 0` in the
// template would silently clobber an attribute-provided initial value back
// to 0 on every mount. Breeze's own `{count}` text bindings and its
// `increment`/`decrement`/`setState` actions only need `count` to exist as a
// key in Breeze's global `State` store — they don't require it to have been
// declared via `@state` first (see `State.getPath` / `State.set` in
// breeze.js). So this example seeds `count`/`step` purely through
// `Breeze.defineElement()`'s own `initialState` + `observedAttributes`
// mechanism below, which is the real, documented seeding path and doesn't
// race against the template's own render pass.
export const COUNTER_SOURCE = `
div.bz-counter
  span.bz-counter-badge "Native Custom Element (Breeze-powered)"
  h3.bz-counter-title "Breeze Counter"
  p.bz-counter-value "{count}"
  div.bz-counter-controls
    button.bz-counter-btn "−1" [@click -> decrement(count)]
    button.bz-counter-btn "Reset" [@click -> setState(count, 0)]
    button.bz-counter-btn.bz-counter-btn-primary "+1" [@click -> increment(count)]
`.trim();

let registered = false;

/**
 * Registers `<breeze-counter>` as a native Custom Element backed by the
 * `.breeze` source above. Safe to call more than once (Breeze.defineElement
 * itself no-ops if the tag is already registered; we also short-circuit
 * locally to skip re-building the template string).
 *
 * Two-way interop contract with the host page (React, in this example):
 *   IN  — the `count` attribute seeds Breeze's internal `count` state the
 *         first time the element is connected to the DOM (see
 *         `observedAttributes` below, handled inside breeze.js itself).
 *   OUT — every time Breeze's internal `count` state changes (whether the
 *         user clicked a Breeze-rendered button, or something else set the
 *         state), this dispatches a real, bubbling, composed DOM
 *         `CustomEvent('bz-change')` on the host element, so ANY listener
 *         (`addEventListener`, React ref, Vue `@bz-change`, plain HTML
 *         `onbz-change`, ...) can observe it — no Breeze-specific glue
 *         required on the listening side.
 */
export function registerBreezeCounter() {
  if (registered) return;

  if (typeof window === 'undefined' || !window.Breeze) {
    throw new Error(
      '[breeze-counter] window.Breeze is not defined. Make sure /vendor/breeze.js ' +
        'is loaded via a <script> tag in index.html before this module runs.'
    );
  }

  window.Breeze.defineElement('breeze-counter', COUNTER_SOURCE, {
    observedAttributes: ['count'],
    initialState: { count: 0, step: 1 },
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
      window.Breeze.watch('count', (value) => {
        this.dispatchEvent(
          new CustomEvent('bz-change', {
            detail: { count: value },
            bubbles: true,
            composed: true
          })
        );
      });
    }
  });

  registered = true;
}

// NOTE on a real, documented limitation (not papered over): Breeze's state
// store (`State`) is a single global keyed-by-string store, not scoped per
// custom-element instance. That means if you mount TWO `<breeze-counter>`
// elements on the same page, they will currently share the exact same
// `count`/`step` state under the hood. This example intentionally mounts
// only one instance. See this example's README for the full explanation.
