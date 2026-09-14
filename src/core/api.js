import { Profiler, DevToolsHUD } from './profiler.js';
import { BreezeConfig, reportError, sanitizeUrl } from './config.js';
import { batch, reactiveIdCounter, reactiveNodes, _diagTracking, enableDiagTracking, safeSerializeValue, detectGraphCycles, signal, computed, effect, enableAutoBatch, disableAutoBatch, flushSync } from './reactive.js';
import { Parser } from './parser.js';
import { State, createStore } from './state.js';
import { calculateVirtualWindow } from './virtual-list.js';
import { Renderer } from './renderer.js';
import { Router } from './router.js';
import { Components, Lifecycle, EventBus, Plugins } from './registries.js';
import { Context, Refs, Scheduler, I18n, Forms, A11y, Directives, codeframe, suspense, portal, errorBoundary } from './dx.js';
import { renderToString } from './ssr.js';
import { hydrate } from './hydration.js';
import { defineElement } from './webcomponents.js';
import { Adapters } from './adapters.js';

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API — The global `Breeze` object
  // ═══════════════════════════════════════════════════════════════════════

  export const BreezeAPI = {
    version: '2.3.0',

    // ── Custom Methods Registry ───────────────────────────────────────
    methods: {},

    method(name, fn) {
      this.methods[name] = fn;
      return this;
    },

    // ── Fine-Grained Reactive Signals API ─────────────────────────────
    signal(initialValue, label) {
      return signal(initialValue, label);
    },

    ref(initialValue, label) {
      // v2 ref: { value } alias over signal (Vue-like ergonomics)
      return signal(initialValue, label);
    },

    memo(fn, label) {
      // v2 memo: computed signal with explicit dispose
      const c = computed(fn, label);
      c.dispose = () => { /* computed deps auto-detach on next eval */ };
      return c;
    },

    computed(keyOrFn, maybeDeps, maybeFn, maybeLabel) {
      if (typeof keyOrFn === 'function') {
        return computed(keyOrFn, typeof maybeDeps === 'string' ? maybeDeps : undefined);
      }
      State.computed(keyOrFn, maybeDeps, maybeFn);
      return this;
    },

    effect(fn, label) {
      return effect(fn, label);
    },

    batch(fn) {
      return batch(fn);
    },

    /**
     * v2.3: Opt-in automatic microtask batching.
     * When enabled, multiple synchronous signal writes are coalesced into a
     * single microtask flush, cutting redundant effect/DOM work for multi-write
     * updates. Use Breeze.flushSync() to force synchronous draining.
     */
    autoBatch(enable = true) {
      if (enable) enableAutoBatch();
      else disableAutoBatch();
      return this;
    },

    flushSync() {
      flushSync();
      return this;
    },

    // ── Component & Lifecycle API ─────────────────────────────────────
    component(name, def) {
      Components.register(name, def);
      return this;
    },

    directive(name, def) {
      Directives.register(name, def);
      return this;
    },

    onMount(fn)   { Lifecycle.onMount(fn); return this; },
    onDestroy(fn) { Lifecycle.onDestroy(fn); return this; },
    onUpdate(fn)  { Lifecycle.onUpdate(fn); return this; },
    onError(fn)   { EventBus.on('breeze:error', fn); return this; },

    tick() { return Scheduler.tick(); },
    nextTick(fn) {
      if (fn) return Scheduler.tick().then(fn);
      return Scheduler.tick();
    },
    schedule(fn) { Scheduler.schedule(fn); return this; },

    // ── Profiler & Debugger API ───────────────────────────────────────
    profiler: Profiler,

    debug(enable = true) {
      Profiler._enabled = Boolean(enable);
      if (Profiler._enabled) DevToolsHUD.mount();
      else if (DevToolsHUD._el) DevToolsHUD._el.remove();
      return this;
    },

    // ── DevTools & Diagnostics Graph API ──────────────────────────────
    diagnostics: Object.assign(
      function diagnostics() {
        return Parser.getDiagnostics();
      },
      {
        graph() {
          const nodes = [];
          const edges = [];
          const edgeSet = new Set();

          for (const [id, node] of reactiveNodes.entries()) {
            let rawVal = undefined;
            try { rawVal = node.getVal ? node.getVal() : undefined; } catch (_) {}
            nodes.push({
              id,
              type: node.type,
              value: safeSerializeValue(rawVal),
              label: typeof node.label === 'function' ? node.label() : (node.label || id)
            });

            if (node.runner && node.runner._depNodes) {
              for (const depId of node.runner._depNodes) {
                if (reactiveNodes.has(depId)) {
                  const edgeKey = `${depId}->${id}`;
                  if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);
                    edges.push({ from: depId, to: id });
                  }
                }
              }
            }
          }

          const cycleResult = detectGraphCycles(nodes, edges);

          return {
            nodes,
            edges,
            hasCycle: cycleResult.hasCycle,
            cycles: cycleResult.cycles
          };
        },

        table() {
          const g = this.graph();
          const rows = g.nodes.map(n => {
            const deps = g.edges.filter(e => e.to === n.id).map(e => e.from).join(', ') || '-';
            const dependents = g.edges.filter(e => e.from === n.id).map(e => e.to).join(', ') || '-';
            return {
              id: n.id,
              type: n.type,
              label: n.label,
              value: typeof n.value === 'object' && n.value !== null ? JSON.stringify(n.value) : String(n.value),
              dependencies: deps,
              dependents: dependents
            };
          });
          if (typeof console !== 'undefined' && typeof console.table === 'function') {
            try { console.table(rows); } catch (_) {}
          }
          return rows;
        },

        detectCycles() {
          const g = this.graph();
          return detectGraphCycles(g.nodes, g.edges);
        },

        reset() {
          // Using diagnostics implies you want the graph populated: turn on
          // node tracking so reactive primitives created after this point are
          // recorded. (Production stays leak-free until you opt in.)
          enableDiagTracking();
          reactiveNodes.clear();
          reactiveIdCounter = 0;
        },

        /** Explicitly enable dev-only reactive-node tracking (default: off). */
        enable() { enableDiagTracking(); return true; },
        /** Disable tracking and release all registered nodes. */
        disable() { _diagTracking = false; reactiveNodes.clear(); return false; },
        /** Whether reactive-node tracking is currently active. */
        isEnabled() { return _diagTracking; }
      }
    ),

    // ── SSR & Hydration API ───────────────────────────────────────────
    renderToString(sourceOrAst, state) {
      return renderToString(sourceOrAst, state);
    },

    hydrate(sourceOrAst, rootSelector) {
      hydrate(sourceOrAst, rootSelector);
      return this;
    },

    // ── Boot & Mount ──────────────────────────────────────────────────
    async init(sourceUrl, rootSelector) {
      rootSelector = rootSelector || '#app';
      try {
        const resp = await fetch(sourceUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${sourceUrl}`);
        const source = await resp.text();
        this.mount(source, rootSelector);
      } catch (err) {
        console.error('[Breeze] init failed:', err);
        const root = document.querySelector(rootSelector);
        if (root) {
          root.innerHTML =
            `<div class="bz-alert bz-alert-danger">` +
            `<strong>Breeze Error:</strong> ${err.message}</div>`;
        }
      }
      return this;
    },

    render(sourceOrAst, root) {
      if (typeof sourceOrAst === 'string') {
        const ast = Parser.parse(sourceOrAst);
        if (root) { Renderer.render(ast, root); return root; }
        return Renderer.renderNode(ast[0]);
      }
      if (Array.isArray(sourceOrAst)) {
        if (root) { Renderer.render(sourceOrAst, root); return root; }
        return Renderer.renderNode(sourceOrAst[0]);
      }
      if (typeof sourceOrAst === 'object' && sourceOrAst !== null) {
        if (root) { Renderer.render([sourceOrAst], root); return root; }
        return Renderer.renderNode(sourceOrAst);
      }
      return null;
    },

    mount(source, rootSelector) {
      rootSelector = rootSelector || '#app';
      const root = typeof rootSelector === 'string'
        ? document.querySelector(rootSelector)
        : rootSelector;

      if (!root) {
        console.error('[Breeze] Root element not found:', rootSelector);
        return this;
      }

      const ast = Parser.parse(source);
      Router.init();
      Renderer.render(ast, root);
      Lifecycle.triggerMount(root);
      EventBus.emit('breeze:mounted', { root, ast });
      return this;
    },

    unmount(rootSelector) {
      rootSelector = rootSelector || '#app';
      const root = typeof rootSelector === 'string'
        ? document.querySelector(rootSelector)
        : rootSelector;

      if (!root) return this;
      Lifecycle.triggerUnmount(root);
      root.innerHTML = '';
      EventBus.emit('breeze:unmounted', { root });
      return this;
    },

    // ── State Store API ───────────────────────────────────────────────
    state(key, initialValue) {
      if (typeof key === 'object' && key !== null && initialValue === undefined) {
        Object.entries(key).forEach(([k, v]) => this.state(k, v));
        return this;
      }
      if (key in State._store && initialValue !== undefined) {
        State.set(key, initialValue);
        return this;
      }
      if (!(key in State._store) && initialValue !== undefined) {
        State._store[key] = initialValue;
      }
      if (!State._signals[key]) {
        const s = signal(State._store[key], key);
        // Two-way sync: signal -> store (without re-triggering signal)
        let syncing = false;
        const origDesc = Object.getOwnPropertyDescriptor(s, 'value');
        if (origDesc && origDesc.set) {
          Object.defineProperty(s, 'value', {
            get: origDesc.get,
            set(v) {
              if (syncing) { origDesc.set.call(s, v); return; }
              syncing = true;
              try {
                origDesc.set.call(s, v);
                if (State._store[key] !== v) {
                  State._store[key] = v;
                  (State._watchers[key] || []).slice().forEach(fn => fn(v, State._store[key]));
                  Renderer.updateBindings(key, v);
                }
              } finally {
                syncing = false;
              }
            },
            configurable: true,
            enumerable: true
          });
          // Mark sync guard so State.set doesn't loop
          s._bzSyncing = () => syncing;
        }
        State._signals[key] = s;
      }
      const sig = State._signals[key];
      return {
        get:   ()    => State.get(key),
        set:   val   => State.set(key, val),
        watch: fn    => State.watch(key, fn),
        signal: sig
      };
    },

    createStore(initial) {
      return createStore(initial);
    },

    _resetForTests() {
      State.reset();
      Router.reset();
      Parser._components = {};
      Parser.clearCache();
      Context.clear();
      Refs.clear();
      Profiler.reset();
      return this;
    },

    watch(key, callback) {
      return State.watch(key, callback);
    },

    unwatch(key, callback) {
      State.unwatch(key, callback);
      return this;
    },

    getState(key)        { return State.get(key); },
    setState(key, value) { State.set(key, value); return this; },
    push(key, item)      { State.push(key, item); return this; },
    remove(key, index)   { State.remove(key, index); return this; },

    // ── SEO, AEO, & GEO API ───────────────────────────────────────────
    seo(config)          { Renderer.applySEO(config); return this; },
    schema(data)         { Renderer.applySchema(data); return this; },
    aeo(config)          { Renderer.applyAEO(config); return this; },
    geo(config)          { Renderer.applyGEO(config); return this; },

    // ── Router API ────────────────────────────────────────────────────
    router: Router,
    route(pattern, handler) {
      Router.route(pattern, handler);
      return this;
    },
    navigate(path) {
      Router.navigate(path);
      return this;
    },
    outlet(selector) {
      Router.setOutlet(selector);
      return this;
    },

    // ── v2 DX: store slices, context, refs, suspense, portal, forms, i18n ──
    store(name, initial) {
      const key = `store:${name}`;
      if (initial !== undefined && !(key in State._store)) State._store[key] = initial;
      return {
        get: () => State.get(key),
        set: (v) => State.set(key, v),
        watch: (fn) => State.watch(key, fn),
        update: (fn) => State.set(key, fn(State.get(key))),
        reset: () => State.set(key, initial)
      };
    },
    context: Context,
    provide(key, value) { Context.provide(key, value); return this; },
    inject(key, fallback) { return Context.inject(key, fallback); },
    refs: Refs,
    refOf(name) { return Refs.get(name); },
    suspense(promise, opts) { return suspense(promise, opts); },
    portal(children, target) { return portal(children, target); },
    errorBoundary(fn, fallback) { return errorBoundary(fn, fallback); },
    transition(el, anim) {
      if (typeof el === 'string' && typeof document !== 'undefined') el = document.querySelector(el);
      if (el && anim && el.classList) el.classList.add(`bz-${anim}`);
      return this;
    },
    forms: Forms,
    i18n: I18n,
    t(key, vars) { return I18n.t(key, vars); },
    a11y: A11y,
    announce(msg) { A11y.announce(msg); return this; },
    codeframe(source, line) { return codeframe(source, line); },
    clearCache() { Parser.clearCache(); return this; },
    selectRow(containerSel, key, activeClass) {
      const c = typeof containerSel === 'string' && typeof document !== 'undefined'
        ? document.querySelector(containerSel)
        : containerSel;
      return Renderer.setActiveKey(c, key, activeClass);
    },

    // ── Plugins API ───────────────────────────────────────────────────
    plugin(name, pluginObj) {
      Plugins.register(name, pluginObj);
      return this;
    },

    // ── DOM Helpers ───────────────────────────────────────────────────
    query(selector)    { return document.querySelector(selector); },
    queryAll(selector) { return document.querySelectorAll(selector); },

    // ── Event Bus ─────────────────────────────────────────────────────
    on(event, handler)  { EventBus.on(event, handler);  return this; },
    off(event, handler) { EventBus.off(event, handler); return this; },
    emit(event, data)   { EventBus.emit(event, data);   return this; },

    // ── Utilities ─────────────────────────────────────────────────────
    async fetch(url, options) {
      const resp = await fetch(url, options);
      const ct   = resp.headers.get('content-type') || '';
      return ct.includes('application/json') ? resp.json() : resp.text();
    },

    defineElement(tagName, template, options) {
      return defineElement(tagName, template, options);
    },

    /**
     * v2.3: Plug-and-play React/Vue interoperability.
     * Adapters wrap framework components in native Custom Elements so they
     * render anywhere Breeze renders (including inside .breeze templates) and
     * participate in unmount/teardown without leaking. React/Vue runtimes must
     * be present on window; Breeze does not bundle them.
     */
    adapt: Adapters,

    config: BreezeConfig,
    sanitizeUrl(url) { return sanitizeUrl(url); },
    reportError(err, context) { return reportError(err, context); },

    calculateVirtualWindow(opts) { return calculateVirtualWindow(opts); },
    testing: {
      calculateVirtualWindow(opts) { return calculateVirtualWindow(opts); },
      // v2 headless helpers (node + jsdom-free): parse + SSR + action arg split
      renderToString(source, state) { return renderToString(source, state); },
      parse(source, opts) { return Parser.parse(source, opts); },
      splitArgs(inner) { return Parser.splitArgs(inner); },
      fireAction(action, event, el) { return Renderer.executeAction(action, event || {}, el || {}); },
      // Static-row HTML fast path helpers (pure, DOM-free — safe in node):
      isStaticRowTemplate(children, itemVar) { return Renderer.isStaticRowTemplate(children, itemVar); },
      itemNodeToHtml(node, itemVar, item, index, key) { return Renderer.itemNodeToHtml(node, itemVar, item, index, key); },
      renderRowsHtml(children, itemVar, items, startIdx, keyProp) { return Renderer.renderRowsHtml(children, itemVar, items, startIdx, keyProp); },
      compileRowSerializer(children, itemVar, keyProp, options) { return Renderer.compileRowSerializer(children, itemVar, keyProp, options); },
      compileRowPatcher(children, itemVar) { return Renderer.compileRowPatcher(children, itemVar); },
      updateItemDOM(el, children, itemVar, item, index) { return Renderer.updateItemDOM(el, children, itemVar, item, index); }
    },
    Renderer,

    parse(source, opts) { return Parser.parse(source, opts); }
  };

  // ── DevTools Extension Hook (__BREEZE_DEVTOOLS__) ───────────────────
  export const devtoolsHook = {
    version: BreezeAPI.version,
    getGraph: () => BreezeAPI.diagnostics.graph(),
    getTable: () => BreezeAPI.diagnostics.table(),
    getReport: () => Profiler.getReport(),
    detectCycles: () => BreezeAPI.diagnostics.detectCycles(),
    onUpdate: (fn) => {
      // An external DevTools client is attaching — start recording the graph.
      enableDiagTracking();
      if (typeof EventBus !== 'undefined') {
        EventBus.on('breeze:signal', fn);
        EventBus.on('breeze:effect', fn);
        return () => {
          EventBus.off('breeze:signal', fn);
          EventBus.off('breeze:effect', fn);
        };
      }
      return () => {};
    }
  };
