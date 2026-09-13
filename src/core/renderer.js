import { Profiler } from './profiler.js';
import { BreezeConfig, sanitizeUrl } from './config.js';
import { lisKeepSet } from './reactive.js';
import { Parser } from './parser.js';
import { BZ_CLASS_MAP, BZ_BOOL_ATTRS, escHtmlFast, escAttrFast, bzTplText, bzModsHtml } from './row-compiler.js';
import { State } from './state.js';
import { calculateVirtualWindow } from './virtual-list.js';
import { Router } from './router.js';
import { Components, EventBus, Plugins } from './registries.js';
import { Refs, Directives } from './dx.js';
import { BreezeAPI } from './api.js';

  export const BZ_SEMANTIC_CLASS_MAP = {
    form: 'bz-form', input: 'bz-input', textarea: 'bz-textarea',
    select: 'bz-select', label: 'bz-label',
    table: 'bz-table', tbody: 'bz-tbody', tr: 'bz-tr', td: 'bz-td', th: 'bz-th',
    ul: 'bz-list', ol: 'bz-list'
  };

  // ═══════════════════════════════════════════════════════════════════════
  // RENDERER — Converts AST into DOM with Keyed Reconciliation
  // ═══════════════════════════════════════════════════════════════════════

  export const Renderer = {
    _bindings: {}, // stateKey -> [{ el, template }]
    _root: null,

    /** Full render pass */
    render(ast, root, options = {}) {
      const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
      this._root     = root;
      const store = (options && options.store) || State;
      if (root) root._bzStore = store;
      this._bindings = {};
      if (root) root.innerHTML = '';
      this.renderChildrenWithChains(ast, root, store);
      if (t0) Profiler.recordRender(performance.now() - t0);
    },

    /** Render a sibling list, grouping @if/@elif/@else chains so elif/else aren't orphaned */
    renderChildrenWithChains(children, parentEl, store) {
      if (!children) return;
      const s = store || (parentEl && parentEl._bzStore) || State;
      for (let idx = 0; idx < children.length; idx++) {
        const node = children[idx];
        if (!node) continue;
        if (node.type === 'elif' || node.type === 'else') {
          // Orphaned (no preceding @if at this level) — render standalone via renderNode
          const el = this.renderNode(node, null, s);
          if (el && parentEl) parentEl.appendChild(el);
          continue;
        }
        if (node.type === 'if') {
          const chain = { siblings: children, index: idx, consumed: 0 };
          const el = this.renderNode(node, chain, s);
          if (el && parentEl) parentEl.appendChild(el);
          if (chain.consumed) idx += chain.consumed;
          continue;
        }
        const el = this.renderNode(node, null, s);
        if (el && parentEl) parentEl.appendChild(el);
      }
    },

    /** Dispatch a single node to the right render method */
    renderNode(node, chain, store) {
      if (!node) return null;
      const s = store || (this._root && this._root._bzStore) || State;
      let resEl = null;
      switch (node.type) {
        case 'theme':     this.applyTheme(node.props);                   return null;
        case 'seo':       this.applySEO(node.props);                     return null;
        case 'schema':    this.applySchema(node.props);                  return null;
        case 'aeo':       this.applyAEO(node.props);                     return null;
        case 'geo':       this.applyGEO(node.props);                     return null;
        case 'app':       if (typeof document !== 'undefined') document.title = node.text || 'Breeze App'; return null;
        case 'state':     s.set(node.key, node.value);                   return null;
        case 'style':     this.injectStyle(node.text);                   return null;
        case 'def':       return null; // Component definition, instantiated on call
        case 'component': resEl = this.renderComponent(node, s); break;
        case 'nav':       resEl = this.renderNav(node, s); break;
        case 'section':   resEl = this.renderSection(node, s); break;
        case 'footer':    resEl = this.renderFooter(node, s); break;
        case 'header':    resEl = this.renderHeader(node, s); break;
        case 'main':      resEl = this.renderMain(node, s); break;
        case 'link':      resEl = this.renderLink(node, s); break;
        case 'card':      resEl = this.renderCard(node, s); break;
        case 'button':    resEl = this.renderButton(node, s); break;
        case 'each':         resEl = this.renderEach(node, s); break;
        case 'virtual-each': resEl = this.renderVirtualEach(node, s); break;
        case 'if':        resEl = this.renderIfChain(node, chain, s); break;
        case 'elif':
          // Standalone elif (no parent if) — render as its own condition
          resEl = this.renderIfChain({ type: 'if', conditionKey: node.conditionKey, negate: node.negate, children: node.children }, null, s);
          break;
        case 'else':
          if (chain && chain.elseTaken) { resEl = this.renderElseBlock(node, s); break; }
          // Standalone else — always render
          resEl = this.renderElseBlock(node, s); break;
        case 'error':     resEl = this.renderError(node, s); break;
        case 'slot':      return null; // Only meaningful inside renderComponent
        case 'portal':    resEl = this.renderPortal(node, s); break;
        default:
          if (/^[a-z][\w-]*$/.test(node.type)) resEl = this.renderElement(node, s);
          break;
      }
      if (resEl && typeof resEl === 'object') {
        resEl._bzStore = s;
      }
      return resEl;
    },

    renderError(node, store) {
      if (typeof document === 'undefined') return null;
      const s = store || (this._root && this._root._bzStore) || State;
      const div = document.createElement('div');
      div.className = 'bz-alert bz-alert-danger';
      div.setAttribute('role', 'alert');
      div._bzStore = s;
      if (node.text) this.setTextWithBindings(div, node.text, s);
      (node.children || []).forEach(child => {
        const el = this.renderNode(child, null, s);
        if (el) div.appendChild(el);
      });
      Profiler.recordDomOp('create');
      return div;
    },

    renderElseBlock(node, store) {
      if (typeof document === 'undefined') return null;
      const s = store || (this._root && this._root._bzStore) || State;
      const wrap = document.createElement('div');
      wrap.className = 'bz-if bz-else';
      wrap._bzStore = s;
      (node.children || []).forEach(child => {
        const el = this.renderNode(child, null, s);
        if (el) wrap.appendChild(el);
      });
      return wrap;
    },

    renderPortal(node, store) {
      // v2 portal/teleport: render children into target selector, leave anchor comment
      if (typeof document === 'undefined') return null;
      const s = store || (this._root && this._root._bzStore) || State;
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
            const el = this.renderNode(child, null, s);
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

    renderComponent(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const def = Parser._components[node.name] || Components.get(node.name);
      if (!def) {
        // Fallback to div if undefined
        return this.renderElement(node, s);
      }

      const container = document.createElement('div');
      container.className = `bz-component bz-${node.name.toLowerCase()}`;
      container._bzStore = s;
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
        if (res instanceof HTMLElement) {
          res._bzStore = s;
          container.appendChild(res);
        }
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
              const el = this.renderNode(slotChild, null, s);
              if (el) container.appendChild(el);
            });
          } else {
            const el = this.renderNode(interpNode(child), null, s);
            if (el) container.appendChild(el);
          }
        });
      }
      return container;
    },

    // ── Layout elements ───────────────────────────────────────────────

    renderNav(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const nav = document.createElement('nav');
      nav.className = 'bz-nav';
      nav._bzStore = s;
      if (node.id) nav.id = node.id;
      this.applyModifiers(nav, node.modifiers || []);

      const brand = document.createElement('div');
      brand.className = 'bz-nav-brand';
      brand._bzStore = s;
      if (node.text) brand.textContent = node.text;
      nav.appendChild(brand);

      const links = document.createElement('div');
      links.className = 'bz-nav-links';
      links._bzStore = s;
      this.renderChildrenWithChains(node.children || [], links, s);
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

    renderSection(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const section = document.createElement('section');
      section.className = 'bz-section';
      section._bzStore = s;
      if (node.id) section.id = node.id;
      this.applyModifiers(section, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], section, s);
      Profiler.recordDomOp('create');
      return section;
    },

    renderFooter(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const footer = document.createElement('footer');
      footer.className = 'bz-footer';
      footer._bzStore = s;
      if (node.id) footer.id = node.id;
      this.applyModifiers(footer, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], footer, s);
      Profiler.recordDomOp('create');
      return footer;
    },

    renderHeader(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const header = document.createElement('header');
      header.className = 'bz-header';
      header._bzStore = s;
      if (node.id) header.id = node.id;
      this.applyModifiers(header, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], header, s);
      Profiler.recordDomOp('create');
      return header;
    },

    renderMain(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const main = document.createElement('main');
      main.className = 'bz-main';
      main._bzStore = s;
      if (node.id) main.id = node.id;
      this.applyModifiers(main, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], main, s);
      Profiler.recordDomOp('create');
      return main;
    },

    renderLink(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const a = document.createElement('a');
      a.className = 'bz-nav-link';
      a._bzStore = s;
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

    renderCard(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const div = document.createElement('div');
      div.className = 'bz-card';
      div._bzStore = s;
      if (node.id) div.id = node.id;
      this.applyModifiers(div, node.modifiers || []);
      if (node.text) this.setTextWithBindings(div, node.text, s);
      this.renderChildrenWithChains(node.children || [], div, s);
      Profiler.recordDomOp('create');
      return div;
    },

    renderButton(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const btn = document.createElement('button');
      btn.className = 'bz-btn';
      btn._bzStore = s;
      if (node.id) btn.id = node.id;
      if (node.text) this.setTextWithBindings(btn, node.text, s);
      this.applyModifiers(btn, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], btn, s);
      Profiler.recordDomOp('create');
      return btn;
    },

    renderElement(node, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const tag = node.tag || node.type || 'div';
      const el  = document.createElement(tag);
      el._bzStore = s;
      if (node.id) el.id = node.id;

      const semanticClass = BZ_SEMANTIC_CLASS_MAP[tag];
      if (semanticClass) el.classList.add(semanticClass);

      if (node.text != null) this.setTextWithBindings(el, node.text, s);
      this.applyModifiers(el, node.modifiers || []);
      this.renderChildrenWithChains(node.children || [], el, s);
      Profiler.recordDomOp('create');
      return el;
    },

    // ── High-Performance Keyed List Reconciliation Engine ─────────────

    renderEach(node, parentStore) {
      const store = parentStore || (this._root && this._root._bzStore) || State;
      const isTable = (node.children && node.children.length === 1 && (node.children[0].tag === 'tr' || node.children[0].type === 'tr'));
      const container = document.createElement(isTable ? 'tbody' : 'div');
      container.className = 'bz-each';
      container._bzStore = store;
      if (node.id) container.id = node.id;
      if (node.modifiers) this.applyModifiers(container, node.modifiers);

      const itemVar = node.itemVar;
      const listKey = node.listKey;
      const keyProp = node.keyProp || 'id';

      // Rendered row cache: records of { key, el, item, index, oldIndex }
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
        const v = store.getPath(listKey);
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
      const usesIndex = () => {
        if (node._bzUsesIndex === undefined) {
          node._bzUsesIndex = Renderer.rowTemplateUsesIndex(node.children, itemVar);
        }
        return node._bzUsesIndex;
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
              const rec = { key, el: cur, item: items[i], index: i, oldIndex: -1 };
              if (cur) {
                cur._bzItemKey = key;
                cur._bzStore = store;
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
            const rowEl = Renderer.renderItemChildren(node.children, itemVar, item, i, keyProp, key, store);
            if (rowEl) {
              frag.appendChild(rowEl);
              const rec = { key, el: rowEl, item, index: i, oldIndex: -1 };
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
            const rec = { key, el: cur, item, index: tailStart + i, oldIndex: -1 };
            if (cur) {
              cur._bzItemKey = key;
              cur._bzStore = store;
              cur = cur.nextElementSibling;
            }
            renderedRecords.push(rec);
            recordMap.set(key, rec);
          }
          Profiler.recordDomOp('create');
          return;
        }

        // Fast-path: In-place update when list length and all keys are identical (common in animations & row updates)
        if (renderedRecords.length === items.length && items.length > 0) {
          let keysMatch = true;
          for (let i = 0; i < items.length; i++) {
            if (renderedRecords[i].key !== keyOf(items[i], i)) {
              keysMatch = false;
              break;
            }
          }
          if (keysMatch) {
            const idxNeeded = usesIndex();
            for (let i = 0; i < items.length; i++) {
              const rec = renderedRecords[i];
              const item = items[i];
              if (rec.item !== item || (idxNeeded && rec.index !== i)) {
                const patched = Renderer.updateItemDOM(rec.el, node.children, itemVar, item, i, store);
                if (!patched) {
                  const rowEl = Renderer.renderItemChildren(node.children, itemVar, item, i, keyProp, rec.key, store);
                  if (rec.el && rec.el.parentNode === container) {
                    container.replaceChild(rowEl, rec.el);
                    Profiler.recordDomOp('remove');
                    Profiler.recordDomOp('create');
                  }
                  rec.el = rowEl;
                }
                rec.item = item;
                rec.index = i;
              }
            }
            return;
          }
        }

        // General Keyed Reconciliation
        const nextRecords = new Array(items.length);
        const nextKeyMap = new Map();
        const seenKeys = new Set();
        const idxNeeded = usesIndex();

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const key = keyOf(item, i);
          if (seenKeys.has(key) && BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
            console.warn(`[Breeze] Duplicate key "${key}" in list "${listKey}" — keys must be unique. Later rows win.`);
          }
          seenKeys.add(key);
          const existing = recordMap.get(key);
          if (existing && !nextKeyMap.has(key)) {
            const oldIndex = existing.index;
            // Reused row! Only patch if content changed or if index changed and template actually uses index
            if (existing.item !== item || (idxNeeded && oldIndex !== i)) {
              const patched = Renderer.updateItemDOM(existing.el, node.children, itemVar, item, i, store);
              if (!patched) {
                // Structural change — recreate row
                const rowEl = Renderer.renderItemChildren(node.children, itemVar, item, i, keyProp, key, store);
                if (existing.el && existing.el.parentNode === container) {
                  container.replaceChild(rowEl, existing.el);
                  Profiler.recordDomOp('remove');
                  Profiler.recordDomOp('create');
                }
                existing.el = rowEl;
              }
              existing.item = item;
            }
            existing.index = i;
            existing.oldIndex = oldIndex;
            nextRecords[i] = existing;
          } else {
            // Newly added row!
            const rowEl = Renderer.renderItemChildren(node.children, itemVar, item, i, keyProp, key, store);
            const rec = { key, el: rowEl, item, index: i, oldIndex: -1 };
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

        // Step 2: Fast-path append, order-maintained, 2-element swap, or LIS reorder
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
          // Check if order is already completely maintained (e.g. after deletions or in-place updates)
          let orderMaintained = true;
          let lastOldIdx = -1;
          for (let i = 0; i < nextRecords.length; i++) {
            const rec = nextRecords[i];
            if (!rec || !rec.el || rec.el.parentNode !== container) {
              orderMaintained = false;
              break;
            }
            const oldIdx = (rec.oldIndex !== undefined && rec.oldIndex !== -1) ? rec.oldIndex : -1;
            if (oldIdx === -1 || oldIdx < lastOldIdx) {
              orderMaintained = false;
              break;
            }
            lastOldIdx = oldIdx;
          }

          if (orderMaintained) {
            // All surviving elements are already in their correct relative positions in the DOM!
            // No DOM moves required!
          } else {
            // Check for exact 2-element swap fast-path
            let swap1 = -1, swap2 = -1, isSwap = false;
            if (renderedRecords.length === nextRecords.length) {
              isSwap = true;
              for (let i = 0; i < nextRecords.length; i++) {
                if (renderedRecords[i].key !== nextRecords[i].key) {
                  if (swap1 === -1) {
                    swap1 = i;
                  } else if (swap2 === -1) {
                    swap2 = i;
                    if (renderedRecords[swap1].key !== nextRecords[swap2].key ||
                        renderedRecords[swap2].key !== nextRecords[swap1].key) {
                      isSwap = false;
                      break;
                    }
                  } else {
                    isSwap = false;
                    break;
                  }
                }
              }
            }

            if (isSwap && swap1 !== -1 && swap2 !== -1) {
              const el1 = renderedRecords[swap1].el;
              const el2 = renderedRecords[swap2].el;
              if (el1 && el2 && el1.parentNode === container && el2.parentNode === container) {
                const s1 = el1.nextSibling;
                const s2 = el2.nextSibling;
                if (s1 === el2) {
                  container.insertBefore(el2, el1);
                } else if (s2 === el1) {
                  container.insertBefore(el1, el2);
                } else {
                  container.insertBefore(el2, s1);
                  container.insertBefore(el1, s2);
                }
                Profiler.recordDomOp('move');
                Profiler.recordDomOp('move');
              }
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
          }
        }

        renderedRecords = nextRecords.filter(rec => rec && rec.el);
        recordMap = nextKeyMap;
      };

      reconcile();
      const unwatch = store.watch(baseWatchKey, () => {
        if (container.isConnected === false) {
          unwatch();
          renderedRecords = [];
          recordMap.clear();
          return;
        }
        reconcile();
      });
      return container;
    },

    renderVirtualEach(node, parentStore) {
      if (typeof document === 'undefined') return null;

      const store = parentStore || (this._root && this._root._bzStore) || State;
      const container = document.createElement('div');
      container.className = 'bz-each bz-virtual-each';
      container._bzStore = store;
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
        const v = store.getPath(listKey);
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
            const rowEl = Renderer.renderItemChildren(node.children, itemVar, slice[i], globalIdx, keyProp, undefined, store);
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
      const unwatch = store.watch(baseWatchKey, () => {
        if (container.isConnected === false) {
          unwatch();
          return;
        }
        renderSlice(true);
      });

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

    renderItemChildren(children, itemVar, item, index, keyProp, key, store) {
      if (!children || children.length === 0) return null;
      const s = store || (this._root && this._root._bzStore) || State;
      const tagKey = (key !== undefined) ? key : ((typeof item === 'object' && item !== null) ? item.id : index);
      if (children.length === 1) {
        const itemNode = this.interpolateItemNode(children[0], itemVar, item, index);
        const el = this.renderNode(itemNode, null, s);
        if (el) {
          el._bzItemKey = tagKey;
          el._bzStore = s;
          try { el.dataset.bzKey = String(tagKey); } catch (_) {}
        }
        return el;
      }
      const wrap = document.createElement('div');
      try { wrap.dataset.bzKey = String(tagKey); } catch (_) {}
      wrap._bzItemKey = tagKey;
      wrap._bzStore = s;
      children.forEach(child => {
        const itemNode = this.interpolateItemNode(child, itemVar, item, index);
        const el = this.renderNode(itemNode, null, s);
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

    rowTemplateUsesIndex(children, itemVar) {
      if (!children || !children.length) return false;
      const targetToken = `${itemVar}.index`;
      const checkNode = (node) => {
        if (!node) return false;
        if (typeof node.text === 'string' && node.text.includes(targetToken)) return true;
        if (Array.isArray(node.modifiers)) {
          for (let i = 0; i < node.modifiers.length; i++) {
            if (String(node.modifiers[i]).includes(targetToken)) return true;
          }
        }
        if (Array.isArray(node.children)) {
          for (let i = 0; i < node.children.length; i++) {
            if (checkNode(node.children[i])) return true;
          }
        }
        return false;
      };
      for (let i = 0; i < children.length; i++) {
        if (checkNode(children[i])) return true;
      }
      return false;
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
      } else if (numGetters === 4) {
        const c0 = chunks[0], c1 = chunks[1], c2 = chunks[2], c3 = chunks[3], c4 = chunks[4];
        const g0 = getters[0], g1 = getters[1], g2 = getters[2], g3 = getters[3];
        renderFn = function (items, startIdx, keys) {
          let out = '';
          const len = items.length;
          for (let i = 0; i < len; i++) {
            const item = items[i], idx = startIdx + i, k = keys[i];
            out += c0 + g0(item, idx, k) + c1 + g1(item, idx, k) + c2 + g2(item, idx, k) + c3 + g3(item, idx, k) + c4;
          }
          return out;
        };
      } else if (numGetters === 5) {
        const c0 = chunks[0], c1 = chunks[1], c2 = chunks[2], c3 = chunks[3], c4 = chunks[4], c5 = chunks[5];
        const g0 = getters[0], g1 = getters[1], g2 = getters[2], g3 = getters[3], g4 = getters[4];
        renderFn = function (items, startIdx, keys) {
          let out = '';
          const len = items.length;
          for (let i = 0; i < len; i++) {
            const item = items[i], idx = startIdx + i, k = keys[i];
            out += c0 + g0(item, idx, k) + c1 + g1(item, idx, k) + c2 + g2(item, idx, k) + c3 + g3(item, idx, k) + c4 + g4(item, idx, k) + c5;
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
        return host.content;
      }
      const frag = document.createDocumentFragment();
      while (source.firstChild) frag.appendChild(source.firstChild);
      return frag;
    },

    /**
     * Compile a static row template into a high-speed surgical DOM patcher.
     * Pre-indexes paths to dynamic text nodes and attributes.
     * When updating an existing row element, executes direct pointer updates in microseconds
     * with zero AST traversal and 100% correctness for arbitrarily nested elements.
     */
    compileRowPatcher(children, itemVar) {
      if (!children || !children.length) return null;
      const patches = [];

      function compileGetter(rawStr) {
        if (rawStr == null || rawStr === '') return () => '';
        if (typeof rawStr !== 'string' || rawStr.indexOf('{') === -1) {
          const s = String(rawStr);
          return () => s;
        }
        const re = /\{([\w.$-]+)\}/g;
        const chunks = [];
        const getters = [];
        let lastIdx = 0;
        let m;
        while ((m = re.exec(rawStr)) !== null) {
          if (m.index > lastIdx) {
            chunks.push(rawStr.slice(lastIdx, m.index));
          } else {
            chunks.push('');
          }
          const key = m[1];
          if (key === `${itemVar}.index`) {
            getters.push((item, i) => String(i));
          } else if (key === itemVar) {
            getters.push((item) => (typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)));
          } else if (key.startsWith(itemVar + '.')) {
            const prop = key.slice(itemVar.length + 1);
            getters.push((item) => (item != null && item[prop] !== undefined && item[prop] !== null ? String(item[prop]) : ''));
          } else {
            getters.push(() => {
              const v = State.getPath(key);
              return v != null ? String(v) : '';
            });
          }
          lastIdx = re.lastIndex;
        }
        if (lastIdx < rawStr.length) {
          chunks.push(rawStr.slice(lastIdx));
        } else {
          chunks.push('');
        }

        const numGetters = getters.length;
        if (numGetters === 1 && chunks[0] === '' && chunks[1] === '') {
          return getters[0];
        }
        if (numGetters === 1) {
          const c0 = chunks[0], c1 = chunks[1], g0 = getters[0];
          return (item, idx) => c0 + g0(item, idx) + c1;
        }
        if (numGetters === 2) {
          const c0 = chunks[0], c1 = chunks[1], c2 = chunks[2], g0 = getters[0], g1 = getters[1];
          return (item, idx) => c0 + g0(item, idx) + c1 + g1(item, idx) + c2;
        }
        if (numGetters === 3) {
          const c0 = chunks[0], c1 = chunks[1], c2 = chunks[2], c3 = chunks[3], g0 = getters[0], g1 = getters[1], g2 = getters[2];
          return (item, idx) => c0 + g0(item, idx) + c1 + g1(item, idx) + c2 + g2(item, idx) + c3;
        }
        return (item, idx) => {
          let res = chunks[0];
          for (let g = 0; g < numGetters; g++) {
            res += getters[g](item, idx) + chunks[g + 1];
          }
          return res;
        };
      }

      function getNodeBaseClass(node) {
        if (!node) return '';
        let baseClass = '';

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
              if (cv.indexOf('{') === -1) {
                baseClass += (baseClass ? ' ' : '') + cv;
              }
            }
            continue;
          }
          if (BZ_BOOL_ATTRS.has(mod)) continue;
          const cls = BZ_CLASS_MAP[mod] || `bz-${mod}`;
          baseClass += (baseClass ? ' ' : '') + cls;
        }
        return baseClass;
      }

      function analyze(node, path) {
        if (!node) return;

        // Dynamic text bindings
        if (node.text != null && typeof node.text === 'string' && node.text.indexOf('{') !== -1) {
          patches.push({
            path: path.slice(),
            type: 'text',
            getter: compileGetter(node.text)
          });
        }

        // Dynamic attribute/class modifiers
        if (Array.isArray(node.modifiers)) {
          const baseClass = getNodeBaseClass(node);
          for (let m = 0; m < node.modifiers.length; m++) {
            const mod = String(node.modifiers[m]);
            if (mod.indexOf('{') !== -1 && mod.includes('=')) {
              const eq = mod.indexOf('=');
              const attr = mod.slice(0, eq).trim();
              const rawVal = mod.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
              patches.push({
                path: path.slice(),
                type: attr === 'class' ? 'class' : 'attr',
                attrName: attr,
                baseClass: attr === 'class' ? baseClass : '',
                getter: compileGetter(rawVal)
              });
            }
          }
        }

        // Children traversal
        if (node.children && node.children.length > 0) {
          for (let c = 0; c < node.children.length; c++) {
            path.push(c);
            analyze(node.children[c], path);
            path.pop();
          }
        }
      }

      const multi = children.length > 1;
      if (!multi) {
        analyze(children[0], []);
      } else {
        for (let c = 0; c < children.length; c++) {
          analyze(children[c], [c]);
        }
      }

      return function patch(rootEl, item, index) {
        if (!rootEl) return false;
        let targets = rootEl._bzPatchTargets;
        if (!targets || targets.length !== patches.length) {
          targets = new Array(patches.length);
          for (let i = 0; i < patches.length; i++) {
            const p = patches[i];
            let target = rootEl;
            const pPath = p.path;
            for (let k = 0; k < pPath.length; k++) {
              if (!target || !target.children) { target = null; break; }
              target = target.children[pPath[k]];
            }
            if (!target) return false;
            let textNode = null;
            if (p.type === 'text') {
              const hasChildNodes = Boolean(target.childNodes);
              const childNodesLen = hasChildNodes ? target.childNodes.length : (target.firstChild ? 1 : 0);
              if (target.firstChild && target.firstChild.nodeType === 3 && childNodesLen <= 1) {
                textNode = target.firstChild;
              }
            }
            targets[i] = { target, textNode };
          }
          rootEl._bzPatchTargets = targets;
        }

        for (let i = 0; i < patches.length; i++) {
          const p = patches[i];
          const tInfo = targets[i];
          const target = tInfo.target;
          if (!target) return false;

          const nextVal = p.getter(item, index);
          if (p.type === 'text') {
            if (tInfo.textNode) {
              if (tInfo.textNode.nodeValue !== nextVal) {
                tInfo.textNode.nodeValue = nextVal;
                Profiler.recordDomOp('text');
              }
            } else {
              const hasChildNodes = Boolean(target.childNodes);
              const childNodesLen = hasChildNodes ? target.childNodes.length : (target.firstChild ? 1 : 0);
              if (target.firstChild && target.firstChild.nodeType === 3 && childNodesLen <= 1) {
                tInfo.textNode = target.firstChild;
                if (tInfo.textNode.nodeValue !== nextVal) {
                  tInfo.textNode.nodeValue = nextVal;
                  Profiler.recordDomOp('text');
                }
              } else if (childNodesLen === 0) {
                target.textContent = nextVal;
                if (target.firstChild && target.firstChild.nodeType === 3) {
                  tInfo.textNode = target.firstChild;
                }
                Profiler.recordDomOp('text');
              } else if (target.textContent !== nextVal) {
                target.textContent = nextVal;
                Profiler.recordDomOp('text');
              }
            }
          } else if (p.type === 'class') {
            const dynamicClass = nextVal ? nextVal.trim() : '';
            const fullClass = p.baseClass
              ? (dynamicClass ? p.baseClass + ' ' + dynamicClass : p.baseClass)
              : dynamicClass;
            if (target.className !== fullClass) {
              target.className = fullClass;
              Profiler.recordDomOp('attr');
            }
          } else if (p.type === 'attr') {
            if (p.attrName === 'style' && target.style) {
              if (target.style.cssText !== nextVal) {
                target.style.cssText = nextVal;
                Profiler.recordDomOp('attr');
              }
            } else if (target.getAttribute && target.getAttribute(p.attrName) !== nextVal) {
              target.setAttribute(p.attrName, nextVal);
              Profiler.recordDomOp('attr');
            }
          }
        }
        return true;
      };
    },

    /** General recursive patcher for dynamic or non-static templates. */
    patchNodeDOM(el, node, itemVar, item, index) {
      if (!el || !node) return false;
      const interpolated = this.interpolateItemNode(node, itemVar, item, index);
      const expectedTag = (interpolated.tag || interpolated.type || '').toLowerCase();
      const actualTag = (el.tagName || '').toLowerCase();
      if (expectedTag && actualTag && expectedTag !== actualTag &&
          !['component', 'def', 'if', 'elif', 'else', 'each', 'virtual-each'].includes(interpolated.type)) {
        return false;
      }
      if (interpolated.text != null) {
        if (el.firstChild && el.firstChild.nodeType === 3 && el.childNodes.length === 1) {
          if (el.firstChild.nodeValue !== interpolated.text) {
            el.firstChild.nodeValue = interpolated.text;
            Profiler.recordDomOp('text');
          }
        } else if (el.textContent !== interpolated.text) {
          el.textContent = interpolated.text;
          Profiler.recordDomOp('text');
        }
      }
      if (Array.isArray(interpolated.modifiers)) {
        this.applyModifiers(el, interpolated.modifiers);
      }
      if (node.children && node.children.length > 0) {
        const elKids = el.children;
        if (!elKids || elKids.length !== node.children.length) return false;
        for (let c = 0; c < node.children.length; c++) {
          if (!this.patchNodeDOM(elKids[c], node.children[c], itemVar, item, index)) {
            return false;
          }
        }
      }
      return true;
    },

    /** Surgical in-place DOM update of a row without recreation.
     *  Returns true if patched in place, false if caller should re-create. */
    updateItemDOM(el, children, itemVar, item, index) {
      if (!el || !children || !children.length) return false;

      // Fast-path: compiled surgical row patcher for static templates
      if (this.isStaticRowTemplate(children, itemVar)) {
        if (!children._bzPatcher) {
          children._bzPatcher = this.compileRowPatcher(children, itemVar);
        }
        if (children._bzPatcher) {
          const success = children._bzPatcher(el, item, index);
          if (success) return true;
        }
      }

      // General recursive fallback
      if (children.length === 1) {
        return this.patchNodeDOM(el, children[0], itemVar, item, index);
      } else {
        const elKids = (el.classList && el.classList.contains('bz-each')) ? el.children : (el.children && el.children.length === children.length ? el.children : []);
        if (!elKids || elKids.length !== children.length) return false;
        for (let c = 0; c < children.length; c++) {
          if (!this.patchNodeDOM(elKids[c], children[c], itemVar, item, index)) {
            return false;
          }
        }
        return true;
      }
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

    evalCondition(node, store) {
      const s = store || State;
      const val = s.getPath(node.conditionKey);
      let truthy = Boolean(val);
      if (node.negate) truthy = !truthy;
      return truthy;
    },

    renderIf(node, store) {
      return this.renderIfChain(node, null, store);
    },

    renderIfChain(node, chain, store) {
      const s = store || (this._root && this._root._bzStore) || State;
      const container = document.createElement('div');
      container.className = 'bz-if';
      container._bzStore = s;

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
          if (this.evalCondition(branches[b].node, s)) {
            this.renderChildrenWithChains(branches[b].node.children || [], container, s);
            matched = true;
            break;
          }
        }
        if (!matched && elseNode) {
          this.renderChildrenWithChains(elseNode.children || [], container, s);
          matched = true;
        }
        container.style.display = matched ? '' : 'none';
      };

      update();
      watchedKeys.forEach(k => {
        const unwatch = s.watch(k, () => {
          if (container.isConnected === false) {
            unwatch();
            return;
          }
          update();
        });
      });
      return container;
    },

    // ── Reactive text binding ─────────────────────────────────────────

    setTextWithBindings(el, text, store) {
      if (!text) return;
      const s = store || (el && el._bzStore) || (this._root && this._root._bzStore) || State;
      const re = /\{([\w.]+)\}/g;
      let m;
      let hasBinding = false;
      while ((m = re.exec(text)) !== null) {
        hasBinding = true;
        const key = m[1].split('.')[0];
        if (!this._bindings[key]) this._bindings[key] = [];
        this._bindings[key].push({ el, template: text, store: s });
      }
      el.textContent = hasBinding ? this.resolveBindings(text, s) : text;
    },

    resolveBindings(tpl, store) {
      if (!tpl) return '';
      const s = store || State;
      return tpl.replace(/\{([\w.]+)\}/g, (_, k) => {
        const parts = k.split('.');
        let v = s.get(parts[0]);
        for (let p = 1; p < parts.length && v != null; p++) {
          v = v[parts[p]];
        }
        return v !== undefined ? String(v) : '';
      });
    },

    updateBindings(key, value, targetStore) {
      const list = this._bindings[key];
      if (!list || !list.length) return;
      const alive = [];
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        if (b.el.isConnected === false) continue;
        if (targetStore && b.store && b.store !== targetStore) {
          alive.push(b);
          continue;
        }
        const newText = this.resolveBindings(b.template, b.store);
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
      const store = (el && el._bzStore) || (this._root && this._root._bzStore) || State;

      modifiers.forEach(mod => {
        mod = mod.trim();
        if (!mod) return;

        // ── Two-way binding: [bind=stateKey] or [bind:value=stateKey] ──
        if (mod.startsWith('bind=') || mod.startsWith('bind:value=')) {
          const key = mod.split('=')[1].trim().replace(/^["']|["']$/g, '');
          const isCheck = el.type === 'checkbox';
          const isRadio = el.type === 'radio';

          const curVal = store.get(key);
          if (isCheck) el.checked = Boolean(curVal);
          else if (isRadio) el.checked = (el.value === String(curVal));
          else el.value = curVal !== undefined ? String(curVal) : '';

          const evt = (isCheck || isRadio || el.tagName === 'SELECT') ? 'change' : 'input';
          el.addEventListener(evt, () => {
            store.set(key, isCheck ? el.checked : el.value);
          });

          const unwatch = store.watch(key, (val) => {
            if (el.isConnected === false) {
              unwatch();
              return;
            }
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
            const v = store.getPath(key);
            el.style.display = v ? '' : 'none';
          };
          apply();
          const unwatch = store.watch(baseKey, () => {
            if (el.isConnected === false) {
              unwatch();
              return;
            }
            apply();
          });
          return;
        }
        if (mod.startsWith('@model=')) {
          const key = mod.slice(7).trim().replace(/^["']|["']$/g, '');
          const curVal = store.getPath(key);
          const baseKey = key.split('.')[0];
          if (el.type === 'checkbox') el.checked = Boolean(curVal);
          else el.value = curVal !== undefined ? String(curVal) : '';
          const evt = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
          el.addEventListener(evt, () => store.set(baseKey, el.type === 'checkbox' ? el.checked : el.value));
          const unwatch = store.watch(baseKey, (val) => {
            if (el.isConnected === false) {
              unwatch();
              return;
            }
            const vv = (key.includes('.') ? store.getPath(key) : val);
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
      const store = (el && el._bzStore) || (this._root && this._root._bzStore) || State;

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
          store.set(parts[0].trim(), parseVal(parts.slice(1).join(',')));
          return;
        }
        let v = setM[2].trim();
        try { v = JSON.parse(v); } catch (e) { v = v.replace(/^["']|["']$/g, ''); }
        store.set(setM[1], v);
        return;
      }

      const incrM = action.match(/^increment\(([\w.$-]+)\)$/);
      if (incrM) { store.set(incrM[1], (store.getPath(incrM[1]) || 0) + 1); return; }

      const decrM = action.match(/^decrement\(([\w.$-]+)\)$/);
      if (decrM) { store.set(decrM[1], (store.getPath(decrM[1]) || 0) - 1); return; }

      const togM = action.match(/^toggle\(([\w.$-]+)\)$/);
      if (togM) { store.set(togM[1], !store.getPath(togM[1])); return; }

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
          store.push(parts[0].trim(), parseVal(parts.slice(1).join(',')));
          return;
        }
        let v = pushM[2].trim();
        try { v = JSON.parse(v); } catch (e) { v = v.replace(/^["']|["']$/g, ''); }
        store.push(pushM[1], v);
        return;
      }

      const remM = action.match(/^remove\(([\w.$-]+),\s*(\d+)\)$/);
      if (remM) {
        store.remove(remM[1], parseInt(remM[2], 10));
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


