import { Parser } from './parser.js';
import { Renderer } from './renderer.js';

  // ═══════════════════════════════════════════════════════════════════════
  // ROUTER — Supporting Hash & HTML5 History Mode with Route Params
  // ═══════════════════════════════════════════════════════════════════════

  export const Router = {
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


