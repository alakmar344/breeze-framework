# Breeze HTTP / Data Layer

`breeze-http.js` is Breeze's production-grade data layer. It is a **separate,
dependency-free, tree-shakeable module** built entirely on web standards
(`fetch`, `Headers`, `URL`, `URLSearchParams`, `AbortController`). It runs
unchanged in browsers, Node 18+, Deno, Bun and edge runtimes (Cloudflare
Workers, Vercel Edge) — anywhere a global `fetch` exists.

The core framework stays tiny: `breeze.js` does **not** depend on it. When the
module is loaded it installs itself onto the `Breeze` object and wires the
reactive `resource()` primitive to `Breeze.signal`.

```js
// Node / bundler
const { Breeze } = require('breeze-framework');   // auto-installs the layer
Breeze.http;          // default shared client
Breeze.createClient;  // client factory
Breeze.resource;      // reactive async state
Breeze.HttpError;     // typed error
```

```html
<!-- Browser: load after breeze.js -->
<script src="breeze.js"></script>
<script src="breeze-http.js"></script>
<script> Breeze.http.get('/api/users').then(console.log) </script>
```

---

## Quick start

Simple things are tiny:

```js
const users = await Breeze.http.get('/api/users');          // parsed JSON
const created = await Breeze.http.post('/api/users', { name: 'Ada' });
await Breeze.http.delete('/api/users/42');                  // 204 -> null
```

Complex things are still one call:

```js
const api = Breeze.createClient({
  baseURL: 'https://api.example.com/v1',
  headers: { 'x-app': 'breeze' },
  timeout: 10_000,
  retry: { attempts: 3 },
  auth: () => localStorage.getItem('token'),
  cache: { ttl: 30_000, swr: 300_000 },
  onUnauthorized: refreshSession,
});

const page = await api.get('/orders', {
  params: { status: 'open', page: 2, tags: ['a', 'b'] },
  timeout: 5_000,
});
```

---

## Client configuration

`createClient(config)` — every field is also accepted per-request (per-request
wins). Nothing is required.

