import { sanitizeUrl } from './config.js';
import { Parser } from './parser.js';
import { BZ_CLASS_MAP } from './row-compiler.js';
import { State, isUnsafeKeySegment } from './state.js';
import { Renderer } from './renderer.js';

  // ═══════════════════════════════════════════════════════════════════════
  // SERVER-SIDE RENDERING (SSR) & HYDRATION
  // ═══════════════════════════════════════════════════════════════════════

  export function escHtml(str) {
    if (str == null) return '';
    const s = typeof str === 'string' ? str : String(str);
    // v2.4: the overwhelming majority of SSR text (ids, labels, numbers, plain
    // prose) contains none of &<>. A single scan that bails early skips three
    // full-string regex replaces + their allocations for that common case.
    if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1) return s;
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  export function escAttr(str) {
    if (str == null) return '';
    const s = typeof str === 'string' ? str : String(str);
    if (s.indexOf('&') === -1 && s.indexOf('<') === -1 && s.indexOf('>') === -1 && s.indexOf('"') === -1) return s;
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  export function renderToString(sourceOrAst, initialState) {
    const ast = typeof sourceOrAst === 'string' ? Parser.parse(sourceOrAst) : sourceOrAst;
    const store = Object.assign({}, State._store, initialState || {});
    const getPath = (key) => {
      if (!key) return undefined;
      const parts = String(key).split('.');
      if (parts.some(isUnsafeKeySegment)) return undefined;
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
      // v2.4: resolve via the memoized template splitter instead of a fresh
      // per-call RegExp + replace-callback closure. Semantics are identical to
      // the previous `/\{([\w.$-]+)\}/g` replace (same token grammar, same
      // dotted-path descent, same undefined→'' rule).
      if (typeof str !== 'string' || str.indexOf('{') === -1) return str;
      const tpl = Parser.compileTemplate(str);
      if (tpl.static) return str;
      let out = tpl.parts[0];
      for (let i = 0; i < tpl.keys.length; i++) {
        const k = tpl.keys[i];
        let v;
        if (k.indexOf('.') === -1) {
          v = store[k];
        } else {
          const parts = k.split('.');
          v = store[parts[0]];
          for (let p = 1; p < parts.length && v != null; p++) v = v[parts[p]];
        }
        out += (v !== undefined ? escHtml(String(v)) : '') + tpl.parts[i + 1];
      }
      return out;
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
        // v2.4: single-pass token substitution via the precompiled-template
        // splitter instead of building one `new RegExp` per prop per string.
        // For a component instantiated N times with M props this turned an
        // O(N·M) RegExp-construction + full-string-rescan cost into a single
        // O(tokens) walk, and also removes the accidental re-substitution a
        // prop value containing another `{prop}` used to trigger.
        const rep = (s) => {
          if (typeof s !== 'string' || s.indexOf('{') === -1) return s;
          const tpl = Parser.compileTemplate(s);
          if (tpl.static) return s;
          let out = tpl.parts[0];
          for (let i = 0; i < tpl.keys.length; i++) {
            const k = tpl.keys[i];
            out += (k in props ? escHtml(String(props[k])) : '{' + k + '}') + tpl.parts[i + 1];
          }
          return out;
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

