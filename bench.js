#!/usr/bin/env node
/**
 * Breeze Framework — Performance Benchmarks
 * Measures parse, render, and build pipeline throughput.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// Import engine
const { Breeze } = require('./breeze.js');

// Import build utils
const { extractSeoAndHead, buildHTML } = require('./breeze-cli.js');

const exampleBreeze = fs.readFileSync(path.join(__dirname, 'example.breeze'), 'utf8');
const breezeCss = fs.readFileSync(path.join(__dirname, 'breeze.css'), 'utf8');
const breezeJs = fs.readFileSync(path.join(__dirname, 'breeze.js'), 'utf8');

function bench(name, fn, iterations = 100) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = performance.now() - start;
  const avg = (ms / iterations).toFixed(2);
  console.log(`${name.padEnd(35)} ${ms.toFixed(1)}ms total  (${avg}ms/iter)`);
  return ms;
}

console.log('\n🌊 Breeze Framework Benchmarks\n');

// ── Parser ────────────────────────────────────────────────────────
console.log('📝 Parser:');
let ast;
const parseMs = bench('  Parse example.breeze', () => {
  ast = Breeze.parse(exampleBreeze);
}, 200);

// ── SEO/Build ─────────────────────────────────────────────────────
console.log('\n🔨 Build:');
bench('  Extract SEO/head/schema', () => {
  extractSeoAndHead(exampleBreeze);
}, 150);

bench('  buildHTML (normal)', () => {
  buildHTML({ breezeSource: exampleBreeze, css: breezeCss, js: null, doSpa: false, doMinify: false });
}, 100);

bench('  buildHTML (SPA)', () => {
  buildHTML({ breezeSource: exampleBreeze, css: breezeCss, js: breezeJs, doSpa: true, doMinify: false });
}, 50);

bench('  buildHTML (SPA + minify)', () => {
  buildHTML({ breezeSource: exampleBreeze, css: breezeCss, js: breezeJs, doSpa: true, doMinify: true });
}, 30);

// ── Cold start ────────────────────────────────────────────────────
// ── Reactivity & Signals ─────────────────────────────────────────
console.log('\n⚡ Reactivity & Signals:');
bench('  Signal read / write (10k ops)', () => {
  const s = Breeze.signal(0);
  for (let i = 0; i < 10000; i++) s.value = i;
}, 50);

bench('  Computed evaluation (5k ops)', () => {
  const a = Breeze.signal(1);
  const b = Breeze.signal(2);
  const c = Breeze.computed(() => a.value + b.value);
  for (let i = 0; i < 5000; i++) {
    a.value = i;
    const _ = c.value;
  }
}, 30);

bench('  Batched updates (5k ops)', () => {
  const a = Breeze.signal(0);
  const b = Breeze.signal(0);
  let triggers = 0;
  Breeze.effect(() => { const _ = a.value + b.value; triggers++; });
  for (let i = 0; i < 5000; i++) {
    Breeze.batch(() => {
      a.value = i;
      b.value = i * 2;
    });
  }
}, 20);

// ── SSR ───────────────────────────────────────────────────────────
console.log('\n🖥️ Server-Side Rendering:');
let html;
bench('  renderToString (full page)', () => {
  html = Breeze.renderToString(exampleBreeze);
}, 100);

// ── Output size ───────────────────────────────────────────────────
console.log('\n📦 Output Sizes:');
const htmlSize = Buffer.byteLength(html, 'utf8');
console.log(`  Full HTML: ${(htmlSize / 1024).toFixed(1)} KB`);
console.log(`  Breeze.js: ${(breezeJs.length / 1024).toFixed(1)} KB`);
console.log(`  Breeze.css: ${(breezeCss.length / 1024).toFixed(1)} KB`);

console.log(`\n✨ Summary: parse at ${(exampleBreeze.length * 200 / parseMs * 1000 / 1024).toFixed(0)} KB/sec\n`);
