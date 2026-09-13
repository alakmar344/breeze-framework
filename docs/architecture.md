# Architecture — how `breeze.js` is put together

This explains how the single-file `breeze.js` you `<script src="breeze.js">` (or `require()`, or
`npm install` and import) relates to the `src/core/` source tree, why it's still shipped as one
dependency-free file, and how to regenerate it after making a source change.

If you only came here to fix a bug or add a feature: **edit a file under `src/core/`, then run
`npm run build:core`.** Never hand-edit `breeze.js` directly — it's generated, and your edit will
be silently overwritten the next time someone runs the build script.

## The layered structure

`breeze.js` is assembled, in a fixed order, from 15 ES modules under `src/core/`:

| Order | Module | Layer |
| ---: | :--- | :--- |
| 1 | `profiler.js` | Diagnostics — portable median-run benchmarking helpers used internally and by the CLI's `profile`/`bench` commands |
| 2 | `config.js` | Shared constants/config (e.g. `MAX_UPDATE_DEPTH`) other layers read |
| 3 | `reactive.js` | **The tiny reactive core** — signals, computed, effects, batching, disposal. Everything else is built on top of this. |
| 4 | `parser.js` | `.breeze` → AST, with the LRU parse cache and codeframe diagnostics |
| 5 | `row-compiler.js` | Compile-time detection of static `@each`/`@virtual each` row templates into fast chunked string serializers |
| 6 | `state.js` | The global reactive store, watchers, cycle-guarded computeds, signal sync |
| 7 | `virtual-list.js` | `@virtual each` windowed-list arithmetic |
| 8 | `renderer.js` | AST → DOM: keyed LIS reconciliation, append fast-path, `@if`/`@elif`/`@else` chains, component params, `@show`/`@model`/`@ref`/`@cloak`/`@transition` |
| 9 | `router.js` | Hash/history routing, `:id`/`:id?`/`*`, outlet rendering, async guards, compiled-regex cache |
| 10 | `registries.js` | Plugin/action/method registries |
| 11 | `dx.js` | Developer-experience surface: context (`provide`/`inject`), `refs`, `suspense`, `errorBoundary`, `forms`, `i18n`, `a11y`, `directive()`, `testing` helpers |
| 12 | `ssr.js` | `renderToString()` — parity string rendering of chains/components/ids/attrs |
| 13 | `hydration.js` | Non-destructive client hydration of server-rendered markup, with mismatch detection/self-healing |
| 14 | `webcomponents.js` | `Breeze.defineElement()` — wraps a `.breeze` template in a native Custom Element class |
| 15 | `api.js` | The public `BreezeAPI` surface — the object every other layer's exports get attached to as `Breeze.*` |

Read top to bottom, this is the dependency direction: a minimal reactive core (`reactive.js`) is
extended by a parser and a state store, which the renderer and router build on, which SSR/hydration
and web-components build on top of again, all finally exposed through one public API object in
`api.js`. The exact list and order live in `scripts/build-core.js`'s `MODULE_ORDER` constant — that
file is the source of truth, not this document; if they ever disagree, trust the script.

## Why still one dependency-free file?

Zero-build consumption is a core value proposition of Breeze: `<script src="breeze.js"></script>`
in a plain HTML file, no bundler, no `node_modules`, no build step, has to keep working. Splitting
the source into `src/core/*.js` for maintainability (readable, independently-editable, single-
responsibility modules) does not change what ships to a browser or `npm install` consumer — it's
still exactly one file, `breeze.js`, with zero runtime dependencies. The module split is a
source-organization improvement for contributors; it is not a change to the distribution model.

## Regenerating `breeze.js`

```bash
# After editing anything under src/core/:
npm run build:core
```

This runs `scripts/build-core.js`, which concatenates the 15 modules above, in that fixed order,
into `breeze.js`, stripping the `import`/`export` statements that exist purely so each module is
independently readable/importable on its own. `npm test` runs this automatically via a `pretest`
script, so `node --test` (which exercises the committed `breeze.js`, not `src/core/*.js` directly)
always sees a freshly-rebuilt file. If you run `node --test` directly (bypassing `npm test`) after
editing a module under `src/core/`, rebuild first — otherwise your change won't be reflected in
the file the tests (or a browser) actually load.

## Why not just use a real bundler (esbuild/rollup/webpack)?

This is answered directly in `scripts/build-core.js`'s header comment — reproduced here because
it's a common question and worth being explicit about:

The `src/core/*.js` modules form a large strongly-connected cluster of **circular imports**
(`renderer.js` <-> `state.js`, `renderer.js` <-> `router.js`, `renderer.js` <-> `api.js`,
`profiler.js` <-> the reactive layer, etc.) that mirrors how the original single-file `breeze.js`
was always organized: one shared top-level scope, executed strictly top-to-bottom, where
cross-section references are safe as long as they're read lazily inside function bodies (the
handful of places that read another section's export eagerly, at object-literal-construction
time, are all confined to the *last* section, `api.js`, by design).

A general-purpose bundler — or Node's native ESM loader — resolving that import cycle dynamically
could legally choose a different evaluation order than the one the code was written to assume, and
would silently produce `undefined` for a cyclic eager read chosen the "wrong" way. Since the
correct order is already known (it's simply the original pre-split file's section order), `build-
core.js` sidesteps the general cyclic-module-resolution problem entirely instead of solving it: it
just concatenates the modules, in that fixed known-good order, into one scope — textually
reproducing the semantics of the original monolithic file. This is why `MODULE_ORDER` in
`scripts/build-core.js` is explicitly commented "do not reorder without re-verifying every eager
(non-function-body) cross-section read still resolves correctly" — reordering it is the one way
this approach can break.

## See also

- `scripts/build-core.js` — the actual build script and the authoritative module order.
- [`docs/dsl.md`](dsl.md) — the `.breeze` template language the `parser.js`/`renderer.js` layers
  implement.
- [`benchmark.md`](../benchmark.md) — includes bundle-size/parse-cost numbers for the file this
  script produces (§1).
