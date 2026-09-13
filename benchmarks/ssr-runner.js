#!/usr/bin/env node
/**
 * Server-Side Rendering (SSR) Throughput Benchmark for Breeze Framework
 * Compares Breeze SSR against Preact-style VDOM stringification and Native Template Literals.
 */

'use strict';

const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');
const { summarize } = require('./stats.js');
const { writeReport } = require('./lib/report.js');

// Benchmark page template with navigation, user profile, list of 10 dynamic items, and footer
const pageSource = `
@app "SSR Benchmark App"
@state username = "Alex"
@state count = 10
@nav "Breeze SSR"
  a "Home" [href=/]
  a "Dashboard" [href=/dashboard]
  a "Settings" [href=/settings]
@section #profile
  h1 "User Profile: {username}"
  p "Current dynamic count: {count}"
@section #items
  h2 "Feed Items"
  @each item in items
    div.item-card
      strong "{item.title}"
      p "{item.desc}"
      span.badge "{item.badge}"
@footer
  p "Rendered by Breeze SSR in pure Node.js"
`;

const parsedAst = Breeze.parse(pageSource);

const testData = {
  username: "Alex Rivera",
  count: 10,
  items: Array.from({ length: 10 }, (_, i) => ({
    title: `Notification event #${i + 1}`,
    desc: `Detailed payload summary for event id ${i * 42} with metadata and latency checks`,
    badge: i % 2 === 0 ? "Critical" : "Standard"
  }))
};

// Baseline 1: Native JavaScript Template Literals
function nativeTemplate(data) {
  return `<nav class="bz-nav"><div class="bz-nav-brand">Breeze SSR</div><div class="bz-nav-links"><a href="/">Home</a><a href="/dashboard">Dashboard</a><a href="/settings">Settings</a></div></nav><section id="profile" class="bz-section"><h1>User Profile: ${data.username}</h1><p>Current dynamic count: ${data.count}</p></section><section id="items" class="bz-section"><h2>Feed Items</h2>${data.items.map(item => `<div class="item-card"><strong>${item.title}</strong><p>${item.desc}</p><span class="badge">${item.badge}</span></div>`).join('')}</section><footer class="bz-footer"><p>Rendered by Breeze SSR in pure Node.js</p></footer>`;
}

// Baseline 2: Virtual DOM tree to HTML serializer (Preact / minimal VDOM pattern)
function createVNodeTree(data) {
  return {
    tag: 'div',
    children: [
      {
        tag: 'nav',
        attrs: { class: 'bz-nav' },
        children: [
          { tag: 'div', attrs: { class: 'bz-nav-brand' }, children: ['Breeze SSR'] },
          {
            tag: 'div',
            attrs: { class: 'bz-nav-links' },
            children: [
              { tag: 'a', attrs: { href: '/' }, children: ['Home'] },
              { tag: 'a', attrs: { href: '/dashboard' }, children: ['Dashboard'] },
              { tag: 'a', attrs: { href: '/settings' }, children: ['Settings'] }
            ]
          }
        ]
      },
      {
        tag: 'section',
        attrs: { id: 'profile', class: 'bz-section' },
        children: [
          { tag: 'h1', children: [`User Profile: ${data.username}`] },
          { tag: 'p', children: [`Current dynamic count: ${data.count}`] }
        ]
      },
      {
        tag: 'section',
        attrs: { id: 'items', class: 'bz-section' },
        children: [
          { tag: 'h2', children: ['Feed Items'] },
          ...data.items.map(item => ({
            tag: 'div',
            attrs: { class: 'item-card' },
            children: [
              { tag: 'strong', children: [item.title] },
              { tag: 'p', children: [item.desc] },
              { tag: 'span', attrs: { class: 'badge' }, children: [item.badge] }
            ]
          }))
        ]
      },
      {
        tag: 'footer',
        attrs: { class: 'bz-footer' },
        children: [
          { tag: 'p', children: ['Rendered by Breeze SSR in pure Node.js'] }
        ]
      }
    ]
  };
}

function renderVNodeToString(vnode) {
  if (typeof vnode === 'string') return vnode;
  let attrs = '';
  if (vnode.attrs) {
    for (const [k, v] of Object.entries(vnode.attrs)) {
      attrs += ` ${k}="${v}"`;
    }
  }
  let inner = '';
  if (vnode.children) {
    for (const child of vnode.children) {
      inner += renderVNodeToString(child);
    }
  }
  return `<${vnode.tag}${attrs}>${inner}</${vnode.tag}>`;
}

/**
 * Runs `repeats` independent timing samples of `iterations` render passes
 * each per engine, and returns a full distribution (median/p95/min/max/sd)
 * per engine instead of one bare average — a single sample can't tell you
 * whether a number is stable or a fluke, especially on shared/virtualized
 * hardware (see benchmarks/lib/env-info.js).
 */
