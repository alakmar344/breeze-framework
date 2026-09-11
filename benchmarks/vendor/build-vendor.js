#!/usr/bin/env node
/**
 * Reproducible vendor builder for Breeze benchmarks.
 * Downloads the exact pinned framework releases from the npm registry
 * (no transitive deps installed) and assembles browser-ready vendor files:
 *
 *   vendor/preact.umd.js      — Preact minified UMD global build
 *   vendor/vue.global.prod.js — Vue production IIFE global build
 *   vendor/react-19-stack.js  — React 19 browser stack: scheduler + react +
 *                               react-dom internals + react-dom/client, with a
 *                               tiny CJS shim (React 19 ships no UMD builds).
 *                               Exposes window.React and window.ReactDOM.
 *   vendor/VERSIONS.md        — pinned versions, dates, sizes, sources
 *
 * Usage: node benchmarks/vendor/build-vendor.js
 * Requires: npm + tar on PATH, network access to registry.npmjs.org.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PINNED = {
  react: '19.3.0',
  'react-dom': '19.3.0',
  scheduler: '0.28.0',
  preact: '10.29.8',
  vue: '3.5.42'
};

const vendorDir = __dirname;
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-vendor-'));

function sh(cmd, opts) {
  execSync(cmd, Object.assign({ stdio: 'pipe', cwd: workDir }, opts || {}));
}

function pack(name, version) {
  console.log(`  packing ${name}@${version}...`);
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  sh(`${npmBin} pack ${name}@${version}`);
  const tgz = path.join(workDir, `${name.split('/').pop()}-${version}.tgz`);
  const dest = path.join(workDir, 'pkgs', name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.mkdirSync(dest, { recursive: true });
  sh(`tar -xzf ${JSON.stringify(tgz)} -C ${JSON.stringify(dest)} --strip-components=1`);
  return dest;
}

function readFile(p) {
  return fs.readFileSync(p, 'utf8').replace(/\/\/# sourceMappingURL=.*$/gm, '').trim();
}

/**
 * Minify with terser (installed into the temp work dir — never into the repo,
 * which stays zero-dependency). React 19 ships no minified browser build, so
 * without this the bundle comparison would pit unminified CJS against the
 * minified Preact/Vue builds. Returns minified code; throws on failure.
 */
function terserMinify(code) {
  const envDir = path.join(workDir, 'terser-env');
  console.log('  installing terser (build-time only)...');
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execSync(`${npmBin} install terser --prefix ${JSON.stringify(envDir)} --no-audit --no-fund`, {
    stdio: 'pipe',
    cwd: workDir
  });
  const { minify } = require(path.join(envDir, 'node_modules', 'terser'));
  return minify(code, {
    compress: { passes: 2 },
    mangle: true,
    format: { comments: false }
  }).then(out => {
    if (out.error) throw out.error;
    return out.code;
  });
}

/** Smoke-test a built stack file in a bare vm context (no DOM needed at load). */
function smokeTestStack(file, label) {
  const vm = require('vm');
  const src = fs.readFileSync(file, 'utf8');
  const sandbox = { console };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: path.basename(file) });
  const version = sandbox.React && sandbox.React.version;
  const hasRoot = typeof (sandbox.ReactDOM && sandbox.ReactDOM.createRoot) === 'function';
  console.log(`  smoke ${label}: React ${version}, createRoot ${hasRoot ? 'ok' : 'MISSING'}`);
  if (!version || !hasRoot) throw new Error(`smoke test failed for ${label}`);
}

/** Wrap a CJS production file so it runs from a plain <script> tag. */
function wrapCjs(name, code, needsRequire) {
  return (
    `// ---- ${name} (CJS wrapped for browser; React 19 ships no UMD) ----\n` +
    `window.__breezeCjs = window.__breezeCjs || {};\n` +
    `(function () {\n` +
    `  var exports = {};\n` +
    `  var module = { exports: exports };\n` +
    (needsRequire
      ? `  var require = function (id) {\n` +
        `    if (id === 'react') return window.__breezeCjs.react;\n` +
        `    if (id === 'scheduler') return window.__breezeCjs.scheduler;\n` +
        `    if (id === 'react-dom') return window.__breezeCjs['react-dom'];\n` +
        `    throw new Error('[vendor] unknown CJS require: ' + id);\n` +
        `  };\n`
      : `  var require = function (id) { throw new Error('[vendor] unexpected require: ' + id); };\n`) +
    code + `\n` +
    `  window.__breezeCjs[${JSON.stringify(name)}] = module.exports && Object.keys(module.exports).length ? module.exports : exports;\n` +
    `})();\n`
  );
}

