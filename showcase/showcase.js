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
  // Shipped breeze.js (v1.1.0, with if/elif/else chains, component params,
  // SSR parity, portable router, non-destructive hydrate). Regenerate with:
  // node -e "const fs=require('fs'),z=require('zlib');const b=fs.readFileSync('breeze.js');console.log((z.gzipSync(b,{level:9}).length/1024).toFixed(2))"
  const SIZES = {
    rawBytes: 115937,
    rawKb: '113.22',
    minBytes: 23674,
    minKb: '23.12',
    gzipBytes: 25200,
    gzipKb: '24.61',
    cssGzipKb: '5.90',
    deps: 0,
    note: 'shipped file (not minified core-only)'
  };

  document.addEventListener('DOMContentLoaded', () => {
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
