import { BreezeAPI } from './api.js';

  // ═══════════════════════════════════════════════════════════════════════
  // COMPONENTS & LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════

  export const Components = {
    _registry: {},
    register(name, def) {
      this._registry[name] = def;
    },
    get(name) {
      return this._registry[name];
    }
  };

  export const Lifecycle = {
    _mountHooks: [],
    _destroyHooks: [],
    _updateHooks: [],

    onMount(fn)   { this._mountHooks.push(fn); },
    onDestroy(fn) { this._destroyHooks.push(fn); },
    onUpdate(fn)  { this._updateHooks.push(fn); },

    triggerMount(root)   { this._mountHooks.forEach(h => h(root)); },
    triggerDestroy()     { this._destroyHooks.forEach(h => h()); },
    triggerUnmount(root) { this._destroyHooks.forEach(h => h(root)); },
    triggerUpdate(state) { this._updateHooks.forEach(h => h(state)); }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // EVENT BUS — Global publish / subscribe
  // ═══════════════════════════════════════════════════════════════════════

  export const EventBus = {
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

  export const Plugins = {
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