function runSsrBenchmark(iterations = 1000, repeats = 7) {
  console.log('\n================================================================');
  console.log('🖥️  SERVER-SIDE RENDERING (SSR) THROUGHPUT BENCHMARK');
  console.log(`Executing ${repeats} samples of ${iterations.toLocaleString()} iterations per engine...`);
  console.log('================================================================\n');

  const engines = [
    {
      name: 'Breeze SSR (pre-parsed AST)',
      fn: () => Breeze.renderToString(parsedAst, testData)
    },
    {
      name: 'Breeze SSR (raw DSL string)',
      fn: () => Breeze.renderToString(pageSource, testData)
    },
    {
      name: 'Virtual DOM Serializer (Preact-style, hand-rolled reference impl)',
      fn: () => renderVNodeToString(createVNodeTree(testData))
    },
    {
      name: 'Native JS Template Literals',
      fn: () => nativeTemplate(testData)
    }
  ];

  const results = {};

  for (const eng of engines) {
    // Warmup
    for (let i = 0; i < 50; i++) eng.fn();

    let htmlBytes = 0;
    const opsPerSecSamples = [];
    for (let s = 0; s < repeats; s++) {
      const t0 = performance.now();
      let sampleOutput = '';
      for (let i = 0; i < iterations; i++) {
        sampleOutput = eng.fn();
      }
      const elapsedMs = performance.now() - t0;
      opsPerSecSamples.push(iterations / (elapsedMs / 1000));
      htmlBytes = Buffer.byteLength(sampleOutput, 'utf8');
      if (global.gc) { try { global.gc(); } catch (_) {} }
    }

    const dist = summarize(opsPerSecSamples);
    results[eng.name] = { ...dist, htmlBytes, meanLatencyUsMedian: +((1_000_000 / dist.median)).toFixed(1) };

    console.log(`Engine: ${eng.name}`);
    console.log(`  • Throughput (median of ${repeats}): ${Math.round(dist.median).toLocaleString().padStart(8)} pages/sec  (p95 ${Math.round(dist.p95)}, range ${Math.round(dist.min)}–${Math.round(dist.max)}, sd ${dist.sd})`);
    console.log(`  • Output Size: ${htmlBytes.toString().padStart(8)} bytes`);
    console.log('');
  }

  console.log('| SSR Engine | Median Throughput (pages/sec) | p95 | Range (min–max) | sd | HTML Size |');
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: |');
  for (const [name, d] of Object.entries(results)) {
    console.log(`| **${name}** | **${Math.round(d.median).toLocaleString()} ops/s** | ${Math.round(d.p95)} | ${Math.round(d.min)}–${Math.round(d.max)} | ${d.sd} | ${d.htmlBytes} B |`);
  }
  console.log('');

  return results;
}

function generateReport(results, iterations, repeats) {
  const rows = Object.entries(results).map(([name, d]) =>
    `| **${name}** | **${Math.round(d.median).toLocaleString()} ops/s** | ${Math.round(d.p95).toLocaleString()} | ${Math.round(d.min).toLocaleString()}–${Math.round(d.max).toLocaleString()} | ${d.sd} | ${d.htmlBytes} B |`
  ).join('\n');

  writeReport('ssr.md', {
    title: '📊 Benchmark Report: Server-Side Rendering (SSR) Throughput',
    summary: `Breeze's zero-dependency server-side renderer (\`Breeze.renderToString()\`) measured against two reference baselines: a hand-rolled virtual-DOM-to-string serializer (representative of the Preact/React SSR string-render pattern) and raw native JS template literals (the theoretical ceiling — no parsing, no tree walk, just string concatenation). ${repeats} independent samples of ${iterations.toLocaleString()} render passes each per engine; the table reports the full distribution, not a single run.`,
    reproCommand: 'node benchmarks/ssr-runner.js',
    body: `## Results (median of ${repeats} samples × ${iterations.toLocaleString()} iterations each)\n\n| SSR Engine | Median Throughput (pages/sec) | p95 | Range (min–max) | sd | Output Size |\n| :--- | :---: | :---: | :---: | :---: | :---: |\n${rows}\n\n## Reading these numbers\n\n- "Native JS Template Literals" is not a competing framework — it's the theoretical ceiling (raw string concatenation, no template parsing, no tree walk). Breeze SSR will never beat it; the interesting comparison is how close it gets.\n- The "Virtual DOM Serializer" baseline is a small hand-rolled reference implementation of the classic recurse-a-vnode-tree-into-a-string pattern used by React/Preact SSR, not an actual React/Preact SSR call — it isolates the cost of *tree-walking* from any of the JSX/component-instantiation overhead a real React SSR path also pays. Do not read it as "faster/slower than React SSR" without that caveat.\n- "Breeze SSR (pre-parsed AST)" vs "(raw DSL string)" isolates the one-time parse cost: the gap between them is what you save by parsing a template once (e.g. at build/import time) instead of on every request.`
  });
}

if (require.main === module) {
  const results = runSsrBenchmark();
  generateReport(results, 1000, 7);
}

module.exports = { runSsrBenchmark };
