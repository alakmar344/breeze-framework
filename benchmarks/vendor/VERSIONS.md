# Benchmark vendor sources

Regenerated with `node benchmarks/vendor/build-vendor.js` (npm registry, pinned versions).

| File | Package | Version | Upstream path | Size (bytes) |
| :--- | :--- | :--- | :--- | ---: |
| preact.umd.js | preact | 10.29.8 | dist/preact.min.umd.js (minified UMD global) | 11441 |
| vue.global.prod.js | vue | 3.5.42 | dist/vue.global.prod.js (prod IIFE global) | 167536 |
| react-19-stack.js | react + react-dom + scheduler | 19.3.0 / 19.3.0 / 0.28.0 | cjs/*.production.js + CJS shim, terser-minified (React 19 ships no UMD/minified browser build) | 219468 |

All packages MIT-licensed. Tarballs only — nothing installed into the repo (terser runs from a temp dir at build time).
