#!/usr/bin/env node
/**
 * Server-Side Rendering (SSR) Throughput Benchmark for Breeze Framework
 * Compares Breeze SSR against Preact-style VDOM stringification and Native Template Literals.
 */

'use strict';

const { performance } = require('perf_hooks');
const { Breeze } = require('../breeze.js');

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

function runSsrBenchmark(iterations = 1000) {
  console.log('\n================================================================');
  console.log('🖥️  SERVER-SIDE RENDERING (SSR) THROUGHPUT BENCHMARK');
  console.log(`Executing ${iterations.toLocaleString()} iterations per engine...`);
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
      name: 'Virtual DOM Serializer (Preact-style)',
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

    const t0 = performance.now();
    let sampleOutput = '';
    for (let i = 0; i < iterations; i++) {
      sampleOutput = eng.fn();
    }
    const elapsedMs = performance.now() - t0;
    const opsPerSec = Math.round((iterations / (elapsedMs / 1000)));
    const meanLatencyUs = ((elapsedMs / iterations) * 1000).toFixed(1);
    const htmlBytes = Buffer.byteLength(sampleOutput, 'utf8');

    results[eng.name] = {
      elapsedMs: parseFloat(elapsedMs.toFixed(1)),
      opsPerSec,
      meanLatencyUs: parseFloat(meanLatencyUs),
      htmlBytes
    };

    console.log(`Engine: ${eng.name}`);
    console.log(`  • Throughput:   ${opsPerSec.toLocaleString().padStart(8)} pages/sec`);
    console.log(`  • Mean Latency: ${meanLatencyUs.padStart(8)} μs/page`);
    console.log(`  • Output Size:  ${htmlBytes.toString().padStart(8)} bytes`);
    console.log('');
  }

  console.log('| SSR Engine | Throughput (pages/sec) | Mean Latency (μs) | HTML Size |');
  console.log('| :--- | :---: | :---: | :---: |');
  for (const [name, d] of Object.entries(results)) {
    console.log(`| **${name}** | **${d.opsPerSec.toLocaleString()} ops/s** | ${d.meanLatencyUs} μs | ${d.htmlBytes} B |`);
  }
  console.log('');

  return results;
}

if (require.main === module) {
  runSsrBenchmark();
}

module.exports = { runSsrBenchmark };