| Option | Type | Default | Notes |
| --- | --- | --- | --- |
| `baseURL` | string | — | Prepended to relative paths; absolute URLs pass through. |
| `headers` | object \| Headers | — | Merged with per-request headers. `null` value deletes an inherited header. |
| `timeout` | number (ms) | `0` (off) | Aborts via `AbortController`, throws `HttpError` code `TIMEOUT`. |
| `retry` | policy \| number \| bool | off | See [Retries](#retries). |
| `cache` | see below | off | GET caching + SWR. See [Caching](#caching--dedup--swr). |
| `dedupe` | boolean | `true` for GET | Coalesces concurrent identical GETs into one network call. |
| `auth` | string \| fn \| `{header,value}` | — | See [Auth](#auth--token-refresh). |
| `onUnauthorized` | fn(ctx) | — | Single-flight refresh on `401`, then retry once. |
| `responseType` | `'auto'` \| `'json'` \| `'text'` \| `'blob'` \| `'arrayBuffer'` \| `'stream'` \| `'response'` | `'auto'` | `'auto'` negotiates on `Content-Type`. |
| `throwHttpErrors` | boolean | `true` | When `false`, non-2xx responses resolve instead of throwing. |
| `credentials` / `mode` / `redirect` / `keepalive` | — | — | Passed straight to `fetch`. |
| `arrayFormat` | `'repeat'` \| `'bracket'` \| `'comma'` | `'repeat'` | Query array encoding. |
| `fetch` | function | global `fetch` | Inject a custom fetch (tests, edge polyfills). |

### Request methods

```js
api.get(url, opts)
api.delete(url, opts)
api.head(url, opts)
api.options(url, opts)
api.post(url, body, opts)
api.put(url, body, opts)
api.patch(url, body, opts)
api.request(method, url, opts)
```

`extend(extra)` creates a child client with merged config (and a **shared
cache** by default):

```js
const authed = api.extend({ headers: { authorization: 'Bearer ' + token } });
```

---

## Request & response bodies

**Sending.** Plain objects/arrays are `JSON.stringify`-ed and get
`Content-Type: application/json`. `FormData`, `Blob`, `ArrayBuffer`/typed
arrays, `URLSearchParams`, `ReadableStream` and strings pass through untouched
so the platform can set the right `Content-Type` (e.g. the multipart boundary).
`GET`/`HEAD` never send a body.

**Receiving (`responseType: 'auto'`).**

- JSON content type → parsed object (`+json` suffixes included)
- text/xml/csv/js/empty content type → string
- `204` / `205` / `304` / empty 200 body → `null` (never a parse crash)
- anything else → `Blob` (browser) or `ArrayBuffer` (Node)
- malformed JSON → `HttpError` with code `PARSE`

Force a shape with `responseType`. `'stream'` returns `response.body`,
`'response'` returns the raw `Response`.

Get metadata alongside the body with `{ raw: true }`:

```js
const { data, status, headers, fromCache } = await api.get('/x', { raw: true });
```

---

## Query parameters

```js
api.get('/search', { params: { q: 'hi', page: 2, tags: ['a', 'b'] } });
// -> /search?q=hi&page=2&tags=a&tags=b
```

- `null` / `undefined` values are skipped.
- `Date` → ISO string. Nested objects → JSON.
- Arrays: `repeat` (default), `bracket` (`tags[]=a`), or `comma` (`tags=a,b`).
- Existing query strings and `#hash` fragments are preserved.

---

## Errors

Every failure is a single `HttpError` with a `code` so you branch without
string-matching messages:

| `code` | Meaning |
| --- | --- |
| `HTTP` | Non-2xx response (unless `throwHttpErrors:false`). `.status`, `.data` (parsed error body), `.response`. |
| `TIMEOUT` | Per-request timeout elapsed. |
| `ABORTED` | Caller aborted via `AbortSignal`. |
| `NETWORK` | `fetch` itself rejected (offline, DNS, CORS, reset). |
| `PARSE` | Body could not be decoded to the requested type. |

```js
try {
  await api.get('/users/1');
} catch (err) {
  if (err.code === 'HTTP' && err.status === 404) showNotFound();
  else if (err.timeout || err.network) showRetryToast();
  else throw err;
}
```

---

## Timeouts & cancellation

```js
await api.get('/slow', { timeout: 3000 });   // -> HttpError TIMEOUT

const ac = new AbortController();
const p = api.get('/big', { signal: ac.signal });
ac.abort();                                   // -> HttpError ABORTED
```

Timeouts and external signals are composed (`AbortSignal.any` when available,
manual fallback otherwise). Timers are always cleared on settle.

---

## Retries

Off by default. Enable with a number, `true`, or a full policy. Only
**idempotent** methods (`GET/HEAD/OPTIONS/PUT/DELETE`) retry by default — POST
is never silently retried unless you opt in.

```js
createClient({
  retry: {
    attempts: 3,             // extra tries after the first
    minDelay: 200,           // exponential base (ms)
    factor: 2,               // 200, 400, 800, ...
    maxDelay: 10_000,        // cap
    jitter: true,            // full jitter (decorrelates retry storms)
    methods: ['GET', 'PUT'],
    statuses: [429, 502, 503, 504],
    respectRetryAfter: true, // honor Retry-After (seconds or HTTP-date)
    shouldRetry: ({ error, response, attempt }) => attempt < 5,
  },
});
```

Retries fire on network errors, timeouts, and retryable statuses (default:
`408, 425, 429, 500, 502, 503, 504`). `Retry-After` overrides the computed
backoff.

---

## Caching, dedup & SWR

```js
const api = createClient({ cache: { ttl: 30_000, swr: 300_000 } });
```

- **TTL** (`ttl` ms): fresh hits skip the network entirely.
- **stale-while-revalidate** (`swr` ms): after TTL, a stale value is returned
  immediately while a background request refreshes the cache.
- **Dedup**: concurrent identical GETs share one in-flight request.
- Only GET is cached by default; enable per-request with `cache` on any method.
- `cacheBust: true` forces a fresh network hit and updates the cache.

Invalidation:

```js
api.cache.invalidate('/users');       // substring / prefix
api.cache.invalidate(/^GET \/orders/); // RegExp against the cache key
api.cache.invalidate(key => key.includes('draft'));
api.cache.clear();
```

Cache keys are `METHOD url [body]`. Override per-request with
`cache: { key: 'my-key' }`.

---

## Interceptors / middleware

```js
api.interceptors.request.use(ctx => { ctx.headers = { ...ctx.headers, 'x-trace': id() }; return ctx; });
api.interceptors.response.use((res, ctx) => { metrics.record(ctx.url, res.status); });
api.interceptors.error.use(err => { if (err.status === 402) return { upgrade: true }; }); // recover
```

- **request**: runs before the URL/headers/body are finalized; may mutate or
  replace `ctx`.
- **response**: observes/replaces the raw `Response`.
- **error**: may swallow-and-recover by returning a value, or rethrow.

Each `use()` returns an id for `eject(id)`.

---

## Auth & token refresh

```js
createClient({
  auth: () => store.getToken(),        // string | Promise<string> — added as Bearer
  onUnauthorized: async (ctx) => {     // single-flight refresh on 401
    await store.refresh();
    return true;                        // truthy -> retry original request once
  },
});
```

`auth` may be a static string, a (async) function, or `{ header, value }` for a
custom header. Concurrent 401s share one refresh call.

---

## Reactive `resource()`

`resource()` binds async data to Breeze signals for use inside components. It
tracks `data`/`error`/`loading`/`fetching`, cancels superseded requests, and
supports optimistic updates.

```js
const users = Breeze.resource(
  ({ signal }) => api.get('/users', { signal }),
  { initialData: [] }
);

users.data.value;      // T | undefined  (reactive)
users.loading.value;   // true only during the first load
users.fetching.value;  // true during any load (incl. refetch)
users.error.value;     // HttpError | null

users.refetch();                         // re-run the fetcher
users.mutate(list => [...list, newUser]);// optimistic local update
users.abort();                           // cancel the in-flight request
```

Options: `initialData`, `immediate` (default `true`), `onError`.

---

## Edge / SSR notes

- The module only touches web-standard globals, so it runs on Workers, Deno,
  Bun and Node without shims.
- In runtimes without a global `fetch`, inject one:
  `createClient({ fetch: myFetch })`.
- No cookies, `localStorage`, or `window` are required by the core client.

---

## Performance

Framework overhead is measured, not asserted. On the reference machine (AMD
EPYC, Node 22), with an in-process mock fetch so no network noise leaks in:

- **~1.2 µs/request** overhead over raw `fetch` + `json()`.
- **cache hits ~12× faster** than a fresh client GET.

Reproduce:

```bash
npm run bench:http     # node benchmarks/http-layer-runner.js
```

Report is written to `benchmarks/reports/http-layer.json`.

---

## Testing

35 tests cover URL/query helpers, body encoding, JSON/text/binary/204 parsing,
malformed-JSON handling, HTTP errors, retries (incl. Retry-After and
POST-never-retried), timeout/abort, interceptors, auth + 401 refresh, caching,
dedup, SWR, invalidation, `extend()`, and `resource()`.

```bash
node --test test/http.test.js
```
