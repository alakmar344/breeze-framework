/*!
 * Breeze Framework v1.0.0
 * Ultra-lightweight declarative web framework
 * https://github.com/breeze-framework/breeze-framework
 * MIT License
 *
 * Architecture:
 *   Parser  — Converts .breeze source text into an AST
 *   State   — Reactive state store with watchers and computed values
 *   Renderer— Turns AST nodes into real DOM elements
 *   Router  — Hash-based client-side routing with smooth scroll
 *   EventBus— Global publish/subscribe message bus
 *   Plugins — Plugin registry and lifecycle hooks
 *   API     — Public Breeze object exposed on window
 */
(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // PARSER — Converts .breeze source text into an Abstract Syntax Tree
  // ═══════════════════════════════════════════════════════════════════════

  const Parser = {

    /**
     * Parse a full .breeze source string into an array of AST nodes.
     * Indentation (2 spaces per level) determines parent-child nesting.
     *
     * Each node shape:
     *   { type, tag, id, text, modifiers[], children[], indent, [key, value, props, target] }
     */
    parse(source) {
      const lines = source.split('\n');
      const root  = [];
      // Stack entries: { children: Array, indent: Number }
      // The "indent" here is the indent of the node that OWNS those children.
      const stack = [{ children: root, indent: -1 }];
      let i = 0;

      while (i < lines.length) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        // Skip empty lines, line comments, and the shebang (if used as data)
        if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('##')) {
          i++;
          continue;
        }

        // Indentation level = number of leading spaces
        const indent = rawLine.search(/\S/);

        // ── Special block: @theme { key: value ... } ───────────────────
        if (trimmed.startsWith('@theme')) {
          const themeNode = { type: 'theme', props: {} };
          i++;
          while (i < lines.length) {
            const tl = lines[i].trim();
            if (tl === '}') { i++; break; }
            if (tl && !tl.startsWith('//')) {
              const ci = tl.indexOf(':');
              if (ci !== -1) {
                const k = tl.substring(0, ci).trim();
                const v = tl.substring(ci + 1).trim().replace(/^["']|["']$/g, '');
                themeNode.props[k] = v;
              }
            }
            i++;
          }
          root.push(themeNode);
          continue;
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
          // If the node accepts children, push it so subsequent indented
          // lines are appended to node.children.
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

    // ── Directive parser (@nav, @section, @state, …) ─────────────────

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

      // @state count = 0  or  @state name = "Alice"
      if (content.startsWith('@state')) {
        const m = content.match(/@state\s+(\w+)\s*=\s*(.+)/);
        if (m) {
          let val = m[2].trim();
          try { val = JSON.parse(val); } catch (e) {
            val = val.replace(/^["']|["']$/g, '');
          }
          return { type: 'state', key: m[1], value: val, indent };
        }
      }

      // @style "raw css string"
      if (content.startsWith('@style')) {
        return { type: 'style', text: Parser.extractQuoted(content), indent };
      }

      // @each item in listKey  or  @for item in listKey
      if (content.startsWith('@each') || content.startsWith('@for')) {
        const m = content.match(/@(each|for)\s+(\w+)\s+in\s+(\w+)/);
        if (m) {
          return {
            type: 'each',
            itemVar: m[2],
            listKey: m[3],
            children: [],
            indent
          };
        }
      }

      // @if conditionKey  or  @if !conditionKey
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

    // ── Element parser (h1, p, button, card, link, input, …) ─────────

    parseElement(content, indent) {
      // link "Label" -> #target
      if (content.startsWith('link')) {
        return {
          type: 'link', tag: 'a',
          text: Parser.extractQuoted(content),
          target: Parser.extractArrowTarget(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      // Generic: tagName "text" [mod1, mod2] #id
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

    /** First double-quoted string: "hello world" → 'hello world' */
    extractQuoted(str) {
      const m = str.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
      return m ? m[1] : null;
    },

    /**
     * Element #id — only look before the first `[` bracket to avoid
     * mistakenly matching #refs inside event-handler expressions.
     */
    extractId(str) {
      const before = str.split('[')[0];
      const m = before.match(/#([\w-]+)/);
      return m ? m[1] : null;
    },

    /**
     * Modifier list inside [...].
     * Splits on commas that are NOT inside parentheses so that
     * `@click -> navigate(#about)` is kept as one token.
     * Uses a linear character-by-character scan to avoid ReDoS.
     */
    extractModifiers(str) {
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

    /** Arrow target: link "X" -> #id  →  '#id' */
    extractArrowTarget(str) {
      const m = str.match(/->\s*(#?[\w-]+)/);
      return m ? m[1] : null;
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // STATE — Reactive store with watchers and computed values
  // ═══════════════════════════════════════════════════════════════════════

  const State = {
    _store:    {},
    _watchers: {},
    _computed: {},

    /** Write a value, notify watchers, refresh DOM bindings */
    set(key, value) {
      const prev = this._store[key];
      this._store[key] = value;

      // Run registered watchers for this key
      (this._watchers[key] || []).forEach(fn => fn(value, prev));

      // Refresh any DOM text nodes bound to this key
      Renderer.updateBindings(key, value);

      // Re-evaluate computed values that list this key as a dependency
      Object.keys(this._computed).forEach(cKey => {
        const c = this._computed[cKey];
        if (c.deps.includes(key)) {
          const next = c.fn(...c.deps.map(d => State._store[d]));
          State.set(cKey, next);
        }
      });
    },

    get(key) { return this._store[key]; },

    watch(key, fn) {
      if (!this._watchers[key]) this._watchers[key] = [];
      this._watchers[key].push(fn);
    },

    computed(key, deps, fn) {
      this._computed[key] = { deps, fn };
      // Compute initial value immediately
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
  // RENDERER — Converts AST nodes into real DOM elements
  // ═══════════════════════════════════════════════════════════════════════

  const Renderer = {
    _bindings: {}, // stateKey → [{ el, template }]
    _root: null,

    /** Full render pass: clears root and builds the DOM from the AST */
    render(ast, root) {
      this._root     = root;
      this._bindings = {};
      root.innerHTML = '';
      ast.forEach(node => {
        const el = this.renderNode(node);
        if (el) root.appendChild(el);
      });
    },

    /** Dispatch a single node to the right render method */
    renderNode(node) {
      if (!node) return null;
      switch (node.type) {
        case 'theme':   this.applyTheme(node.props);                   return null;
        case 'app':     document.title = node.text || 'Breeze App';    return null;
        case 'state':   State.set(node.key, node.value);               return null;
        case 'style':   this.injectStyle(node.text);                   return null;
        case 'nav':     return this.renderNav(node);
        case 'section': return this.renderSection(node);
        case 'footer':  return this.renderFooter(node);
        case 'header':  return this.renderHeader(node);
        case 'main':    return this.renderMain(node);
        case 'link':    return this.renderLink(node);
        case 'card':    return this.renderCard(node);
        case 'button':  return this.renderButton(node);
        case 'each':    return this.renderEach(node);
        case 'if':      return this.renderIf(node);
        default:
          if (/^[a-z][\w-]*$/.test(node.type)) return this.renderElement(node);
          return null;
      }
    },

    // ── Theme ─────────────────────────────────────────────────────────

    /** Map @theme props onto CSS custom properties on :root */
    applyTheme(props) {
      if (!props) return;
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

    /** Inject a raw CSS string via a <style> tag */
    injectStyle(css) {
      if (!css) return;
      const s = document.createElement('style');
      s.textContent = css;
      document.head.appendChild(s);
    },

    // ── Layout elements ───────────────────────────────────────────────

    renderNav(node) {
      const nav = document.createElement('nav');
      nav.className = 'bz-nav';
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

      // Hamburger button for mobile
      const hamburger = document.createElement('button');
      hamburger.className = 'bz-nav-hamburger';
      hamburger.setAttribute('aria-label', 'Toggle navigation');
      hamburger.innerHTML = '<span></span><span></span><span></span>';
      hamburger.addEventListener('click', () => {
        nav.classList.toggle('bz-nav-open');
      });
      nav.appendChild(hamburger);

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
      return section;
    },

    renderFooter(node) {
      const footer = document.createElement('footer');
      footer.className = 'bz-footer';
      this.applyModifiers(footer, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) footer.appendChild(el);
      });
      return footer;
    },

    renderHeader(node) {
      const header = document.createElement('header');
      header.className = 'bz-header';
      this.applyModifiers(header, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) header.appendChild(el);
      });
      return header;
    },

    renderMain(node) {
      const main = document.createElement('main');
      main.className = 'bz-main';
      this.applyModifiers(main, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) main.appendChild(el);
      });
      return main;
    },

    // ── Interactive elements ──────────────────────────────────────────

    renderLink(node) {
      const a = document.createElement('a');
      a.className = 'bz-nav-link';
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
      return div;
    },

    renderButton(node) {
      const btn = document.createElement('button');
      btn.classList.add('bz-btn');
      if (node.text) this.setTextWithBindings(btn, node.text);
      this.applyModifiers(btn, node.modifiers || []);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child);
        if (el) btn.appendChild(el);
      });
      return btn;
    },

    renderElement(node) {
      const tag = node.tag || node.type || 'div';
      const el  = document.createElement(tag);
      if (node.id) el.id = node.id;

      // Auto-class for semantic form/table elements
      const semanticClass = {
        form: 'bz-form', input: 'bz-input', textarea: 'bz-textarea',
        select: 'bz-select', label: 'bz-label',
        table: 'bz-table', ul: 'bz-list', ol: 'bz-list'
      }[tag];
      if (semanticClass) el.classList.add(semanticClass);

      if (node.text != null) this.setTextWithBindings(el, node.text);
      this.applyModifiers(el, node.modifiers || []);
      (node.children || []).forEach(child => {
        const childEl = this.renderNode(child);
        if (childEl) el.appendChild(childEl);
      });
      return el;
    },

    // ── Loop & Conditional elements ───────────────────────────────────

    renderEach(node) {
      const container = document.createElement('div');
      container.className = 'bz-each';

      const renderItems = () => {
        container.innerHTML = '';
        const items = State.get(node.listKey) || [];
        if (Array.isArray(items)) {
          items.forEach((item, index) => {
            (node.children || []).forEach(child => {
              const itemNode = this.interpolateItemNode(child, node.itemVar, item, index);
              const el = this.renderNode(itemNode);
              if (el) container.appendChild(el);
            });
          });
        }
      };

      renderItems();
      State.watch(node.listKey, () => renderItems());
      return container;
    },

    interpolateItemNode(node, itemVar, item, index) {
      if (!node) return null;
      const clone = Object.assign({}, node);
      if (typeof clone.text === 'string') {
        const itemStr = typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item);
        clone.text = clone.text.replace(new RegExp(`\\{${itemVar}\\}`, 'g'), itemStr);
        clone.text = clone.text.replace(new RegExp(`\\{${itemVar}\\.index\\}`, 'g'), String(index));
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(prop => {
            clone.text = clone.text.replace(new RegExp(`\\{${itemVar}\\.${prop}\\}`, 'g'), String(item[prop]));
          });
        }
      }
      if (Array.isArray(clone.modifiers)) {
        clone.modifiers = clone.modifiers.map(mod => {
          let m = mod;
          m = m.replace(new RegExp(`\\{${itemVar}\\.index\\}`, 'g'), String(index));
          if (typeof item !== 'object' || item === null) {
            m = m.replace(new RegExp(`\\{${itemVar}\\}`, 'g'), String(item));
          } else {
            Object.keys(item).forEach(prop => {
              m = m.replace(new RegExp(`\\{${itemVar}\\.${prop}\\}`, 'g'), String(item[prop]));
            });
          }
          return m;
        });
      }
      if (Array.isArray(clone.children)) {
        clone.children = clone.children.map(c => this.interpolateItemNode(c, itemVar, item, index));
      }
      return clone;
    },

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

    /**
     * Sets element text and registers reactive bindings for {stateKey} tokens.
     * When matching state changes, the text node is updated automatically.
     */
    setTextWithBindings(el, text) {
      if (!text) return;
      const re = /\{(\w+)\}/g;
      let m;
      let hasBinding = false;
      while ((m = re.exec(text)) !== null) {
        hasBinding = true;
        const key = m[1];
        if (!this._bindings[key]) this._bindings[key] = [];
        this._bindings[key].push({ el, template: text });
      }
      el.textContent = hasBinding ? this.resolveBindings(text) : text;
    },

    resolveBindings(tpl) {
      return tpl.replace(/\{(\w+)\}/g, (_, k) => {
        const v = State.get(k);
        return v !== undefined ? String(v) : '';
      });
    },

    /** Called by State.set() to refresh all DOM nodes bound to a key */
    updateBindings(key) {
      (this._bindings[key] || []).forEach(b => {
        b.el.textContent = this.resolveBindings(b.template);
      });
    },

    // ── Modifier → DOM mapping ────────────────────────────────────────

    /**
     * Applies modifiers to a DOM element.
     *   @click -> action(args)   → addEventListener
     *   attr=value               → setAttribute
     *   known-name               → map to bz-* CSS class
     *   unknown-name             → bz-{name} class (fallback)
     */
    applyModifiers(el, modifiers) {
      const classMap = {
        // Layout
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
        // Color & theme
        dark: 'bz-dark', light: 'bz-light',
        primary: 'bz-primary', secondary: 'bz-secondary', accent: 'bz-accent',
        success: 'bz-success', warning: 'bz-warning', danger: 'bz-danger',
        outline: 'bz-outline', ghost: 'bz-ghost', info: 'bz-info',
        // Typography
        bold: 'bz-bold', italic: 'bz-italic', muted: 'bz-muted',
        small: 'bz-small', large: 'bz-large',
        'text-left': 'bz-text-left', 'text-right': 'bz-text-right', 'text-center': 'bz-text-center',
        // Decoration & effects
        shadow: 'bz-shadow', rounded: 'bz-rounded',
        'hover-lift': 'bz-hover-lift', 'hover-glow': 'bz-hover-glow',
        'hover-scale': 'bz-hover-scale',
        // Animation
        'fade-in': 'bz-fade-in', 'slide-up': 'bz-slide-up',
        'slide-left': 'bz-slide-left', 'slide-right': 'bz-slide-right',
        bounce: 'bz-bounce', pulse: 'bz-pulse', 'zoom-in': 'bz-zoom-in',
        // State
        disabled: 'disabled', active: 'active', hidden: 'bz-hidden',
        // Spacing helpers
        'mt-sm': 'bz-mt-sm', 'mt-md': 'bz-mt-md', 'mt-lg': 'bz-mt-lg',
        'mb-sm': 'bz-mb-sm', 'mb-md': 'bz-mb-md', 'mb-lg': 'bz-mb-lg',
        'no-wrap': 'bz-no-wrap'
      };

      modifiers.forEach(mod => {
        mod = mod.trim();
        if (!mod) return;

        // ── Event handler: @eventname -> action(…) ───────────────────
        if (mod.startsWith('@')) {
          const em = mod.match(/@([\w:]+)\s*->\s*(.+)/);
          if (em) {
            el.addEventListener(em[1], e => Renderer.executeAction(em[2].trim(), e, el));
          }
          return;
        }

        // ── HTML attribute: attr=value or attr="value" ───────────────
        if (mod.includes('=')) {
          const ei    = mod.indexOf('=');
          const attr  = mod.substring(0, ei).trim();
          const val   = mod.substring(ei + 1).trim().replace(/^["']|["']$/g, '');
          el.setAttribute(attr, val);
          return;
        }

        // ── CSS class ────────────────────────────────────────────────
        el.classList.add(classMap[mod] || `bz-${mod}`);
      });
    },

    /**
     * Execute an action string emitted by an event handler modifier.
     *
     * Supported actions:
     *   navigate(#id)           scroll + history push
     *   setState(key, value)    set a state value
     *   increment(key)          numeric increment
     *   decrement(key)          numeric decrement
     *   toggle(key)             boolean flip
     *   emit(eventName)         fire on the EventBus
     */
    executeAction(action, event, el) {
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

      // Plugin actions — let registered plugins handle unknown actions
      const pluginAction = Plugins.findAction(action);
      if (pluginAction) pluginAction(action, event, el);
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // ROUTER — Hash-based client-side routing with smooth scroll
  // ═══════════════════════════════════════════════════════════════════════

  const Router = {
    _routes:  {},
    _current: null,

    init() {
      window.addEventListener('hashchange', () => this.handleRoute());
      // Handle initial hash on load
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => this.handleRoute());
      } else {
        this.handleRoute();
      }
    },

    route(path, handler) {
      this._routes[path] = handler;
    },

    navigate(path) {
      // Normalise: ensure leading #
      const hash = path.startsWith('#') ? path : '#' + path;

      // Smooth-scroll to the target element
      const targetId = hash.slice(1);
      const target   = document.getElementById(targetId) ||
                       document.querySelector(hash);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', hash);
        this._current = hash;
        this.updateActiveLinks(hash);
      } else {
        window.location.hash = hash;
      }

      if (this._routes[hash]) this._routes[hash](hash);
    },

    handleRoute() {
      const hash = window.location.hash || '#';
      this._current = hash;
      if (this._routes[hash]) this._routes[hash](hash);
      this.updateActiveLinks(hash);
    },

    updateActiveLinks(path) {
      document.querySelectorAll('.bz-nav-link').forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === path);
      });
    }
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
  // PLUGINS — Registry and lifecycle hooks
  // ═══════════════════════════════════════════════════════════════════════

  const Plugins = {
    _registry: {},

    register(name, plugin) {
      this._registry[name] = plugin;
      // Call the plugin's install hook if present
      if (typeof plugin.install === 'function') plugin.install(BreezeAPI);
    },

    get(name) { return this._registry[name]; },

    /**
     * Walk registered plugins looking for one whose `actions` map
     * contains the leading function name of the action string.
     */
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
  // PUBLIC API — The global `Breeze` object
  // ═══════════════════════════════════════════════════════════════════════

  const BreezeAPI = {
    version: '1.0.0',

    /**
     * Boot from a remote .breeze file.
     *   Breeze.init('app.breeze', '#app')
     */
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

    /**
     * Mount from a raw .breeze string.
     *   Breeze.mount(source, '#app')
     */
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
      EventBus.emit('breeze:mounted', { root, ast });
      return this;
    },

    // ── State API ───────────────────────────────────────────────────

    /**
     * Create a reactive state entry and return a controller object.
     *   const count = Breeze.state('count', 0)
     *   count.set(5)
     *   count.get()  // → 5
     */
    state(key, initialValue) {
      State.set(key, initialValue);
      return {
        get:   ()    => State.get(key),
        set:   val   => State.set(key, val),
        watch: fn    => State.watch(key, fn)
      };
    },

    /** Watch a state key: Breeze.watch('count', (v, prev) => …) */
    watch(key, callback) {
      State.watch(key, callback);
      return this;
    },

    /** Computed value: Breeze.computed('doubled', ['count'], n => n * 2) */
    computed(key, deps, fn) {
      State.computed(key, deps, fn);
      return this;
    },

    getState(key)        { return State.get(key); },
    setState(key, value) { State.set(key, value); return this; },
    push(key, item)      { State.push(key, item); return this; },
    remove(key, index)   { State.remove(key, index); return this; },

    // ── Routing ─────────────────────────────────────────────────────

    /** Register a route handler: Breeze.route('#about', path => …) */
    route(path, handler) {
      Router.route(path, handler);
      return this;
    },

    /** Navigate programmatically: Breeze.navigate('#contact') */
    navigate(path) {
      Router.navigate(path);
      return this;
    },

    // ── Plugins ─────────────────────────────────────────────────────

    /** Register a plugin: Breeze.plugin('name', { install(api){…} }) */
    plugin(name, pluginObj) {
      Plugins.register(name, pluginObj);
      return this;
    },

    // ── DOM helpers ──────────────────────────────────────────────────

    query(selector)    { return document.querySelector(selector); },
    queryAll(selector) { return document.querySelectorAll(selector); },

    // ── Event bus ───────────────────────────────────────────────────

    on(event, handler)  { EventBus.on(event, handler);  return this; },
    off(event, handler) { EventBus.off(event, handler); return this; },
    emit(event, data)   { EventBus.emit(event, data);   return this; },

    // ── Utilities ────────────────────────────────────────────────────

    /**
     * Fetch wrapper that auto-parses JSON responses.
     *   const data = await Breeze.fetch('/api/posts')
     */
    async fetch(url, options) {
      const resp = await fetch(url, options);
      const ct   = resp.headers.get('content-type') || '';
      return ct.includes('application/json') ? resp.json() : resp.text();
    },

    /** Expose parser for tooling / testing */
    parse(source) { return Parser.parse(source); }
  };

  // Expose globally
  global.Breeze = BreezeAPI;

})(typeof window !== 'undefined' ? window : this);
