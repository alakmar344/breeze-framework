
  // ── Configuration & Robustness System ─────────────────────────────
  export const BreezeConfig = {
    warn: true,
    security: {
      sanitizeUrls: true
    }
  };

  let _activeErrorBoundary = null;

  export function reportError(err, context = 'runtime') {
    if (_activeErrorBoundary && typeof _activeErrorBoundary === 'function') {
      try {
        _activeErrorBoundary(err, context);
        return;
      } catch (_) {}
    }
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      try {
        EventBus.emit('breeze:error', { error: err, context });
      } catch (_) {}
    }
    if (BreezeConfig.warn && typeof console !== 'undefined' && console.error) {
      console.error(`[Breeze Error in ${context}]:`, err);
    }
  }

  export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return url;
    if (!BreezeConfig.security.sanitizeUrls) return url;
    const trimmed = url.replace(/[\x00-\x1f\x7f-\x9f\s]+/g, '');
    if (/^(?:javascript|vbscript):/i.test(trimmed)) {
      if (BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
        console.warn(`[Breeze Security] Blocked dangerous pseudo-protocol URL: "${url}"`);
      }
      return 'about:blank';
    }
    if (/^data:text\/html/i.test(trimmed)) {
      if (BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
        console.warn(`[Breeze Security] Blocked dangerous data:text/html URL: "${url}"`);
      }
      return 'about:blank';
    }
    return url;
  }

