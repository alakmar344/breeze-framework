<script setup>
import { ref } from 'vue';
import { registerBreezeToggleCounter } from './breeze-toggle-counter.js';

// Registering a custom element is idempotent and side-effect-only; doing it
// once at module scope (before Vue ever renders) is the normal pattern —
// same as you'd do with any other Web Component library in a Vue app.
registerBreezeToggleCounter();

// Props flowing IN to the Breeze element: a real Vue ref value bound down
// as a plain DOM attribute on the custom element via `:count="initialCount"`.
const initialCount = ref(5);

// Events flowing OUT of the Breeze element: mirrored into real Vue state via
// a native template event listener, `@bz-change="onBzChange"`. Unlike React
// (whose JSX event props only understand its own synthetic DOM event names),
// Vue's `v-on`/`@` on an element that the compiler recognizes as native —
// see `isCustomElement` in vite.config.js — compiles straight to
// `addEventListener('bz-change', ...)`. No `ref` + manual
// `addEventListener` plumbing is required on the Vue side; the framework's
// own template compiler already treats unknown DOM events as native.
const lastReportedCount = ref(initialCount.value);
const lastActive = ref(false);
const changeLog = ref([]);

function onBzChange(event) {
  lastReportedCount.value = event.detail.count;
  lastActive.value = event.detail.active;
  changeLog.value = [
    ...changeLog.value.slice(-4),
    `bz-change -> count = ${event.detail.count}, active = ${event.detail.active}`
  ];
}
</script>

<template>
  <main class="app">
    <h1>Vue ⇄ Breeze: a real Custom Element, both directions</h1>
    <p class="lede">
      <code>&lt;breeze-toggle-counter&gt;</code> below is a native
      <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_components">Web Component</a>
      registered via <code>Breeze.defineElement()</code>. Its markup, state, and click handling are
      100% Breeze's own <code>.breeze</code> compiler and DOM renderer — Vue never touches its
      internals. Vue only sees a DOM element.
    </p>

    <section class="panel">
      <h2>1. Props in — Vue → Breeze</h2>
      <p>
        Vue binds <code>:count="initialCount"</code> down as a plain attribute (Vue's compiler
        falls back to <code>setAttribute()</code> here because <code>count</code> isn't an existing
        property on the custom element instance). Breeze's <code>observedAttributes</code> hook
        reads it once on connect and seeds its own internal state.
      </p>
      <breeze-toggle-counter :count="initialCount" @bz-change="onBzChange"></breeze-toggle-counter>
    </section>

    <section class="panel">
      <h2>2. Events out — Breeze → Vue</h2>
      <p>
        Every click inside the Breeze component (−1 / Reset / +1 / Toggle) runs entirely inside
        Breeze's own action system. Breeze then dispatches a real, bubbling
        <code>CustomEvent('bz-change')</code> on the host element, which the template observes with
        a plain <code>@bz-change="onBzChange"</code> listener — no <code>ref</code>, no manual
        <code>addEventListener</code> call needed on the Vue side — and mirrors it into genuine Vue
        <code>ref()</code> state below.
      </p>
      <p>
        Last reported by Breeze: <strong>count = {{ lastReportedCount }}</strong>,
        <strong>active = {{ lastActive }}</strong>
      </p>
      <ul class="log">
        <li v-if="changeLog.length === 0" class="log-empty">(click a button above)</li>
        <li v-for="(entry, i) in changeLog" :key="i">{{ entry }}</li>
      </ul>
    </section>
  </main>
</template>
