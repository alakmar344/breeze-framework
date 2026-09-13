import { enableDiagTracking } from './reactive.js';
import { State } from './state.js';

  // ═══════════════════════════════════════════════════════════════════════
  // PROFILER & DIAGNOSTICS
  // ═══════════════════════════════════════════════════════════════════════

  export const Profiler = {
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
  export const DevToolsHUD = {
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
        if (Profiler._enabled) { enableDiagTracking(); DevToolsHUD.mount(); }
        else if (DevToolsHUD._el) DevToolsHUD._el.remove();
      }
    });
  }

