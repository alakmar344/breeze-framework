import { sanitizeUrl } from './config.js';
import { Parser } from './parser.js';
import { Directives } from './dx.js';

  // ═══════════════════════════════════════════════════════════════════════
  // SHARED CLASS MAP — single source of truth for Renderer.applyModifiers,
  // SSR parity and the static-row HTML fast path.
  // ═══════════════════════════════════════════════════════════════════════

  export const BZ_CLASS_MAP = {
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

  export const BZ_BOOL_ATTRS = new Set([
    'disabled', 'checked', 'readonly', 'required',
    'selected', 'multiple', 'autofocus'
  ]);

  // ── Static-row HTML helpers (module scope: zero per-row closures) ───
  // Fast escaping with identical semantics to escHtml/escAttr: values without
  // special chars (the common case: ids, labels) skip the regexes entirely.
  export function escHtmlFast(s) {
    if (s == null) return '';
    const str = typeof s === 'string' ? s : String(s);
    if (str.indexOf('&') === -1 && str.indexOf('<') === -1 && str.indexOf('>') === -1) return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  export function escAttrFast(s) {
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

  export function bzTplText(str, itemVar, item, isObj, index) {
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
  export function bzModsHtml(mods, itemVar, item, isObj, index) {
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


