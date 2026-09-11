/*!
 * Breeze Framework — Information Page Scripts
 * Handles technical interactions, copy actions, and size metrics verification
 */

(function () {
  'use strict';

  // ── Clipboard Copy Helper ────────────────────────────────────────────────
  window.copySnippet = function (text, btnEl) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast(text));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      showToast(text);
    }
  };

  function showToast(text) {
    let toast = document.getElementById('bz-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'bz-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = `Copied to clipboard: ${text.slice(0, 45)}...`;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2400);
  }

  // ── Real Repository Size Verification ────────────────────────────────────
  // Shipped breeze.js v2 (LIS reorder, template precompile, DX kit, 10 new benches).
  // Regenerate with: node benchmarks/bundle-runner.js
  const SIZES = {
    rawBytes: 136920,
    rawKb: '133.71',
    minBytes: 23674,
    minKb: '23.12',
    gzipBytes: 31375,
    gzipKb: '30.64',
    cssGzipKb: '6.39',
    deps: 0,
    note: 'shipped v2 file (honest, not minified core-only)'
  };

  // ── v2 comfort demo: focusEmail custom action (used by app.breeze #v2) ──
  function registerV2Methods() {
    if (typeof window === 'undefined' || !window.Breeze) return;
    try {
      window.Breeze.method('focusEmail', () => {
        const input = document.querySelector('#v2 input[type="email"]') ||
          document.querySelector('input[type="email"]');
        if (input) {
          input.focus();
          if (window.Breeze.announce) window.Breeze.announce('Email field focused');
        }
      });
    } catch (_) {}
  }

  document.addEventListener('DOMContentLoaded', () => {
    registerV2Methods();
    // Populate dynamic size elements if present
    const liveSizeEl = document.getElementById('live-size-val');
    if (liveSizeEl) {
      liveSizeEl.textContent = SIZES.gzipKb;
    }

    // Auto-expand first FAQ item for pleasant scanning
    const firstFaq = document.querySelector('.faq-item');
    if (firstFaq) {
      firstFaq.setAttribute('open', '');
    }
  });

})();
