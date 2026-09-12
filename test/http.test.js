'use strict';
// Comprehensive tests for the Breeze HTTP/data layer.
// Uses Node's built-in test runner and real Response objects with a mock fetch.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const BreezeHttp = require('../breeze-http.js');
const { createClient, HttpError, HttpCache, encodeQuery, withQuery, joinURL, makeResource } = BreezeHttp;

// ── Mock fetch factory ──────────────────────────────────────────────────
// `program` is a function (url, init) => { status, body, headers, delay } | Response
function mockFetch(program) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const spec = typeof program === 'function' ? program(url, init, calls.length) : program;
    // Honor abort during an artificial delay.
    if (spec && spec.delay) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, spec.delay);
        if (init.signal) {
          if (init.signal.aborted) { clearTimeout(t); return reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }
          init.signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); }, { once: true });
        }
      });
    }
    if (spec instanceof Response) return spec;
    if (spec && spec.throw) throw spec.throw;
    const headers = spec && spec.headers ? spec.headers : { 'content-type': 'application/json' };
    const status = spec && spec.status != null ? spec.status : 200;
    let body = spec ? spec.body : null;
    if (body != null && typeof body !== 'string' && !(body instanceof ArrayBuffer)) body = JSON.stringify(body);
    return new Response(status === 204 ? null : body, { status, headers });
  };
  fn.calls = calls;
  return fn;
}

// ── URL / query helpers ───────────────────────────────────────────────
test('joinURL handles base, absolute, and slashes', () => {
  assert.equal(joinURL('https://api.test', '/users'), 'https://api.test/users');
  assert.equal(joinURL('https://api.test/', 'users'), 'https://api.test/users');
  assert.equal(joinURL('https://api.test/v1/', '/users/'), 'https://api.test/v1/users/');
  assert.equal(joinURL('https://api.test', 'https://other.test/x'), 'https://other.test/x');
  assert.equal(joinURL('', '/users'), '/users');
});

test('encodeQuery: arrays, dates, nested, null skip', () => {
  assert.equal(encodeQuery({ a: 1, b: 'x' }), 'a=1&b=x');
  assert.equal(encodeQuery({ a: null, b: undefined, c: 0 }), 'c=0');
  assert.equal(encodeQuery({ tags: ['x', 'y'] }), 'tags=x&tags=y');
  assert.equal(encodeQuery({ tags: ['x', 'y'] }, 'comma'), 'tags=x%2Cy');
  assert.equal(encodeQuery({ f: { a: 1 } }), 'f=%7B%22a%22%3A1%7D');
  assert.equal(decodeURIComponent(encodeQuery({ d: new Date('2020-01-01T00:00:00Z') })), 'd=2020-01-01T00:00:00.000Z');
});

test('withQuery preserves existing query and hash', () => {
  assert.equal(withQuery('/x?a=1', { b: 2 }), '/x?a=1&b=2');
  assert.equal(withQuery('/x#top', { b: 2 }), '/x?b=2#top');
  assert.equal(withQuery('/x', null), '/x');
});

// ── Basic requests + parsing ───────────────────────────────────────────
test('GET returns parsed JSON', async () => {
  const fetchImpl = mockFetch({ body: { id: 1, name: 'a' } });
  const api = createClient({ fetch: fetchImpl });
  const res = await api.get('/users/1');
  assert.deepEqual(res, { id: 1, name: 'a' });
});

test('text/plain returns string', async () => {
  const fetchImpl = mockFetch({ body: 'hello', headers: { 'content-type': 'text/plain' } });
  const api = createClient({ fetch: fetchImpl });
  assert.equal(await api.get('/x'), 'hello');
});

test('204 returns null (no parse crash)', async () => {
  const fetchImpl = mockFetch({ status: 204, headers: {} });
  const api = createClient({ fetch: fetchImpl });
  assert.equal(await api.delete('/users/1'), null);
});

test('empty 200 body returns null', async () => {
  const fetchImpl = mockFetch({ status: 200, body: '', headers: { 'content-type': 'application/json' } });
  const api = createClient({ fetch: fetchImpl });
  assert.equal(await api.get('/x'), null);
});

test('malformed JSON throws PARSE error', async () => {
  const fetchImpl = mockFetch({ body: '{not json', headers: { 'content-type': 'application/json' } });
  const api = createClient({ fetch: fetchImpl });
  await assert.rejects(() => api.get('/x'), (e) => e instanceof HttpError && e.code === 'PARSE');
});

