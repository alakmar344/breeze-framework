#!/usr/bin/env node
// Headless, genuine sanity check — run via `npm run verify`.
//
// Step 1: parses the ACTUAL `.breeze` source embedded in
//         src/breeze-counter.js using the repo root's real `breeze.js`
//         (`Breeze.parse()`), so a syntax mistake in the DSL fails loudly
//         instead of only showing up in a browser.
//
// Step 2: boots a real jsdom document, requires the repo root's real
//         `breeze.js` into it (exactly like a <script> tag would attach
//         `window.Breeze`), registers the real custom element, mounts it,
//         and drives it like a browser would: reads the initial `count`
//         attribute, clicks the real rendered <button>, and asserts BOTH
//         that Breeze's own DOM re-rendered AND that a genuine
//         `CustomEvent('bz-change')` was dispatched with the right detail.
//
// Nothing here is mocked or hand-waved: it is the same breeze.js shipped
// at the repo root, the same custom element class Breeze.defineElement()
// builds in a real browser, and a real DOM (jsdom) driving real click events.

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { COUNTER_SOURCE, registerBreezeCounter } from './src/breeze-counter.js';

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
  const ast = Breeze.parse(COUNTER_SOURCE);
  assert(Array.isArray(ast) && ast.length > 0, 'Breeze.parse() returned an empty/invalid AST for the counter template.');
  const hasRootDiv = ast.some((n) => n.type === 'div' || n.tag === 'div');
  assert(hasRootDiv, 'Parsed AST is missing the expected root <div.bz-counter> node.');
  console.log(`[verify] Step 1/2 OK — Breeze.parse() accepted the .breeze source (${ast.length} top-level AST node(s)).`);
}

// ── Step 2: real custom element lifecycle inside a real DOM (jsdom) ──────
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
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

registerBreezeCounter();
assert(Boolean(dom.window.customElements.get('breeze-counter')), 'breeze-counter was not registered as a Custom Element.');

const root = dom.window.document.getElementById('root');
const el = dom.window.document.createElement('breeze-counter');
el.setAttribute('count', '5');
root.appendChild(el); // triggers a REAL connectedCallback()

const valueEl = el.querySelector('.bz-counter-value');
assert(Boolean(valueEl), 'Could not find the rendered .bz-counter-value element inside the custom element.');
assert(valueEl.textContent.trim() === '5', `Expected initial rendered count "5" (from the "count" attribute), got "${valueEl.textContent.trim()}".`);
console.log('[verify] Step 2/2 — initial "count" attribute correctly seeded Breeze state and rendered into the DOM.');

let receivedEvent = null;
el.addEventListener('bz-change', (e) => {
  receivedEvent = e;
});

const incrementBtn = [...el.querySelectorAll('button')].find((b) => b.textContent.includes('+1'));
assert(Boolean(incrementBtn), 'Could not find the "+1" button rendered by Breeze.');
incrementBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));

assert(Boolean(receivedEvent), 'Clicking "+1" did not dispatch a "bz-change" CustomEvent on the host element.');
assert(receivedEvent.detail.count === 6, `Expected bz-change detail.count === 6, got ${JSON.stringify(receivedEvent.detail)}.`);
assert(valueEl.textContent.trim() === '6', `Expected the DOM to re-render to "6" after the click, got "${valueEl.textContent.trim()}".`);

console.log('[verify] Clicking "+1": Breeze state updated internally, the DOM re-rendered to "6", AND a real');
console.log('[verify] `CustomEvent(\'bz-change\', { detail: { count: 6 } })` was dispatched on the host element.');
console.log('[verify] ALL CHECKS PASSED.');
