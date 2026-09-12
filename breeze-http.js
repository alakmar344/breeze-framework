/*!
 * Breeze HTTP v1.0.0 — production-grade data layer for the Breeze framework
 * Zero dependencies. Built entirely on web standards: fetch, Headers, URL,
 * AbortController, URLSearchParams. Runs in browsers, Node 18+, Deno, Bun,
 * Cloudflare Workers and other edge runtimes with a global `fetch`.
 *
 * Design goals:
 *   - Tiny simple cases: http.get(url) -> parsed body
 *   - Powerful complex cases: retries, backoff, interceptors, auth refresh,
 *     caching, dedup/coalescing, stale-while-revalidate, cancellation.
 *   - Never surprise: typed HttpError, safe defaults, no silent data loss.
 *
 * MIT License
 */
(function (global, factory) {
  'use strict';
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
    module.exports.default = mod;
  }
  // Attach to global for script-tag / global-Breeze usage.
  if (global) {
    global.BreezeHttp = mod;
    if (global.Breeze && typeof global.Breeze === 'object') {
      // Merge into an existing Breeze global without clobbering it.
      mod.installInto(global.Breeze);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this), function () {
  'use strict';

  // ── Environment guards ────────────────────────────────────────────────
  const hasFetch = typeof fetch === 'function';
  const HAS_ABORT_ANY = typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function';

  // ═══════════════════════════════════════════════════════════════════════
  // Typed errors
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * The single error type thrown by the client. `code` distinguishes the
   * failure class so callers can branch without string matching messages.
   *   HTTP    — a non-2xx response was received (unless throwHttpErrors:false)
   *   TIMEOUT — the per-request timeout elapsed
   *   ABORTED — the caller aborted via an AbortSignal
   *   NETWORK — fetch itself rejected (DNS, offline, CORS, connection reset)
   *   PARSE   — the body could not be decoded to the requested type
   */
  class HttpError extends Error {
    constructor(message, { code, status, statusText, response, data, request, cause } = {}) {
      super(message);
      this.name = 'HttpError';
      this.code = code || 'HTTP';
      this.status = status != null ? status : 0;
      this.statusText = statusText || '';
      this.response = response || null;
      this.data = data;              // parsed error body when available
      this.request = request || null; // { method, url }
      if (cause) this.cause = cause;
    }
    get isHttpError() { return true; }
    get timeout() { return this.code === 'TIMEOUT'; }
    get aborted() { return this.code === 'ABORTED'; }
    get network() { return this.code === 'NETWORK'; }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // URL + query helpers
  // ═══════════════════════════════════════════════════════════════════════

  const ABSOLUTE_RE = /^([a-z][a-z0-9+.-]*:)?\/\//i;

  function joinURL(base, path) {
    if (!base) return path;
    if (!path) return base;
    if (ABSOLUTE_RE.test(path)) return path;            // already absolute
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path; // has a scheme (data:, mailto:)
    const b = base.replace(/\/+$/, '');
    const p = String(path).replace(/^\/+/, '');
    return b + '/' + p;
  }

  // Serialize a params object into a query string. Arrays repeat the key.
  // null/undefined values are skipped. Nested objects are JSON-encoded.
  function encodeQuery(params, arrayFormat) {
    if (!params) return '';
    if (typeof params === 'string') return params.replace(/^\?/, '');
    if (params instanceof URLSearchParams) return params.toString();
    const sp = new URLSearchParams();
    const add = (key, value) => {
      if (value === null || value === undefined) return;
      if (value instanceof Date) { sp.append(key, value.toISOString()); return; }
      if (typeof value === 'object') { sp.append(key, JSON.stringify(value)); return; }
      sp.append(key, String(value));
    };
    for (const key of Object.keys(params)) {
      const val = params[key];
      if (Array.isArray(val)) {
        if (arrayFormat === 'bracket') val.forEach((v) => add(key + '[]', v));
        else if (arrayFormat === 'comma') { const f = val.filter((v) => v != null); if (f.length) sp.append(key, f.join(',')); }
        else val.forEach((v) => add(key, v)); // 'repeat' (default)
      } else {
        add(key, val);
      }
    }
    return sp.toString();
  }

  function withQuery(url, params, arrayFormat) {
    const q = encodeQuery(params, arrayFormat);
    if (!q) return url;
    const hashIdx = url.indexOf('#');
    const hash = hashIdx >= 0 ? url.slice(hashIdx) : '';
    const bare = hashIdx >= 0 ? url.slice(0, hashIdx) : url;
    return bare + (bare.indexOf('?') >= 0 ? '&' : '?') + q + hash;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Body encoding + response parsing
  // ═══════════════════════════════════════════════════════════════════════

  function isPlainBody(body) {
    if (body == null) return false;
    if (typeof body === 'string') return false;
    if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
    if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
    if (typeof ArrayBuffer !== 'undefined' && (body instanceof ArrayBuffer || ArrayBuffer.isView(body))) return false;
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
    if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) return false;
    return typeof body === 'object' || typeof body === 'number' || typeof body === 'boolean';
  }

  // Returns { body, contentType } — contentType is null when fetch/browser
  // should decide (FormData boundary, Blob type, etc.).
  function encodeBody(body) {
    if (body == null) return { body: undefined, contentType: null };
    if (isPlainBody(body)) return { body: JSON.stringify(body), contentType: 'application/json' };
    return { body, contentType: null };
  }

  const EMPTY_STATUS = new Set([204, 205, 304]);

  async function parseResponse(response, responseType) {
    // Explicit passthrough for streaming / raw consumers.
    if (responseType === 'stream') return response.body;
    if (responseType === 'response') return response;

    if (EMPTY_STATUS.has(response.status)) return null;

    if (responseType === 'blob') return response.blob();
    if (responseType === 'arrayBuffer') return response.arrayBuffer();
    if (responseType === 'text') return response.text();

    if (responseType === 'json') {
      const raw = await response.text();
      if (!raw) return null; // empty body on a 200 -> null, never a parse crash
      try { return JSON.parse(raw); }
      catch (err) { throw new HttpError('Malformed JSON response', { code: 'PARSE', status: response.status, statusText: response.statusText, response, cause: err }); }
    }

    // 'auto' (default): negotiate on Content-Type.
    const ct = (response.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json') || ct.includes('+json')) {
      const raw = await response.text();
      if (!raw) return null;
      try { return JSON.parse(raw); }
      catch (err) { throw new HttpError('Malformed JSON response', { code: 'PARSE', status: response.status, statusText: response.statusText, response, cause: err }); }
    }
    if (ct.startsWith('text/') || ct.includes('xml') || ct.includes('csv') || ct.includes('javascript') || ct === '') {
      return response.text();
    }
    // Unknown binary content -> hand back a Blob (browser) or ArrayBuffer (node).
    if (typeof Blob !== 'undefined') return response.blob();
    return response.arrayBuffer();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Retry policy
  // ═══════════════════════════════════════════════════════════════════════

  const IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
  const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

  function normalizeRetry(retry) {
    if (retry == null || retry === false) return { attempts: 0 };
    if (retry === true) retry = {};
    if (typeof retry === 'number') retry = { attempts: retry };
    return {
      attempts: retry.attempts != null ? retry.attempts : 2,   // total extra tries
      minDelay: retry.minDelay != null ? retry.minDelay : 200,
      maxDelay: retry.maxDelay != null ? retry.maxDelay : 10000,
      factor: retry.factor != null ? retry.factor : 2,
      jitter: retry.jitter !== false,
      methods: retry.methods ? new Set(retry.methods.map((m) => m.toUpperCase())) : IDEMPOTENT,
      statuses: retry.statuses ? new Set(retry.statuses) : RETRY_STATUS,
      respectRetryAfter: retry.respectRetryAfter !== false,
      shouldRetry: typeof retry.shouldRetry === 'function' ? retry.shouldRetry : null,
    };
  }

  function backoffDelay(policy, attempt) {
    const base = policy.minDelay * Math.pow(policy.factor, attempt);
    const capped = Math.min(base, policy.maxDelay);
    if (!policy.jitter) return capped;
    // Full jitter: random in [0, capped] — decorrelates retry storms.
    return Math.random() * capped;
  }

  function parseRetryAfter(response) {
    if (!response) return null;
    const h = response.headers.get('retry-after');
    if (!h) return null;
    const secs = Number(h);
    if (!Number.isNaN(secs)) return Math.max(0, secs * 1000);
    const date = Date.parse(h);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
    return null;
  }

  function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(abortError(signal));
      const t = setTimeout(() => { cleanup(); resolve(); }, ms);
      const onAbort = () => { cleanup(); reject(abortError(signal)); };
      function cleanup() { clearTimeout(t); if (signal) signal.removeEventListener('abort', onAbort); }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function abortError(signal) {
    const reason = signal && signal.reason;
    if (reason instanceof HttpError) return reason;
    return new HttpError('Request aborted', { code: 'ABORTED', cause: reason });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // In-memory cache (TTL + optional stale-while-revalidate)
  // ═══════════════════════════════════════════════════════════════════════

  class HttpCache {
    constructor(max = 500) { this._map = new Map(); this._max = max; }
    _evict() {
      // Simple LRU: Map preserves insertion order; oldest key is first.
      while (this._map.size > this._max) {
        const oldest = this._map.keys().next().value;
        this._map.delete(oldest);
      }
    }
    get(key) {
      const e = this._map.get(key);
      if (!e) return undefined;
      // refresh recency
      this._map.delete(key); this._map.set(key, e);
      return e;
    }
    set(key, data, ttl, staleTtl) {
      const now = Date.now();
      this._map.delete(key);
      this._map.set(key, {
        data,
        freshUntil: ttl > 0 ? now + ttl : (ttl === Infinity ? Infinity : 0),
        staleUntil: staleTtl > 0 ? now + staleTtl : 0,
      });
      this._evict();
    }
    delete(key) { return this._map.delete(key); }
    clear() { this._map.clear(); }
    // Invalidate by exact key, RegExp, prefix string, or predicate fn.
    invalidate(matcher) {
      if (matcher == null) { this.clear(); return; }
      for (const key of Array.from(this._map.keys())) {
        let hit = false;
        if (typeof matcher === 'function') hit = matcher(key);
        else if (matcher instanceof RegExp) hit = matcher.test(key);
        else hit = key === matcher || key.indexOf(matcher) >= 0;
        if (hit) this._map.delete(key);
      }
    }
  }

  function normalizeCacheOpt(cache) {
    if (cache == null || cache === false || cache === 'no-store') return null;
    if (cache === true || cache === 'default') return { ttl: 0, swr: 0 };
    if (typeof cache === 'number') return { ttl: cache, swr: 0 };
    return { ttl: cache.ttl || 0, swr: cache.swr || cache.staleWhileRevalidate || 0, key: cache.key };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Interceptor registry
  // ═══════════════════════════════════════════════════════════════════════

  function makeInterceptor() {
    const handlers = [];
    return {
      use(fn) { handlers.push(fn); return handlers.length - 1; },
      eject(id) { if (handlers[id]) handlers[id] = null; },
      clear() { handlers.length = 0; },
      _handlers: handlers,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Client
  // ═══════════════════════════════════════════════════════════════════════

  function createClient(config = {}) {
    config = Object.assign({}, config);
    const cache = config.cache instanceof HttpCache ? config.cache : new HttpCache(config.cacheMax || 500);
    const inflight = new Map(); // dedup: key -> Promise
    const interceptors = {
      request: makeInterceptor(),
      response: makeInterceptor(),
      error: makeInterceptor(),
    };
    let refreshInFlight = null; // single-flight token refresh

    function mergeHeaders(...sources) {
      const h = new Headers();
      for (const src of sources) {
        if (!src) continue;
        const entries = src instanceof Headers ? src : new Headers(normalizeHeaderInit(src));
        entries.forEach((v, k) => h.set(k, v));
      }
      return h;
    }

    function normalizeHeaderInit(obj) {
      // Drop null/undefined header values so callers can delete inherited headers.
      const out = {};
      for (const k of Object.keys(obj)) { if (obj[k] != null) out[k] = String(obj[k]); }
      return out;
    }

    async function applyAuth(headers, opts) {
      const auth = opts.auth !== undefined ? opts.auth : config.auth;
      if (!auth) return;
      let token = typeof auth === 'function' ? await auth() : auth;
      if (!token) return;
      if (typeof token === 'string' && !headers.has('authorization')) {
        headers.set('authorization', token.startsWith('Bearer ') || token.includes(' ') ? token : 'Bearer ' + token);
      } else if (typeof token === 'object' && token.header && !headers.has(token.header.toLowerCase())) {
        headers.set(token.header, token.value);
      }
    }

    function cacheKeyFor(ctx) {
      if (ctx.cacheOpt && ctx.cacheOpt.key) return ctx.cacheOpt.key;
      // Body is included so different POST-as-query reads don't collide; for GET
      // there is normally no body.
      const bodyKey = ctx.rawBody != null && typeof ctx.rawBody !== 'object' ? String(ctx.rawBody)
        : (isPlainBody(ctx.rawBody) ? JSON.stringify(ctx.rawBody) : '');
      return ctx.method + ' ' + ctx.url + (bodyKey ? ' ' + bodyKey : '');
    }

    // Perform one network attempt, honoring timeout + external abort.
    async function attempt(ctx) {
      const controller = new AbortController();
      const signals = [controller.signal];
      if (ctx.externalSignal) signals.push(ctx.externalSignal);

      let combined;
      if (signals.length === 1) combined = signals[0];
      else if (HAS_ABORT_ANY) combined = AbortSignal.any(signals);
      else {
        // Manual composition for older runtimes.
        combined = controller.signal;
        const onExt = () => controller.abort(ctx.externalSignal.reason);
        if (ctx.externalSignal.aborted) controller.abort(ctx.externalSignal.reason);
        else ctx.externalSignal.addEventListener('abort', onExt, { once: true });
      }

      let timer = null;
      let timedOut = false;
      if (ctx.timeout > 0) {
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, ctx.timeout);
      }

      try {
        const response = await ctx.fetchImpl(ctx.url, {
          method: ctx.method,
          headers: ctx.headers,
          body: ctx.body,
          signal: combined,
          credentials: ctx.credentials,
          mode: ctx.mode,
          cache: ctx.fetchCache,
          redirect: ctx.redirect,
          referrerPolicy: ctx.referrerPolicy,
          keepalive: ctx.keepalive,
        });
        return response;
      } catch (err) {
        if (timedOut) throw new HttpError(`Request timed out after ${ctx.timeout}ms`, { code: 'TIMEOUT', request: { method: ctx.method, url: ctx.url }, cause: err });
        if (err instanceof HttpError) throw err;
        const isAbort = err && (err.name === 'AbortError' || (ctx.externalSignal && ctx.externalSignal.aborted));
        if (isAbort) throw abortError(ctx.externalSignal || combined);
        throw new HttpError(err && err.message ? err.message : 'Network request failed', { code: 'NETWORK', request: { method: ctx.method, url: ctx.url }, cause: err });
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    async function runWithRetry(ctx) {
      const policy = ctx.retry;
      let attemptNum = 0;
      // total tries = attempts + 1
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let response = null;
        let error = null;
        try {
          response = await attempt(ctx);
        } catch (err) {
          error = err;
        }

        // Decide whether to retry.
        const canRetryMethod = policy.attempts > 0 && policy.methods.has(ctx.method) && attemptNum < policy.attempts;
        const isAbortOrTimeout = error && (error.code === 'ABORTED');
        let doRetry = false;
        if (!isAbortOrTimeout && canRetryMethod) {
          if (policy.shouldRetry) {
            doRetry = await policy.shouldRetry({ error, response, attempt: attemptNum, ctx });
          } else if (error) {
            doRetry = error.code === 'NETWORK' || error.code === 'TIMEOUT';
          } else if (response && policy.statuses.has(response.status)) {
            doRetry = true;
          }
        }

        if (doRetry) {
          let waitMs = backoffDelay(policy, attemptNum);
          if (policy.respectRetryAfter) {
            const ra = parseRetryAfter(response);
            if (ra != null) waitMs = ra;
          }
          attemptNum++;
          await sleep(waitMs, ctx.externalSignal);
          // Drain the previous body to avoid leaking connections.
          if (response && response.body && typeof response.body.cancel === 'function') { try { response.body.cancel(); } catch (_) {} }
          continue;
        }

        if (error) throw error;
        return response;
      }
    }

    // Core request. Returns parsed body by default (or full result if opts.raw).
    async function request(method, url, opts = {}) {
      if (!hasFetch && !config.fetch && !opts.fetch) {
        throw new HttpError('No global fetch available in this runtime; pass { fetch } to createClient', { code: 'NETWORK' });
      }
      method = method.toUpperCase();

      // Build context object shared with interceptors.
      let ctx = {
        method,
        url,
        baseURL: opts.baseURL !== undefined ? opts.baseURL : config.baseURL,
        params: opts.params,
        query: opts.query || opts.params,
        rawBody: opts.body,
        headers: opts.headers,
        responseType: opts.responseType || config.responseType || 'auto',
        timeout: opts.timeout !== undefined ? opts.timeout : (config.timeout || 0),
        credentials: opts.credentials !== undefined ? opts.credentials : config.credentials,
        mode: opts.mode,
        redirect: opts.redirect,
        referrerPolicy: opts.referrerPolicy,
        keepalive: opts.keepalive,
        fetchCache: opts.fetchCache,
        externalSignal: opts.signal,
        meta: opts.meta || {},
        fetchImpl: opts.fetch || config.fetch || fetch,
        _opts: opts,
      };

      // Run request interceptors (may mutate/replace ctx).
      for (const h of interceptors.request._handlers) {
        if (!h) continue;
        const res = await h(ctx);
        if (res) ctx = res;
      }

      // Resolve final URL: base + path + query.
      ctx.url = withQuery(joinURL(ctx.baseURL, ctx.url), ctx.query, config.arrayFormat || opts.arrayFormat);

      // Build headers.
      const headers = mergeHeaders(config.headers, ctx.headers);
      const enc = (method === 'GET' || method === 'HEAD') ? { body: undefined, contentType: null } : encodeBody(ctx.rawBody);
      if (enc.contentType && !headers.has('content-type')) headers.set('content-type', enc.contentType);
      if (ctx.responseType === 'json' && !headers.has('accept')) headers.set('accept', 'application/json');
      await applyAuth(headers, opts);
      ctx.headers = headers;
      ctx.body = enc.body;
      ctx.retry = normalizeRetry(opts.retry !== undefined ? opts.retry : config.retry);

      // Caching + dedup (reads only, unless explicitly enabled).
      ctx.cacheOpt = normalizeCacheOpt(opts.cache !== undefined ? opts.cache : (method === 'GET' ? config.cache : null));
      const cacheable = !!ctx.cacheOpt && (method === 'GET' || opts.cache != null);
      const dedupe = opts.dedupe !== undefined ? opts.dedupe : (config.dedupe !== false && method === 'GET');
      const key = (cacheable || dedupe) ? cacheKeyFor(ctx) : null;

      if (cacheable && !opts.cacheBust) {
        const entry = cache.get(key);
        if (entry) {
          const now = Date.now();
          const fresh = entry.freshUntil === Infinity || entry.freshUntil > now;
          if (fresh) return finalize(entry.data, opts, null, ctx, true);
          const staleOk = entry.staleUntil && entry.staleUntil > now;
          if (staleOk) {
            // stale-while-revalidate: return stale now, refresh in background.
            // Pass the ORIGINAL (unresolved) url + opts so the revalidation
            // request re-derives the identical cache key and does not double-
            // append query params.
            revalidate(method, url, opts).catch(() => {});
            return finalize(entry.data, opts, null, ctx, true);
          }
        }
      }

      if (dedupe && inflight.has(key)) {
        return inflight.get(key);
      }

      const promise = execute(ctx, key, cacheable, opts);
      if (dedupe && key) {
        inflight.set(key, promise);
        // Clean up the in-flight entry on settle. Provide BOTH handlers so this
        // bookkeeping chain never surfaces as an unhandled rejection — the
        // caller's own `promise` reference remains the sole rejection consumer.
        const cleanup = () => { if (inflight.get(key) === promise) inflight.delete(key); };
        promise.then(cleanup, cleanup);
      }
      return promise;
    }

    async function execute(ctx, key, cacheable, opts) {
      let response;
      try {
        response = await runWithRetry(ctx);
      } catch (err) {
        return handleError(err, ctx, opts);
      }

      // Run response interceptors.
      for (const h of interceptors.response._handlers) {
        if (!h) continue;
        const r = await h(response, ctx);
        if (r) response = r;
      }

      // Auth refresh: 401 -> refresh once -> retry the original request.
      const onUnauthorized = opts.onUnauthorized || config.onUnauthorized;
      if (response.status === 401 && onUnauthorized && !ctx._refreshed) {
        try {
          if (!refreshInFlight) refreshInFlight = Promise.resolve(onUnauthorized(ctx)).finally(() => { refreshInFlight = null; });
          const ok = await refreshInFlight;
          if (ok !== false) {
            const retried = Object.assign({}, ctx, { _refreshed: true });
            // Re-apply auth header with the (hopefully) refreshed token.
            retried.headers = mergeHeaders(config.headers, opts.headers);
            const enc = (ctx.method === 'GET' || ctx.method === 'HEAD') ? { body: undefined } : encodeBody(ctx.rawBody);
            retried.body = enc.body;
            await applyAuth(retried.headers, opts);
            response = await runWithRetry(retried);
          }
        } catch (_) { /* fall through to normal error handling below */ }
      }

      if (!response.ok && (opts.throwHttpErrors !== false && config.throwHttpErrors !== false)) {
        let data;
        try { data = await parseResponse(response.clone ? response.clone() : response, ctx.responseType); } catch (_) { data = undefined; }
        const err = new HttpError(`Request failed with status ${response.status}`, {
          code: 'HTTP', status: response.status, statusText: response.statusText,
          response, data, request: { method: ctx.method, url: ctx.url },
        });
        return handleError(err, ctx, opts);
      }

      const data = await parseResponse(response, ctx.responseType);
      if (cacheable && key && ctx.method === 'GET') {
        cache.set(key, data, ctx.cacheOpt.ttl || 0, ctx.cacheOpt.swr || 0);
      }
      return finalize(data, opts, response, ctx, false);
    }

    async function handleError(err, ctx, opts) {
      let finalErr = err;
      for (const h of interceptors.error._handlers) {
        if (!h) continue;
        try {
          const r = await h(finalErr, ctx);
          if (r !== undefined) {
            // An error interceptor may recover by returning a value.
            return finalize(r, opts, null, ctx, false);
          }
        } catch (e) { finalErr = e; }
      }
      throw finalErr;
    }

    function finalize(data, opts, response, ctx, fromCache) {
      if (opts.raw || opts.meta && opts.meta.raw) {
        return { data, response, status: response ? response.status : (fromCache ? 200 : 0), headers: response ? response.headers : null, fromCache };
      }
      return data;
    }

    // Background revalidation for SWR. Re-runs the request from the original
    // (unresolved) url + opts with cacheBust so it re-derives the identical
    // cache key and writes fresh data under it.
    async function revalidate(method, url, opts) {
      const freshOpts = Object.assign({}, opts, { cacheBust: true, dedupe: false });
      await request(method, url, freshOpts);
    }

    // Public sugar.
    const client = {
      request,
      get: (url, opts) => request('GET', url, opts),
      delete: (url, opts) => request('DELETE', url, opts),
      head: (url, opts) => request('HEAD', url, opts),
      options: (url, opts) => request('OPTIONS', url, opts),
      post: (url, body, opts) => request('POST', url, Object.assign({}, opts, { body })),
      put: (url, body, opts) => request('PUT', url, Object.assign({}, opts, { body })),
      patch: (url, body, opts) => request('PATCH', url, Object.assign({}, opts, { body })),
      interceptors,
      cache,
      config,
      // Derive a child client with merged config (baseURL, headers, etc.).
      extend(extra = {}) {
        const merged = Object.assign({}, config, extra);
        if (config.headers || extra.headers) {
          merged.headers = Object.assign({}, config.headers, extra.headers);
        }
        merged.cache = cache; // share cache by default
        return createClient(merged);
      },
    };
    return client;
  }

  // Default shared client.
  const http = createClient();

  // ═══════════════════════════════════════════════════════════════════════
  // Reactive resource() — async state bound to Breeze signals.
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Build a resource() factory bound to a reactive `signal` implementation.
   * When loaded inside Breeze this is wired automatically to Breeze.signal.
   *
   *   const users = resource(() => http.get('/users'))
   *   users.data.value      // T | undefined
   *   users.error.value     // HttpError | null
   *   users.loading.value   // boolean
   *   users.refetch()       // re-run the fetcher
   *   users.mutate(next)    // optimistic local update (value or updater fn)
   */
  function makeResource(signalFactory) {
    if (typeof signalFactory !== 'function') {
      throw new Error('makeResource requires a signal factory');
    }
    return function resource(fetcher, options = {}) {
      const data = signalFactory(options.initialData !== undefined ? options.initialData : undefined);
      const error = signalFactory(null);
      const loading = signalFactory(false);
      const fetching = signalFactory(false);
      let controller = null;
      let runId = 0;

      async function load(runOpts = {}) {
        const id = ++runId;
        if (controller) { try { controller.abort(); } catch (_) {} }
        controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const isInitial = data.peek() === undefined || runOpts.reset;
        if (isInitial) loading.value = true;
        fetching.value = true;
        error.value = null;
        try {
          const result = await fetcher({ signal: controller ? controller.signal : undefined, refetch: () => load({}) });
          if (id !== runId) return; // a newer run superseded this one
          data.value = result;
          error.value = null;
        } catch (err) {
          if (id !== runId) return;
          if (err && err.code === 'ABORTED') return; // superseded/cancelled: ignore
          error.value = err;
          if (typeof options.onError === 'function') options.onError(err);
        } finally {
          if (id === runId) { loading.value = false; fetching.value = false; }
        }
      }

      const api = {
        data, error, loading, fetching,
        refetch: (o) => load(o || {}),
        abort() { if (controller) { try { controller.abort(); } catch (_) {} } },
        // Optimistic / local mutation. `next` is a value or (prev) => next.
        mutate(next) {
          data.value = typeof next === 'function' ? next(data.peek()) : next;
          return data.value;
        },
      };

      if (options.immediate !== false) load({});
      return api;
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Public module surface
  // ═══════════════════════════════════════════════════════════════════════

  const api = {
    version: '1.0.0',
    createClient,
    http,
    HttpError,
    HttpCache,
    // Low-level helpers (exported for testing + advanced composition).
    encodeQuery,
    withQuery,
    joinURL,
    encodeBody,
    parseResponse,
    makeResource,
    // Install onto an existing Breeze global, wiring resource() to Breeze.signal.
    installInto(Breeze) {
      if (!Breeze || Breeze.__httpInstalled) return Breeze;
      Breeze.createClient = createClient;
      Breeze.http = http;
      Breeze.HttpError = HttpError;
      Breeze.HttpCache = HttpCache;
      if (typeof Breeze.signal === 'function' && !Breeze.resource) {
        Breeze.resource = makeResource(Breeze.signal);
      }
      Breeze.__httpInstalled = true;
      return Breeze;
    },
  };

  return api;
});