test('baseURL + query params compose', async () => {
  const fetchImpl = mockFetch({ body: {} });
  const api = createClient({ fetch: fetchImpl, baseURL: 'https://api.test/v1' });
  await api.get('/search', { params: { q: 'hi', page: 2 } });
  assert.equal(fetchImpl.calls[0].url, 'https://api.test/v1/search?q=hi&page=2');
});

// ── Body encoding ──────────────────────────────────────────────────────
test('POST plain object -> JSON + content-type', async () => {
  const fetchImpl = mockFetch({ body: { ok: true } });
  const api = createClient({ fetch: fetchImpl });
  await api.post('/users', { name: 'z' });
  const init = fetchImpl.calls[0].init;
  assert.equal(init.method, 'POST');
  assert.equal(init.body, JSON.stringify({ name: 'z' }));
  assert.equal(init.headers.get('content-type'), 'application/json');
});

test('POST FormData passes through without content-type', async () => {
  const fetchImpl = mockFetch({ body: {} });
  const api = createClient({ fetch: fetchImpl });
  const fd = new FormData();
  fd.append('file', 'x');
  await api.post('/upload', fd);
  const init = fetchImpl.calls[0].init;
  assert.equal(init.body, fd);
  assert.equal(init.headers.get('content-type'), null);
});

test('GET never sends a body', async () => {
  const fetchImpl = mockFetch({ body: {} });
  const api = createClient({ fetch: fetchImpl });
  await api.request('GET', '/x', { body: { should: 'ignore' } });
  assert.equal(fetchImpl.calls[0].init.body, undefined);
});

// ── HTTP errors ────────────────────────────────────────────────────────
test('500 throws HttpError with parsed data', async () => {
  const fetchImpl = mockFetch({ status: 500, body: { message: 'boom' } });
  const api = createClient({ fetch: fetchImpl });
  await assert.rejects(() => api.get('/x'), (e) => {
    assert.ok(e instanceof HttpError);
    assert.equal(e.code, 'HTTP');
    assert.equal(e.status, 500);
    assert.deepEqual(e.data, { message: 'boom' });
    return true;
  });
});

test('throwHttpErrors:false returns body of error responses', async () => {
  const fetchImpl = mockFetch({ status: 404, body: { error: 'nope' } });
  const api = createClient({ fetch: fetchImpl, throwHttpErrors: false });
  const res = await api.get('/x', { raw: true });
  assert.equal(res.status, 404);
  assert.deepEqual(res.data, { error: 'nope' });
});

// ── Retries ────────────────────────────────────────────────────────────
test('retries on 503 then succeeds', async () => {
  let n = 0;
  const fetchImpl = mockFetch(() => (++n < 3 ? { status: 503, body: {} } : { status: 200, body: { ok: n } }));
  const api = createClient({ fetch: fetchImpl, retry: { attempts: 3, minDelay: 1 } });
  const res = await api.get('/x');
  assert.deepEqual(res, { ok: 3 });
  assert.equal(fetchImpl.calls.length, 3);
});

test('does not retry POST by default', async () => {
  const fetchImpl = mockFetch({ status: 503, body: {} });
  const api = createClient({ fetch: fetchImpl, retry: { attempts: 3, minDelay: 1 } });
  await assert.rejects(() => api.post('/x', {}));
  assert.equal(fetchImpl.calls.length, 1);
});

test('retries network errors', async () => {
  let n = 0;
  const fetchImpl = mockFetch(() => (++n < 2 ? { throw: new TypeError('fetch failed') } : { body: { ok: 1 } }));
  const api = createClient({ fetch: fetchImpl, retry: { attempts: 2, minDelay: 1 } });
  assert.deepEqual(await api.get('/x'), { ok: 1 });
});

test('respects Retry-After header', async () => {
  let n = 0;
  const t0 = Date.now();
  const fetchImpl = mockFetch(() => (++n < 2 ? { status: 429, headers: { 'retry-after': '0' }, body: {} } : { body: { ok: 1 } }));
  const api = createClient({ fetch: fetchImpl, retry: { attempts: 2, minDelay: 5000 } });
  await api.get('/x');
  // Retry-After: 0 overrides the 5s backoff -> completes fast.
  assert.ok(Date.now() - t0 < 1000);
});

