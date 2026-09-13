import { Parser } from './parser.js';
import { State, createStore } from './state.js';
import { Renderer } from './renderer.js';
import { Lifecycle } from './registries.js';

  // ── Web Component Native Custom Element Interop ───────────────────
  export function defineElement(tagName, template, options = {}) {
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
        this._scoped = options.scoped !== false;
        this._store = null;
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
          this._store = this._scoped ? createStore(initial) : State;
          this.store = this._store;
          this.state = this._store;
          this.watch = (k, fn) => this._store.watch(k, fn);
          if (!this._scoped) {
            Object.keys(initial).forEach(k => State.set(k, initial[k]));
          }
          const ast = typeof template === 'string' ? Parser.parse(template) : template;
          Renderer.render(ast, this._root, { store: this._store });
          Lifecycle.triggerMount(this._root);
        }
        if (typeof options.connected === 'function') {
          options.connected.call(this);
        }
      }

      disconnectedCallback() {
        Lifecycle.triggerUnmount(this._root);
        if (this._store && this._scoped) {
          this._store.reset();
        }
        if (typeof options.disconnected === 'function') {
          options.disconnected.call(this);
        }
      }

      attributeChangedCallback(name, oldVal, newVal) {
        if (oldVal !== newVal) {
          let val = newVal;
          try { val = JSON.parse(newVal); } catch (_) { val = newVal; }
          if (this._store) this._store.set(name, val);
          else State.set(name, val);
        }
      }
    }

    customElements.define(tagName, BreezeCustomElement);
    return BreezeCustomElement;
  }