function main() {
  console.log('Breeze benchmark vendor builder');
  console.log('work dir: ' + workDir);

  const dirs = {};
  for (const [name, version] of Object.entries(PINNED)) {
    dirs[name] = pack(name, version);
  }

  // Preact (minified UMD global) + Vue (global prod IIFE): copy verbatim.
  const preactSrc = readFile(path.join(dirs.preact, 'dist', 'preact.min.umd.js'));
  const preactOut =
    `/*! Preact ${PINNED.preact} (minified UMD, MIT) — vendored for Breeze benchmarks. See VERSIONS.md */\n` +
    preactSrc + '\n';
  fs.writeFileSync(path.join(vendorDir, 'preact.umd.js'), preactOut);

  const vueSrc = readFile(path.join(dirs.vue, 'dist', 'vue.global.prod.js'));
  fs.writeFileSync(path.join(vendorDir, 'vue.global.prod.js'), vueSrc + '\n');

  // React 19 stack (single file, load order: scheduler -> react -> react-dom -> client).
  const schedSrc = readFile(path.join(dirs.scheduler, 'cjs', 'scheduler.production.js'));
  const reactSrc = readFile(path.join(dirs.react, 'cjs', 'react.production.js'));
  const rdSrc = readFile(path.join(dirs['react-dom'], 'cjs', 'react-dom.production.js'));
  const clientSrc = readFile(path.join(dirs['react-dom'], 'cjs', 'react-dom-client.production.js'));

  const stack =
    `/*! React ${PINNED.react} browser stack vendored for Breeze benchmarks (MIT).\n` +
    ` * React 19 ships no UMD builds, so the npm CJS production files are wrapped with\n` +
    ` * a tiny require/exports shim, then minified with terser (build-time only) so the\n` +
    ` * bundle comparison stays apples-to-apples with the minified Preact/Vue builds.\n` +
    ` * Contents: scheduler + react + react-dom + react-dom/client.\n` +
    ` * Regenerate: node benchmarks/vendor/build-vendor.js (see VERSIONS.md). */\n` +
    `window.process = window.process || { env: { NODE_ENV: 'production' } };\n` +
    wrapCjs('scheduler', schedSrc, false) +
    wrapCjs('react', reactSrc, false) +
    wrapCjs('react-dom', rdSrc, true) +
    wrapCjs('client', clientSrc, true) +
    `(function () {\n` +
    `  var Client = window.__breezeCjs.client;\n` +
    `  if (!Client || typeof Client.createRoot !== 'function') {\n` +
    `    throw new Error('[vendor] react-dom/client failed to initialise');\n` +
    `  }\n` +
    `  window.React = window.__breezeCjs.react;\n` +
    `  window.ReactDOM = { createRoot: Client.createRoot, hydrateRoot: Client.hydrateRoot };\n` +
    `})();\n`;
  const stackPath = path.join(vendorDir, 'react-19-stack.js');
  return terserMinify(stack).then(min => {
    fs.writeFileSync(stackPath, min + '\n');
    smokeTestStack(stackPath, 'react-19-stack.js');

  // Remove superseded React 18 UMD files.
  for (const stale of ['react.production.min.js', 'react-dom.production.min.js']) {
    const fp = path.join(vendorDir, stale);
    if (fs.existsSync(fp)) fs.rmSync(fp);
  }

  const versionsMd =
    `# Benchmark vendor sources\n\n` +
    `Regenerated with \`node benchmarks/vendor/build-vendor.js\` (npm registry, pinned versions).\n\n` +
    `| File | Package | Version | Upstream path | Size (bytes) |\n` +
    `| :--- | :--- | :--- | :--- | ---: |\n` +
    `| preact.umd.js | preact | ${PINNED.preact} | dist/preact.min.umd.js (minified UMD global) | ${fs.statSync(path.join(vendorDir, 'preact.umd.js')).size} |\n` +
    `| vue.global.prod.js | vue | ${PINNED.vue} | dist/vue.global.prod.js (prod IIFE global) | ${fs.statSync(path.join(vendorDir, 'vue.global.prod.js')).size} |\n` +
    `| react-19-stack.js | react + react-dom + scheduler | ${PINNED.react} / ${PINNED['react-dom']} / ${PINNED.scheduler} | cjs/*.production.js + CJS shim, terser-minified (React 19 ships no UMD/minified browser build) | ${fs.statSync(path.join(vendorDir, 'react-19-stack.js')).size} |\n` +
    `\nAll packages MIT-licensed. Tarballs only — nothing installed into the repo (terser runs from a temp dir at build time).\n`;
  fs.writeFileSync(path.join(vendorDir, 'VERSIONS.md'), versionsMd);

  console.log('done. vendor files:');
  for (const f of ['preact.umd.js', 'vue.global.prod.js', 'react-19-stack.js', 'VERSIONS.md']) {
    console.log(`  ${f} (${fs.statSync(path.join(vendorDir, f)).size} bytes)`);
  }
  });
}

if (require.main === module) main().catch(e => { console.error('vendor build failed: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
module.exports = { PINNED };