// ── Timeout + cancellation ─────────────────────────────────────────────
test('timeout aborts and throws TIMEOUT', async () => {
  const fetchImpl = mockFetch({ delay: 100, body: {} });
  const api = createClient({ fetch: fetchImpl, timeout: 20 });
  await assert.rejects(() => api.get('/x'), (e) => e instanceof HttpError && e.code === 'TIMEOUT');
});

test('external AbortSignal cancels', async () => {
  const fetchImpl = mockFetch({ delay: 100, body: {} });
  const api = createClient({ fetch: fetchImpl });
  const ac = new AbortController();
  const p = api.get('/x', { signal: ac.signal });
  ac.abort();
  await assert.rejects(() => p, (e) => e instanceof HttpError && e.code === 'ABORTED');
});

// ── Interceptors ───────────────────────────────────────────────────────
test('request interceptor mutates headers', async () => {
  const fetchImpl = mockFetch({ body: {} });
  const api = createClient({ fetch: fetchImpl });
  api.interceptors.request.use((ctx) => { ctx.headers = Object.assign({}, ctx.headers, { 'x-trace': '1' }); return ctx; });
  await api.get('/x');
  assert.equal(fetchImpl.calls[0].init.headers.get('x-trace'), '1');
});

test('response interceptor observes response', async () => {
  const fetchImpl = mockFetch({ body: { v: 1 } });
  const api = createClient({ fetch: fetchImpl });
  let seen = 0;
  api.interceptors.response.use((resp) => { seen = resp.status; });
  await api.get('/x');
  assert.equal(seen, 200);
});

test('error interceptor can recover', async () => {
  const fetchImpl = mockFetch({ status: 500, body: {} });
  const api = createClient({ fetch: fetchImpl });
  api.interceptors.error.use(() => ({ recovered: true }));
  assert.deepEqual(await api.get('/x'), { recovered: true });
});

// ── Auth + refresh ─────────────────────────────────────────────────────
test('auth function adds Bearer token', async () => {
  const fetchImpl = mockFetch({ body: {} });
  const api = createClient({ fetch: fetchImpl, auth: () => 'abc' });
  await api.get('/x');
  assert.equal(fetchImpl.calls[0].init.headers.get('authorization'), 'Bearer abc');
});

test('401 triggers single-flight refresh then retry', async () => {
  let refreshed = false;
  let n = 0;
  const fetchImpl = mockFetch(() => {
    n++;
    if (!refreshed) return { status: 401, body: {} };
    return { status: 200, body: { ok: 1 } };
  });
  const api = createClient({
    fetch: fetchImpl,
    onUnauthorized: async () => { refreshed = true; return true; },
  });
  assert.deepEqual(await api.get('/x'), { ok: 1 });
  assert.equal(n, 2);
});

// ── Caching + dedup + SWR ──────────────────────────────────────────────
test('cache TTL serves without a second network hit', async () => {
  const fetchImpl = mockFetch({ body: { v: 1 } });
  const api = createClient({ fetch: fetchImpl, cache: { ttl: 10000 } });
  await api.get('/x');
  await api.get('/x');
  assert.equal(fetchImpl.calls.length, 1);
});

test('cacheBust forces a network hit', async () => {
  const fetchImpl = mockFetch({ body: { v: 1 } });
  const api = createClient({ fetch: fetchImpl, cache: { ttl: 10000 } });
  await api.get('/x');
  await api.get('/x', { cacheBust: true });
  assert.equal(fetchImpl.calls.length, 2);
});

test('dedup coalesces concurrent identical GETs', async () => {
  const fetchImpl = mockFetch({ delay: 20, body: { v: 1 } });
  const api = createClient({ fetch: fetchImpl });
  const [a, b] = await Promise.all([api.get('/x'), api.get('/x')]);
  assert.deepEqual(a, b);
  assert.equal(fetchImpl.calls.length, 1);
});

test('cache.invalidate by prefix', async () => {
  const fetchImpl = mockFetch({ body: { v: 1 } });
  const api = createClient({ fetch: fetchImpl, cache: { ttl: 10000 } });
  await api.get('/users');
  api.cache.invalidate('/users');
  await api.get('/users');
  assert.equal(fetchImpl.calls.length, 2);
});

