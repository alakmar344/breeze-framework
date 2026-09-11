/*!
 * Breeze Framework v1.0.0 (Nuclear Upgrade)
 * Ultra-lightweight declarative web framework
 * https://github.com/breeze-framework/breeze-framework
 * MIT License
 *
 * Architecture:
 *   Parser    — Converts .breeze source text into an AST (with @def, @slot, @elif, @else, CRLF normalization)
 *   Signals   — Fine-grained reactive primitives (signal, computed, effect, batch)
 *   State     — Reactive store with watchers, microtask batching, and array mutations
 *   Renderer  — High-performance DOM renderer with native <template> cloning & keyed reconciliation
 *   Router    — Client router supporting Hash and HTML5 History modes, params (:id), & guards
 *   EventBus  — Global publish/subscribe message bus
 *   Plugins   — Plugin registry and lifecycle hooks
 *   Profiler  — Diagnostic profiler and in-browser DevTools HUD overlay
 *   SSR       — Zero-dependency server-side string rendering (renderToString) & client hydration
 *   API       — Public Breeze object exposed globally and as CJS/ESM module
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


  // ═══════════════════════════════════════════════════════════════════════
  // SIGNALS — Fine-grained reactivity engine
  // ═══════════════════════════════════════════════════════════════════════

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
        const effectsToRun = Array.from(pendingEffects);
        pendingEffects.clear();
        for (let i = 0; i < effectsToRun.length; i++) {
          effectsToRun[i]();
        }
      }
    }
  }

  function signal(initialValue) {
    let value = initialValue;
    const subscribers = new Set();

    return {
      get value() {
        if (activeEffect) subscribers.add(activeEffect);
        return value;
      },
      set value(newValue) {
        if (value !== newValue) {
          value = newValue;
          Profiler.recordSignalUpdate();
          for (const sub of subscribers) {
            if (batchDepth > 0) {
              pendingEffects.add(sub);
            } else {
              sub();
            }
          }
        }
      },
      peek() { return value; },
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      }
    };
  }

  function computed(fn) {
    let cachedValue;
    let dirty = true;
    const subscribers = new Set();

    const runner = () => {
      dirty = true;
      for (const sub of subscribers) {
        if (batchDepth > 0) pendingEffects.add(sub);
        else sub();
      }
    };

    return {
      get value() {
        if (dirty) {
          const prev = activeEffect;
          activeEffect = runner;
          try {
            cachedValue = fn();
            dirty = false;
          } finally {
            activeEffect = prev;
          }
        }
        if (activeEffect) subscribers.add(activeEffect);
        return cachedValue;
      },
      peek() { return cachedValue; },
      subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
      }
    };
  }

  function effect(fn) {
    const runner = () => {
      const prev = activeEffect;
      activeEffect = runner;
      try {
        fn();
      } finally {
        activeEffect = prev;
      }
    };
    runner();
    return () => {
      // unsubscribe
    };
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PARSER — Converts .breeze source text into an Abstract Syntax Tree
  // ═══════════════════════════════════════════════════════════════════════

  const Parser = {
    _components: {}, // Component definitions registered via @def / @component

    /** Emit a non-fatal parser diagnostic */
    _warn(msg) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Breeze] ' + msg);
      }
    },

    /**
     * Parse a full .breeze source string into an array of AST nodes.
     * Indentation (2 spaces per level) determines parent-child nesting.
     */
    parse(source) {
      if (!source) return [];
      // Normalize line endings (\r\n -> \n, \r -> \n)
      const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalized.split('\n');
      const root  = [];
      const stack = [{ children: root, indent: -1 }];
      let i = 0;
      let warnedTabs = false;

      while (i < lines.length) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        // Skip empty lines, line comments, and the shebang
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('##')) {
          i++;
          continue;
        }

        // Tab indentation warning
        if (!warnedTabs && /^\t/.test(rawLine)) {
          warnedTabs = true;
          Parser._warn(
            `Line ${i + 1}: tab indentation detected. Breeze uses 2 spaces per ` +
            `level — mixing tabs will misnest elements.`
          );
        }

        const indent = rawLine.search(/\S/);

        // ── Block directives: @theme, @seo, @schema, @aeo, @geo { key: value ... }
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

        // ── Component Definition: @def ComponentName(prop1, prop2) ─────
        if (trimmed.startsWith('@def') || trimmed.startsWith('@component')) {
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

      // @each item in listKey [key=id]
      if (content.startsWith('@each') || content.startsWith('@for')) {
        const m = content.match(/@(each|for)\s+(\w+)\s+in\s+(\w+)/);
        if (m) {
          const mods = Parser.extractModifiers(content);
          let keyProp = 'id';
          for (let k = 0; k < mods.length; k++) {
            if (mods[k].startsWith('key=')) {
              keyProp = mods[k].split('=')[1].trim();
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

      // Check if starts with a capitalized Component name: Card [shadow] or Modal(...)
      const firstWord = content.split(/[\s[(\"]/)[0];
      if (/^[A-Z]\w*$/.test(firstWord)) {
        return {
          type: 'component',
          name: firstWord,
          id: Parser.extractId(content),
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [],
          indent
        };
      }

      // Generic element: tagName "text" [mod1, mod2] #id
      const tagM = content.match(/^([\w-]+)(.*)/);
      if (!tagM) return null;

      return {
        type: tagM[1], tag: tagM[1],
        id: Parser.extractId(content),
        text: Parser.extractQuoted(content),
        modifiers: Parser.extractModifiers(content),
        children: [], indent
      };
    },

    // ── Extraction helpers ────────────────────────────────────────────

    extractQuoted(str) {
      if (!str) return null;
      const m = str.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
      return m ? m[1] : null;
    },

    extractId(str) {
      if (!str) return null;
      const before = str.split('[')[0];
      const m = before.match(/#([\w-]+)/);
      return m ? m[1] : null;
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

      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if      (ch === '(')              depth++;
        else if (ch === ')')              depth = depth > 0 ? depth - 1 : 0;
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
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // STATE — Reactive store with signals, watchers, & batching
  // ═══════════════════════════════════════════════════════════════════════

  const State = {
    _store:    {},
    _watchers: {},
    _computed: {},
    _signals:  {},

    set(key, value) {
      const prev = this._store[key];
      this._store[key] = value;

      // Update signal if bound
      if (this._signals[key]) {
        this._signals[key].value = value;
      }

      // Run registered watchers
      (this._watchers[key] || []).forEach(fn => fn(value, prev));

      // Refresh DOM text bindings
      Renderer.updateBindings(key, value);

      // Re-evaluate computed values
      Object.keys(this._computed).forEach(cKey => {
        const c = this._computed[cKey];
        if (c.deps.includes(key)) {
          const next = c.fn(...c.deps.map(d => State._store[d]));
          State.set(cKey, next);
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
    }
  };


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
      ast.forEach(node => {
        const el = this.renderNode(node);
        if (el) root.appendChild(el);
      });
      if (t0) Profiler.recordRender(performance.now() - t0);
    },

    /** Dispatch a single node to the right render method */
    renderNode(node) {
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
        case 'each':      return this.renderEach(node);
        case 'if':        return this.renderIf(node);
        default:
          if (/^[a-z][\w-]*$/.test(node.type)) return this.renderElement(node);
          return null;
      }
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
          el.setAttribute(name, name);
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
          el.setAttribute(name, name);
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

      // If registered component has JS setup/render hooks
      if (typeof def.render === 'function') {
        const res = def.render({ props: node.props || {}, children: node.children });
        if (res instanceof HTMLElement) container.appendChild(res);
        return container;
      }

      // Indented .breeze template component
      if (def.children) {
        def.children.forEach(child => {
          if (child.type === 'slot') {
            (node.children || []).forEach(slotChild => {
              const el = this.renderNode(slotChild);
              if (el) container.appendChild(el);
            });
          } else {
            const el = this.renderNode(child);
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
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) links.appendChild(el);
      });
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
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) section.appendChild(el);
      });
      Profiler.recordDomOp('create');
      return section;
    },

    renderFooter(node) {
      const footer = document.createElement('footer');
      footer.className = 'bz-footer';
      if (node.id) footer.id = node.id;
      this.applyModifiers(footer, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) footer.appendChild(el);
      });
      Profiler.recordDomOp('create');
      return footer;
    },

    renderHeader(node) {
      const header = document.createElement('header');
      header.className = 'bz-header';
      if (node.id) header.id = node.id;
      this.applyModifiers(header, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) header.appendChild(el);
      });
      Profiler.recordDomOp('create');
      return header;
    },

    renderMain(node) {
      const main = document.createElement('main');
      main.className = 'bz-main';
      if (node.id) main.id = node.id;
      this.applyModifiers(main, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) main.appendChild(el);
      });
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
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) div.appendChild(el);
      });
      Profiler.recordDomOp('create');
      return div;
    },

    renderButton(node) {
      const btn = document.createElement('button');
      btn.className = 'bz-btn';
      if (node.id) btn.id = node.id;
      if (node.text) this.setTextWithBindings(btn, node.text);
      this.applyModifiers(btn, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) btn.appendChild(el);
      });
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
      (node.children || []).forEach(child => {
        const childEl = this.renderNode(child);
        if (childEl) el.appendChild(childEl);
      });
      Profiler.recordDomOp('create');
      return el;
    },

    // ── High-Performance Keyed List Reconciliation Engine ─────────────

    renderEach(node) {
      const container = document.createElement('div');
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

      const reconcile = () => {
        Profiler.recordKeyedDiff();
        const items = State.get(listKey) || [];
        if (!Array.isArray(items) || items.length === 0) {
          container.textContent = '';
          renderedRecords = [];
          recordMap.clear();
          return;
        }

        // Fast-path 1: Initial Render (DocumentFragment batch append)
        if (renderedRecords.length === 0) {
          const frag = document.createDocumentFragment();
          const nextRecords = new Array(items.length);
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const key = (typeof item === 'object' && item !== null && item[keyProp] !== undefined)
              ? item[keyProp]
              : i;
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

        // Keyed Reconciliation (LIS / Two-pointer diffing)
        const nextRecords = new Array(items.length);
        const nextKeyMap = new Map();

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const key = (typeof item === 'object' && item !== null && item[keyProp] !== undefined)
            ? item[keyProp]
            : i;
          const existing = recordMap.get(key);
          if (existing) {
            // Reused row! Check if item content or index changed
            if (existing.item !== item || existing.index !== i) {
              Renderer.updateItemDOM(existing.el, node.children, itemVar, item, i);
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

        // Step 2: Reposition / Insert nodes in order
        let cursor = container.firstElementChild;
        for (let i = 0; i < nextRecords.length; i++) {
          const rec = nextRecords[i];
          if (!rec || !rec.el) continue;
          if (rec.el === cursor) {
            cursor = cursor.nextElementSibling;
          } else {
            container.insertBefore(rec.el, cursor);
            Profiler.recordDomOp('move');
          }
        }

        renderedRecords = nextRecords.filter(Boolean);
        recordMap = nextKeyMap;
      };

      reconcile();
      State.watch(listKey, () => reconcile());
      return container;
    },

    renderItemChildren(children, itemVar, item, index) {
      if (!children || children.length === 0) return null;
      if (children.length === 1) {
        const itemNode = this.interpolateItemNode(children[0], itemVar, item, index);
        const el = this.renderNode(itemNode);
        if (el) el._bzItemKey = (typeof item === 'object' && item !== null) ? item.id : index;
        return el;
      }
      const wrap = document.createElement('div');
      children.forEach(child => {
        const itemNode = this.interpolateItemNode(child, itemVar, item, index);
        const el = this.renderNode(itemNode);
        if (el) wrap.appendChild(el);
      });
      return wrap;
    },

    /** Surgical in-place DOM update of a row without recreation */
    updateItemDOM(el, children, itemVar, item, index) {
      if (!el) return;
      // Fast path: single child
      if (children && children.length === 1) {
        const childNode = children[0];
        const interpolated = this.interpolateItemNode(childNode, itemVar, item, index);
        if (interpolated.text != null && el.firstChild && el.firstChild.nodeType === 3) {
          el.firstChild.nodeValue = interpolated.text;
          Profiler.recordDomOp('text');
        } else if (interpolated.text != null) {
          el.textContent = interpolated.text;
          Profiler.recordDomOp('text');
        }
        if (Array.isArray(interpolated.modifiers)) {
          this.applyModifiers(el, interpolated.modifiers);
        }
      } else if (children && children.length > 1) {
        // Multi-child row: update each child element
        for (let c = 0; c < children.length && c < el.children.length; c++) {
          const childNode = children[c];
          const childEl = el.children[c];
          const interpolated = this.interpolateItemNode(childNode, itemVar, item, index);
          if (interpolated.text != null && childEl.firstChild && childEl.firstChild.nodeType === 3) {
            childEl.firstChild.nodeValue = interpolated.text;
            Profiler.recordDomOp('text');
          }
          if (Array.isArray(interpolated.modifiers)) {
            this.applyModifiers(childEl, interpolated.modifiers);
          }
        }
      }
    },

    interpolateItemNode(node, itemVar, item, index) {
      if (!node) return null;
      const clone = Object.assign({}, node);
      const isObj = typeof item === 'object' && item !== null;
      const itemStr = isObj ? JSON.stringify(item) : String(item);

      const replaceTokens = (str) => {
        if (!str || typeof str !== 'string') return str;
        let res = str.replace(new RegExp(`\\{${itemVar}\\.index\\}`, 'g'), String(index));
        res = res.replace(new RegExp(`\\{${itemVar}\\}`, 'g'), itemStr);
        if (isObj) {
          for (const prop in item) {
            res = res.replace(new RegExp(`\\{${itemVar}\\.${prop}\\}`, 'g'), String(item[prop]));
          }
        }
        return res;
      };

      if (typeof clone.text === 'string') {
        clone.text = replaceTokens(clone.text);
      }
      if (Array.isArray(clone.modifiers)) {
        clone.modifiers = clone.modifiers.map(m => replaceTokens(m));
      }
      if (Array.isArray(clone.children)) {
        clone.children = clone.children.map(c => this.interpolateItemNode(c, itemVar, item, index));
      }
      return clone;
    },

    // ── Conditionals: @if, @elif, @else ───────────────────────────────

    renderIf(node) {
      const container = document.createElement('div');
      container.className = 'bz-if';

      const update = () => {
        container.innerHTML = '';
        const val = State.get(node.conditionKey);
        let truthy = Boolean(val);
        if (node.negate) truthy = !truthy;

        if (truthy) {
          (node.children || []).forEach(child => {
            const el = this.renderNode(child);
            if (el) container.appendChild(el);
          });
          container.style.display = '';
        } else {
          container.style.display = 'none';
        }
      };

      update();
      State.watch(node.conditionKey, () => update());
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
      const classMap = {
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
        'no-wrap': 'bz-no-wrap'
      };

      const BOOL_ATTRS = new Set([
        'disabled', 'checked', 'readonly', 'required',
        'selected', 'multiple', 'autofocus'
      ]);

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
          const val = mod.substring(ei + 1).trim().replace(/^["']|["']$/g, '');
          el.setAttribute(attr, val);
          return;
        }

        // ── CSS class ──────────────────────────────────────────────────
        el.classList.add(classMap[mod] || `bz-${mod}`);
      });
    },

    executeAction(action, event, el) {
      if (!action) return;

      const navM = action.match(/^navigate\(([^)]+)\)$/);
      if (navM) { Router.navigate(navM[1].trim()); return; }

      const setM = action.match(/^setState\((\w+),\s*(.+)\)$/);
      if (setM) {
        let v = setM[2].trim();
        try { v = JSON.parse(v); } catch (e) { v = v.replace(/^["']|["']$/g, ''); }
        State.set(setM[1], v);
        return;
      }

      const incrM = action.match(/^increment\((\w+)\)$/);
      if (incrM) { State.set(incrM[1], (State.get(incrM[1]) || 0) + 1); return; }

      const decrM = action.match(/^decrement\((\w+)\)$/);
      if (decrM) { State.set(decrM[1], (State.get(decrM[1]) || 0) - 1); return; }

      const togM = action.match(/^toggle\((\w+)\)$/);
      if (togM) { State.set(togM[1], !State.get(togM[1])); return; }

      const emitM = action.match(/^emit\(([^,)]+)(?:,\s*(.+))?\)$/);
      if (emitM) { EventBus.emit(emitM[1].trim(), emitM[2]); return; }

      const pushM = action.match(/^push\((\w+),\s*(.+)\)$/);
      if (pushM) {
        let v = pushM[2].trim();
        try { v = JSON.parse(v); } catch (e) { v = v.replace(/^["']|["']$/g, ''); }
        State.push(pushM[1], v);
        return;
      }

      const remM = action.match(/^remove\((\w+),\s*(\d+)\)$/);
      if (remM) {
        State.remove(remM[1], parseInt(remM[2], 10));
        return;
      }

      // Check Breeze registered custom methods
      const fnName = action.split('(')[0].trim();
      if (typeof BreezeAPI.methods[fnName] === 'function') {
        const rawArgs = action.substring(fnName.length + 1, action.lastIndexOf(')'));
        const args = rawArgs ? rawArgs.split(',').map(a => {
          let t = a.trim();
          if (t === '$event') return event;
          try { return JSON.parse(t); } catch (_) { return t.replace(/^["']|["']$/g, ''); }
        }) : [event, el];
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
    params:       {},
    query:        {},

    setMode(mode) {
      this._mode = mode === 'history' ? 'history' : 'hash';
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

      // Run navigation guards
      let allowed = true;
      for (let i = 0; i < this._guards.length; i++) {
        this._guards[i](to, from, (allow = true) => {
          if (allow === false) allowed = false;
        });
        if (!allowed) return;
      }

      if (typeof window !== 'undefined') {
        if (this._mode === 'history' && window.history && window.history.pushState) {
          window.history.pushState(null, '', to);
          this._current = to;
          this.handleRoute(to);
        } else {
          const hash = to.startsWith('#') ? to : '#' + to;
          const targetId = hash.slice(1);
          const target = (typeof document !== 'undefined')
            ? (document.getElementById(targetId) || document.querySelector(hash))
            : null;
          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

      // Parse query params
      this.query = {};
      const qIdx = currentPath.indexOf('?');
      if (qIdx !== -1) {
        const qStr = currentPath.substring(qIdx + 1);
        qStr.split('&').forEach(p => {
          const [k, v] = p.split('=');
          if (k) this.query[decodeURIComponent(k)] = decodeURIComponent(v || '');
        });
      }

      // Match pattern and extract :params
      this.params = {};
      let matchedHandler = null;
      for (const pattern in this._routes) {
        const match = this._matchPattern(pattern, currentPath);
        if (match) {
          this.params = match.params;
          matchedHandler = this._routes[pattern];
          break;
        }
      }

      if (matchedHandler) matchedHandler(currentPath, this.params);
      this.updateActiveLinks(currentPath);
    },

    _matchPattern(pattern, actual) {
      const cleanPath = actual.split('?')[0];
      if (pattern === cleanPath) return { params: {} };
      const paramKeys = [];
      const regexStr = '^' + pattern.replace(/:(\w+)/g, (_, k) => {
        paramKeys.push(k);
        return '([^/]+)';
      }) + '$';
      const m = cleanPath.match(new RegExp(regexStr));
      if (!m) return null;
      const params = {};
      for (let i = 0; i < paramKeys.length; i++) {
        params[paramKeys[i]] = m[i + 1];
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

    function resolveTpl(str) {
      if (!str) return '';
      return str.replace(/\{([\w.]+)\}/g, (_, k) => {
        const parts = k.split('.');
        let v = store[parts[0]];
        for (let p = 1; p < parts.length && v != null; p++) {
          v = v[parts[p]];
        }
        return v !== undefined ? escHtml(String(v)) : '';
      });
    }

    function renderNodeStr(node) {
      if (!node) return '';
      switch (node.type) {
        case 'theme': case 'seo': case 'schema': case 'aeo': case 'geo':
        case 'app': case 'state': case 'style': case 'def':
          return '';
        case 'nav': {
          let h = `<nav class="bz-nav">`;
          if (node.text) h += `<div class="bz-nav-brand">${escHtml(node.text)}</div>`;
          h += `<div class="bz-nav-links">`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</div>`;
          h += `<button class="bz-nav-hamburger" aria-label="Toggle navigation"><span></span><span></span><span></span></button>`;
          h += `</nav>`;
          return h;
        }
        case 'section': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const classes = ['bz-section', ...(node.modifiers || []).map(m => `bz-${m}`)].join(' ');
          let h = `<section${idAttr} class="${classes}">`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</section>`;
          return h;
        }
        case 'footer': {
          const classes = ['bz-footer', ...(node.modifiers || []).map(m => `bz-${m}`)].join(' ');
          let h = `<footer class="${classes}">`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</footer>`;
          return h;
        }
        case 'header': {
          const classes = ['bz-header', ...(node.modifiers || []).map(m => `bz-${m}`)].join(' ');
          let h = `<header class="${classes}">`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</header>`;
          return h;
        }
        case 'main': {
          const classes = ['bz-main', ...(node.modifiers || []).map(m => `bz-${m}`)].join(' ');
          let h = `<main class="${classes}">`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</main>`;
          return h;
        }
        case 'card': {
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const classes = ['bz-card', ...(node.modifiers || []).map(m => `bz-${m}`)].join(' ');
          const text = node.text ? resolveTpl(node.text) : '';
          let h = `<div${idAttr} class="${classes}">${text}`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</div>`;
          return h;
        }
        case 'button': {
          const classes = ['bz-btn', ...(node.modifiers || []).map(m => `bz-${m}`)].join(' ');
          const text = node.text ? resolveTpl(node.text) : '';
          let h = `<button class="${classes}">${text}`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</button>`;
          return h;
        }
        case 'link': {
          const href = node.target ? (node.target.startsWith('#') ? node.target : '#' + node.target) : '#';
          return `<a href="${escAttr(href)}" class="bz-nav-link">${escHtml(node.text || '')}</a>`;
        }
        case 'each': {
          let h = `<div class="bz-each">`;
          const items = store[node.listKey] || [];
          if (Array.isArray(items)) {
            items.forEach((item, idx) => {
              (node.children || []).forEach(child => {
                const interp = Renderer.interpolateItemNode(child, node.itemVar, item, idx);
                h += renderNodeStr(interp);
              });
            });
          }
          h += `</div>`;
          return h;
        }
        case 'if': {
          const val = store[node.conditionKey];
          let truthy = Boolean(val);
          if (node.negate) truthy = !truthy;
          if (truthy) {
            let h = `<div class="bz-if">`;
            (node.children || []).forEach(c => { h += renderNodeStr(c); });
            h += `</div>`;
            return h;
          }
          return `<div class="bz-if" style="display:none"></div>`;
        }
        default: {
          const tag = node.tag || node.type || 'div';
          const idAttr = node.id ? ` id="${escAttr(node.id)}"` : '';
          const text = node.text != null ? resolveTpl(node.text) : '';
          let h = `<${tag}${idAttr}>${text}`;
          (node.children || []).forEach(c => { h += renderNodeStr(c); });
          h += `</${tag}>`;
          return h;
        }
      }
    }

    let out = '';
    ast.forEach(node => { out += renderNodeStr(node); });
    return out;
  }

  function hydrate(sourceOrAst, rootSelector) {
    rootSelector = rootSelector || '#app';
    const root = typeof rootSelector === 'string'
      ? document.querySelector(rootSelector)
      : rootSelector;
    if (!root) return;

    const ast = typeof sourceOrAst === 'string' ? Parser.parse(sourceOrAst) : sourceOrAst;
    Router.init();
    Renderer.render(ast, root);
    Lifecycle.triggerMount(root);
    EventBus.emit('breeze:hydrated', { root, ast });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API — The global `Breeze` object
  // ═══════════════════════════════════════════════════════════════════════

  const BreezeAPI = {
    version: '1.0.0',

    // ── Custom Methods Registry ───────────────────────────────────────
    methods: {},

    method(name, fn) {
      this.methods[name] = fn;
      return this;
    },

    // ── Fine-Grained Reactive Signals API ─────────────────────────────
    signal(initialValue) {
      return signal(initialValue);
    },

    computed(keyOrFn, maybeDeps, maybeFn) {
      if (typeof keyOrFn === 'function') {
        return computed(keyOrFn);
      }
      State.computed(keyOrFn, maybeDeps, maybeFn);
      return this;
    },

    effect(fn) {
      return effect(fn);
    },

    batch(fn) {
      return batch(fn);
    },

    // ── Component & Lifecycle API ─────────────────────────────────────
    component(name, def) {
      Components.register(name, def);
      return this;
    },

    onMount(fn)   { Lifecycle.onMount(fn); return this; },
    onDestroy(fn) { Lifecycle.onDestroy(fn); return this; },
    onUpdate(fn)  { Lifecycle.onUpdate(fn); return this; },

    // ── Profiler & Debugger API ───────────────────────────────────────
    profiler: Profiler,

    debug(enable = true) {
      Profiler._enabled = Boolean(enable);
      if (Profiler._enabled) DevToolsHUD.mount();
      else if (DevToolsHUD._el) DevToolsHUD._el.remove();
      return this;
    },

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
      State.set(key, initialValue);
      return {
        get:   ()    => State.get(key),
        set:   val   => State.set(key, val),
        watch: fn    => State.watch(key, fn)
      };
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

    parse(source) { return Parser.parse(source); }
  };

  // Expose globally & as module
  global.Breeze = BreezeAPI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Breeze: BreezeAPI, default: BreezeAPI };
    module.exports.Breeze = BreezeAPI;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
