import { defineElement } from './webcomponents.js';

  // ═══════════════════════════════════════════════════════════════════════
  // ADAPTERS — Plug-and-play React/Vue interoperability layer (v2.3)
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Breeze v2.3 exposes a small, zero-dependency adapter surface that lets
  // React and Vue components participate in Breeze's native Custom Element
  // pipeline without wrapping every component by hand or sacrificing Breeze's
  // fine-grained performance model.
  //
  // Design principles:
  //   1. Framework components are mounted into real DOM nodes (shadow or light).
  //   2. Attribute changes are forwarded as props; DOM events are forwarded as
  //      Breeze events via the standard EventBus.
  //   3. No framework code is bundled — adapters are thin bridges that expect
  //      React/Vue/ReactDOM/Vue runtime to be provided by the host page.
  //   4. Unmounting triggers proper framework teardown to avoid leaks.

  const ADAPTER_REGISTRY = new Map();

  function camelCase(str) {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  }

  function parseAttributeValue(val) {
    if (val === '') return true;
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === 'null') return null;
    if (val === 'undefined') return undefined;
    try { return JSON.parse(val); } catch (_) { return val; }
  }

  function propNamesFromOptions(options) {
    const props = (options && options.props) || [];
    if (Array.isArray(props)) return props;
    return Object.keys(props);
  }

  function buildPropsFromAttributes(el, propList, options) {
    const props = {};
    const declared = (options && options.props) || {};
    for (const name of propList) {
      const attrName = name.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
      if (el.hasAttribute(attrName)) {
        const raw = el.getAttribute(attrName);
        props[name] = parseAttributeValue(raw);
      } else if (declared[name] !== undefined) {
        props[name] = declared[name];
      }
    }
    return props;
  }

  export function registerReactAdapter(tagName, ReactComponent, options) {
    if (typeof window === 'undefined' || !window.React || !window.ReactDOM) {
      throw new Error(
        '[Breeze React Adapter] React and ReactDOM must be available on window. ' +
        'Load them before calling Breeze.adapt.react().'
      );
    }
    const React = window.React;
    const ReactDOM = window.ReactDOM;
    const propList = propNamesFromOptions(options);
    const observedAttributes = propList.map(n => n.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));

    ADAPTER_REGISTRY.set(tagName, { framework: 'react', component: ReactComponent, options });

    defineElement(tagName, '', {
      observedAttributes,
      shadow: !!(options && options.shadow),
      initialState: {},
      connected() {
        const host = (options && options.shadow) ? this.shadowRoot || this.attachShadow({ mode: 'open' }) : this;
        const props = buildPropsFromAttributes(this, propList, options);
        this._bzReactRoot = host;
        this._bzReactProps = props;
        const element = React.createElement(ReactComponent, props);
        this._bzReactRender = () => {
          ReactDOM.render(React.createElement(ReactComponent, this._bzReactProps), host);
        };
        this._bzReactRender();
      },
      attributeChanged(name, oldValue, newValue) {
        if (!this._bzReactProps) return;
        const propName = camelCase(name);
        if (!propList.includes(propName)) return;
        this._bzReactProps[propName] = parseAttributeValue(newValue);
        if (this._bzReactRender) this._bzReactRender();
      },
      disconnected() {
        if (this._bzReactRoot && ReactDOM.unmountComponentAtNode) {
          ReactDOM.unmountComponentAtNode(this._bzReactRoot);
        }
        this._bzReactRoot = null;
        this._bzReactRender = null;
        this._bzReactProps = null;
      }
    });

    return tagName;
  }

  export function registerVueAdapter(tagName, VueComponent, options) {
    if (typeof window === 'undefined' || !window.Vue) {
      throw new Error(
        '[Breeze Vue Adapter] Vue must be available on window. ' +
        'Load it before calling Breeze.adapt.vue().'
      );
    }
    const Vue = window.Vue;
    const propList = propNamesFromOptions(options);
    const observedAttributes = propList.map(n => n.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));

    ADAPTER_REGISTRY.set(tagName, { framework: 'vue', component: VueComponent, options });

    defineElement(tagName, '', {
      observedAttributes,
      shadow: !!(options && options.shadow),
      initialState: {},
      connected() {
        const host = (options && options.shadow) ? this.shadowRoot || this.attachShadow({ mode: 'open' }) : this;
        const props = buildPropsFromAttributes(this, propList, options);
        this._bzVueHost = host;
        this._bzVueProps = props;
        const app = Vue.createApp ? Vue.createApp(VueComponent, props) : new Vue({ render: h => h(VueComponent, { props }) });
        this._bzVueApp = app;
        if (app.mount) {
          app.mount(host);
        } else {
          app.$mount(host);
        }
      },
      attributeChanged(name, oldValue, newValue) {
        if (!this._bzVueApp) return;
        const propName = camelCase(name);
        if (!propList.includes(propName)) return;
        const next = parseAttributeValue(newValue);
        if (this._bzVueApp.props && this._bzVueApp.props[propName] !== undefined) {
          this._bzVueApp.props[propName] = next;
        } else if (this._bzVueApp.$props) {
          this._bzVueApp.$props[propName] = next;
        }
      },
      disconnected() {
        if (this._bzVueApp) {
          if (this._bzVueApp.unmount) this._bzVueApp.unmount();
          else if (this._bzVueApp.$destroy) this._bzVueApp.$destroy();
        }
        this._bzVueApp = null;
        this._bzVueHost = null;
        this._bzVueProps = null;
      }
    });

    return tagName;
  }

  export function mountReact(ReactComponent, host, props) {
    if (typeof window === 'undefined' || !window.React || !window.ReactDOM) {
      throw new Error('[Breeze React Adapter] React and ReactDOM are required.');
    }
    window.ReactDOM.render(window.React.createElement(ReactComponent, props || {}), host);
    return {
      update(nextProps) {
        window.ReactDOM.render(window.React.createElement(ReactComponent, nextProps || props || {}), host);
      },
      unmount() {
        window.ReactDOM.unmountComponentAtNode(host);
      }
    };
  }

  export function mountVue(VueComponent, host, props) {
    if (typeof window === 'undefined' || !window.Vue) {
      throw new Error('[Breeze Vue Adapter] Vue is required.');
    }
    const Vue = window.Vue;
    const app = Vue.createApp ? Vue.createApp(VueComponent, props || {}) : new Vue({ render: h => h(VueComponent, { props: props || {} }) });
    if (app.mount) app.mount(host);
    else app.$mount(host);
    return {
      update(nextProps) {
        if (app.props) Object.assign(app.props, nextProps || {});
        else if (app.$props) Object.assign(app.$props, nextProps || {});
      },
      unmount() {
        if (app.unmount) app.unmount();
        else if (app.$destroy) app.$destroy();
      }
    };
  }

  export const Adapters = {
    react: registerReactAdapter,
    vue: registerVueAdapter,
    mountReact,
    mountVue,
    list() {
      return Array.from(ADAPTER_REGISTRY.entries()).map(([tag, meta]) => ({ tag, framework: meta.framework }));
    }
  };
