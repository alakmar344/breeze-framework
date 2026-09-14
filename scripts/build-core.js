#!/usr/bin/env node
/*
 * build-core.js
 * ─────────────────────────────────────────────────────────────────────────
 * Reassembles the modular ES modules under src/core/ into the single
 * dependency-free distributable breeze.js at the repo root.
 *
 * Why not a general-purpose bundler? The src/core/*.js modules form a large
 * strongly-connected cluster of circular imports (Renderer <-> State,
 * Renderer <-> Router, Renderer <-> BreezeAPI, Profiler <-> Signals, etc.)
 * that mirrors how the original single-file breeze.js was always organized:
 * one shared top-level scope, executed strictly top-to-bottom, where
 * cross-section references are safe as long as they're read lazily inside
 * function bodies (the handful of places that read another section's export
 * eagerly at object-literal-construction time are all in the LAST section,
 * api.js, by design — see the "Renderer," shorthand property and friends in
 * BreezeAPI).
 *
 * A real bundler (or Node's native ESM loader) resolving this cycle
 * dynamically could legally pick a different evaluation order than the one
 * the code was written to assume, and would silently produce `undefined`
 * for a cyclic eager read. Since we already know the exact order that is
 * correct (it's simply the section order of the pre-split breeze.js), this
 * script sidesteps the general cyclic-resolution problem entirely: it just
 * concatenates the modules, in that fixed known-good order, into one scope
 * — textually reproducing the semantics of the original file. Import/export
 * statements exist in src/core/*.js purely so each module is independently
 * readable/editable (and importable on its own, module-cycle caveats
 * aside) — this script strips them back out.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src', 'core');
const OUT_FILE = path.join(ROOT, 'breeze.js');

// Fixed assembly order — matches the original single-file breeze.js section
// order exactly. Do not reorder without re-verifying every eager
// (non-function-body) cross-section read still resolves correctly.
const MODULE_ORDER = [
  'profiler',
  'config',
  'reactive',
  'parser',
  'row-compiler',
  'state',
  'virtual-list',
  'renderer',
  'router',
  'registries',
  'dx',
  'ssr',
  'hydration',
  'webcomponents',
  'adapters',
  'api',
];

const HEADER = `/*!
 * Breeze Framework v2.3.0 (Scalability + Interop + Auto-Batching)
 * Ultra-lightweight declarative web framework
 * https://github.com/breeze-framework/breeze-framework
 * MIT License
 *
 * Architecture:
 *   Parser    — Cached LRU parse, precompiled {token} templates, codeframe diagnostics
 *   Signals   — Object.is correctness, disposable signals, opt-in auto microtask batching
 *   State     — Store slices, watchers, cycle-guarded computeds, signal sync
 *   Renderer  — LIS minimal-move keyed reconciliation, append fast-path, data-key select,
 *               if/elif/else chains, component params, portal, @show/@model/@ref/@cloak/@transition
 *   Router    — Hash/history, :id/:id?/*, outlet rendering, async guards, regex cache
 *   DX        — Context, refs, suspense, errorBoundary, forms, i18n, a11y, directives, testing
 *   SSR       — Parity string rendering (chains/components/ids/attrs) & non-destructive hydration
 *   Adapters  — Plug-and-play React/Vue Custom Element bridges (zero bundled deps)
 *   CLI       — generate/lint/format/check/min, portable median-run benchmarks (15 suites)
 *
 * NOTE: This file is generated. Do not edit it directly — edit the modules
 * under src/core/ and run \`npm run build:core\` to regenerate it.
 */
(function (global) {
  'use strict';

`;

const FOOTER = `
  if (typeof window !== 'undefined') {
    window.__BREEZE_DEVTOOLS__ = devtoolsHook;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.__BREEZE_DEVTOOLS__ = devtoolsHook;
  }

  // Expose globally & as module
  global.Breeze = BreezeAPI;

  // ── Optional HTTP/data layer wiring ─────────────────────────────────
  // The HTTP layer ships as a separate, dependency-free, tree-shakeable
  // module (breeze-http.js) so the core stays tiny. When it is present it
  // installs createClient/http/resource/HttpError onto the Breeze API and
  // wires resource() to Breeze.signal. In the browser, loading the script
  // auto-installs via the global; in Node we opportunistically require it.
  if (typeof require === 'function' && typeof module !== 'undefined') {
    try {
      const BreezeHttp = require('./breeze-http.js');
      if (BreezeHttp && typeof BreezeHttp.installInto === 'function') {
        BreezeHttp.installInto(BreezeAPI);
      }
    } catch (_) { /* optional — core works without it */ }
  } else if (typeof global.BreezeHttp !== 'undefined' && global.BreezeHttp.installInto) {
    global.BreezeHttp.installInto(BreezeAPI);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Breeze: BreezeAPI, default: BreezeAPI };
    module.exports.Breeze = BreezeAPI;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
`;

const IMPORT_RE = /^import\s*\{[^}]*\}\s*from\s*'\.\/[\w-]+\.js';\s*$/;
const EXPORT_RE = /^(\s*)export (const|let|function)\s/;

function stripModule(name) {
  const file = path.join(SRC_DIR, name + '.js');
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const out = [];
  let sawImports = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (IMPORT_RE.test(l)) { sawImports = true; continue; }
    // Drop the single blank separator line right after the import block.
    if (sawImports && l === '' && out.length === 0) { sawImports = false; continue; }
    out.push(l.replace(EXPORT_RE, '$1$2 '));
  }
  // Each src file was written with a trailing '\n' (i.e. a trailing empty
  // element after split). Drop exactly one trailing blank line so
  // concatenation doesn't accumulate blank lines between sections beyond
  // what the original file had.
  if (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function build() {
  const parts = MODULE_ORDER.map(stripModule);
  const body = parts.join('\n');
  const output = HEADER + body + '\n' + FOOTER;
  fs.writeFileSync(OUT_FILE, output);
  console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (${output.split('\n').length} lines) from ${MODULE_ORDER.length} modules.`);
}

build();
