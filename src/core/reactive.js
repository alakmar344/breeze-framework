import { Profiler } from './profiler.js';
import { reportError } from './config.js';

  // ═══════════════════════════════════════════════════════════════════════
  // SIGNALS — Fine-grained reactivity engine
  // ═══════════════════════════════════════════════════════════════════════

  const MAX_UPDATE_DEPTH = 100;
  let activeEffect = null;
  let batchDepth = 0;
  const pendingEffects = new Set();
  const effectsQueue = [];

  // v2.3: Opt-in automatic microtask batching. When enabled, signal writes
  // outside an explicit batch() are coalesced into a single microtask flush,
  // dramatically reducing redundant effect/DOM work for multi-write updates
  // while preserving synchronous semantics inside batch().
  let autoBatchEnabled = false;
  let autoBatchFlushScheduled = false;

  export function enableAutoBatch() { autoBatchEnabled = true; }
  export function disableAutoBatch() { autoBatchEnabled = false; }
  export function isAutoBatchEnabled() { return autoBatchEnabled; }

  function flushPendingEffects() {
    let iterations = 0;
    while (pendingEffects.size > 0) {
      if (++iterations > MAX_UPDATE_DEPTH) {
        pendingEffects.clear();
        effectsQueue.length = 0;
        const msg = `[Breeze] Maximum recursive update depth (${MAX_UPDATE_DEPTH}) exceeded. Detected a potential infinite reactivity loop in effect or watcher.`;
        reportError(new Error(msg), 'batch');
        break;
      }
      effectsQueue.length = 0;
      for (const eff of pendingEffects) effectsQueue.push(eff);
      pendingEffects.clear();
      for (let i = 0; i < effectsQueue.length; i++) {
        try {
          effectsQueue[i]();
        } catch (err) {
          reportError(err, 'effect');
        }
      }
      effectsQueue.length = 0;
    }
    autoBatchFlushScheduled = false;
  }

  function scheduleAutoBatchFlush() {
    if (autoBatchFlushScheduled) return;
    autoBatchFlushScheduled = true;
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(flushPendingEffects);
    } else {
      Promise.resolve().then(flushPendingEffects);
    }
  }

  export function batch(fn) {
    batchDepth++;
    try {
      return fn();
    } finally {
      batchDepth--;
      if (batchDepth === 0) {
        flushPendingEffects();
      }
    }
  }

  /**
   * v2.3: Explicitly flush any pending auto-batched effects. Useful right
   * before reading DOM state or after a sequence of writes when autoBatch is on.
   */
  export function flushSync() {
    flushPendingEffects();
  }

  // ── Reactive Graph Tracking & Diagnostics Helpers ───────────────────
  // The reactive-node registry powers the DevTools graph/table/cycle inspector.
  // It is a DEV-ONLY structure: in production most apps never open DevTools, yet
  // registering every signal/computed/effect (a) allocates a node object +
  // closures on every reactive creation (hot path) and (b) pins those objects
  // forever because signals have no dispose() — an unbounded memory leak in
  // long-lived, signal-heavy apps. Tracking is therefore OPT-IN: it turns on
  // automatically the moment any diagnostics/DevTools surface is used
  // (Breeze.diagnostics.*, the Ctrl+Shift+B HUD, or the __BREEZE_DEVTOOLS__
  // hook) and stays off — zero cost — otherwise.
  export let reactiveIdCounter = 0;
  export const reactiveNodes = new Map();
  export let _diagTracking = false;
  export function enableDiagTracking() { _diagTracking = true; }

  export function safeSerializeValue(val) {
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

  export function detectGraphCycles(nodes, edges) {
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

  export function signal(initialValue, label) {
    let value = initialValue;
    const subscribers = new Set();
    const id = 'sig_' + (++reactiveIdCounter);
    const nodeLabel = label || `signal_${id}`;
    let disposed = false;

    if (_diagTracking) reactiveNodes.set(id, {
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
        // Dep-node recording feeds only the DevTools graph — skip when off.
        if (_diagTracking && activeEffect._depNodes) {
          activeEffect._depNodes.add(id);
        }
      }
    }

    function notify() {
      // v2.3 fast-paths: single subscriber (common) avoids Array.from alloc;
      // batched multi-subscriber path batches without intermediate arrays.
      if (batchDepth > 0 || autoBatchEnabled) {
        for (const sub of subscribers) pendingEffects.add(sub);
        if (autoBatchEnabled && batchDepth === 0) scheduleAutoBatchFlush();
      } else if (subscribers.size === 1) {
        for (const sub of subscribers) { sub(); break; }
      } else if (subscribers.size === 2) {
        let s1 = null, s2 = null;
        for (const sub of subscribers) {
          if (s1 === null) s1 = sub;
          else { s2 = sub; break; }
        }
        if (s1) s1();
        if (s2) s2();
      } else if (subscribers.size > 2) {
        const subs = [];
        for (const s of subscribers) subs.push(s);
        for (let i = 0; i < subs.length; i++) subs[i]();
      }
    }

    return {
      get value() {
        if (disposed && typeof console !== 'undefined' && console.warn) {
          console.warn(`[Breeze] Reading disposed signal "${nodeLabel}".`);
        }
        track();
        return value;
      },
      set value(newValue) {
        if (disposed) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(`[Breeze] Writing disposed signal "${nodeLabel}" — no-op.`);
          }
          return;
        }
        // v2.3: Object.is semantics for NaN/-0/+0 correctness.
        if (!Object.is(value, newValue)) {
          value = newValue;
          Profiler.recordSignalUpdate();
          // Dev-only signal event: skip the per-update payload allocation +
          // emit unless DevTools/diagnostics are actually attached.
          if (_diagTracking && typeof EventBus !== 'undefined' && EventBus.emit) {
            try { EventBus.emit('breeze:signal', { id, label: nodeLabel, value }); } catch (_) {}
          }
          notify();
        }
      },
      peek() { return value; },
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      },
      dispose() {
        disposed = true;
        subscribers.clear();
        if (_diagTracking) reactiveNodes.delete(id);
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
  export function lisKeepSet(positions) {
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

  export function computed(fn, label) {
    let cachedValue;
    let dirty = true;
    let evaluating = false;
    let disposed = false;
    const subscribers = new Set();
    const id = 'comp_' + (++reactiveIdCounter);
    const nodeLabel = label || `computed_${id}`;

    function notify() {
      if (batchDepth > 0 || autoBatchEnabled) {
        for (const sub of subscribers) pendingEffects.add(sub);
        if (autoBatchEnabled && batchDepth === 0) scheduleAutoBatchFlush();
      } else if (subscribers.size === 1) {
        for (const sub of subscribers) { sub(); break; }
      } else if (subscribers.size === 2) {
        let s1 = null, s2 = null;
        for (const sub of subscribers) {
          if (s1 === null) s1 = sub;
          else { s2 = sub; break; }
        }
        if (s1) s1();
        if (s2) s2();
      } else if (subscribers.size > 2) {
        const subs = [];
        for (const s of subscribers) subs.push(s);
        for (let i = 0; i < subs.length; i++) subs[i]();
      }
    }

    const runner = () => {
      if (!dirty) {
        dirty = true;
        notify();
      }
    };
    runner._sources = new Set();
    runner._depNodes = new Set();
    runner._nodeId = id;
    runner._nodeType = 'computed';

    if (_diagTracking) reactiveNodes.set(id, {
      id,
      type: 'computed',
      label: nodeLabel,
      getVal: () => cachedValue,
      runner,
      subscribers
    });

    return {
      get value() {
        if (disposed && typeof console !== 'undefined' && console.warn) {
          console.warn(`[Breeze] Reading disposed computed "${nodeLabel}".`);
        }
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
            const next = fn();
            // v2.3: Object.is semantics avoid spurious downstream updates.
            if (!Object.is(cachedValue, next)) cachedValue = next;
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
          if (_diagTracking && activeEffect._depNodes) {
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
        disposed = true;
        detachRunner(runner);
        subscribers.clear();
        reactiveNodes.delete(id);
      },
      _nodeId: id,
      _nodeType: 'computed',
      label: nodeLabel
    };
  }

  export function effect(fn, label) {
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
        if (_diagTracking && typeof EventBus !== 'undefined' && EventBus.emit) {
          try { EventBus.emit('breeze:effect', { id, label: nodeLabel, runCount }); } catch (_) {}
        }
      }
    };
    runner._sources = new Set();
    runner._depNodes = new Set();
    runner._nodeId = id;
    runner._nodeType = 'effect';

    if (_diagTracking) reactiveNodes.set(id, {
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


