import { Renderer } from './renderer.js';

  // ═══════════════════════════════════════════════════════════════════════
  // STATE — Reactive store with signals, watchers, & batching
  // ═══════════════════════════════════════════════════════════════════════

  // Blocks state keys/path segments that could reach or reshape Object.prototype
  // (defense in depth for dynamic keys sourced from user input, e.g. URL params
  // fed into setState/@each paths — see docs/type-checking.md "Security").
  export function isUnsafeKeySegment(segment) {
    return segment === '__proto__' || segment === 'constructor' || segment === 'prototype';
  }

  export function createStore(initial = {}) {
    const initialClone = () => {
      try {
        return JSON.parse(JSON.stringify(initial));
      } catch (_) {
        return { ...initial };
      }
    };

    const store = {
      _store:    initialClone(),
      _watchers: {},
      _computed: {},
      _signals:  {},
      _computing: null,

      getPath(key) {
        if (!key) return undefined;
        const parts = String(key).split('.');
        if (parts.some(isUnsafeKeySegment)) return undefined;
        let v = this._store[parts[0]];
        for (let p = 1; p < parts.length && v != null; p++) v = v[parts[p]];
        return v;
      },

      set(key, value) {
        if (isUnsafeKeySegment(key)) {
          if (typeof console !== 'undefined' && console.warn) {
            console.warn(`[Breeze] Refusing to set unsafe state key "${key}".`);
          }
          return;
        }

        if (typeof key === 'string' && key.includes('.')) {
          const parts = key.split('.');
          if (parts.some(isUnsafeKeySegment)) return;
          let cur = this._store;
          for (let p = 0; p < parts.length - 1; p++) {
            if (cur[parts[p]] == null || typeof cur[parts[p]] !== 'object') {
              cur[parts[p]] = {};
            }
            cur = cur[parts[p]];
          }
          const lastProp = parts[parts.length - 1];
          const prev = cur[lastProp];
          if (Object.is(prev, value)) return;
          cur[lastProp] = value;
          const topKey = parts[0];
          const watchers = this._watchers[topKey];
          if (watchers && watchers.length) {
            watchers.slice().forEach(fn => fn(this._store[topKey], this._store[topKey]));
          }
          if (this._watchers[key]) {
            this._watchers[key].slice().forEach(fn => fn(value, prev));
          }
          if (this !== State && typeof State !== 'undefined' && State._watchers && State._watchers[topKey]) {
            State._watchers[topKey].slice().forEach(fn => fn(this._store[topKey], this._store[topKey]));
          }
          Renderer.updateBindings(topKey, this._store[topKey], this);
          return;
        }

        const prev = this._store[key];
        if (Object.is(prev, value)) {
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
        const watchers = this._watchers[key];
        if (watchers && watchers.length) {
          watchers.slice().forEach(fn => fn(value, prev));
        }

        // If this is a scoped store, also notify global watchers if any exist
        if (this !== State && typeof State !== 'undefined' && State._watchers && State._watchers[key]) {
          State._watchers[key].slice().forEach(fn => fn(value, prev));
        }

        // Refresh DOM text bindings
        Renderer.updateBindings(key, value, this);

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
              const next = c.fn(...c.deps.map(d => this._store[d]));
              // Avoid infinite recursion: only set if changed (shallow, NaN-safe)
              if (!Object.is(next, this._store[cKey])) this.set(cKey, next);
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
        return () => {
          const arr = this._watchers[key];
          if (arr) {
            const idx = arr.indexOf(fn);
            if (idx !== -1) arr.splice(idx, 1);
          }
        };
      },

      unwatch(key, fn) {
        const arr = this._watchers[key];
        if (arr) {
          const idx = arr.indexOf(fn);
          if (idx !== -1) arr.splice(idx, 1);
        }
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
        this._store = initialClone();
        this._watchers = {};
        this._computed = {};
        this._signals = {};
        this._computing = new Set();
        if (this === State) {
          Renderer._bindings = {};
        }
      }
    };
    return store;
  }

  export const State = createStore();