test('stale-while-revalidate returns stale then refreshes', async () => {
  let v = 1;
  const fetchImpl = mockFetch(() => ({ body: { v: v++ } }));
  const api = createClient({ fetch: fetchImpl, cache: { ttl: 0, swr: 10000 } });
  const first = await api.get('/x');
  assert.deepEqual(first, { v: 1 });
  const second = await api.get('/x'); // stale hit -> returns {v:1}, revalidates in bg
  assert.deepEqual(second, { v: 1 });
  await new Promise((r) => setTimeout(r, 20));
  const third = await api.get('/x');
  assert.deepEqual(third, { v: 2 }); // background revalidation updated the cache
});

test('stale-while-revalidate refreshes the correct key when params are used', async () => {
  // Regression: revalidation must reuse the original url+params so it writes
  // back to the same cache key and does not double-append the query string.
  let v = 1;
  const fetchImpl = mockFetch((url) => ({ body: { url, v: v++ } }));
  const api = createClient({ fetch: fetchImpl, baseURL: 'https://a.test', cache: { ttl: 0, swr: 10000 } });
  const first = await api.get('/items', { params: { page: 2 } });
  assert.equal(first.url, 'https://a.test/items?page=2');
  await api.get('/items', { params: { page: 2 } });         // stale hit + bg revalidate
  await new Promise((r) => setTimeout(r, 20));
  const third = await api.get('/items', { params: { page: 2 } });
  assert.equal(third.url, 'https://a.test/items?page=2');   // no doubled ?page=2&page=2
  assert.equal(third.v, 2);                                  // background refresh landed on the right key
});

// ── extend() ───────────────────────────────────────────────────────────
test('extend merges baseURL + headers and shares cache', async () => {
  const fetchImpl = mockFetch({ body: {} });
  const api = createClient({ fetch: fetchImpl, baseURL: 'https://a.test', headers: { 'x-a': '1' } });
  const child = api.extend({ headers: { 'x-b': '2' } });
  await child.get('/x');
  const h = fetchImpl.calls[0].init.headers;
  assert.equal(h.get('x-a'), '1');
  assert.equal(h.get('x-b'), '2');
  assert.equal(fetchImpl.calls[0].url, 'https://a.test/x');
});

// ── Reactive resource() with a minimal signal impl ─────────────────────
function tinySignal(initial) {
  let v = initial; const subs = new Set();
  return {
    get value() { return v; },
    set value(n) { v = n; subs.forEach((f) => f()); },
    peek() { return v; },
    subscribe(f) { subs.add(f); return () => subs.delete(f); },
  };
}

test('resource loads, exposes data, and refetches', async () => {
  const resource = makeResource(tinySignal);
  let n = 0;
  const r = resource(async () => ({ n: ++n }));
  assert.equal(r.loading.value, true);
  await new Promise((res) => setTimeout(res, 5));
  assert.deepEqual(r.data.value, { n: 1 });
  assert.equal(r.loading.value, false);
  await r.refetch();
  assert.deepEqual(r.data.value, { n: 2 });
});

test('resource captures errors', async () => {
  const resource = makeResource(tinySignal);
  const r = resource(async () => { throw new HttpError('bad', { code: 'HTTP', status: 500 }); });
  await new Promise((res) => setTimeout(res, 5));
  assert.ok(r.error.value instanceof HttpError);
  assert.equal(r.data.value, undefined);
});

test('resource.mutate supports optimistic updates', async () => {
  const resource = makeResource(tinySignal);
  const r = resource(async () => ({ count: 1 }), { initialData: { count: 0 } });
  r.mutate((prev) => ({ count: prev.count + 5 }));
  assert.deepEqual(r.data.value, { count: 5 });
});

// ── installInto wiring ─────────────────────────────────────────────────
test('installInto wires resource() to Breeze.signal', () => {
  const fakeBreeze = { signal: tinySignal };
  BreezeHttp.installInto(fakeBreeze);
  assert.equal(typeof fakeBreeze.createClient, 'function');
  assert.equal(typeof fakeBreeze.resource, 'function');
  assert.equal(fakeBreeze.HttpError, HttpError);
});

test('strips JSON hijacking vulnerability prefix )]}\',\n', async () => {
  const client = createClient({
    fetch: async () => new Response(")]}',\n{\"secure\": true, \"items\": [1, 2, 3]}", {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  });
  const data = await client.get('/api/protected');
  assert.deepEqual(data, { secure: true, items: [1, 2, 3] });
});

