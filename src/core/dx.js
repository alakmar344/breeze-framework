import { batch, signal } from './reactive.js';
import { EventBus } from './registries.js';

  // ═══════════════════════════════════════════════════════════════════════
  // V2 DX — store slices, context, refs, memo, suspense, portal,
  // error boundaries, transitions, forms, i18n, a11y, testing, scheduler
  // ═══════════════════════════════════════════════════════════════════════

  export const Context = {
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

  export const Refs = {
    _map: {},
    set(name, el) { this._map[name] = el; },
    get(name) { return this._map[name] || null; },
    clear() { this._map = {}; }
  };

  export const Scheduler = {
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

  export const I18n = {
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

  export const Forms = {
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

  export const A11y = {
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

  export const Directives = {
    _registry: {},
    register(name, def) { this._registry[name] = def; },
    get(name) { return this._registry[name]; }
  };

  export function codeframe(source, line) {
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

  export function suspense(promise, { fallback, onError } = {}) {
    const state = signal('pending');
    const data = signal(null);
    const error = signal(null);
    Promise.resolve(promise).then(
      v => { data.value = v; state.value = 'ready'; },
      e => { error.value = e; state.value = 'error'; if (onError) { try { onError(e); } catch (_) {} } }
    );
    return { state, data, error, fallback: fallback || null };
  }

  export function portal(children, target) {
    return { type: 'portal', children, target };
  }

  export function errorBoundary(fn, fallback) {
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


