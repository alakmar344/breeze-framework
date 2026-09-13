#!/usr/bin/env node
// Headless, genuine sanity check — run via `npm run verify`.
//
// Step 1: parses the ACTUAL `.breeze` source embedded in
//         src/breeze-toggle-counter.js using the repo root's real
//         `breeze.js` (`Breeze.parse()`), so a syntax mistake in the DSL
//         fails loudly instead of only showing up in a browser.
//
// Step 2: boots a real jsdom document, requires the repo root's real
//         `breeze.js` into it (exactly like a <script> tag would attach
//         `window.Breeze`), registers the real custom element, mounts it,
//         and drives it like a browser would: reads the initial `count`
//         attribute, clicks the real rendered <button>s, and asserts BOTH
//         that Breeze's own DOM re-rendered AND that genuine
//         `CustomEvent('bz-change')`s were dispatched with the right detail
//         — for both the counter buttons AND the boolean toggle button.
//
// Nothing here is mocked or hand-waved: it is the same breeze.js shipped
// at the repo root, the same custom element class Breeze.defineElement()
// builds in a real browser, and a real DOM (jsdom) driving real click
// events. This script deliberately does NOT depend on Vue at all — it
// verifies the custom element itself, which is exactly the part of this
// example that's framework-agnostic by design.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { TOGGLE_COUNTER_SOURCE, registerBreezeToggleCounter } from './src/breeze-toggle-counter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BREEZE_JS_PATH = path.resolve(__dirname, '../../breeze.js');
const require = createRequire(import.meta.url);

function assert(condition, message) {
  if (!condition) {
    console.error(`[verify] FAILED: ${message}`);
    process.exit(1);
  }
}

// ── Step 1: parse-only validation (no DOM needed at all) ─────────────────
{
  const { Breeze } = require(BREEZE_JS_PATH);
  const ast = Breeze.parse(TOGGLE_COUNTER_SOURCE);
  assert(Array.isArray(ast) && ast.length > 0, 'Breeze.parse() returned an empty/invalid AST for the toggle-counter template.');
  const hasRootDiv = ast.some((n) => n.type === 'div' || n.tag === 'div');
  assert(hasRootDiv, 'Parsed AST is missing the expected root <div.bz-panel> node.');
  console.log(`[verify] Step 1/2 OK — Breeze.parse() accepted the .breeze source (${ast.length} top-level AST node(s)).`);
}

// ── Step 2: real custom element lifecycle inside a real DOM (jsdom) ──────
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://localhost/'
});

// Bridge jsdom's window onto Node's global object, the same way a browser
// exposes these as ambient globals to any script it runs.
global.window = dom.window;
for (const key of [
  'document', 'customElements', 'HTMLElement', 'CustomEvent', 'Event', 'MouseEvent', 'Node', 'Element', 'navigator'
]) {
  if (!(key in dom.window)) continue;
  try {
    global[key] = dom.window[key];
  } catch (_) {
    // Node 22+ defines a getter-only `globalThis.navigator`; breeze.js only
    // needs `window.navigator`, which is already set above, so skipping the
    // bare-global alias here is harmless.
  }
}
if (typeof global.requestAnimationFrame !== 'function') {
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
}

// Re-require breeze.js now that `window`/`document` exist, so its UMD
// wrapper attaches `Breeze` onto the jsdom window — exactly like loading
// it via <script src="breeze.js"> in an actual page.
delete require.cache[require.resolve(BREEZE_JS_PATH)];
require(BREEZE_JS_PATH);
assert(Boolean(dom.window.Breeze), 'breeze.js did not attach itself to window.Breeze under jsdom.');

registerBreezeToggleCounter();
assert(Boolean(dom.window.customElements.get('breeze-toggle-counter')), 'breeze-toggle-counter was not registered as a Custom Element.');

const root = dom.window.document.getElementById('app');
const el = dom.window.document.createElement('breeze-toggle-counter');
el.setAttribute('count', '5');
root.appendChild(el); // triggers a REAL connectedCallback()

const valueEl = el.querySelector('.bz-panel-value');
assert(Boolean(valueEl), 'Could not find the rendered .bz-panel-value element inside the custom element.');
assert(valueEl.textContent.trim() === '5', `Expected initial rendered count "5" (from the "count" attribute), got "${valueEl.textContent.trim()}".`);
console.log('[verify] Step 2/2 — initial "count" attribute correctly seeded Breeze state and rendered into the DOM.');

const events = [];
el.addEventListener('bz-change', (e) => events.push(e.detail));

const incrementBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('+1'));
assert(Boolean(incrementBtn), 'Could not find the "+1" button rendered by Breeze.');
incrementBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

assert(events.length === 1, `Expected exactly 1 "bz-change" event after clicking "+1", got ${events.length}.`);
assert(events[0].count === 6, `Expected bz-change detail.count === 6, got ${JSON.stringify(events[0])}.`);
assert(valueEl.textContent.trim() === '6', `Expected the DOM to re-render to "6" after the click, got "${valueEl.textContent.trim()}".`);
console.log('[verify] Clicking "+1": Breeze state updated internally, DOM re-rendered to "6", and a real');
console.log(`[verify] \`CustomEvent('bz-change', { detail: ${JSON.stringify(events[0])} })\` was dispatched.`);

const toggleBtn = el.querySelector('.bz-panel-toggle');
assert(Boolean(toggleBtn), 'Could not find the toggle button rendered by Breeze.');
const toggleLabelEl = el.querySelector('.bz-panel-toggle-label');
assert(toggleLabelEl.textContent.includes('false'), `Expected toggle label to start at "active: false"-ish text, got "${toggleLabelEl.textContent}".`);

toggleBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

assert(events.length === 2, `Expected exactly 2 "bz-change" events after also clicking the toggle, got ${events.length}.`);
assert(events[1].active === true, `Expected bz-change detail.active === true after toggling, got ${JSON.stringify(events[1])}.`);
assert(toggleLabelEl.textContent.includes('true'), `Expected toggle label to update to "active: true"-ish text, got "${toggleLabelEl.textContent}".`);

console.log('[verify] Clicking "Toggle": Breeze boolean state flipped, DOM re-rendered, and a real');
console.log(`[verify] \`CustomEvent('bz-change', { detail: ${JSON.stringify(events[1])} })\` was dispatched.`);
console.log('[verify] ALL CHECKS PASSED.');
