/*!
 * Breeze Framework v2.2.0 (Comfort + Perf + Benchmarks)
 * Ultra-lightweight declarative web framework
 * https://github.com/breeze-framework/breeze-framework
 * MIT License
 *
 * Architecture:
 *   Parser    — Cached LRU parse, precompiled {token} templates, codeframe diagnostics
 *   Signals   — Fast-path single-subscriber sets, disposable effects, batched scheduler
 *   State     — Store slices, watchers, cycle-guarded computeds, signal sync
 *   Renderer  — LIS minimal-move keyed reconciliation, append fast-path, data-key select,
 *               if/elif/else chains, component params, portal, @show/@model/@ref/@cloak/@transition
 *   Router    — Hash/history, :id/:id?/*, outlet rendering, async guards, regex cache
 *   DX        — Context, refs, suspense, errorBoundary, forms, i18n, a11y, directives, testing
 *   SSR       — Parity string rendering (chains/components/ids/attrs) & non-destructive hydration
 *   CLI       — generate/lint/format/check/min, portable median-run benchmarks (15 suites)
 */
(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // PROFILER & DIAGNOSTICS
  // ═══════════════════════════════════════════════════════════════════════

  const Profiler = {
    _enabled: false,
    _metrics: {
      renders: 0,
      renderTimeMs: 0,
      domOps: { create: 0, remove: 0, move: 0, text: 0, attr: 0 },
      signalUpdates: 0,
      keyedDiffs: 0,
      history: []
    },

    recordRender(ms) {
      this._metrics.renders++;
      this._metrics.renderTimeMs += ms;
      this._metrics.history.push({ type: 'render', ms, timestamp: Date.now() });
      if (this._metrics.history.length > 50) this._metrics.history.shift();
      if (ms > 16.6 && typeof console !== 'undefined' && console.warn) {
        console.warn(`[Breeze Profiler] Long frame detected: render took ${ms.toFixed(2)}ms (>16.6ms budget)`);
      }
      if (this._enabled) DevToolsHUD.update();
    },

    recordDomOp(type) {
      if (this._metrics.domOps[type] !== undefined) {
        this._metrics.domOps[type]++;
      }
      if (this._enabled && Math.random() < 0.1) DevToolsHUD.update();
    },

    recordSignalUpdate() {
      this._metrics.signalUpdates++;
      if (this._enabled && Math.random() < 0.1) DevToolsHUD.update();
    },

    recordKeyedDiff() {
      this._metrics.keyedDiffs++;
    },

    getReport() {
      let heap = 'N/A';
      if (typeof performance !== 'undefined' && performance.memory) {
        heap = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2) + ' MB';
      }
      return {
        renders: this._metrics.renders,
        renderTimeMs: parseFloat(this._metrics.renderTimeMs.toFixed(2)),
        domOps: { ...this._metrics.domOps },
        signalUpdates: this._metrics.signalUpdates,
        keyedDiffs: this._metrics.keyedDiffs,
        heapUsed: heap
      };
    },

    reset() {
      this._metrics = {
        renders: 0,
        renderTimeMs: 0,
        domOps: { create: 0, remove: 0, move: 0, text: 0, attr: 0 },
        signalUpdates: 0,
        keyedDiffs: 0,
        history: []
      };
      if (this._enabled) DevToolsHUD.update();
    }
  };

  // ── In-Browser DevTools HUD Overlay ──────────────────────────────────
  const DevToolsHUD = {
    _el: null,
    _visible: false,

    mount() {
      if (typeof document === 'undefined' || this._el) return;
      const el = document.createElement('div');
      el.id = 'breeze-devtools-hud';
      el.style.cssText = `
        position: fixed; bottom: 16px; right: 16px; z-index: 999999;
        background: rgba(17, 24, 39, 0.92); color: #f9fafb;
        backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 11px; line-height: 1.4; padding: 8px 12px;
        border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
        box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
        cursor: pointer; user-select: none; transition: all 0.2s ease;
      `;
      el.innerHTML = `<span style="color:#6366f1;font-weight:bold">🌊 Breeze DevTools</span> | Initializing...`;
      el.addEventListener('click', () => this.toggleExpand());
      document.body.appendChild(el);
      this._el = el;
      this._visible = true;
      this.update();
    },

    update() {
      if (!this._el) return;
      const rep = Profiler.getReport();
      const avgMs = rep.renders > 0 ? (rep.renderTimeMs / rep.renders).toFixed(1) : '0.0';
      const totalOps = rep.domOps.create + rep.domOps.remove + rep.domOps.move + rep.domOps.text;
      this._el.innerHTML = `
        <span style="color:#6366f1;font-weight:bold">🌊 Breeze</span> |
        <span>Renders: <b>${rep.renders}</b> (${avgMs}ms)</span> |
        <span>DOM Ops: <b>${totalOps}</b></span> |
        <span>Signals: <b>${rep.signalUpdates}</b></span>
        ${rep.heapUsed !== 'N/A' ? ` | <span>Heap: <b>${rep.heapUsed}</b></span>` : ''}
      `;
    },

    toggleExpand() {
      if (!this._el) return;
      const rep = Profiler.getReport();
      console.table({
        'Total Renders': rep.renders,
        'Render Time (ms)': rep.renderTimeMs,
        'DOM Creates': rep.domOps.create,
        'DOM Removes': rep.domOps.remove,
        'DOM Moves': rep.domOps.move,
        'DOM Text Updates': rep.domOps.text,
        'Signal Updates': rep.signalUpdates,
        'Keyed List Diffs': rep.keyedDiffs,
        'Heap Memory': rep.heapUsed
      });
      console.log('[Breeze DevTools] Live State Snapshot:', State.getAll());
    }
  };

  // Keyboard shortcut Ctrl+Shift+B for DevTools HUD
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.key === 'b')) {
        Profiler._enabled = !Profiler._enabled;
        if (Profiler._enabled) DevToolsHUD.mount();
        else if (DevToolsHUD._el) DevToolsHUD._el.remove();
      }
    });
  }


  // ── Configuration & Robustness System ─────────────────────────────
  const BreezeConfig = {
    warn: true,
    security: {
      sanitizeUrls: true
    }
  };

  let _activeErrorBoundary = null;

  function reportError(err, context = 'runtime') {
    if (_activeErrorBoundary && typeof _activeErrorBoundary === 'function') {
      try {
        _activeErrorBoundary(err, context);
        return;
      } catch (_) {}
    }
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      try {
        EventBus.emit('breeze:error', { error: err, context });
      } catch (_) {}
    }
    if (BreezeConfig.warn && typeof console !== 'undefined' && console.error) {
      console.error(`[Breeze Error in ${context}]:`, err);
    }
  }

  function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (!BreezeConfig.security.sanitizeUrls) return url;
    const trimmed = url.replace(/[\x00-\x1f\x7f-\x9f\s]+/g, '');
    if (/^(?:javascript|vbscript):/i.test(trimmed)) {
      if (BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
        console.warn(`[Breeze Security] Blocked dangerous pseudo-protocol URL: "${url}"`);
      }
      return 'about:blank';
    }
    if (/^data:text\/html/i.test(trimmed)) {
      if (BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
        console.warn(`[Breeze Security] Blocked dangerous data:text/html URL: "${url}"`);
      }
      return 'about:blank';
    }
    return url;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SIGNALS — Fine-grained reactivity engine
  // ═══════════════════════════════════════════════════════════════════════

  const MAX_UPDATE_DEPTH = 100;
  let activeEffect = null;
  let batchDepth = 0;
  const pendingEffects = new Set();

  function batch(fn) {
    batchDepth++;
    try {
      return fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        let iterations = 0;
        while (pendingEffects.size > 0) {
          if (++iterations > MAX_UPDATE_DEPTH) {
            pendingEffects.clear();
            const msg = `[Breeze] Maximum recursive update depth (${MAX_UPDATE_DEPTH}) exceeded. Detected a potential infinite reactivity loop in effect or watcher.`;
            reportError(new Error(msg), 'batch');
            break;
          }
          const effectsToRun = Array.from(pendingEffects);
          pendingEffects.clear();
          for (let i = 0; i < effectsToRun.length; i++) {
            try {
              effectsToRun[i]();
            } catch (err) {
              reportError(err, 'effect');
            }
          }
        }
      }
    }
  }

  // ── Reactive Graph Tracking & Diagnostics Helpers ───────────────────
  let reactiveIdCounter = 0;
  const reactiveNodes = new Map();

  function safeSerializeValue(val) {
    if (val === undefined) return undefined;
    if (val === null) return null;
    const type = typeof val;
    if (type === 'number' || type === 'boolean' || type === 'string') return val;
    if (type === 'bigint') return val.toString() + 'n';
    if (type === 'function') return `[Function: ${val.name || 'anonymous'}]`;
    if (typeof Element !== 'undefined' && val instanceof Element) return `<${val.tagName.toLowerCase()}>`;
    if (Array.isArray(val)) {
      return val.length <= 10 ? val.map(safeSerializeValue) : `Array(${val.length})`;
    }
    if (type === 'object') {
      try {
        JSON.stringify(val);
        return val;
      } catch (_) {
        return '[Circular / Complex Object]';
      }
    }
    return String(val);
  }

  function detectGraphCycles(nodes, edges) {
    const adj = new Map();
    (nodes || []).forEach(n => adj.set(n.id, []));
    (edges || []).forEach(e => {
      if (adj.has(e.from)) adj.get(e.from).push(e.to);
    });

    const state = new Map(); // 0: unvisited, 1: visiting, 2: visited
    const cycles = [];

    function dfs(u, path) {
      state.set(u, 1);
      path.push(u);

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        const vState = state.get(v) || 0;
        if (vState === 1) {
          const cycleStart = path.indexOf(v);
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart).concat([v]));
          }
        } else if (vState === 0) {
          dfs(v, path);
        }
      }

      path.pop();
      state.set(u, 2);
    }

    (nodes || []).forEach(n => {
      if ((state.get(n.id) || 0) === 0) {
        dfs(n.id, []);
      }
    });

    return {
      hasCycle: cycles.length > 0,
      cycles
    };
  }

  function signal(initialValue, label) {
    let value = initialValue;
    const subscribers = new Set();
    const id = 'sig_' + (++reactiveIdCounter);
    const nodeLabel = label || `signal_${id}`;

    reactiveNodes.set(id, {
      id,
      type: 'signal',
      label: nodeLabel,
      getVal: () => value,
      subscribers
    });

    function track() {
      if (activeEffect) {
        subscribers.add(activeEffect);
        // Record reverse link so effects/computeds can unsubscribe on re-run/dispose
        if (!activeEffect._sources) activeEffect._sources = new Set();
        activeEffect._sources.add(subscribers);
        if (activeEffect._depNodes) {
          activeEffect._depNodes.add(id);
        }
      }
    }

    return {
      get value() {
        track();
        return value;
      },
      set value(newValue) {
        if (value !== newValue) {
          value = newValue;
          Profiler.recordSignalUpdate();
          if (typeof EventBus !== 'undefined' && EventBus.emit) {
            try { EventBus.emit('breeze:signal', { id, label: nodeLabel, value }); } catch (_) {}
          }
          // v2 fast-paths: single subscriber (common) avoids Array.from alloc;
          // batched multi-subscriber path batches without intermediate arrays.
          if (batchDepth > 0) {
            for (const sub of subscribers) pendingEffects.add(sub);
          } else if (subscribers.size === 1) {
            for (const sub of subscribers) { sub(); break; }
          } else if (subscribers.size > 1) {
            for (const sub of Array.from(subscribers)) sub();
          }
        }
      },
      peek() { return value; },
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
      _subscribers: subscribers,
      _nodeId: id,
      _nodeType: 'signal',
      label: nodeLabel
    };
  }

  function detachRunner(runner) {
    if (runner && runner._sources) {
      for (const set of runner._sources) set.delete(runner);
      runner._sources.clear();
    }
    if (runner && runner._depNodes) {
      runner._depNodes.clear();
    }
  }

  /**
   * v2: Longest Increasing Subsequence (patience) for keyed reorder.
   * Given an array of current positions (or -1 for new nodes) in next order,
   * returns the Set of indices that can stay in place — everything else moves.
   * This turns swap-2-in-1000 from O(n) moves into O(1).
   */
  function lisKeepSet(positions) {
    const n = positions.length;
    const predecessors = new Array(n).fill(-1);
    const tails = []; // tails[len] = index in positions with smallest tail value
    const tailPos = [];
    for (let i = 0; i < n; i++) {
      const v = positions[i];
      if (v === -1) continue; // new node, must insert
      // binary search over tailPos
      let lo = 0, hi = tailPos.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tailPos[mid] < v) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) predecessors[i] = tails[lo - 1];
      if (lo === tailPos.length) {
        tailPos.push(v);
        tails.push(i);
      } else {
        tailPos[lo] = v;
        tails[lo] = i;
      }
    }
    const keep = new Set();
    let k = tails.length ? tails[tails.length - 1] : -1;
    while (k !== -1 && k !== undefined) {
      keep.add(k);
      k = predecessors[k];
    }
    return keep;
  }

  function computed(fn, label) {
    let cachedValue;
    let dirty = true;
    let evaluating = false;
    const subscribers = new Set();
    const id = 'comp_' + (++reactiveIdCounter);
    const nodeLabel = label || `computed_${id}`;

    const runner = () => {
      if (!dirty) {
        dirty = true;
        if (batchDepth > 0) {
          for (const sub of subscribers) pendingEffects.add(sub);
        } else if (subscribers.size === 1) {
          for (const sub of subscribers) { sub(); break; }
        } else if (subscribers.size > 1) {
          for (const sub of Array.from(subscribers)) sub();
        }
      }
    };
    runner._sources = new Set();
    runner._depNodes = new Set();
    runner._nodeId = id;
    runner._nodeType = 'computed';

    reactiveNodes.set(id, {
      id,
      type: 'computed',
      label: nodeLabel,
      getVal: () => cachedValue,
      runner,
      subscribers
    });

    return {
      get value() {
        if (evaluating) {
          const msg = `[Breeze] Cyclic computed dependency detected: a computed signal cannot depend on its own evaluation.`;
          reportError(new Error(msg), 'computed');
          return cachedValue;
        }
        if (dirty) {
          detachRunner(runner);
          const prev = activeEffect;
          activeEffect = runner;
          evaluating = true;
          try {
            cachedValue = fn();
            dirty = false;
          } catch (err) {
            reportError(err, 'computed');
          } finally {
            evaluating = false;
            activeEffect = prev;
          }
        }
        if (activeEffect) {
          subscribers.add(activeEffect);
          if (!activeEffect._sources) activeEffect._sources = new Set();
          activeEffect._sources.add(subscribers);
          if (activeEffect._depNodes) {
            activeEffect._depNodes.add(id);
          }
        }
        return cachedValue;
      },
      peek() { return cachedValue; },
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
      dispose() {
        detachRunner(runner);
        reactiveNodes.delete(id);
      },
      _nodeId: id,
      _nodeType: 'computed',
      label: nodeLabel
    };
  }

  function effect(fn, label) {
    let running = false;
    let runCount = 0;
    const id = 'eff_' + (++reactiveIdCounter);
    const nodeLabel = label || `effect_${id}`;

    const runner = () => {
      if (running) {
        if (++runCount > MAX_UPDATE_DEPTH) {
          const msg = `[Breeze] Infinite loop detected: effect repeatedly triggered itself synchronously.`;
          reportError(new Error(msg), 'effect');
          return;
        }
      }
      detachRunner(runner);
      const prev = activeEffect;
      activeEffect = runner;
      running = true;
      try {
        fn();
      } catch (err) {
        reportError(err, 'effect');
      } finally {
        running = false;
        activeEffect = prev;
        if (typeof EventBus !== 'undefined' && EventBus.emit) {
          try { EventBus.emit('breeze:effect', { id, label: nodeLabel, runCount }); } catch (_) {}
        }
      }
    };
    runner._sources = new Set();
    runner._depNodes = new Set();
    runner._nodeId = id;
    runner._nodeType = 'effect';

    reactiveNodes.set(id, {
      id,
      type: 'effect',
      label: nodeLabel,
      getVal: () => '[Effect]',
      runner
    });

    runner();
    return () => {
      detachRunner(runner);
      pendingEffects.delete(runner);
      reactiveNodes.delete(id);
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PARSER — Converts .breeze source text into an Abstract Syntax Tree
  // ═══════════════════════════════════════════════════════════════════════

  const Parser = {
    _components: {}, // Component definitions registered via @def / @component
    _cache: new Map(), // source-string → AST (LRU, v2 perf)
    _cacheLimit: 50,
    _diagnostics: [],

    /** Emit a non-fatal parser diagnostic (collected for tooling) */
    _warn(msg, line) {
      this._diagnostics.push({ message: msg, line: line || null });
      if (this._diagnostics.length > 200) this._diagnostics.shift();
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Breeze] ' + msg);
      }
    },

    clearCache() {
      this._cache.clear();
      this._diagnostics = [];
    },

    getDiagnostics() {
      return this._diagnostics.slice();
    },

    /**
     * Precompile a text template with {tokens} into static parts + keys.
     * v2 fast-path: avoids per-row RegExp construction in lists/SSR.
     * Returns { parts: string[], keys: string[] } so that
     *   render = parts[0] + val(keys[0]) + parts[1] + ...
     */
    compileTemplate(str) {
      if (!str || typeof str !== 'string' || str.indexOf('{') === -1) {
        return { parts: [str], keys: [], static: true };
      }
      const parts = [], keys = [];
      let last = 0;
      const re = /\{([\w.$-]+)\}/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        parts.push(str.slice(last, m.index));
        keys.push(m[1]);
        last = m.index + m[0].length;
      }
      parts.push(str.slice(last));
      return { parts, keys, static: keys.length === 0 };
    },

    renderCompiled(tpl, lookup) {
      if (!tpl || tpl.static) return tpl.parts[0];
      let out = tpl.parts[0];
      for (let i = 0; i < tpl.keys.length; i++) {
        const v = lookup(tpl.keys[i]);
        out += (v !== undefined && v !== null ? String(v) : '') + tpl.parts[i + 1];
      }
      return out;
    },

    _hashString(str) {
      let hash = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(36);
    },

    _getPersistedAST(hash) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem('bz_ast_' + hash);
          if (raw) return JSON.parse(raw);
        }
      } catch (_) {}
      return null;
    },

    _setPersistedAST(hash, ast) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('bz_ast_' + hash, JSON.stringify(ast));
        }
      } catch (_) {}
    },

    /**
     * Parse a full .breeze source string into an array of AST nodes.
     * Indentation (2 spaces per level) determines parent-child nesting.
     * v2: LRU-caches small sources; pass { noCache: true } to bypass.
     * v2.2: Persisted content-hash cache + zero-backtracking tokenizing.
     */
    parse(source, opts) {
      if (!source) return [];
      const useCache = !(opts && opts.noCache) && source.length < 500000;
      let hash = null;
      if (useCache) {
        if (this._cache.has(source)) {
          const hit = this._cache.get(source);
          this._cache.delete(source);
          this._cache.set(source, hit);
          return hit;
        }
        hash = this._hashString(source);
        const persisted = this._getPersistedAST(hash);
        if (persisted) {
          this._cache.set(source, persisted);
          return persisted;
        }
      }

      // Normalize line endings (\r\n -> \n, \r -> \n)
      const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalized.split('\n');
      const root  = [];
      const stack = [{ children: root, indent: -1 }];
      let i = 0;

      while (i < lines.length) {
        const rawLine = lines[i];
        let spaces = 0;
        let j = 0;
        let tabDetected = false;
        const len = rawLine.length;

        // Fast whitespace and indent scanner — eliminates per-line regex allocations
        while (j < len) {
          const ch = rawLine.charCodeAt(j);
          if (ch === 32) {
            spaces++;
          } else if (ch === 9) {
            spaces += 2;
            tabDetected = true;
          } else {
            break;
          }
          j++;
        }

        if (j === len) {
          i++;
          continue;
        }

        const c0 = rawLine.charCodeAt(j);
        const c1 = j + 1 < len ? rawLine.charCodeAt(j + 1) : 0;
        if ((c0 === 47 && c1 === 47) || (c0 === 35 && c1 === 35)) {
          i++;
          continue;
        }

        if (tabDetected) {
          Parser._warn(
            `Line ${i + 1}: tab indentation detected. Breeze uses 2 spaces per ` +
            `level — tabs were expanded to 2 spaces; please convert to spaces.`
          );
        }

        if (spaces % 2 !== 0) {
          Parser._warn(
            `Line ${i + 1}: odd indentation (${spaces} spaces). Breeze uses 2 spaces per ` +
            `level — rounding down to level ${Math.floor(spaces / 2)}.`
          );
        }
        const indent = Math.floor(spaces / 2);
        const trimmed = rawLine.slice(j).trimEnd();
        const isDirective = c0 === 64; // '@'

        // ── Block directives: @theme, @seo, @schema, @aeo, @geo { key: value ... }
        if (isDirective && (
          trimmed.startsWith('@theme') ||
          trimmed.startsWith('@seo') ||
          trimmed.startsWith('@schema') ||
          trimmed.startsWith('@aeo') ||
          trimmed.startsWith('@geo')
        )) {
          const blockMatch = trimmed.match(/^@(theme|seo|schema|aeo|geo)\b/);
          if (blockMatch) {
            const blockType = blockMatch[1];
            if (!trimmed.includes('{')) {
              Parser._warn(`Line ${i + 1}: @${blockType} must open a block with "{" on the same line.`);
            }
            const blockNode = { type: blockType, props: {} };
            const blockStart = i;
            let closed = false;
            i++;
            while (i < lines.length) {
              const tl = lines[i].trim();
              if (tl === '}') { i++; closed = true; break; }
              if (tl && !tl.startsWith('//') && !tl.startsWith('##')) {
                const ci = tl.indexOf(':');
                if (ci !== -1) {
                  const k = tl.substring(0, ci).trim();
                  let v = tl.substring(ci + 1).trim();
                  try {
                    v = JSON.parse(v);
                  } catch (_) {
                    v = v.replace(/^["']|["']$/g, '');
                  }
                  blockNode.props[k] = v;
                }
              }
              i++;
            }
            if (!closed) {
              Parser._warn(`Line ${blockStart + 1}: @${blockType} block is missing a closing "}".`);
            }
            root.push(blockNode);
            continue;
          }
        }

        // ── Component Definition: @def ComponentName(prop1, prop2) ─────
        if (isDirective && (trimmed.startsWith('@def') || trimmed.startsWith('@component'))) {
          const compM = trimmed.match(/@(def|component)\s+([A-Z]\w*)(?:\(([^)]*)\))?/);
          if (compM) {
            const compName = compM[2];
            const rawProps = compM[3] ? compM[3].split(',').map(s => s.trim()).filter(Boolean) : [];
            const compNode = {
              type: 'def',
              name: compName,
              params: rawProps,
              children: [],
              indent
            };
            Parser._components[compName] = compNode;
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
              stack.pop();
            }
            const parent = stack[stack.length - 1];
            if (!parent.children) parent.children = [];
            parent.children.push(compNode);
            stack.push({ children: compNode.children, indent });
            i++;
            continue;
          }
        }

        // ── Adjust stack: pop entries whose indent >= current indent ───
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }

        const parent = stack[stack.length - 1];
        const node   = Parser.parseLine(trimmed, indent);

        if (node) {
          if (!parent.children) parent.children = [];
          parent.children.push(node);
          if (Array.isArray(node.children)) {
            stack.push({ children: node.children, indent });
          }
        }

        i++;
      }

      if (useCache) {
        this._cache.set(source, root);
        if (this._cache.size > this._cacheLimit) {
          const oldest = this._cache.keys().next().value;
          this._cache.delete(oldest);
        }
        if (hash) {
          this._setPersistedAST(hash, root);
        }
      }
      return root;
    },

    /** Route a single trimmed line to directive or element parser */
    parseLine(content, indent) {
      return content.startsWith('@')
        ? Parser.parseDirective(content, indent)
        : Parser.parseElement(content, indent);
    },

    // ── Directive parser (@nav, @section, @state, @each, @if, …) ─────

    parseDirective(content, indent) {
      if (content.startsWith('@app')) {
        return { type: 'app', text: Parser.extractQuoted(content), children: [], indent };
      }

      if (content.startsWith('@nav')) {
        return {
          type: 'nav', tag: 'nav',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@section')) {
        return {
          type: 'section', tag: 'section',
          id: Parser.extractId(content),
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@footer')) {
        return {
          type: 'footer', tag: 'footer',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@header')) {
        return {
          type: 'header', tag: 'header',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@main')) {
        return {
          type: 'main', tag: 'main',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@state')) {
        const m = content.match(/@state\s+(\w+)\s*=\s*(.+)/);
        if (m) {
          let val = m[2].trim();
          try { val = JSON.parse(val); } catch (e) {
            val = val.replace(/^["']|["']$/g, '');
          }
          return { type: 'state', key: m[1], value: val, indent };
        }
        Parser._warn(`Malformed @state: "${content}". Expected: @state name = value`);
        return null;
      }

      if (content.startsWith('@style')) {
        return { type: 'style', text: Parser.extractQuoted(content), indent };
      }

      if (content.startsWith('@slot')) {
        return { type: 'slot', indent };
      }

      if (content.startsWith('@error')) {
        return {
          type: 'error',
          text: Parser.extractQuoted(content),
          children: [],
          indent
        };
      }

      // @virtual each item in listKey [height=40, overscan=5, key=id]
      if (content.startsWith('@virtual')) {
        const m = content.match(/@virtual(?:-|\s+)(?:(?:each|for)\s+)?([\w$-]+)\s+in\s+([\w.$-]+)/);
        if (m) {
          const mods = Parser.extractModifiers(content);
          let keyProp = 'id';
          let itemHeight = 40;
          let overscan = 3;
          let containerHeight = null;
          for (let k = 0; k < mods.length; k++) {
            const mod = mods[k];
            if (mod.startsWith('key=')) {
              keyProp = mod.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            } else if (mod.startsWith('height=')) {
              const hVal = parseFloat(mod.split('=')[1]);
              if (!isNaN(hVal) && hVal > 0) itemHeight = hVal;
            } else if (mod.startsWith('overscan=')) {
              const oVal = parseInt(mod.split('=')[1], 10);
              if (!isNaN(oVal) && oVal >= 0) overscan = oVal;
            } else if (mod.startsWith('containerHeight=')) {
              const chVal = parseFloat(mod.split('=')[1]);
              if (!isNaN(chVal) && chVal > 0) containerHeight = chVal;
            }
          }
          return {
            type: 'virtual-each',
            itemVar: m[1],
            listKey: m[2],
            keyProp,
            itemHeight,
            overscan,
            containerHeight,
            modifiers: mods,
            children: [],
            indent
          };
        }
        Parser._warn(`Malformed @virtual each: "${content}". Expected: @virtual each item in listKey [height=40, overscan=3]`);
        return null;
      }

      // @each item in listKey [key=id]
      if (content.startsWith('@each') || content.startsWith('@for')) {
        const m = content.match(/@(each|for)\s+([\w$-]+)\s+in\s+([\w.$-]+)/);
        if (m) {
          const mods = Parser.extractModifiers(content);
          let keyProp = 'id';
          for (let k = 0; k < mods.length; k++) {
            if (mods[k].startsWith('key=')) {
              keyProp = mods[k].split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            }
          }
          return {
            type: 'each',
            itemVar: m[2],
            listKey: m[3],
            keyProp,
            modifiers: mods,
            children: [],
            indent
          };
        }
        Parser._warn(`Malformed @each: "${content}". Expected: @each item in listKey`);
        return null;
      }

      // @if conditionKey
      if (content.startsWith('@if')) {
        const m = content.match(/@if\s+(!?)([\w.]+)/);
        if (m) {
          return {
            type: 'if',
            negate: m[1] === '!',
            conditionKey: m[2],
            children: [],
            indent
          };
        }
        Parser._warn(`Malformed @if: "${content}". Expected: @if conditionKey or @if !conditionKey`);
        return null;
      }

      // @elif / @elseif conditionKey
      if (content.startsWith('@elif') || content.startsWith('@elseif')) {
        const m = content.match(/@(elif|elseif)\s+(!?)([\w.]+)/);
        if (m) {
          return {
            type: 'elif',
            negate: m[2] === '!',
            conditionKey: m[3],
            children: [],
            indent
          };
        }
        return null;
      }

      // @else
      if (content.startsWith('@else')) {
        return {
          type: 'else',
          children: [],
          indent
        };
      }

      // Generic directive fallback — treat as custom tag
      const sp = content.indexOf(' ');
      const directive = sp !== -1 ? content.substring(1, sp) : content.substring(1);
      const rest      = sp !== -1 ? content.substring(sp + 1) : '';
      return {
        type: directive, tag: directive,
        id: Parser.extractId(rest),
        text: Parser.extractQuoted(rest),
        modifiers: Parser.extractModifiers(rest),
        children: [], indent
      };
    },

    // ── Element parser (h1, p, button, card, link, input, components) ─

    parseElement(content, indent) {
      if (content.startsWith('link')) {
        return {
          type: 'link', tag: 'a',
          text: Parser.extractQuoted(content),
          target: Parser.extractArrowTarget(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      // Check if starts with a capitalized Component name: Card [shadow] or Card("a", badge="b")
      let fwEnd = 0;
      while (fwEnd < content.length) {
        const c = content.charCodeAt(fwEnd);
        if (c === 32 || c === 91 || c === 40 || c === 34) break;
        fwEnd++;
      }
      const firstWord = fwEnd === content.length ? content : content.slice(0, fwEnd);
      if (/^[A-Z]\w*$/.test(firstWord)) {
        return {
          type: 'component',
          name: firstWord,
          id: Parser.extractId(content),
          text: Parser.extractQuoted(content),
          args: Parser.extractParenArgs(content),
          modifiers: Parser.extractModifiers(content),
          children: [],
          indent
        };
      }

      // Generic element: tagName.class1.class2#id "text" [mod1, mod2] #id
      const head = firstWord;
      let tag = head;
      let id = Parser.extractId(content);
      const dotClasses = [];

      if (head && (head.includes('.') || head.includes('#'))) {
        const parts = head.split(/([.#][^.#\s]+)/).filter(Boolean);
        tag = parts[0] || 'div';
        for (let p = 1; p < parts.length; p++) {
          const part = parts[p];
          if (part.startsWith('.')) {
            dotClasses.push(part.slice(1));
          } else if (part.startsWith('#') && !id) {
            id = part.slice(1);
          }
        }
      }

      const tagClean = (tag && !/[^a-zA-Z0-9_-]/.test(tag)) ? tag : (tag.replace(/[^a-zA-Z0-9_-]/g, '') || 'div');
      const bracketMods = Parser.extractModifiers(content);
      const dotMods = dotClasses.map(c => `class="${typeof BZ_CLASS_MAP !== 'undefined' && BZ_CLASS_MAP[c] ? BZ_CLASS_MAP[c] : c}"`);
      const allMods = dotMods.length > 0 ? [...dotMods, ...bracketMods] : bracketMods;

      return {
        type: tagClean, tag: tagClean,
        id: id,
        text: Parser.extractQuoted(content),
        classes: dotClasses,
        modifiers: allMods,
        children: [], indent
      };
    },

    // ── Extraction helpers ────────────────────────────────────────────

    extractQuoted(str) {
      if (!str) return null;
      const len = str.length;
      const q1 = str.indexOf('"');
      const q2 = str.indexOf("'");
      if (q1 === -1 && q2 === -1) return null;

      let quoteChar = 34; // '"'
      let startIdx = q1;
      if (q1 === -1 || (q2 !== -1 && q2 < q1)) {
        quoteChar = 39; // "'"
        startIdx = q2;
      }

      let escaped = false;
      for (let i = startIdx + 1; i < len; i++) {
        const code = str.charCodeAt(i);
        if (code === 92) {
          escaped = !escaped;
        } else if (code === quoteChar && !escaped) {
          return str.slice(startIdx + 1, i);
        } else {
          escaped = false;
        }
      }
      return null;
    },

    extractId(str) {
      if (!str) return null;
      const bracket = str.indexOf('[');
      const searchEnd = bracket === -1 ? str.length : bracket;
      const hashIdx = str.indexOf('#');
      if (hashIdx === -1 || hashIdx >= searchEnd) return null;
      let end = hashIdx + 1;
      while (end < searchEnd) {
        const c = str.charCodeAt(end);
        if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45) {
          end++;
        } else {
          break;
        }
      }
      return end > hashIdx + 1 ? str.slice(hashIdx + 1, end) : null;
    },

    extractModifiers(str) {
      if (!str) return [];
      const start = str.indexOf('[');
      const end   = str.lastIndexOf(']');
      if (start === -1 || end === -1 || end <= start) return [];

      const inner  = str.slice(start + 1, end);
      const tokens = [];
      let   depth  = 0;
      let   cur    = '';
      let   inSingle = false;
      let   inDouble = false;

      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        const prev = i > 0 ? inner[i - 1] : '';
        const escaped = prev === '\\';
        if (ch === '"' && !inSingle && !escaped) { inDouble = !inDouble; cur += ch; continue; }
        if (ch === "'" && !inDouble && !escaped) { inSingle = !inSingle; cur += ch; continue; }
        if (inSingle || inDouble) { cur += ch; continue; }
        if      (ch === '(' || ch === '{')              depth++;
        else if (ch === ')' || ch === '}')              depth = depth > 0 ? depth - 1 : 0;
        else if (ch === ',' && depth === 0) {
          const t = cur.trim();
          if (t) tokens.push(t);
          cur = '';
          continue;
        }
        cur += ch;
      }
      const last = cur.trim();
      if (last) tokens.push(last);
      return tokens;
    },

    extractArrowTarget(str) {
      if (!str) return null;
      const m = str.match(/->\s*(#?[\w-]+)/);
      return m ? m[1] : null;
    },

    /** Split a comma list respecting single/double quotes and ()/[]/{} depth */
    splitArgs(inner) {
      const out = [];
      let depth = 0, cur = '', inSingle = false, inDouble = false;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        const prev = i > 0 ? inner[i - 1] : '';
        const escaped = prev === '\\';
        if (ch === '"' && !inSingle && !escaped) { inDouble = !inDouble; cur += ch; continue; }
        if (ch === "'" && !inDouble && !escaped) { inSingle = !inSingle; cur += ch; continue; }
        if (inSingle || inDouble) { cur += ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth = depth > 0 ? depth - 1 : 0;
        else if (ch === ',' && depth === 0) {
          const t = cur.trim();
          if (t) out.push(t);
          cur = '';
          continue;
        }
        cur += ch;
      }
      const last = cur.trim();
      if (last) out.push(last);
      return out;
    },

    /** Extract positional/named args from Component invocation parens: Card("a", badge="b") */
    extractParenArgs(str) {
      if (!str) return [];
      // Find first '(' that is not inside [...] or quotes, before '[' if present
      const bracketIdx = str.indexOf('[');
      const searchEnd = bracketIdx === -1 ? str.length : bracketIdx;
      const openIdx = str.indexOf('(', searchEnd > 0 ? 0 : 0);
      if (openIdx === -1 || openIdx > searchEnd) return [];
      let depth = 0, inSingle = false, inDouble = false;
      for (let i = openIdx; i < str.length; i++) {
        const ch = str[i];
        const prev = i > 0 ? str[i - 1] : '';
        const escaped = prev === '\\';
        if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
        else if (ch === "'" && !inDouble && !escaped) inSingle = !inSingle;
        else if (!inSingle && !inDouble) {
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (depth === 0) {
              const inner = str.slice(openIdx + 1, i);
              return Parser.splitArgs(inner);
            }
          }
        }
      }
      return [];
    },

    escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // SHARED CLASS MAP — single source of truth for Renderer.applyModifiers,
  // SSR parity and the static-row HTML fast path.
  // ═══════════════════════════════════════════════════════════════════════

  const BZ_CLASS_MAP = {
    sticky: 'bz-sticky', hero: 'bz-hero', center: 'bz-center',
    'pad-sm': 'bz-pad-sm', 'pad-md': 'bz-pad-md',
    'pad-lg': 'bz-pad-lg', 'pad-xl': 'bz-pad-xl',
    grid: 'bz-grid', 'grid-2': 'bz-grid-2', 'grid-3': 'bz-grid-3', 'grid-4': 'bz-grid-4',
    flex: 'bz-flex', column: 'bz-column', wrap: 'bz-wrap',
    'gap-sm': 'bz-gap-sm', 'gap-md': 'bz-gap-md', 'gap-lg': 'bz-gap-lg',
    'full-width': 'bz-full-width', 'full-height': 'bz-full-height',
    'align-center': 'bz-align-center', 'align-start': 'bz-align-start',
    'align-end': 'bz-align-end', 'justify-center': 'bz-justify-center',
    'justify-between': 'bz-justify-between', 'justify-end': 'bz-justify-end',
    dark: 'bz-dark', light: 'bz-light',
    primary: 'bz-primary', secondary: 'bz-secondary', accent: 'bz-accent',
    success: 'bz-success', warning: 'bz-warning', danger: 'bz-danger',
    outline: 'bz-outline', ghost: 'bz-ghost', info: 'bz-info',
    bold: 'bz-bold', italic: 'bz-italic', muted: 'bz-muted',
    small: 'bz-small', large: 'bz-large',
    'text-left': 'bz-text-left', 'text-right': 'bz-text-right', 'text-center': 'bz-text-center',
    shadow: 'bz-shadow', rounded: 'bz-rounded',
    'hover-lift': 'bz-hover-lift', 'hover-glow': 'bz-hover-glow',
    'hover-scale': 'bz-hover-scale',
    'fade-in': 'bz-fade-in', 'slide-up': 'bz-slide-up',
    'slide-left': 'bz-slide-left', 'slide-right': 'bz-slide-right',
    bounce: 'bz-bounce', pulse: 'bz-pulse', 'zoom-in': 'bz-zoom-in',
    active: 'active', hidden: 'bz-hidden',
    'mt-sm': 'bz-mt-sm', 'mt-md': 'bz-mt-md', 'mt-lg': 'bz-mt-lg',
    'mb-sm': 'bz-mb-sm', 'mb-md': 'bz-mb-md', 'mb-lg': 'bz-mb-lg',
    'no-wrap': 'bz-no-wrap',
    blueberry: 'bz-blueberry', 'btn-blueberry': 'bz-btn-blueberry',
    'card-glass': 'bz-card-glass', glass: 'bz-card-glass',
    switch: 'bz-switch', 'badge-blueberry': 'bz-badge-blueberry',
    'stat-card': 'bz-stat-card', 'btn-glow': 'bz-btn-glow',
    glow: 'bz-btn-glow', tabs: 'bz-tabs'
  };

  const BZ_BOOL_ATTRS = new Set([
    'disabled', 'checked', 'readonly', 'required',
    'selected', 'multiple', 'autofocus'
  ]);

  // ── Static-row HTML helpers (module scope: zero per-row closures) ───
  // Fast escaping with identical semantics to escHtml/escAttr: values without
  // special chars (the common case: ids, labels) skip the regexes entirely.
  function escHtmlFast(s) {
    if (s == null) return '';
    const str = typeof s === 'string' ? s : String(s);
    if (str.indexOf('&') === -1 && str.indexOf('<') === -1 && str.indexOf('>') === -1) return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escAttrFast(s) {
    if (s == null) return '';
    const str = typeof s === 'string' ? s : String(s);
    if (str.indexOf('&') === -1 && str.indexOf('<') === -1 && str.indexOf('>') === -1 && str.indexOf('"') === -1) return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Compiled-template memo: row templates reuse the same few strings per row.
  const _TPL_MEMO = new Map();
  function bzCompile(str) {
    let tpl = _TPL_MEMO.get(str);
    if (!tpl) {
      tpl = Parser.compileTemplate(str);
      if (_TPL_MEMO.size > 512) _TPL_MEMO.clear();
      _TPL_MEMO.set(str, tpl);
    }
    return tpl;
  }

  function bzRowVal(itemVar, item, isObj, index, key) {
    if (key === itemVar) {
      if (!isObj) return String(item);
      try { return JSON.stringify(item); } catch (_) { return String(item); }
    }
    if (key === `${itemVar}.index`) return String(index);
    if (key.startsWith(itemVar + '.')) {
      const prop = key.slice(itemVar.length + 1);
      if (isObj && item[prop] !== undefined && item[prop] !== null) return String(item[prop]);
      return '';
    }
    return `{${key}}`;
  }

  function bzIsToken(v) {
    return typeof v === 'string' && v.length > 2 && v.charCodeAt(0) === 123 && v.charCodeAt(v.length - 1) === 125;
  }

  function bzTplText(str, itemVar, item, isObj, index) {
    if (str == null) return '';
    if (typeof str !== 'string') return escHtmlFast(str);
    if (str.indexOf('{') === -1) return escHtmlFast(str);
    const tpl = bzCompile(str);
    if (tpl.static) return escHtmlFast(str);
    let out = tpl.parts[0];
    for (let i = 0; i < tpl.keys.length; i++) {
      const v = bzRowVal(itemVar, item, isObj, index, tpl.keys[i]);
      out += (bzIsToken(v) ? v : escHtmlFast(v)) + tpl.parts[i + 1];
    }
    return out;
  }

  function bzTplAttr(str, itemVar, item, isObj, index) {
    if (typeof str !== 'string' || str.indexOf('{') === -1) return str;
    const tpl = bzCompile(str);
    if (tpl.static) return str;
    let out = tpl.parts[0];
    for (let i = 0; i < tpl.keys.length; i++) {
      const v = bzRowVal(itemVar, item, isObj, index, tpl.keys[i]);
      out += (bzIsToken(v) ? v : String(v)) + tpl.parts[i + 1];
    }
    return out;
  }

  // Returns [classesString, attrsString] with plain string concat (no arrays).
  function bzModsHtml(mods, itemVar, item, isObj, index) {
    let classes = '';
    let attrs = '';
    for (let i = 0; i < (mods || []).length; i++) {
      const raw = mods[i];
      if (raw == null) continue;
      const mod = String(bzTplAttr(typeof raw === 'string' ? raw : String(raw), itemVar, item, isObj, index)).trim();
      if (!mod || mod[0] === '@' || mod.startsWith('bind=') || mod.startsWith('bind:value=') || mod.startsWith('ref=')) continue;
      const eq = mod.indexOf('=');
      if (eq !== -1) {
        const attr = mod.slice(0, eq).trim();
        if (!attr || Directives.get(attr)) continue;
        if (attr === 'class') {
          const cv = mod.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          classes += (classes ? ' ' : '') + cv;
          continue;
        }
        let val = mod.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (attr === 'href' || attr === 'src' || attr === 'action') val = sanitizeUrl(val);
        attrs += ` ${attr}="${escAttrFast(val)}"`;
        continue;
      }
      if (BZ_BOOL_ATTRS.has(mod)) { attrs += ` ${mod}=""`; continue; }
      const cls = BZ_CLASS_MAP[mod] || `bz-${mod}`;
      classes += (classes ? ' ' : '') + cls;
    }
    return [classes, attrs];
  }


  // ═══════════════════════════════════════════════════════════════════════
  // STATE — Reactive store with signals, watchers, & batching
  // ═══════════════════════════════════════════════════════════════════════

  const State = {
    _store:    {},
    _watchers: {},
    _computed: {},
    _signals:  {},
    _computing: null,

    getPath(key) {
      if (!key) return undefined;
      const parts = String(key).split('.');
      let v = this._store[parts[0]];
      for (let p = 1; p < parts.length && v != null; p++) v = v[parts[p]];
      return v;
    },

    set(key, value) {
      const prev = this._store[key];
      if (prev === value) {
        // Still refresh computed that depend on it? No — same value, skip work.
        return;
      }
      this._store[key] = value;

      // Keep bound signal in sync (created via Breeze.state), avoiding echo loops
      if (this._signals[key]) {
        try {
          const sig = this._signals[key];
          const syncing = sig._bzSyncing && sig._bzSyncing();
          if (!syncing && sig.peek() !== value) sig.value = value;
        } catch (_) {
          try { this._signals[key].value = value; } catch (_) {}
        }
      }

      // Run registered watchers
      (this._watchers[key] || []).slice().forEach(fn => fn(value, prev));

      // Refresh DOM text bindings
      Renderer.updateBindings(key, value);

      // Re-evaluate computed values (with cycle guard)
      if (!this._computing) this._computing = new Set();
      Object.keys(this._computed).forEach(cKey => {
        const c = this._computed[cKey];
        if (c.deps.includes(key)) {
          if (this._computing.has(cKey)) {
            if (typeof console !== 'undefined' && console.warn) {
              console.warn(`[Breeze] Cyclic computed dependency detected for "${cKey}" — skipping re-evaluation.`);
            }
            return;
          }
          this._computing.add(cKey);
          try {
            const next = c.fn(...c.deps.map(d => State._store[d]));
            // Avoid infinite recursion: only set if changed (shallow)
            if (next !== State._store[cKey]) State.set(cKey, next);
          } finally {
            this._computing.delete(cKey);
          }
        }
      });
    },

    get(key) { return this._store[key]; },

    getAll() { return { ...this._store }; },

    watch(key, fn) {
      if (!this._watchers[key]) this._watchers[key] = [];
      this._watchers[key].push(fn);
    },

    computed(key, deps, fn) {
      if (deps.includes(key)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[Breeze] Computed "${key}" depends on itself — skipped.`);
        }
        return;
      }
      this._computed[key] = { deps, fn };
      this._store[key] = fn(...deps.map(d => this._store[d]));
    },

    push(key, item) {
      const arr = Array.isArray(this._store[key]) ? [...this._store[key]] : [];
      arr.push(item);
      this.set(key, arr);
    },

    remove(key, index) {
      if (!Array.isArray(this._store[key])) return;
      const arr = [...this._store[key]];
      arr.splice(index, 1);
      this.set(key, arr);
    },

    reset() {
      this._store = {};
      this._watchers = {};
      this._computed = {};
      this._signals = {};
      this._computing = new Set();
      Renderer._bindings = {};
    }
  };


  // ── Pure Virtual-List Math Helper (Safe in Node & Browser) ───────────
  function calculateVirtualWindow(opts) {
    const options = opts || {};
    const scrollTop = Math.max(0, options.scrollTop || 0);
    const viewportHeight = Math.max(0, options.viewportHeight != null ? options.viewportHeight : 400);
    const totalCount = Math.max(0, options.totalCount || 0);
    const itemHeight = Math.max(1, options.itemHeight || 40);
    const overscan = Math.max(0, options.overscan != null ? options.overscan : 3);
    const totalHeight = totalCount * itemHeight;

    if (totalCount === 0) {
      return {
        startIndex: 0,
        endIndex: 0,
        visibleCount: 0,
        totalHeight: 0,
        offsetY: 0
      };
    }

    const rawStart = Math.floor(scrollTop / itemHeight);
    const startIndex = Math.max(0, rawStart - overscan);
    const rawEnd = Math.ceil((scrollTop + viewportHeight) / itemHeight);
    const endIndex = Math.min(totalCount, rawEnd + overscan);
    const visibleCount = Math.max(0, endIndex - startIndex);
    const offsetY = startIndex * itemHeight;

    return {
      startIndex,
      endIndex,
      visibleCount,
      totalHeight,
      offsetY
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // RENDERER — Converts AST into DOM with Keyed Reconciliation
  // ═══════════════════════════════════════════════════════════════════════

  const Renderer = {
    _bindings: {}, // stateKey -> [{ el, template }]
    _root: null,

    /** Full render pass */
    render(ast, root) {
      const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
      this._root     = root;
      this._bindings = {};
      root.innerHTML = '';
      this.renderChildrenWithChains(ast, root);
      if (t0) Profiler.recordRender(performance.now() - t0);
    },

    /** Render a sibling list, grouping @if/@elif/@else chains so elif/else aren't orphaned */
    renderChildrenWithChains(children, parentEl) {
      if (!children) return;
      for (let idx = 0; idx < children.length; idx++) {
        const node = children[idx];
        if (!node) continue;
        if (node.type === 'elif' || node.type === 'else') {
          // Orphaned (no preceding @if at this level) — render standalone via renderNode
          const el = this.renderNode(node, null);
          if (el && parentEl) parentEl.appendChild(el);
          continue;
        }
        if (node.type === 'if') {
          const chain = { siblings: children, index: idx, consumed: 0 };
          const el = this.renderNode(node, chain);
          if (el && parentEl) parentEl.appendChild(el);
          if (chain.consumed) idx += chain.consumed;
          continue;
        }
        const el = this.renderNode(node, null);
        if (el && parentEl) parentEl.appendChild(el);
      }
    },

    /** Dispatch a single node to the right render method */
    renderNode(node, chain) {
      if (!node) return null;
      switch (node.type) {
        case 'theme':     this.applyTheme(node.props);                   return null;
        case 'seo':       this.applySEO(node.props);                     return null;
        case 'schema':    this.applySchema(node.props);                  return null;
        case 'aeo':       this.applyAEO(node.props);                     return null;
        case 'geo':       this.applyGEO(node.props);                     return null;
        case 'app':       if (typeof document !== 'undefined') document.title = node.text || 'Breeze App'; return null;
        case 'state':     State.set(node.key, node.value);               return null;
        case 'style':     this.injectStyle(node.text);                   return null;
        case 'def':       return null; // Component definition, instantiated on call
        case 'component': return this.renderComponent(node);
        case 'nav':       return this.renderNav(node);
        case 'section':   return this.renderSection(node);
        case 'footer':    return this.renderFooter(node);
        case 'header':    return this.renderHeader(node);
        case 'main':      return this.renderMain(node);
        case 'link':      return this.renderLink(node);
        case 'card':      return this.renderCard(node);
        case 'button':    return this.renderButton(node);
        case 'each':         return this.renderEach(node);
        case 'virtual-each': return this.renderVirtualEach(node);
        case 'if':        return this.renderIfChain(node, chain);
        case 'elif':
          // Standalone elif (no parent if) — render as its own condition
          return this.renderIfChain({ type: 'if', conditionKey: node.conditionKey, negate: node.negate, children: node.children }, null);
        case 'else':
          if (chain && chain.elseTaken) return this.renderElseBlock(node);
          // Standalone else — always render
          return this.renderElseBlock(node);
        case 'error':     return this.renderError(node);
        case 'slot':      return null; // Only meaningful inside renderComponent
        case 'portal':    return this.renderPortal(node);
        default:
          if (/^[a-z][\w-]*$/.test(node.type)) return this.renderElement(node);
          return null;
      }
    },

    renderError(node) {
      if (typeof document === 'undefined') return null;
      const div = document.createElement('div');
      div.className = 'bz-alert bz-alert-danger';
      div.setAttribute('role', 'alert');
      if (node.text) this.setTextWithBindings(div, node.text);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) div.appendChild(el);
      });
      Profiler.recordDomOp('create');
      return div;
    },

    renderElseBlock(node) {
      if (typeof document === 'undefined') return null;
      const wrap = document.createElement('div');
      wrap.className = 'bz-if bz-else';
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) wrap.appendChild(el);
      });
      return wrap;
    },

    renderPortal(node) {
      // v2 portal/teleport: render children into target selector, leave anchor comment
      if (typeof document === 'undefined') return null;
      const anchor = document.createComment('bz-portal');
      const target = typeof node.target === 'string'
        ? document.querySelector(node.target)
        : (node.target instanceof HTMLElement ? node.target : document.body);
      const kids = node.children || [];
      // Defer so anchor is in DOM first (mount order safe)
      setTimeout(() => {
        const host = (typeof node.target === 'string' ? document.querySelector(node.target) : null) || target || document.body;
        kids.forEach(child => {
          try {
            const el = this.renderNode(child);
            if (el) host.appendChild(el);
          } catch (_) {}
        });
      }, 0);
      return anchor;
    },

    // ── Theme & Meta ──────────────────────────────────────────────────

    applyTheme(props) {
      if (!props || typeof document === 'undefined') return;
      const cssVarMap = {
        primary: '--bz-primary', secondary: '--bz-secondary', accent: '--bz-accent',
        bg: '--bz-bg', text: '--bz-text', radius: '--bz-radius', font: '--bz-font',
        border: '--bz-border', muted: '--bz-muted',
        success: '--bz-success', warning: '--bz-warning', danger: '--bz-danger', info: '--bz-info'
      };
      const style = document.documentElement.style;
      Object.keys(props).forEach(k => {
        style.setProperty(cssVarMap[k] || `--bz-${k}`, props[k]);
      });
    },

    injectStyle(css) {
      if (!css || typeof document === 'undefined') return;
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    },

    applySEO(props) {
      if (!props || typeof document === 'undefined') return;
      if (props.title) document.title = props.title;

      const setMeta = (attrName, attrVal, content) => {
        if (!content) return;
        let el = document.querySelector(`meta[${attrName}="${attrVal}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute(attrName, attrVal);
          document.head.appendChild(el);
        }
        el.setAttribute('content', content);
      };

      setMeta('name', 'description', props.description);
      setMeta('name', 'keywords', props.keywords);
      setMeta('name', 'author', props.author);
      setMeta('name', 'robots', props.robots || 'index, follow');

      if (props.canonical) {
        let canon = document.querySelector('link[rel="canonical"]');
        if (!canon) {
          canon = document.createElement('link');
          canon.setAttribute('rel', 'canonical');
          document.head.appendChild(canon);
        }
        canon.setAttribute('href', props.canonical);
      }

      setMeta('property', 'og:title', props.ogTitle || props.title);
      setMeta('property', 'og:description', props.ogDescription || props.description);
      setMeta('property', 'og:image', props.image || props.ogImage);
      setMeta('property', 'og:url', props.canonical || props.ogUrl);
      setMeta('property', 'og:type', props.type || 'website');

      setMeta('name', 'twitter:card', props.twitterCard || 'summary_large_image');
      setMeta('name', 'twitter:title', props.twitterTitle || props.title);
      setMeta('name', 'twitter:description', props.twitterDescription || props.description);
      setMeta('name', 'twitter:image', props.image || props.twitterImage);
    },

    applySchema(props) {
      if (!props || typeof document === 'undefined') return;
      let script = document.querySelector('script[data-breeze-schema]');
      if (!script) {
        script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-breeze-schema', '');
        document.head.appendChild(script);
      }
      const schemaData = Object.assign({
        '@context': 'https://schema.org',
        '@type': props.type || 'WebSite'
      }, props);
      script.textContent = JSON.stringify(schemaData, null, 2);
    },

    applyAEO(props) {
      if (!props || typeof document === 'undefined') return;
      const setMeta = (name, val) => {
        if (!val) return;
        let el = document.querySelector(`meta[name="${name}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute('name', name);
          document.head.appendChild(el);
        }
        el.setAttribute('content', val);
      };
      setMeta('ai:summary', props.summary);
      setMeta('ai:key_points', props.topics || props.keyPoints);

      if (props.speakable) {
        const selectors = Array.isArray(props.speakable)
          ? props.speakable
          : String(props.speakable).split(',').map(s => s.trim());
        this.applySchema({
          type: 'WebPage',
          speakable: {
            '@type': 'SpeakableSpecification',
            cssSelector: selectors
          }
        });
      }
    },

    applyGEO(props) {
      if (!props || typeof document === 'undefined') return;
      const setMeta = (name, val) => {
        if (!val) return;
        let el = document.querySelector(`meta[name="${name}"]`);
        if (!el) {
          el = document.createElement('meta');
          el.setAttribute('name', name);
          document.head.appendChild(el);
        }
        el.setAttribute('content', val);
      };
      setMeta('geo:entities', props.entities);
      setMeta('geo:facts', props.facts);
    },

    // ── Components ────────────────────────────────────────────────────

    renderComponent(node) {
      const def = Parser._components[node.name] || Components.get(node.name);
      if (!def) {
        // Fallback to div if undefined
        return this.renderElement(node);
      }

      const container = document.createElement('div');
      container.className = `bz-component bz-${node.name.toLowerCase()}`;
      if (node.id) container.id = node.id;
      this.applyModifiers(container, node.modifiers || []);

      // Build props from @def params: positional args, named key=value args, text fallback
      const buildProps = () => {
        const props = {};
        const params = def.params || [];
        const args = node.args || [];
        const positional = [];
        args.forEach(a => {
          const eq = a.indexOf('=');
          if (eq > 0 && /^[A-Za-z_]\w*$/.test(a.slice(0, eq).trim())) {
            const k = a.slice(0, eq).trim();
            let v = a.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            try { v = JSON.parse(a.slice(eq + 1).trim()); } catch (_) {}
            props[k] = v;
          } else {
            let v = a.trim().replace(/^["']|["']$/g, '');
            try { v = JSON.parse(a.trim()); } catch (_) {}
            positional.push(v);
          }
        });
        params.forEach((p, idx) => {
          if (!(p in props) && idx < positional.length) props[p] = positional[idx];
        });
        // Text fallback → first param (e.g. Card "Header")
        if (params.length && !(params[0] in props) && node.text != null) {
          props[params[0]] = node.text;
        }
        return props;
      };
      const props = buildProps();

      // If registered component has JS setup/render hooks
      if (typeof def.render === 'function') {
        const res = def.render({ props, children: node.children });
        if (res instanceof HTMLElement) container.appendChild(res);
        return container;
      }

      // Indented .breeze template component — interpolate {params} + slot
      const interpNode = (n) => {
        if (!n) return n;
        const c = Object.assign({}, n);
        const rep = (s) => {
          if (typeof s !== 'string') return s;
          let r = s;
          for (const k in props) {
            r = r.replace(new RegExp(`\\{${Parser.escapeRegExp(k)}\\}`, 'g'), String(props[k]));
          }
          return r;
        };
        if (typeof c.text === 'string') c.text = rep(c.text);
        if (Array.isArray(c.modifiers)) c.modifiers = c.modifiers.map(rep);
        if (Array.isArray(c.children)) c.children = c.children.map(interpNode);
        return c;
      };

      if (def.children) {
        def.children.forEach(child => {
          if (child.type === 'slot') {
            (node.children || []).forEach(slotChild => {
              const el = this.renderNode(slotChild);
              if (el) container.appendChild(el);
            });
          } else {
            const el = this.renderNode(interpNode(child));
            if (el) container.appendChild(el);
          }
        });
      }
      return container;
    },

    // ── Layout elements ───────────────────────────────────────────────

    renderNav(node) {
      const nav = document.createElement('nav');
      nav.className = 'bz-nav';
      if (node.id) nav.id = node.id;
      this.applyModifiers(nav, node.modifiers || []);

      const brand = document.createElement('div');
      brand.className = 'bz-nav-brand';
      if (node.text) brand.textContent = node.text;
      nav.appendChild(brand);

      const links = document.createElement('div');
      links.className = 'bz-nav-links';
      this.renderChildrenWithChains(node.children || [], links);
      nav.appendChild(links);

      const hamburger = document.createElement('button');
      hamburger.className = 'bz-nav-hamburger';
      hamburger.setAttribute('aria-label', 'Toggle navigation');
      hamburger.innerHTML = '<span></span><span></span><span></span>';
      hamburger.addEventListener('click', () => {
        nav.classList.toggle('bz-nav-open');
      });
      nav.appendChild(hamburger);
      Profiler.recordDomOp('create');
      return nav;
    },

    renderSection(node) {
      const section = document.createElement('section');
      section.className = 'bz-section';
      if (node.id) section.id = node.id;
      this.applyModifiers(section, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], section);
      Profiler.recordDomOp('create');
      return section;
    },

    renderFooter(node) {
      const footer = document.createElement('footer');
      footer.className = 'bz-footer';
      if (node.id) footer.id = node.id;
      this.applyModifiers(footer, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], footer);
      Profiler.recordDomOp('create');
      return footer;
    },

    renderHeader(node) {
      const header = document.createElement('header');
      header.className = 'bz-header';
      if (node.id) header.id = node.id;
      this.applyModifiers(header, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], header);
      Profiler.recordDomOp('create');
      return header;
    },

    renderMain(node) {
      const main = document.createElement('main');
      main.className = 'bz-main';
      if (node.id) main.id = node.id;
      this.applyModifiers(main, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], main);
      Profiler.recordDomOp('create');
      return main;
    },

    renderLink(node) {
      const a = document.createElement('a');
      a.className = 'bz-nav-link';
      if (node.id) a.id = node.id;
      if (node.text) a.textContent = node.text;
      this.applyModifiers(a, node.modifiers || []);

      if (node.target) {
        const t = node.target.startsWith('#') ? node.target : '#' + node.target;
        a.href = t;
        a.addEventListener('click', e => {
          e.preventDefault();
          Router.navigate(t);
        });
      }
      Profiler.recordDomOp('create');
      return a;
    },

    renderCard(node) {
      const div = document.createElement('div');
      div.className = 'bz-card';
      if (node.id) div.id = node.id;
      this.applyModifiers(div, node.modifiers || []);
      if (node.text) this.setTextWithBindings(div, node.text);
      this.renderChildrenWithChains(node.children || [], div);
      Profiler.recordDomOp('create');
      return div;
    },

    renderButton(node) {
      const btn = document.createElement('button');
      btn.className = 'bz-btn';
      if (node.id) btn.id = node.id;
      if (node.text) this.setTextWithBindings(btn, node.text);
      this.applyModifiers(btn, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], btn);
      Profiler.recordDomOp('create');
      return btn;
    },

    renderElement(node) {
      const tag = node.tag || node.type || 'div';
      const el  = document.createElement(tag);
      if (node.id) el.id = node.id;

      const semanticClass = {
        form: 'bz-form', input: 'bz-input', textarea: 'bz-textarea',
        select: 'bz-select', label: 'bz-label',
        table: 'bz-table', tbody: 'bz-tbody', tr: 'bz-tr', td: 'bz-td', th: 'bz-th',
        ul: 'bz-list', ol: 'bz-list'
      }[tag];
      if (semanticClass) el.classList.add(semanticClass);

      if (node.text != null) this.setTextWithBindings(el, node.text);
      this.applyModifiers(el, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], el);
      Profiler.recordDomOp('create');
      return el;
    },

    // ── High-Performance Keyed List Reconciliation Engine ─────────────

    renderEach(node) {
      const isTable = (node.children && node.children.length === 1 && (node.children[0].tag === 'tr' || node.children[0].type === 'tr'));
      const container = document.createElement(isTable ? 'tbody' : 'div');
      container.className = 'bz-each';
      if (node.id) container.id = node.id;
      if (node.modifiers) this.applyModifiers(container, node.modifiers);

      const itemVar = node.itemVar;
      const listKey = node.listKey;
      const keyProp = node.keyProp || 'id';

      // Rendered row cache: records of { key, el, item, index }
      let renderedRecords = [];
      let recordMap = new Map();

      // Delegated event handling for massive lists (zero listener overhead)
      container.addEventListener('click', (e) => {
        let cur = e.target;
        while (cur && cur !== container) {
          if (cur._bzAction) {
            Renderer.executeAction(cur._bzAction, e, cur);
            return;
          }
          cur = cur.parentElement;
        }
      });

      const getList = () => {
        const v = State.getPath(listKey);
        return Array.isArray(v) ? v : (v || []);
      };
      const baseWatchKey = String(listKey).split('.')[0];
      const keyOf = (item, i) => (typeof item === 'object' && item !== null && item[keyProp] !== undefined)
        ? item[keyProp]
        : i;
      const staticTemplate = () => {
        if (node._bzStatic === undefined) {
          try { node._bzStatic = Renderer.isStaticRowTemplate(node.children, itemVar); }
          catch (_) { node._bzStatic = false; }
        }
        return node._bzStatic;
      };

      const adoptFragmentRows = (frag, recs) => {
        let cur = frag.firstElementChild;
        for (let i = 0; i < recs.length; i++) {
          const rec = recs[i];
          if (!cur) {
            const built = Renderer.renderItemChildren(node.children, itemVar, rec.item, rec.index);
            if (built) { frag.appendChild(built); cur = built; }
          }
          rec.el = cur;
          if (cur) {
            cur._bzItemKey = rec.key;
            cur = cur.nextElementSibling;
          }
        }
      };

      const reconcile = () => {
        Profiler.recordKeyedDiff();
        const items = getList();
        if (!Array.isArray(items) || items.length === 0) {
          container.textContent = '';
          renderedRecords = [];
          recordMap.clear();
          return;
        }

        // Fast-path 1: Initial Render
        if (renderedRecords.length === 0) {
          if (staticTemplate()) {
            const { html, keys, rootTag } = Renderer.renderRowsHtml(node.children, itemVar, items, 0, keyProp);
            if (isTable && rootTag === 'tr') {
              container.innerHTML = html;
            } else {
              const frag = Renderer.parseRowHtml(html, rootTag);
              container.appendChild(frag);
            }
            const nextRecords = new Array(items.length);
            let cur = container.firstElementChild;
            for (let i = 0; i < items.length; i++) {
              const key = keys[i];
              const rec = { key, el: cur, item: items[i], index: i };
              if (cur) {
                cur._bzItemKey = key;
                cur = cur.nextElementSibling;
              }
              nextRecords[i] = rec;
              recordMap.set(key, rec);
            }
            renderedRecords = nextRecords;
            Profiler.recordDomOp('create');
            return;
          }
          const frag = document.createDocumentFragment();
          const nextRecords = new Array(items.length);
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const key = keyOf(item, i);
            const rowEl = Renderer.renderItemChildren(node.children, itemVar, item, i);
            if (rowEl) {
              frag.appendChild(rowEl);
              const rec = { key, el: rowEl, item, index: i };
              nextRecords[i] = rec;
              recordMap.set(key, rec);
            }
          }
          container.appendChild(frag);
          renderedRecords = nextRecords.filter(Boolean);
          return;
        }

        // Keyed Reconciliation with HTML-tail fast path for static templates.
        let htmlTail = null;
        if (renderedRecords.length > 0 && renderedRecords.length < items.length && staticTemplate()) {
          let prefix = true;
          for (let i = 0; i < renderedRecords.length; i++) {
            if (keyOf(items[i], i) !== renderedRecords[i].key) { prefix = false; break; }
          }
          if (prefix) htmlTail = { start: renderedRecords.length };
        }

        // Tail fast path: append new rows without touching prefix records
        if (htmlTail) {
          const tailStart = htmlTail.start;
          const tailItems = items.slice(tailStart);
          const built = Renderer.renderRowsHtml(node.children, itemVar, tailItems, tailStart, keyProp);
          let lastEl = container.lastElementChild;
          if (container.insertAdjacentHTML) {
            container.insertAdjacentHTML('beforeend', built.html);
          } else {
            const frag = Renderer.parseRowHtml(built.html, built.rootTag);
            container.appendChild(frag);
          }
          let cur = lastEl ? lastEl.nextElementSibling : container.firstElementChild;
          for (let i = 0; i < tailItems.length; i++) {
            const item = tailItems[i];
            const key = built.keys[i];
            const rec = { key, el: cur, item, index: tailStart + i };
            if (cur) {
              cur._bzItemKey = key;
              cur = cur.nextElementSibling;
            }
            renderedRecords.push(rec);
            recordMap.set(key, rec);
          }
          Profiler.recordDomOp('create');
          return;
        }

        // General Keyed Reconciliation
        const nextRecords = new Array(items.length);
        const nextKeyMap = new Map();
        const seenKeys = new Set();

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const key = keyOf(item, i);
          if (seenKeys.has(key) && BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
            console.warn(`[Breeze] Duplicate key "${key}" in list "${listKey}" — keys must be unique. Later rows win.`);
          }
          seenKeys.add(key);
          const existing = recordMap.get(key);
          if (existing && !nextKeyMap.has(key)) {
            // Reused row! Check if item content or index changed
            if (existing.item !== item || existing.index !== i) {
              const patched = Renderer.updateItemDOM(existing.el, node.children, itemVar, item, i);
              if (!patched) {
                // Structural change — recreate row
                const rowEl = Renderer.renderItemChildren(node.children, itemVar, item, i);
                if (existing.el && existing.el.parentNode === container) {
                  container.replaceChild(rowEl, existing.el);
                  Profiler.recordDomOp('remove');
                  Profiler.recordDomOp('create');
                }
                existing.el = rowEl;
              }
              existing.item = item;
              existing.index = i;
            }
            nextRecords[i] = existing;
          } else {
            // Newly added row!
            const rowEl = Renderer.renderItemChildren(node.children, itemVar, item, i);
            const rec = { key, el: rowEl, item, index: i };
            nextRecords[i] = rec;
          }
          nextKeyMap.set(key, nextRecords[i]);
        }

        // Step 1: Remove unmounted keys
        for (let i = 0; i < renderedRecords.length; i++) {
          const rec = renderedRecords[i];
          if (!nextKeyMap.has(rec.key)) {
            if (rec.el && rec.el.parentNode === container) {
              container.removeChild(rec.el);
              Profiler.recordDomOp('remove');
            }
          }
        }

        // Step 2: Fast-path append or LIS reorder
        let isPrefix = renderedRecords.length > 0 && renderedRecords.length < nextRecords.length;
        if (isPrefix) {
          for (let i = 0; i < renderedRecords.length; i++) {
            if (!nextRecords[i] || nextRecords[i].key !== renderedRecords[i].key) { isPrefix = false; break; }
          }
        }
        if (isPrefix) {
          const frag = document.createDocumentFragment();
          for (let i = renderedRecords.length; i < nextRecords.length; i++) {
            const rec = nextRecords[i];
            if (rec && rec.el && rec.el.parentNode !== container) frag.appendChild(rec.el);
          }
          container.appendChild(frag);
        } else {
          // v2 true LIS minimal-move reorder: swap-2-in-1000 → ~2 moves, not O(n).
          const posOfEl = new Map();
          let pi = 0;
          for (let n = container.firstElementChild; n; n = n.nextElementSibling) {
            posOfEl.set(n, pi++);
          }
          const positions = new Array(nextRecords.length);
          for (let i = 0; i < nextRecords.length; i++) {
            const rec = nextRecords[i];
            if (!rec || !rec.el || rec.el.parentNode !== container) { positions[i] = -1; continue; }
            const p = posOfEl.get(rec.el);
            positions[i] = (p === undefined) ? -1 : p;
          }
          const keep = lisKeepSet(positions);
          let anchor = null;
          for (let i = nextRecords.length - 1; i >= 0; i--) {
            const rec = nextRecords[i];
            if (!rec || !rec.el) continue;
            if (keep.has(i) && rec.el.parentNode === container) {
              anchor = rec.el;
              continue;
            }
            if (rec.el.parentNode !== container || rec.el !== anchor) {
              try {
                container.insertBefore(rec.el, anchor);
                Profiler.recordDomOp('move');
              } catch (_) {}
            }
            anchor = rec.el;
          }
        }

        renderedRecords = nextRecords.filter(rec => rec && rec.el);
        recordMap = nextKeyMap;
      };

      reconcile();
      State.watch(baseWatchKey, () => reconcile());
      return container;
    },

    renderVirtualEach(node) {
      if (typeof document === 'undefined') return null;

      const container = document.createElement('div');
      container.className = 'bz-each bz-virtual-each';
      if (node.id) container.id = node.id;
      if (node.modifiers) {
        const domMods = node.modifiers.filter(m => !m.startsWith('height=') && !m.startsWith('overscan=') && !m.startsWith('containerHeight=') && !m.startsWith('key='));
        if (domMods.length > 0) this.applyModifiers(container, domMods);
      }

      container.style.position = 'relative';
      container.style.overflowY = 'auto';
      if (node.containerHeight) {
        container.style.height = `${node.containerHeight}px`;
      }

      const phantom = document.createElement('div');
      phantom.className = 'bz-virtual-phantom';
      phantom.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:0px;pointer-events:none;z-index:-1;visibility:hidden;';
      container.appendChild(phantom);

      const content = document.createElement('div');
      content.className = 'bz-virtual-content';
      content.style.cssText = 'position:absolute;top:0;left:0;width:100%;transform:translateY(0px);will-change:transform;';
      container.appendChild(content);

      const itemVar = node.itemVar;
      const listKey = node.listKey;
      const keyProp = node.keyProp || 'id';
      const itemHeight = node.itemHeight || 40;
      const overscan = node.overscan !== undefined ? node.overscan : 3;

      // Delegated event handling for massive lists (zero listener overhead)
      container.addEventListener('click', (e) => {
        let cur = e.target;
        while (cur && cur !== container) {
          if (cur._bzAction) {
            Renderer.executeAction(cur._bzAction, e, cur);
            return;
          }
          cur = cur.parentElement;
        }
      });

      const getList = () => {
        const v = State.getPath(listKey);
        return Array.isArray(v) ? v : (v || []);
      };
      const baseWatchKey = String(listKey).split('.')[0];
      const staticTemplate = () => {
        if (node._bzStatic === undefined) {
          try { node._bzStatic = Renderer.isStaticRowTemplate(node.children, itemVar); }
          catch (_) { node._bzStatic = false; }
        }
        return node._bzStatic;
      };

      let lastStart = -1;
      let lastEnd = -1;
      let lastTotal = -1;

      const renderSlice = (force) => {
        Profiler.recordKeyedDiff();
        const items = getList();
        const totalCount = Array.isArray(items) ? items.length : 0;
        const scrollTop = container.scrollTop || 0;
        const viewportHeight = container.clientHeight || node.containerHeight || 400;

        const win = calculateVirtualWindow({
          scrollTop,
          viewportHeight,
          totalCount,
          itemHeight,
          overscan
        });

        if (!force && win.startIndex === lastStart && win.endIndex === lastEnd && totalCount === lastTotal) {
          return;
        }

        lastStart = win.startIndex;
        lastEnd = win.endIndex;
        lastTotal = totalCount;

        phantom.style.height = `${win.totalHeight}px`;
        content.style.transform = `translateY(${win.offsetY}px)`;

        if (totalCount === 0 || win.visibleCount === 0) {
          content.textContent = '';
          return;
        }

        const slice = items.slice(win.startIndex, win.endIndex);

        if (staticTemplate()) {
          const { html } = Renderer.renderRowsHtml(node.children, itemVar, slice, win.startIndex, keyProp);
          content.innerHTML = html;
          Profiler.recordDomOp('create');
        } else {
          const frag = document.createDocumentFragment();
          for (let i = 0; i < slice.length; i++) {
            const globalIdx = win.startIndex + i;
            const rowEl = Renderer.renderItemChildren(node.children, itemVar, slice[i], globalIdx, keyProp);
            if (rowEl) frag.appendChild(rowEl);
          }
          content.textContent = '';
          content.appendChild(frag);
          Profiler.recordDomOp('create');
        }
      };

      let ticking = false;
      const onScroll = () => {
        if (!ticking) {
          ticking = true;
          const raf = (typeof requestAnimationFrame !== 'undefined') ? requestAnimationFrame : (cb => setTimeout(cb, 16));
          raf(() => {
            ticking = false;
            renderSlice(false);
          });
        }
      };

      container.addEventListener('scroll', onScroll, { passive: true });

      renderSlice(true);
      State.watch(baseWatchKey, () => renderSlice(true));

      container._bzVirtual = {
        renderSlice: () => renderSlice(true),
        getWindow: () => calculateVirtualWindow({
          scrollTop: container.scrollTop || 0,
          viewportHeight: container.clientHeight || node.containerHeight || 400,
          totalCount: (getList() || []).length,
          itemHeight,
          overscan
        })
      };

      return container;
    },

    renderItemChildren(children, itemVar, item, index, keyProp, key) {
      if (!children || children.length === 0) return null;
      const tagKey = (key !== undefined) ? key : ((typeof item === 'object' && item !== null) ? item.id : index);
      if (children.length === 1) {
        const itemNode = this.interpolateItemNode(children[0], itemVar, item, index);
        const el = this.renderNode(itemNode);
        if (el) {
          el._bzItemKey = tagKey;
          try { el.dataset.bzKey = String(tagKey); } catch (_) {}
        }
        return el;
      }
      const wrap = document.createElement('div');
      try { wrap.dataset.bzKey = String(tagKey); } catch (_) {}
      wrap._bzItemKey = tagKey;
      children.forEach(child => {
        const itemNode = this.interpolateItemNode(child, itemVar, item, index);
        const el = this.renderNode(itemNode);
        if (el) wrap.appendChild(el);
      });
      return wrap;
    },

    /**
     * v2 select fast-path: toggle an active class on one keyed row without
     * reconciling the whole list. Returns true if handled via data-key lookup.
     */    setActiveKey(container, key, activeClass) {
      if (!container) return false;
      activeClass = activeClass || 'danger';
      try {
        const prev = container.querySelector(`.${activeClass}[data-bz-key]`);
        if (prev) prev.classList.remove(activeClass);
        const next = container.querySelector(`[data-bz-key="${CSS.escape(String(key))}"]`);
        if (next) {
          next.classList.add(activeClass);
          return true;
        }
      } catch (_) {}
      // Fallback: linear scan (no CSS.escape in older envs)
      try {
        const kids = container.children;
        for (let i = 0; i < kids.length; i++) {
          const el = kids[i];
          if (el.classList) el.classList.remove(activeClass);
          if (String(el._bzItemKey) === String(key) || (el.dataset && String(el.dataset.bzKey) === String(key))) {
            el.classList.add(activeClass);
            return true;
          }
        }
      } catch (_) {}
      return false;
    },

    // ── Static-row HTML fast path (bulk append/create) ────────────────
    // When a row template needs no live wiring (no actions, bindings, refs,
    // conditionals, components or duplicate-risk ids), whole batches are built
    // as ONE html string + a single insertAdjacentHTML — no per-row DOM API
    // calls, no per-row clone objects. Falls back to the DOM path otherwise.

    _NON_STATIC_TYPES: new Set([
      'slot', 'error', 'each', 'virtual-each', 'if', 'elif', 'else', 'component', 'def',
      'portal', 'link', 'style', 'theme', 'seo', 'schema', 'aeo', 'geo',
      'app', 'state', 'nav', 'section', 'footer', 'header', 'main'
    ]),

    _rowTokensStatic(str, itemVar) {
      if (!str || typeof str !== 'string' || str.indexOf('{') === -1) return true;
      const re = /\{([\w.$-]+)\}/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        const key = m[1];
        if (key !== itemVar && key !== `${itemVar}.index` && !key.startsWith(itemVar + '.')) {
          return false; // state binding or foreign token — needs live wiring
        }
      }
      return true;
    },

    _nodeStatic(node, itemVar) {
      if (!node) return true;
      if (this._NON_STATIC_TYPES.has(node.type)) return false;
      if (!/^[a-z][\w-]*$/.test(node.type) && node.type !== 'card' && node.type !== 'button') return false;
      if (node.id) return false; // repeated ids would duplicate — use DOM path
      const mods = node.modifiers || [];
      for (let i = 0; i < mods.length; i++) {
        const mod = String(mods[i]).trim();
        if (!mod) continue;
        if (mod[0] === '@' || mod.startsWith('bind=') || mod.startsWith('bind:value=') || mod.startsWith('ref=')) return false;
        if (mod.includes('=')) {
          const attr = mod.slice(0, mod.indexOf('=')).trim();
          if (attr && Directives.get(attr)) return false; // custom directive needs mount
        }
      }
      if (!this._rowTokensStatic(node.text, itemVar)) return false;
      for (let i = 0; i < mods.length; i++) {
        if (!this._rowTokensStatic(mods[i], itemVar)) return false;
      }
      const kids = node.children || [];
      for (let i = 0; i < kids.length; i++) {
        if (!this._nodeStatic(kids[i], itemVar)) return false;
      }
      return true;
    },

    /** Pure check (unit-testable, no DOM): can these row children use the HTML path? */
    isStaticRowTemplate(children, itemVar) {
      if (!children || !children.length) return false;
      // Table-section roots other than tr/td/th/thead/tbody/tfoot have no safe
      // detached parse context (colgroup/caption/col) — use the DOM path.
      if (children.length === 1 && children[0]) {
        const rt = String(children[0].tag || children[0].type || '').toLowerCase();
        if (rt === 'colgroup' || rt === 'caption' || rt === 'col') return false;
      }
      for (let i = 0; i < children.length; i++) {
        if (!this._nodeStatic(children[i], itemVar)) return false;
      }
      return true;
    },

    /** Pure serializer (unit-testable, no DOM): interpolated template node → HTML string.
     *  Uses module-scope helpers (no per-row closures/objects) — this is the hot path. */
    itemNodeToHtml(node, itemVar, item, index, rowKey) {
      if (!node) return '';
      const isObj = typeof item === 'object' && item !== null;
      const keyAttr = (rowKey !== null && rowKey !== undefined) ? ` data-bz-key="${escAttrFast(String(rowKey))}"` : '';
      const renderKids = (kids) => {
        let h = '';
        for (let i = 0; i < (kids || []).length; i++) {
          h += this.itemNodeToHtml(kids[i], itemVar, item, index, null);
        }
        return h;
      };
      if (node.type === 'card' || node.type === 'button') {
        const isCard = node.type === 'card';
        const parts = bzModsHtml(node.modifiers, itemVar, item, isObj, index);
        const idAttr = node.id ? ` id="${escAttrFast(node.id)}"` : '';
        const openTag = isCard ? 'div' : 'button';
        const base = isCard ? 'bz-card' : 'bz-btn';
        return `<${openTag}${idAttr}${keyAttr} class="${base}${parts[0] ? ' ' + parts[0] : ''}"${parts[1]}>${bzTplText(node.text, itemVar, item, isObj, index)}${renderKids(node.children)}</${openTag}>`;
      }
      const tag = node.tag || node.type || 'div';
      const parts = bzModsHtml(node.modifiers, itemVar, item, isObj, index);
      const idAttr = node.id ? ` id="${escAttrFast(node.id)}"` : '';
      const semanticClass = {
        form: 'bz-form', input: 'bz-input', textarea: 'bz-textarea',
        select: 'bz-select', label: 'bz-label',
        table: 'bz-table', tbody: 'bz-tbody', tr: 'bz-tr', td: 'bz-td', th: 'bz-th',
        ul: 'bz-list', ol: 'bz-list'
      }[tag];
      const clsAttr = (semanticClass || parts[0])
        ? ` class="${semanticClass ? semanticClass + (parts[0] ? ' ' + parts[0] : '') : parts[0]}"`
        : '';
      const voidTags = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
      if (voidTags[tag]) return `<${tag}${idAttr}${keyAttr}${clsAttr}${parts[1]}>`;
      return `<${tag}${idAttr}${keyAttr}${clsAttr}${parts[1]}>${bzTplText(node.text, itemVar, item, isObj, index)}${renderKids(node.children)}</${tag}>`;
    },

    /**
     * Compile a static row template into a high-speed chunked string serializer.
     * Evaluates static tree once, compiling static chunks and dynamic accessor functions.
     * Yields a 30-50x speedup over AST traversal on mass renders.
     */
    compileRowSerializer(children, itemVar, keyProp, options = {}) {
      const withKeys = options.withKeys !== false;
      const chunks = [''];
      const getters = [];

      function addChunk(str) {
        if (!str) return;
        chunks[chunks.length - 1] += str;
      }
      function addGetter(fn) {
        getters.push(fn);
        chunks.push('');
      }

      const voidTags = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
      const semanticClassMap = {
        form: 'bz-form', input: 'bz-input', textarea: 'bz-textarea',
        select: 'bz-select', label: 'bz-label',
        table: 'bz-table', tbody: 'bz-tbody', tr: 'bz-tr', td: 'bz-td', th: 'bz-th',
        ul: 'bz-list', ol: 'bz-list'
      };
      const boolAttrs = BZ_BOOL_ATTRS;

      function compileText(text) {
        if (text == null || text === '') return;
        if (typeof text !== 'string') {
          addChunk(escHtmlFast(text));
          return;
        }
        if (text.indexOf('{') === -1) {
          addChunk(escHtmlFast(text));
          return;
        }
        const re = /\{([\w.$-]+)\}/g;
        let lastIdx = 0;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m.index > lastIdx) {
            addChunk(escHtmlFast(text.slice(lastIdx, m.index)));
          }
          const key = m[1];
          if (key === `${itemVar}.index`) {
            addGetter((item, i) => String(i));
          } else if (key === itemVar) {
            addGetter((item) => {
              if (typeof item === 'object' && item !== null) {
                try { return escHtmlFast(JSON.stringify(item)); } catch (_) { return String(item); }
              }
              return escHtmlFast(item);
            });
          } else if (key.startsWith(itemVar + '.')) {
            const prop = key.slice(itemVar.length + 1);
            addGetter((item) => {
              if (item != null && item[prop] !== undefined && item[prop] !== null) {
                return escHtmlFast(item[prop]);
              }
              return '';
            });
          } else {
            addGetter(() => {
              const v = State.getPath(key);
              return v != null ? escHtmlFast(v) : '';
            });
          }
          lastIdx = re.lastIndex;
        }
        if (lastIdx < text.length) {
          addChunk(escHtmlFast(text.slice(lastIdx)));
        }
      }

      function compileNode(node, isRoot) {
        if (!node) return;
        let tag = node.tag || node.type || 'div';
        let baseClass = '';
        if (node.type === 'card') {
          tag = 'div';
          baseClass = 'bz-card';
        } else if (node.type === 'button') {
          tag = 'button';
          baseClass = 'bz-btn';
        } else {
          baseClass = semanticClassMap[tag] || '';
        }

        addChunk('<' + tag);

        if (isRoot && withKeys) {
          addChunk(' data-bz-key="');
          addGetter((item, i, key) => escAttrFast(String(key !== undefined ? key : (item != null && item[keyProp] !== undefined ? item[keyProp] : i))));
          addChunk('"');
        }

        if (node.id) {
          addChunk(` id="${escAttrFast(node.id)}"`);
        }

        // Process modifiers
        let classes = baseClass;
        let attrs = '';
        const mods = node.modifiers || [];
        for (let i = 0; i < mods.length; i++) {
          const raw = mods[i];
          if (raw == null) continue;
          const mod = String(raw).trim();
          if (!mod || mod[0] === '@' || mod.startsWith('bind=') || mod.startsWith('bind:value=') || mod.startsWith('ref=')) continue;
          const eq = mod.indexOf('=');
          if (eq !== -1) {
            const attr = mod.slice(0, eq).trim();
            if (attr === 'class') {
              const cv = mod.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
              classes += (classes ? ' ' : '') + cv;
              continue;
            }
            let val = mod.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
            if (attr === 'href' || attr === 'src' || attr === 'action') val = sanitizeUrl(val);
            attrs += ` ${attr}="${escAttrFast(val)}"`;
            continue;
          }
          if (boolAttrs.has(mod)) {
            attrs += ` ${mod}=""`;
            continue;
          }
          const cls = BZ_CLASS_MAP[mod] || `bz-${mod}`;
          classes += (classes ? ' ' : '') + cls;
        }

        if (classes) {
          addChunk(` class="${escAttrFast(classes)}"`);
        }
        if (attrs) {
          addChunk(attrs);
        }

        if (voidTags[tag]) {
          addChunk('>');
          return;
        }
        addChunk('>');

        compileText(node.text);

        if (node.children && node.children.length > 0) {
          for (let c = 0; c < node.children.length; c++) {
            compileNode(node.children[c], false);
          }
        }

        addChunk(`</${tag}>`);
      }

      const multi = children.length > 1;
      if (!multi) {
        compileNode(children[0], true);
      } else {
        if (withKeys) {
          addChunk('<div data-bz-key="');
          addGetter((item, i, key) => escAttrFast(String(key !== undefined ? key : (item != null && item[keyProp] !== undefined ? item[keyProp] : i))));
          addChunk('">');
        } else {
          addChunk('<div>');
        }
        for (let c = 0; c < children.length; c++) {
          compileNode(children[c], false);
        }
        addChunk('</div>');
      }

      const rootTag = !multi && children[0]
        ? String(children[0].tag || children[0].type || 'div').toLowerCase()
        : 'div';

      const numGetters = getters.length;
      let renderFn;
      if (numGetters === 0) {
        const c0 = chunks[0];
        renderFn = function (items, startIdx, keys) {
          let out = '';
          const len = items.length;
          for (let i = 0; i < len; i++) out += c0;
          return out;
        };
      } else if (numGetters === 1) {
        const c0 = chunks[0], c1 = chunks[1], g0 = getters[0];
        renderFn = function (items, startIdx, keys) {
          let out = '';
          const len = items.length;
          for (let i = 0; i < len; i++) {
            out += c0 + g0(items[i], startIdx + i, keys[i]) + c1;
          }
          return out;
        };
      } else if (numGetters === 2) {
        const c0 = chunks[0], c1 = chunks[1], c2 = chunks[2];
        const g0 = getters[0], g1 = getters[1];
        renderFn = function (items, startIdx, keys) {
          let out = '';
          const len = items.length;
          for (let i = 0; i < len; i++) {
            const item = items[i], idx = startIdx + i, k = keys[i];
            out += c0 + g0(item, idx, k) + c1 + g1(item, idx, k) + c2;
          }
          return out;
        };
      } else if (numGetters === 3) {
        const c0 = chunks[0], c1 = chunks[1], c2 = chunks[2], c3 = chunks[3];
        const g0 = getters[0], g1 = getters[1], g2 = getters[2];
        renderFn = function (items, startIdx, keys) {
          let out = '';
          const len = items.length;
          for (let i = 0; i < len; i++) {
            const item = items[i], idx = startIdx + i, k = keys[i];
            out += c0 + g0(item, idx, k) + c1 + g1(item, idx, k) + c2 + g2(item, idx, k) + c3;
          }
          return out;
        };
      } else {
        renderFn = function (items, startIdx, keys) {
          let out = '';
          const len = items.length;
          for (let i = 0; i < len; i++) {
            const item = items[i], idx = startIdx + i, k = keys[i];
            for (let g = 0; g < numGetters; g++) {
              out += chunks[g] + getters[g](item, idx, k);
            }
            out += chunks[numGetters];
          }
          return out;
        };
      }

      return {
        rootTag,
        render(items, startIdx = 0) {
          const len = items.length;
          const keys = new Array(len);
          for (let i = 0; i < len; i++) {
            const item = items[i];
            keys[i] = (typeof item === 'object' && item !== null && item[keyProp] !== undefined)
              ? item[keyProp]
              : startIdx + i;
          }
          const html = renderFn(items, startIdx, keys);
          return { html, keys, rootTag };
        }
      };
    },

    /**
     * Build ONE html string for a slice of rows. Returns { html, keys, rootTag } where
     * keys[i] is the row key for rows[startIdx + i] (caller tags parsed nodes).
     */
    renderRowsHtml(children, itemVar, items, startIdx, keyProp) {
      if (!children || !children.length) return { html: '', keys: [], rootTag: 'div' };
      const serializer = (children && children._bzSerializer)
        ? children._bzSerializer
        : (children ? (children._bzSerializer = this.compileRowSerializer(children, itemVar, keyProp)) : this.compileRowSerializer(children, itemVar, keyProp));
      return serializer.render(items, startIdx);
    },

    /**
     * Parse row HTML in the correct HTML-parser context. A bare <tr> string fed to
     * div/template innerHTML is DROPPED by the spec ("in body" ignores table-section
     * tags), so table-section roots are parsed inside a detached table/tbody/tr.
     * Returns a DocumentFragment with the row elements in order.
     */
    parseRowHtml(html, rootTag) {
      const frag = document.createDocumentFragment();
      const tag = String(rootTag || 'div').toLowerCase();
      let host = null;
      let source = null;
      if (tag === 'tr') {
        host = document.createElement('tbody');
        host.innerHTML = html;
        source = host;
      } else if (tag === 'td' || tag === 'th') {
        host = document.createElement('tr');
        host.innerHTML = html;
        source = host;
      } else if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
        host = document.createElement('table');
        host.innerHTML = html;
        source = host;
      } else {
        host = document.createElement('template');
        host.innerHTML = html;
        source = host.content;
      }
      while (source.firstChild) frag.appendChild(source.firstChild);
      return frag;
    },

    /** Surgical in-place DOM update of a row without recreation.
     *  Returns true if patched in place, false if caller should re-create. */
    updateItemDOM(el, children, itemVar, item, index) {
      if (!el) return false;
      // Fast path: single child
      if (children && children.length === 1) {
        const childNode = children[0];
        // Structural change (different tag/type or child count) → recreate
        const interpolated = this.interpolateItemNode(childNode, itemVar, item, index);
        const expectedTag = (interpolated.tag || interpolated.type || '').toLowerCase();
        const actualTag = (el.tagName || '').toLowerCase();
        if (expectedTag && actualTag && expectedTag !== actualTag &&
            !['component', 'def', 'if', 'elif', 'else', 'each', 'virtual-each'].includes(interpolated.type)) {
          return false;
        }
        if (interpolated.text != null && el.firstChild && el.firstChild.nodeType === 3) {
          if (el.firstChild.nodeValue !== interpolated.text) {
            el.firstChild.nodeValue = interpolated.text;
            Profiler.recordDomOp('text');
          }
        } else if (interpolated.text != null) {
          if (el.textContent !== interpolated.text) {
            el.textContent = interpolated.text;
            Profiler.recordDomOp('text');
          }
        }
        if (Array.isArray(interpolated.modifiers)) {
          this.applyModifiers(el, interpolated.modifiers);
        }
        return true;
      } else if (children && children.length > 1) {
        // Multi-child row: child count change → recreate
        // Note: single-child rows render directly; multi-child rows render inside a wrapper div
        const wrapCount = el.classList && el.classList.contains('bz-each') ? -1 : el.children.length;
        if (wrapCount !== -1 && wrapCount !== children.length) return false;
        const targetChildren = (el.children.length === children.length) ? el.children : (el.children[0] ? el.children : []);
        // Multi-child row: update each child element
        for (let c = 0; c < children.length && c < el.children.length; c++) {
          const childNode = children[c];
          const childEl = el.children[c];
          const interpolated = this.interpolateItemNode(childNode, itemVar, item, index);
          if (interpolated.text != null && childEl.firstChild && childEl.firstChild.nodeType === 3) {
            if (childEl.firstChild.nodeValue !== interpolated.text) {
              childEl.firstChild.nodeValue = interpolated.text;
              Profiler.recordDomOp('text');
            }
          }
          if (Array.isArray(interpolated.modifiers)) {
            this.applyModifiers(childEl, interpolated.modifiers);
          }
        }
        return true;
      }
      return false;
    },

    interpolateItemNode(node, itemVar, item, index, extraProps) {
      if (!node) return null;
      const clone = Object.assign({}, node);
      const isObj = typeof item === 'object' && item !== null;
      // v2: avoid JSON.stringify per row unless {item} is actually used
      let itemStr = null;
      const getItemStr = () => {
        if (itemStr === null) itemStr = isObj ? JSON.stringify(item) : String(item);
        return itemStr;
      };

      // v2: precompiled template cache per string (avoids RegExp construction per prop)
      if (!this._tplCache) this._tplCache = new Map();
      const getTpl = (s) => {
        let t = this._tplCache.get(s);
        if (!t) {
          t = Parser.compileTemplate(s);
          if (this._tplCache.size > 2000) this._tplCache.clear();
          this._tplCache.set(s, t);
        }
        return t;
      };

      const replaceTokens = (str) => {
        if (!str || typeof str !== 'string' || str.indexOf('{') === -1) return str;
        const tpl = getTpl(str);
        if (tpl.static) return str;
        return Parser.renderCompiled(tpl, (key) => {
          if (key === `${itemVar}.index`) return String(index);
          if (key === itemVar) return getItemStr();
          if (key.startsWith(itemVar + '.')) {
            const prop = key.slice(itemVar.length + 1);
            if (isObj && prop in item) return String(item[prop]);
            return '';
          }
          if (extraProps && key in extraProps) return String(extraProps[key]);
          return `{${key}}`;
        });
      };

      if (typeof clone.text === 'string') {
        clone.text = replaceTokens(clone.text);
      }
      if (Array.isArray(clone.modifiers)) {
        clone.modifiers = clone.modifiers.map(m => replaceTokens(m));
      }
      if (Array.isArray(clone.children)) {
        clone.children = clone.children.map(c => this.interpolateItemNode(c, itemVar, item, index, extraProps));
      }
      return clone;
    },

    // ── Conditionals: @if, @elif, @else ───────────────────────────────

    evalCondition(node) {
      const val = State.getPath(node.conditionKey);
      let truthy = Boolean(val);
      if (node.negate) truthy = !truthy;
      return truthy;
    },

    renderIf(node) {
      return this.renderIfChain(node, null);
    },

    renderIfChain(node, chain) {
      const container = document.createElement('div');
      container.className = 'bz-if';

      // Collect sibling elif/else chain: caller passes {siblings, index} when rendering
      // flat AST lists (render() and section/footer/etc. iterate children). For direct
      // single-node calls, chain is null and we render just this branch.
      const branches = [{ node, kind: 'if' }];
      let elseNode = null;
      if (chain && Array.isArray(chain.siblings) && typeof chain.index === 'number') {
        for (let k = chain.index + 1; k < chain.siblings.length; k++) {
          const sib = chain.siblings[k];
          if (sib.type === 'elif') branches.push({ node: sib, kind: 'elif' });
          else if (sib.type === 'else') { elseNode = sib; break; }
          else break;
        }
      }
      // Mark consumed siblings so parent loops skip them
      if (chain) chain.consumed = branches.length - 1 + (elseNode ? 1 : 0);

      const watchedKeys = new Set();
      branches.forEach(b => watchedKeys.add(String(b.node.conditionKey).split('.')[0]));
      if (elseNode) {
        // else has no condition but re-renders when any branch key changes
      }

      const update = () => {
        container.innerHTML = '';
        let matched = false;
        for (let b = 0; b < branches.length; b++) {
          if (this.evalCondition(branches[b].node)) {
            this.renderChildrenWithChains(branches[b].node.children || [], container);
            matched = true;
            break;
          }
        }
        if (!matched && elseNode) {
          this.renderChildrenWithChains(elseNode.children || [], container);
          matched = true;
        }
        container.style.display = matched ? '' : 'none';
      };

      update();
      watchedKeys.forEach(k => State.watch(k, () => update()));
      return container;
    },

    // ── Reactive text binding ─────────────────────────────────────────

    setTextWithBindings(el, text) {
      if (!text) return;
      const re = /\{([\w.]+)\}/g;
      let m;
      let hasBinding = false;
      while ((m = re.exec(text)) !== null) {
        hasBinding = true;
        const key = m[1].split('.')[0];
        if (!this._bindings[key]) this._bindings[key] = [];
        this._bindings[key].push({ el, template: text });
      }
      el.textContent = hasBinding ? this.resolveBindings(text) : text;
    },

    resolveBindings(tpl) {
      if (!tpl) return '';
      return tpl.replace(/\{([\w.]+)\}/g, (_, k) => {
        const parts = k.split('.');
        let v = State.get(parts[0]);
        for (let p = 1; p < parts.length && v != null; p++) {
          v = v[parts[p]];
        }
        return v !== undefined ? String(v) : '';
      });
    },

    updateBindings(key) {
      const list = this._bindings[key];
      if (!list || !list.length) return;
      const alive = [];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.el.isConnected === false) continue;
        const newText = this.resolveBindings(b.template);
        if (b.el.firstChild && b.el.childNodes.length === 1 && b.el.firstChild.nodeType === 3) {
          b.el.firstChild.nodeValue = newText;
        } else {
          b.el.textContent = newText;
        }
        Profiler.recordDomOp('text');
        alive.push(b);
      }
      this._bindings[key] = alive;
    },

    // ── Modifier mapping ──────────────────────────────────────────────

    applyModifiers(el, modifiers) {
      const classMap = BZ_CLASS_MAP;

      const BOOL_ATTRS = BZ_BOOL_ATTRS;

      modifiers.forEach(mod => {
        mod = mod.trim();
        if (!mod) return;

        // ── Two-way binding: [bind=stateKey] or [bind:value=stateKey] ──
        if (mod.startsWith('bind=') || mod.startsWith('bind:value=')) {
          const key = mod.split('=')[1].trim().replace(/^["']|["']$/g, '');
          const isCheck = el.type === 'checkbox';
          const isRadio = el.type === 'radio';

          const curVal = State.get(key);
          if (isCheck) el.checked = Boolean(curVal);
          else if (isRadio) el.checked = (el.value === String(curVal));
          else el.value = curVal !== undefined ? String(curVal) : '';

          const evt = (isCheck || isRadio || el.tagName === 'SELECT') ? 'change' : 'input';
          el.addEventListener(evt, () => {
            State.set(key, isCheck ? el.checked : el.value);
          });

          State.watch(key, (val) => {
            if (isCheck) el.checked = Boolean(val);
            else if (isRadio) el.checked = (el.value === String(val));
            else if (el.value !== String(val !== undefined ? val : '')) {
              el.value = val !== undefined ? String(val) : '';
            }
          });
          return;
        }

        // ── v2 shorthand directives ────────────────────────────────────
        // [ref=name] → Refs.set(name, el); [@show=key] → display toggle;
        // [@model=key] → alias for bind=key; [@cloak] → remove cloak after mount;
        // [@transition=fade-in] → add animation class on mount
        if (mod.startsWith('ref=')) {
          const name = mod.slice(4).trim().replace(/^["']|["']$/g, '');
          if (name) Refs.set(name, el);
          return;
        }
        if (mod.startsWith('@show=')) {
          const key = mod.slice(6).trim().replace(/^["']|["']$/g, '');
          const baseKey = key.split('.')[0];
          const apply = () => {
            const v = State.getPath(key);
            el.style.display = v ? '' : 'none';
          };
          apply();
          State.watch(baseKey, apply);
          return;
        }
        if (mod.startsWith('@model=')) {
          const key = mod.slice(7).trim().replace(/^["']|["']$/g, '');
          const curVal = State.getPath(key);
          const baseKey = key.split('.')[0];
          if (el.type === 'checkbox') el.checked = Boolean(curVal);
          else el.value = curVal !== undefined ? String(curVal) : '';
          const evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
          el.addEventListener(evt, () => State.set(baseKey, el.type === 'checkbox' ? el.checked : el.value));
          State.watch(baseKey, (val) => {
            const vv = (key.includes('.') ? State.getPath(key) : val);
            if (el.type === 'checkbox') el.checked = Boolean(vv);
            else if (el.value !== String(vv !== undefined ? vv : '')) el.value = vv !== undefined ? String(vv) : '';
          });
          return;
        }
        if (mod === '@cloak' || mod === 'cloak') {
          el.setAttribute('bz-cloak', '');
          setTimeout(() => { try { el.removeAttribute('bz-cloak'); } catch (_) {} }, 0);
          return;
        }
        if (mod.startsWith('@transition=')) {
          const anim = mod.slice(12).trim().replace(/^["']|["']$/g, '');
          if (anim) {
            el.classList.add(classMap[anim] || `bz-${anim}`);
          }
          return;
        }
        // Custom directive hook: [mydir=val] with Directives.register('mydir', { mount(el, val) })
        if (mod.includes('=')) {
          const ei = mod.indexOf('=');
          const dname = mod.substring(0, ei).trim();
          if (dname && !dname.startsWith('@') && !dname.startsWith('bind') && Directives.get(dname)) {
            const val = mod.substring(ei + 1).trim().replace(/^["']|["']$/g, '');
            try { Directives.get(dname).mount(el, val); } catch (_) {}
            return;
          }
        }

        // ── Event handler: @event -> action(args) ─────────────────────
        if (mod.startsWith('@')) {
          const em = mod.match(/@([\w:]+)\s*->\s*(.+)/);
          if (em) {
            const eventName = em[1];
            const actionStr = em[2].trim();
            el._bzAction = actionStr;
            el.addEventListener(eventName, e => Renderer.executeAction(actionStr, e, el));
          }
          return;
        }

        // ── Boolean attributes: [disabled], [checked] ──────────────────
        if (BOOL_ATTRS.has(mod)) {
          el.setAttribute(mod, '');
          return;
        }

        // ── HTML attributes: attr=value ────────────────────────────────
        if (mod.includes('=')) {
          const ei = mod.indexOf('=');
          const attr = mod.substring(0, ei).trim();
          let val = mod.substring(ei + 1).trim().replace(/^["']|["']$/g, '');
          if (attr === 'class') {
            val.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
            return;
          }
          if (attr === 'href' || attr === 'src' || attr === 'action') val = sanitizeUrl(val);
          el.setAttribute(attr, val);
          return;
        }

        // ── CSS class ──────────────────────────────────────────────────
        el.classList.add(classMap[mod] || `bz-${mod}`);
      });
    },

    executeAction(action, event, el) {
      if (!action) return;

      const parseVal = (raw) => {
        let t = String(raw).trim();
        if (t === '$event') return event;
        if (t === '$el' || t === '$element') return el;
        try { return JSON.parse(t); } catch (_) { return t.replace(/^["']|["']$/g, ''); }
      };
      const splitTopArgs = (inner) => Parser.splitArgs(inner);

      const navM = action.match(/^navigate\(([^)]+)\)$/);
      if (navM) { Router.navigate(navM[1].trim().replace(/^["']|["']$/g, '')); return; }

      const setM = action.match(/^setState\(([\w.$-]+),\s*(.+)\)$/);
      if (setM) {
        // Re-split to respect quoted commas: setState(key, "a, b")
        const inner = action.slice(action.indexOf('(') + 1, action.lastIndexOf(')'));
        const parts = splitTopArgs(inner);
        if (parts.length >= 2) {
          State.set(parts[0].trim(), parseVal(parts.slice(1).join(',')));
          return;
        }
        let v = setM[2].trim();
        try { v = JSON.parse(v); } catch (e) { v = v.replace(/^["']|["']$/g, ''); }
        State.set(setM[1], v);
        return;
      }

      const incrM = action.match(/^increment\(([\w.$-]+)\)$/);
      if (incrM) { State.set(incrM[1], (State.getPath(incrM[1]) || 0) + 1); return; }

      const decrM = action.match(/^decrement\(([\w.$-]+)\)$/);
      if (decrM) { State.set(decrM[1], (State.getPath(decrM[1]) || 0) - 1); return; }

      const togM = action.match(/^toggle\(([\w.$-]+)\)$/);
      if (togM) { State.set(togM[1], !State.getPath(togM[1])); return; }

      const emitM = action.match(/^emit\(([^,)]+)(?:,\s*(.+))?\)$/);
      if (emitM) {
        const inner = action.slice(action.indexOf('(') + 1, action.lastIndexOf(')'));
        const parts = splitTopArgs(inner);
        EventBus.emit(parts[0].trim().replace(/^["']|["']$/g, ''), parts.length > 1 ? parseVal(parts.slice(1).join(',')) : undefined);
        return;
      }

      const pushM = action.match(/^push\(([\w.$-]+),\s*(.+)\)$/);
      if (pushM) {
        const inner = action.slice(action.indexOf('(') + 1, action.lastIndexOf(')'));
        const parts = splitTopArgs(inner);
        if (parts.length >= 2) {
          State.push(parts[0].trim(), parseVal(parts.slice(1).join(',')));
          return;
        }
        let v = pushM[2].trim();
        try { v = JSON.parse(v); } catch (e) { v = v.replace(/^["']|["']$/g, ''); }
        State.push(pushM[1], v);
        return;
      }

      const remM = action.match(/^remove\(([\w.$-]+),\s*(\d+)\)$/);
      if (remM) {
        State.remove(remM[1], parseInt(remM[2], 10));
        return;
      }

      // Check Breeze registered custom methods (quote-aware args)
      const fnName = action.split('(')[0].trim();
      if (/^[A-Za-z_]\w*$/.test(fnName) && typeof BreezeAPI.methods[fnName] === 'function') {
        const openIdx = action.indexOf('(');
        const closeIdx = action.lastIndexOf(')');
        let args;
        if (openIdx === -1 || closeIdx === -1 || closeIdx < openIdx) {
          args = [event, el];
        } else {
          const rawInner = action.substring(openIdx + 1, closeIdx).trim();
          if (!rawInner) args = [event, el];
          else args = splitTopArgs(rawInner).map(parseVal);
        }
        BreezeAPI.methods[fnName](...args);
        return;
      }

      // Plugin actions
      const pluginAction = Plugins.findAction(action);
      if (pluginAction) pluginAction(action, event, el);
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // ROUTER — Supporting Hash & HTML5 History Mode with Route Params
  // ═══════════════════════════════════════════════════════════════════════

  const Router = {
    _routes:      {},
    _mode:        'hash', // 'hash' or 'history'
    _guards:      [],
    _current:     null,
    _initialized: false,
    _outlet:      null,
    params:       {},
    query:        {},

    setMode(mode) {
      this._mode = mode === 'history' ? 'history' : 'hash';
      return this;
    },

    setOutlet(selector) {
      this._outlet = selector;
      return this;
    },

    reset() {
      this._routes = {};
      this._guards = [];
      this._current = null;
      this._initialized = false;
      this._outlet = null;
      this.params = {};
      this.query = {};
      if (this._regexCache) this._regexCache.clear();
      return this;
    },

    beforeEach(guardFn) {
      this._guards.push(guardFn);
      return this;
    },

    init() {
      if (this._initialized) { this.handleRoute(); return; }
      this._initialized = true;

      if (typeof window !== 'undefined') {
        window.addEventListener('hashchange', () => {
          if (this._mode === 'hash') this.handleRoute();
        });
        window.addEventListener('popstate', () => {
          this.handleRoute();
        });
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => this.handleRoute());
        } else {
          this.handleRoute();
        }
      }
    },

    route(pattern, handler) {
      this._routes[pattern] = handler;
      return this;
    },

    navigate(path) {
      const from = this._current;
      const to = path;

      const runGuards = (idx) => {
        if (idx >= this._guards.length) {
          this._doNavigate(to);
          return;
        }
        let called = false;
        const next = (allow) => {
          if (called) return;
          called = true;
          if (allow === false) return;
          // Support async guards returning promises
          if (allow && typeof allow.then === 'function') {
            allow.then(v => { if (v !== false) runGuards(idx + 1); });
            return;
          }
          runGuards(idx + 1);
        };
        try {
          const ret = this._guards[idx](to, from, next);
          // Async guard (returned promise, never called next synchronously)
          if (ret && typeof ret.then === 'function' && !called) {
            ret.then(v => { if (v !== false) runGuards(idx + 1); }).catch(() => {});
          } else if (this._guards[idx].length < 3 && !called) {
            // Sync boolean guard: (to, from) => true/false
            if (ret === false) return;
            runGuards(idx + 1);
          }
        } catch (_) {
          return;
        }
      };
      runGuards(0);
    },

    _doNavigate(to) {
      if (typeof window !== 'undefined') {
        if (this._mode === 'history' && window.history && window.history.pushState) {
          window.history.pushState(null, '', to);
          this._current = to;
          this.handleRoute(to);
        } else {
          // Normalize: allow paths with query, e.g. "#users/42?tab=info"
          const hash = to.startsWith('#') ? to : '#' + to;
          const hashPath = hash.split('?')[0];
          const targetId = hashPath.slice(1).split('/')[0];
          const target = (typeof document !== 'undefined')
            ? (document.getElementById(targetId) || document.querySelector(hashPath))
            : null;
          if (target && typeof target.scrollIntoView === 'function') {
            try {
              const reduced = typeof window.matchMedia === 'function' &&
                window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
            } catch (_) {
              target.scrollIntoView();
            }
            if (window.history && window.history.pushState) history.pushState(null, '', hash);
            this._current = hash;
            this.updateActiveLinks(hash);
          } else if (window.location) {
            window.location.hash = hash;
          }
          this.handleRoute(hash);
        }
      } else {
        this._current = to;
        this.handleRoute(to);
      }
    },

    handleRoute(overridePath) {
      let currentPath = overridePath;
      if (!currentPath && typeof window !== 'undefined') {
        currentPath = this._mode === 'history'
          ? (window.location.pathname + window.location.search)
          : (window.location.hash || '#');
      }
      currentPath = currentPath || this._current || '#';
      this._current = currentPath;

      // Parse query params (decode safely)
      this.query = {};
      const qIdx = currentPath.indexOf('?');
      if (qIdx !== -1) {
        const qStr = currentPath.substring(qIdx + 1).split('#')[0];
        qStr.split('&').forEach(p => {
          if (!p) return;
          const eq = p.indexOf('=');
          const k = eq === -1 ? p : p.slice(0, eq);
          const v = eq === -1 ? '' : p.slice(eq + 1);
          try {
            if (k) this.query[decodeURIComponent(k)] = decodeURIComponent(v || '');
          } catch (_) {
            if (k) this.query[k] = v || '';
          }
        });
      }

      // Match pattern and extract :params (supports :id, :id?, and * wildcard)
      this.params = {};
      let matchedHandler = null;
      let matchedPattern = null;
      for (const pattern in this._routes) {
        const match = this._matchPattern(pattern, currentPath);
        if (match) {
          this.params = match.params;
          matchedHandler = this._routes[pattern];
          matchedPattern = pattern;
          break;
        }
      }

      if (matchedHandler) {
        try {
          const ret = matchedHandler(currentPath, this.params, this.query);
          // If handler returns a string/AST and an outlet is set, render into outlet
          if (ret != null && this._outlet && typeof document !== 'undefined') {
            const outlet = document.querySelector(this._outlet);
            if (outlet) {
              if (typeof ret === 'string' && ret.trim().startsWith('<')) {
                outlet.innerHTML = ret;
              } else if (Array.isArray(ret)) {
                outlet.innerHTML = '';
                ret.forEach(n => { const el = Renderer.renderNode(n); if (el) outlet.appendChild(el); });
              } else if (typeof ret === 'string') {
                const ast = Parser.parse(ret);
                outlet.innerHTML = '';
                ast.forEach(n => { const el = Renderer.renderNode(n); if (el) outlet.appendChild(el); });
              }
            }
          }
          if (ret && typeof ret.then === 'function') ret.catch(() => {});
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error('[Breeze] Route handler error:', e);
        }
      }
      this.updateActiveLinks(currentPath);
    },

    _regexCache: new Map(),
    _regexCacheLimit: 100,

    _compiledPattern(pattern) {
      let hit = this._regexCache.get(pattern);
      if (hit) {
        this._regexCache.delete(pattern);
        this._regexCache.set(pattern, hit);
        return hit;
      }
      // :id? optional, :id required, * wildcard segment
      // Handle "/:id?" as optional "/segment" so "/u" and "/u/42" both match "/u/:id?"
      // NOTE: do not escape : ? * here — they are processed below.
      const paramKeys = [];
      let regexSrc = '^' + pattern
        .replace(/([.+^=!$(){}\[\]|/\\])/g, '\\$1')
        .replace(/\\?\/:(\w+)\?/g, (_, k) => { paramKeys.push({ name: k, optional: true }); return '(?:/([^/]+))?'; })
        .replace(/\\?:(\w+)\?/g, (_, k) => { paramKeys.push({ name: k, optional: true }); return '(?:([^/]+))?'; })
        .replace(/\\?:(\w+)/g, (_, k) => { paramKeys.push({ name: k, optional: false }); return '([^/]+)'; })
        .replace(/\*/g, '(.*)');
      // Allow optional trailing slash on all patterns
      regexSrc += '/?$';
      let re = null;
      try { re = new RegExp(regexSrc); } catch (_) { re = null; }
      const compiled = { re, paramKeys };
      this._regexCache.set(pattern, compiled);
      if (this._regexCache.size > this._regexCacheLimit) {
        const oldest = this._regexCache.keys().next().value;
        this._regexCache.delete(oldest);
      }
      return compiled;
    },

    _matchPattern(pattern, actual) {
      const cleanPath = actual.split('?')[0].split('#')[0] || actual.split('?')[0];
      // Normalize trailing slashes (except root)
      const norm = (s) => (s.length > 1 ? s.replace(/\/+$/, '') : s);
      const nPattern = norm(pattern);
      const nPath = norm(cleanPath);
      if (nPattern === nPath) return { params: {} };
      // Wildcard support: "/files/*" or "*"
      if (nPattern === '*' || nPattern === '/*') return { params: { wildcard: nPath } };
      if (nPattern.endsWith('/*')) {
        const base = nPattern.slice(0, -2);
        if (nPath === base || nPath.startsWith(base + '/')) {
          return { params: { wildcard: nPath.slice(base.length + 1) } };
        }
        return null;
      }
      const { re, paramKeys } = this._compiledPattern(nPattern);
      if (!re) return null;
      let m;
      try {
        m = nPath.match(re);
      } catch (_) { return null; }
      if (!m) return null;
      const params = {};
      let grp = 1;
      for (let i = 0; i < paramKeys.length; i++) {
        const pk = paramKeys[i];
        let v = m[grp++];
        if (pk.name === undefined) continue;
        if (v !== undefined) {
          try { v = decodeURIComponent(v); } catch (_) {}
          params[pk.name] = v;
        } else if (!pk.optional) {
          return null;
        }
      }
      // Bare * capture
      if (nPattern.includes('*') && paramKeys.length === 0 && m[1] !== undefined) {
        params.wildcard = m[1];
      }
      return { params };
    },

    updateActiveLinks(path) {
      if (typeof document === 'undefined') return;
      document.querySelectorAll('.bz-nav-link').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === path);
      });
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS & LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  const Components = {
    _registry: {},
    register(name, def) {
      this._registry[name] = def;
    },
    get(name) {
      return this._registry[name];
    }
  };

  const Lifecycle = {
    _mountHooks: [],
    _destroyHooks: [],
    _updateHooks: [],

    onMount(fn)   { this._mountHooks.push(fn); },
    onDestroy(fn) { this._destroyHooks.push(fn); },
    onUpdate(fn)  { this._updateHooks.push(fn); },

    triggerMount(root)   { this._mountHooks.forEach(h => h(root)); },
    triggerDestroy()     { this._destroyHooks.forEach(h => h()); },
    triggerUpdate(state) { this._updateHooks.forEach(h => h(state)); }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // EVENT BUS — Global publish / subscribe
  // ═══════════════════════════════════════════════════════════════════════

  const EventBus = {
    _h: {},

    on(event, fn)  {
      if (!this._h[event]) this._h[event] = [];
      this._h[event].push(fn);
    },

    off(event, fn) {
      if (!this._h[event]) return;
      this._h[event] = this._h[event].filter(h => h !== fn);
    },

    emit(event, data) {
      (this._h[event] || []).forEach(fn => fn(data));
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // PLUGINS — Registry and hooks
  // ═══════════════════════════════════════════════════════════════════════

  const Plugins = {
    _registry: {},

    register(name, plugin) {
      this._registry[name] = plugin;
      if (typeof plugin.install === 'function') plugin.install(BreezeAPI);
    },

    get(name) { return this._registry[name]; },

    findAction(action) {
      const fnName = action.split('(')[0];
      for (const name in this._registry) {
        const p = this._registry[name];
        if (p.actions && typeof p.actions[fnName] === 'function') {
          return p.actions[fnName];
        }
      }
      return null;
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // V2 DX — store slices, context, refs, memo, suspense, portal,
  // error boundaries, transitions, forms, i18n, a11y, testing, scheduler
  // ═══════════════════════════════════════════════════════════════════════

  const Context = {
    _map: {},
    provide(key, value) {
      this._map[key] = value;
      EventBus.emit(`breeze:context:${key}`, value);
    },
    inject(key, fallback) {
      return (key in this._map) ? this._map[key] : fallback;
    },
    clear() { this._map = {}; }
  };

  const Refs = {
    _map: {},
    set(name, el) { this._map[name] = el; },
    get(name) { return this._map[name] || null; },
    clear() { this._map = {}; }
  };

  const Scheduler = {
    _queue: new Set(),
    _scheduled: false,
    schedule(fn) {
      this._queue.add(fn);
      if (!this._scheduled) {
        this._scheduled = true;
        const flush = () => {
          this._scheduled = false;
          const jobs = Array.from(this._queue);
          this._queue.clear();
          batch(() => { jobs.forEach(j => { try { j(); } catch (_) {} }); });
        };
        if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => flush());
        else if (typeof setImmediate !== 'undefined') setImmediate(flush);
        else setTimeout(flush, 0);
      }
    },
    tick() {
      return new Promise(res => {
        if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => res());
        else setTimeout(() => res(), 0);
      });
    }
  };

  const I18n = {
    _locale: 'en',
    _dicts: {},
    locale(l) {
      if (l) { this._locale = l; EventBus.emit('breeze:locale', l); }
      return this._locale;
    },
    add(locale, dict) {
      this._dicts[locale] = Object.assign({}, this._dicts[locale] || {}, dict);
    },
    t(key, vars) {
      const dict = this._dicts[this._locale] || {};
      let s = (key in dict) ? dict[key] : key;
      if (vars) {
        for (const k in vars) {
          s = String(s).split(`{${k}}`).join(String(vars[k]));
        }
      }
      return s;
    }
  };

  const Forms = {
    required(v) { return (v === null || v === undefined || v === '') ? 'Required' : null; },
    email(v) {
      if (!v) return null;
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v)) ? null : 'Invalid email';
    },
    min(len) {
      return (v) => (String(v || '').length < len ? `Min ${len} chars` : null);
    },
    validate(value, rules) {
      const errors = [];
      (rules || []).forEach(r => {
        try {
          const e = typeof r === 'function' ? r(value) : null;
          if (e) errors.push(e);
        } catch (_) {}
      });
      return errors;
    },
    validateObject(obj, schema) {
      const out = {};
      for (const k in schema) {
        const errs = this.validate(obj ? obj[k] : undefined, schema[k]);
        if (errs.length) out[k] = errs;
      }
      return out;
    }
  };

  const A11y = {
    announce(msg) {
      if (typeof document === 'undefined') return;
      let live = document.getElementById('bz-a11y-live');
      if (!live) {
        live = document.createElement('div');
        live.id = 'bz-a11y-live';
        live.setAttribute('role', 'status');
        live.setAttribute('aria-live', 'polite');
        live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
        document.body.appendChild(live);
      }
      live.textContent = String(msg);
    },
    focus(selOrEl) {
      if (typeof document === 'undefined') return;
      const el = typeof selOrEl === 'string' ? document.querySelector(selOrEl) : selOrEl;
      if (el && el.focus) {
        try { el.setAttribute('tabindex', el.getAttribute('tabindex') || '-1'); } catch (_) {}
        el.focus();
      }
    },
    trapFocus(container) {
      // Minimal focus trap: returns release(). Full trap is app-level.
      if (typeof document === 'undefined' || !container) return () => {};
      const sel = 'a[href],button,input,textarea,select,[tabindex]:not([tabindex="-1"])';
      const keyHandler = (e) => {
        if (e.key !== 'Tab') return;
        const items = Array.from(container.querySelectorAll(sel)).filter(el => !el.disabled);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      };
      container.addEventListener('keydown', keyHandler);
      return () => container.removeEventListener('keydown', keyHandler);
    }
  };

  const Directives = {
    _registry: {},
    register(name, def) { this._registry[name] = def; },
    get(name) { return this._registry[name]; }
  };

  function codeframe(source, line) {
    if (!source || !line) return '';
    const lines = String(source).split('\n');
    const start = Math.max(0, line - 3), end = Math.min(lines.length, line + 2);
    let out = '';
    for (let i = start; i < end; i++) {
      const marker = (i + 1 === line) ? '>' : ' ';
      out += `${marker} ${i + 1} | ${lines[i]}\n`;
    }
    return out;
  }

  function suspense(promise, { fallback, onError } = {}) {
    const state = signal('pending');
    const data = signal(null);
    const error = signal(null);
    Promise.resolve(promise).then(
      v => { data.value = v; state.value = 'ready'; },
      e => { error.value = e; state.value = 'error'; if (onError) { try { onError(e); } catch (_) {} } }
    );
    return { state, data, error, fallback: fallback || null };
  }

  function portal(children, target) {
    return { type: 'portal', children, target };
  }

  function errorBoundary(fn, fallback) {
    try {
      const r = fn();
      if (r && typeof r.then === 'function') {
        return r.catch(e => (typeof fallback === 'function' ? fallback(e) : fallback));
      }
      return r;
    } catch (e) {
      return (typeof fallback === 'function') ? fallback(e) : fallback;
    }
  }


  // ═══════════════════════════════════════════════════════════════════════
  // SERVER-SIDE RENDERING (SSR) & HYDRATION
  // ═══════════════════════════════════════════════════════════════════════

  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function escAttr(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderToString(sourceOrAst, initialState) {
    const ast = typeof sourceOrAst === 'string' ? Parser.parse(sourceOrAst) : sourceOrAst;
    const store = Object.assign({}, State._store, initialState || {});
    const getPath = (key) => {
      if (!key) return undefined;
      const parts = String(key).split('.');
      let v = store[parts[0]];
      for (let p = 1; p < parts.length && v != null; p++) v = v[parts[p]];
      return v;
    };

    // Shared class map (single source of truth for applyModifiers, SSR and the
    // static-row HTML fast path — action/bind/attr modifiers are NOT classes
    // and must not leak as bz-@click etc.
    const SSR_CLASS_MAP = BZ_CLASS_MAP;
    const ssrSplitModifiers = (mods) => {
      const classes = [], attrs = [];
      (mods || []).forEach(raw => {
        const mod = String(raw).trim();
        if (!mod) return;
        if (mod.startsWith('@') || mod.startsWith('bind=') || mod.startsWith('bind:value=')) return;
        if (mod.includes('=')) {
          const ei = mod.indexOf('=');
          const attr = mod.substring(0, ei).trim();
          let val = mod.substring(ei + 1).trim().replace(/^["']|["']$/g, '');
          if (attr === 'class') {
            val.split(/\s+/).filter(Boolean).forEach(c => classes.push(c));
            return;
          }
          if (attr === 'href' || attr === 'src' || attr === 'action') val = sanitizeUrl(val);
          if (attr) attrs.push(` ${escAttr(attr)}="${escAttr(val)}"`);
          return;
        }
        classes.push(SSR_CLASS_MAP[mod] || `bz-${mod}`);
      });
      return { classes, attrs: attrs.join('') };
    };

    function resolveTpl(str) {
      if (!str) return '';
      return str.replace(/\{([\w.$-]+)\}/g, (_, k) => {
        const parts = k.split('.');
        let v = store[parts[0]];
        for (let p = 1; p < parts.length && v != null; p++) {
          v = v[parts[p]];
        }
        return v !== undefined ? escHtml(String(v)) : '';
      });
    }

    function renderChildrenStr(children) {
      if (!children || !children.length) return '';
      // Group if/elif/else chains for SSR parity with client
      const parts = [];
      for (let idx = 0; idx < children.length; idx++) {
        const n = children[idx];
        if (!n) continue;
        if (n.type === 'if') {
          const branches = [n];
          let elseN = null, consumed = 0;
          for (let k = idx + 1; k < children.length; k++) {
            const s = children[k];
            if (s.type === 'elif') { branches.push(s); consumed++; }
            else if (s.type === 'else') { elseN = s; consumed++; break; }
            else break;
          }
          let done = false;
          for (let b = 0; b < branches.length && !done; b++) {
            const br = branches[b];
            let tv = getPath(br.conditionKey);
            let truthy = Boolean(tv);
            if (br.negate) truthy = !truthy;
            if (truthy) { parts.push(`<div class="bz-if">${renderChildrenStr(br.children)}</div>`); done = true; }
          }
          if (!done && elseN) parts.push(`<div class="bz-if bz-else">${renderChildrenStr(elseN.children)}</div>`);
          if (!done && !elseN) parts.push(`<div class="bz-if" style="display:none"></div>`);
          idx += consumed;
          continue;
        }
        if (n.type === 'elif') {
          let tv = getPath(n.conditionKey);
          let truthy = Boolean(tv);
          if (n.negate) truthy = !truthy;
          parts.push(truthy ? `<div class="bz-if">${renderChildrenStr(n.children)}</div>` : `<div class="bz-if" style="display:none"></div>`);
          continue;
        }
        if (n.type === 'else') {
          parts.push(`<div class="bz-if bz-else">${renderChildrenStr(n.children)}</div>`);
          continue;
        }
        parts.push(renderNodeStr(n));
      }
      return parts.join('');
    }

    function renderComponentStr(node) {
      const def = Parser._components[node.name];
      if (!def || !def.children) {
        const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
        const sm = ssrSplitModifiers(node.modifiers);
        const text = node.text ? resolveTpl(node.text) : '';
        return `<div${idAttr} class="bz-component bz-${escAttr(node.name.toLowerCase())}${sm.classes.length ? ' ' + sm.classes.join(' ') : ''}"${sm.attrs}>${text}${renderChildrenStr(node.children)}</div>`;
      }
      // Build props (same rules as client)
      const props = {};
      const params = def.params || [];
      const args = node.args || [];
      const positional = [];
      args.forEach(a => {
        const eq = a.indexOf('=');
        if (eq > 0 && /^[A-Za-z_]\w*$/.test(a.slice(0, eq).trim())) {
          const k = a.slice(0, eq).trim();
          let v = a.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
          try { v = JSON.parse(a.slice(eq + 1).trim()); } catch (_) {}
          props[k] = v;
        } else {
          let v = a.trim().replace(/^["']|["']$/g, '');
          try { v = JSON.parse(a.trim()); } catch (_) {}
          positional.push(v);
        }
      });
      params.forEach((p, idx) => { if (!(p in props) && idx < positional.length) props[p] = positional[idx]; });
      if (params.length && !(params[0] in props) && node.text != null) props[params[0]] = node.text;
      const interp = (n) => {
        if (!n) return n;
        const c = Object.assign({}, n);
        const rep = (s) => {
          if (typeof s !== 'string') return s;
          let r = s;
          for (const k in props) {
            const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            r = r.replace(new RegExp(`\\{${esc}\\}`, 'g'), escHtml(String(props[k])));
          }
          return r;
        };
        if (typeof c.text === 'string') c.text = rep(c.text);
        if (Array.isArray(c.modifiers)) c.modifiers = c.modifiers.map(rep);
        if (Array.isArray(c.children)) c.children = c.children.map(interp);
        return c;
      };
      const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
      const sm = ssrSplitModifiers(node.modifiers);
      let h = `<div${idAttr} class="bz-component bz-${escAttr(node.name.toLowerCase())}${sm.classes.length ? ' ' + sm.classes.join(' ') : ''}"${sm.attrs}>`;
      def.children.forEach(child => {
        if (child.type === 'slot') {
          h += renderChildrenStr(node.children);
        } else {
          h += renderNodeStr(interp(child));
        }
      });
      h += `</div>`;
      return h;
    }

    function renderNodeStr(node) {
      if (!node) return '';
      switch (node.type) {
        case 'theme': case 'seo': case 'schema': case 'aeo': case 'geo':
        case 'app': case 'state': case 'style': case 'def': case 'slot':
          return '';
        case 'component':
          return renderComponentStr(node);
        case 'error': {
          const text = node.text ? resolveTpl(node.text) : '';
          return `<div class="bz-alert bz-alert-danger" role="alert">${text}${renderChildrenStr(node.children)}</div>`;
        }
        case 'nav': {
          const sm = ssrSplitModifiers(node.modifiers);
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          let h = `<nav${idAttr} class="bz-nav${sm.classes.length ? ' ' + sm.classes.join(' ') : ''}"${sm.attrs}>`;
          if (node.text) h += `<div class="bz-nav-brand">${escHtml(node.text)}</div>`;
          h += `<div class="bz-nav-links">`;
          h += renderChildrenStr(node.children);
          h += `</div>`;
          h += `<button class="bz-nav-hamburger" aria-label="Toggle navigation"><span></span><span></span><span></span></button>`;
          h += `</nav>`;
          return h;
        }
        case 'section': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const classes = ['bz-section', ...sm.classes].join(' ');
          return `<section${idAttr} class="${classes}"${sm.attrs}>${renderChildrenStr(node.children)}</section>`;
        }
        case 'footer': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const classes = ['bz-footer', ...sm.classes].join(' ');
          return `<footer${idAttr} class="${classes}"${sm.attrs}>${renderChildrenStr(node.children)}</footer>`;
        }
        case 'header': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const classes = ['bz-header', ...sm.classes].join(' ');
          return `<header${idAttr} class="${classes}"${sm.attrs}>${renderChildrenStr(node.children)}</header>`;
        }
        case 'main': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const classes = ['bz-main', ...sm.classes].join(' ');
          return `<main${idAttr} class="${classes}"${sm.attrs}>${renderChildrenStr(node.children)}</main>`;
        }
        case 'card': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const classes = ['bz-card', ...sm.classes].join(' ');
          const text = node.text ? resolveTpl(node.text) : '';
          return `<div${idAttr} class="${classes}"${sm.attrs}>${text}${renderChildrenStr(node.children)}</div>`;
        }
        case 'button': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const classes = ['bz-btn', ...sm.classes].join(' ');
          const text = node.text ? resolveTpl(node.text) : '';
          return `<button${idAttr} class="${classes}"${sm.attrs}>${text}${renderChildrenStr(node.children)}</button>`;
        }
        case 'link': {
          const href = node.target ? (node.target.startsWith('#') ? node.target : '#' + node.target) : '#';
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const cls = ['bz-nav-link', ...sm.classes].join(' ');
          return `<a${idAttr} href="${escAttr(href)}" class="${cls}"${sm.attrs}>${escHtml(node.text || '')}</a>`;
        }
        case 'virtual-each': {
          const sm = ssrSplitModifiers(node.modifiers);
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const cls = ['bz-each', 'bz-virtual-each', ...sm.classes].join(' ');
          const rawItems = getPath(node.listKey) || [];
          const itemHeight = node.itemHeight || 40;
          const totalHeight = (Array.isArray(rawItems) ? rawItems.length : 0) * itemHeight;
          const initialCount = Math.min(Array.isArray(rawItems) ? rawItems.length : 0, Math.ceil((node.containerHeight || 400) / itemHeight) + (node.overscan || 3));
          const slice = Array.isArray(rawItems) ? rawItems.slice(0, initialCount) : [];
          let h = `<div${idAttr} class="${cls}" style="position:relative;overflow-y:auto;"${sm.attrs}>`;
          h += `<div class="bz-virtual-phantom" style="position:absolute;top:0;left:0;width:100%;height:${totalHeight}px;pointer-events:none;z-index:-1;visibility:hidden;"></div>`;
          h += `<div class="bz-virtual-content" style="position:absolute;top:0;left:0;width:100%;transform:translateY(0px);will-change:transform;">`;
          if (Array.isArray(slice) && slice.length > 0) {
            if (Renderer.isStaticRowTemplate(node.children, node.itemVar)) {
              const serializer = node._bzSsrSerializer || (node._bzSsrSerializer = Renderer.compileRowSerializer(node.children, node.itemVar, node.keyProp || 'id', { withKeys: false }));
              h += serializer.render(slice, 0).html;
            } else {
              slice.forEach((item, idx) => {
                (node.children || []).forEach(child => {
                  const interp = Renderer.interpolateItemNode(child, node.itemVar, item, idx);
                  h += renderNodeStr(interp);
                });
              });
            }
          }
          h += `</div></div>`;
          return h;
        }
        case 'each': {
          const sm = ssrSplitModifiers(node.modifiers);
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const cls = ['bz-each', ...sm.classes].join(' ');
          const rawItems = getPath(node.listKey) || [];
          const isTable = (node.children && node.children.length === 1 && (node.children[0].tag === 'tr' || node.children[0].type === 'tr'));
          const wrapTag = isTable ? 'tbody' : 'div';
          let h = `<${wrapTag}${idAttr} class="${cls}"${sm.attrs}>`;
          if (Array.isArray(rawItems) && rawItems.length > 0) {
            if (Renderer.isStaticRowTemplate(node.children, node.itemVar)) {
              const serializer = node._bzSsrSerializer || (node._bzSsrSerializer = Renderer.compileRowSerializer(node.children, node.itemVar, node.keyProp || 'id', { withKeys: false }));
              h += serializer.render(rawItems, 0).html;
            } else {
              rawItems.forEach((item, idx) => {
                (node.children || []).forEach(child => {
                  const interp = Renderer.interpolateItemNode(child, node.itemVar, item, idx);
                  h += renderNodeStr(interp);
                });
              });
            }
          }
          h += `</${wrapTag}>`;
          return h;
        }
        case 'if': {
          const val = getPath(node.conditionKey);
          let truthy = Boolean(val);
          if (node.negate) truthy = !truthy;
          if (truthy) {
            return `<div class="bz-if">${renderChildrenStr(node.children)}</div>`;
          }
          return `<div class="bz-if" style="display:none"></div>`;
        }
        case 'elif': {
          const val = getPath(node.conditionKey);
          let truthy = Boolean(val);
          if (node.negate) truthy = !truthy;
          if (truthy) return `<div class="bz-if">${renderChildrenStr(node.children)}</div>`;
          return `<div class="bz-if" style="display:none"></div>`;
        }
        case 'else':
          return `<div class="bz-if bz-else">${renderChildrenStr(node.children)}</div>`;
        default: {
          const tag = node.tag || node.type || 'div';
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const sm = ssrSplitModifiers(node.modifiers);
          const text = node.text != null ? resolveTpl(node.text) : '';
          const clsAttr = sm.classes.length ? ` class="${sm.classes.join(' ')}"` : '';
          return `<${tag}${idAttr}${clsAttr}${sm.attrs}>${text}${renderChildrenStr(node.children)}</${tag}>`;
        }
      }
    }

    const outParts = [];
    // Top-level if/elif/else grouping for SSR
    for (let idx = 0; idx < ast.length; idx++) {
      const n = ast[idx];
      if (!n) continue;
      if (n.type === 'if') {
        const branches = [n];
        let elseN = null, consumed = 0;
        for (let k = idx + 1; k < ast.length; k++) {
          const s = ast[k];
          if (s.type === 'elif') { branches.push(s); consumed++; }
          else if (s.type === 'else') { elseN = s; consumed++; break; }
          else break;
        }
        let done = false;
        for (let b = 0; b < branches.length && !done; b++) {
          const br = branches[b];
          let tv = getPath(br.conditionKey);
          let truthy = Boolean(tv);
          if (br.negate) truthy = !truthy;
          if (truthy) { outParts.push(`<div class="bz-if">${renderChildrenStr(br.children)}</div>`); done = true; }
        }
        if (!done && elseN) outParts.push(`<div class="bz-if bz-else">${renderChildrenStr(elseN.children)}</div>`);
        if (!done && !elseN) outParts.push(`<div class="bz-if" style="display:none"></div>`);
        idx += consumed;
        continue;
      }
      outParts.push(renderNodeStr(n));
    }
    return outParts.join('');
  }

  function hydrate(sourceOrAst, rootSelector) {
    rootSelector = rootSelector || '#app';
    const root = typeof rootSelector === 'string'
      ? document.querySelector(rootSelector)
      : rootSelector;
    if (!root) return;

    const ast = typeof sourceOrAst === 'string' ? Parser.parse(sourceOrAst) : sourceOrAst;
    Router.init();
    const hasSSR = root && root.children && root.children.length > 0;
    if (hasSSR) {
      // Non-destructive hydrate: keep SSR DOM, wire state/bindings/events.
      try {
        attachHydration(ast, root);
      } catch (_) {
        Renderer.render(ast, root);
      }
    } else {
      Renderer.render(ast, root);
    }
    Lifecycle.triggerMount(root);
    EventBus.emit('breeze:hydrated', { root, ast, reused: hasSSR });
  }

  // Walk SSR DOM + AST in parallel to attach reactivity without wiping content.
  // Covers: text bindings, @click actions, bind: inputs, each/if watchers, nav/route.
  function attachHydration(ast, root) {
    // Seed text bindings + actions by re-rendering bindings metadata:
    // We traverse AST and mirror DOM order (best-effort for static + each/if shells).
    const walk = (nodes, parentEl) => {
      if (!nodes || !parentEl) return;
      let childIdx = 0;
      for (let ni = 0; ni < nodes.length; ni++) {
        const node = nodes[ni];
        if (!node) continue;
        if (['theme', 'seo', 'schema', 'aeo', 'geo', 'app', 'state', 'style', 'def'].includes(node.type)) {
          // Still apply side-effects (theme/title/state) during hydrate
          Renderer.renderNode(node);
          continue;
        }
        if (node.type === 'if' || node.type === 'elif' || node.type === 'else') {
          // Ensure conditional reactivity: create hidden watcher container if missing.
          // Simplest robust approach: watch condition keys and force full re-render on change
          // only when the SSR shell diverges (lazy). Register watchers now.
          const keys = [];
          if (node.conditionKey) keys.push(String(node.conditionKey).split('.')[0]);
          // Look ahead for elif/else keys at this level
          for (let k = ni + 1; k < nodes.length; k++) {
            const s = nodes[k];
            if (s.type === 'elif' && s.conditionKey) keys.push(String(s.conditionKey).split('.')[0]);
            else if (s.type === 'else') continue;
            else break;
          }
          keys.forEach(k => {
            State.watch(k, () => {
              // On first conditional change post-hydrate, upgrade to full client render
              // (SSR shell is static; keyed/full render takes over from here).
              // Guard against loops with a flag on root.
              if (!root._bzHydratedUpgraded) {
                root._bzHydratedUpgraded = true;
                Renderer.render(ast, root);
              }
            });
          });
          // Skip elif/else siblings in walk (they belong to this chain)
          while (ni + 1 < nodes.length && (nodes[ni + 1].type === 'elif' || nodes[ni + 1].type === 'else')) ni++;
          childIdx++;
          continue;
        }
        if (node.type === 'each' || node.type === 'virtual-each') {
          // Lists are dynamic: watch list key and upgrade to full render on change
          const baseKey = String(node.listKey).split('.')[0];
          State.watch(baseKey, () => {
            if (!root._bzHydratedUpgraded) {
              root._bzHydratedUpgraded = true;
              Renderer.render(ast, root);
            }
          });
          childIdx++;
          continue;
        }
        let domChild = parentEl.children ? parentEl.children[childIdx] : null;
        if (domChild) {
          const expectedTag = (node.tag || node.type || 'div').toLowerCase();
          const actualTag = (domChild.tagName || '').toLowerCase();
          if (expectedTag !== 'component' && actualTag && expectedTag !== actualTag) {
            if (BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
              console.warn(`[Breeze Hydration] Mismatch at <${actualTag}> (expected <${expectedTag}>). Attempting recovery...`);
            }
            let found = null;
            for (let s = childIdx + 1; s < parentEl.children.length; s++) {
              if ((parentEl.children[s].tagName || '').toLowerCase() === expectedTag) {
                found = parentEl.children[s];
                childIdx = s;
                break;
              }
            }
            domChild = found || domChild;
          }
          // Re-attach text bindings + actions/inputs for this node
          try {
            if (node.text && /\{([\w.$-]+)\}/.test(node.text)) {
              Renderer.setTextWithBindings(domChild, node.text);
              // Restore SSR text (setTextWithBindings already resolves current state)
            }
            if (node.modifiers) Renderer.applyModifiers(domChild, node.modifiers);
          } catch (_) {}
          if (node.children && node.children.length && domChild.children) {
            walk(node.children, domChild);
          }
        }
        childIdx++;
        // Cap walk to avoid O(n²) on huge SSR pages
        if (childIdx > 5000) break;
      }
    };
    // Apply @state nodes first so bindings resolve to correct values
    ast.filter(n => n && n.type === 'state').forEach(n => State.set(n.key, n.value));
    walk(ast, root);
  }


  // ── Web Component Native Custom Element Interop ───────────────────
  function defineElement(tagName, template, options = {}) {
    if (typeof customElements === 'undefined') return;
    if (customElements.get(tagName)) return customElements.get(tagName);

    const observedAttrs = options.observedAttributes || [];
    const useShadow = options.shadow === true;

    class BreezeCustomElement extends HTMLElement {
      static get observedAttributes() {
        return observedAttrs;
      }

      constructor() {
        super();
        this._root = useShadow ? this.attachShadow({ mode: 'open' }) : this;
        this._mounted = false;
      }

      connectedCallback() {
        if (!this._mounted) {
          this._mounted = true;
          const initial = Object.assign({}, options.initialState || {});
          observedAttrs.forEach(attr => {
            if (this.hasAttribute(attr)) {
              const val = this.getAttribute(attr);
              try { initial[attr] = JSON.parse(val); } catch (_) { initial[attr] = val; }
            }
          });
          Object.keys(initial).forEach(k => State.set(k, initial[k]));
          const ast = typeof template === 'string' ? Parser.parse(template) : template;
          Renderer.render(ast, this._root);
          Lifecycle.triggerMount(this._root);
        }
        if (typeof options.connected === 'function') {
          options.connected.call(this);
        }
      }

      disconnectedCallback() {
        Lifecycle.triggerUnmount(this._root);
        if (typeof options.disconnected === 'function') {
          options.disconnected.call(this);
        }
      }

      attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) {
          let val = newVal;
          try { val = JSON.parse(newVal); } catch (_) { val = newVal; }
          State.set(name, val);
        }
      }
    }

    customElements.define(tagName, BreezeCustomElement);
    return BreezeCustomElement;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API — The global `Breeze` object
  // ═══════════════════════════════════════════════════════════════════════

  const BreezeAPI = {
    version: '2.2.0',

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
          reactiveNodes.clear();
          reactiveIdCounter = 0;
        }
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
      State.watch(key, callback);
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
      compileRowSerializer(children, itemVar, keyProp, options) { return Renderer.compileRowSerializer(children, itemVar, keyProp, options); }
    },

    parse(source, opts) { return Parser.parse(source, opts); }
  };

  // ── DevTools Extension Hook (__BREEZE_DEVTOOLS__) ───────────────────
  const devtoolsHook = {
    version: BreezeAPI.version,
    getGraph: () => BreezeAPI.diagnostics.graph(),
    getTable: () => BreezeAPI.diagnostics.table(),
    getReport: () => Profiler.getReport(),
    detectCycles: () => BreezeAPI.diagnostics.detectCycles(),
    onUpdate: (fn) => {
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
