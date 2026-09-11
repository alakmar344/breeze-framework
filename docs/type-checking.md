IyBTdGF0aWMgVGVtcGxhdGUgVHlwZSBDaGVja2luZyAoYGJyZWV6ZSBjaGVjayAtLXR5cGVzYCkKCkJyZWV6ZSBwcm92aWRlcyBjb21waWxlLXRpbWUgc3RhdGljIHR5cGUgY2hlY2tpbmcgZm9yIGAuYnJlZXplYCB0ZW1wbGF0ZXMgdG8gZWxpbWluYXRlIHNpbGVudCB0eXBvcyBhbmQgdW5oYW5kbGVkIGB1bmRlZmluZWRgIHJlZmVyZW5jZXMgYmVmb3JlIGNvZGUgcmVhY2hlcyBwcm9kdWN0aW9uIG9yIHJ1bnRpbWUuCgotLS0KCiMjIPCflI0gVGhlIFByb2JsZW0gSXQgU29sdmVzCgpJbiBkeW5hbWljIHRlbXBsYXRpbmcgbGFuZ3VhZ2VzLCB2YXJpYWJsZSB0eXBvcyBsaWtlIGB7dXNlci5uYW1lZX1gIGluc3RlYWQgb2YgYHt1c2VyLm5hbWV9YCBmYWlsIHNpbGVudGx5IG9yIGV2YWx1YXRlIHRvIGB1bmRlZmluZWRgIGF0IHJ1bnRpbWUuIFdpdGhvdXQgc3RhdGljIHZhbGlkYXRpb24sIHRoZXNlIGJ1Z3Mgb2Z0ZW4gc2xpcCB0aHJvdWdoIG1hbnVhbCByZXZpZXdzIGFuZCBzdXJmYWNlIGluIHByb2R1Y3Rpb24uCgpgYnJlZXplIGNoZWNrIC0tdHlwZXNgIHN0YXRpY2FsbHkgYW5hbHl6ZXMgYWxsIGAuYnJlZXplYCB0ZW1wbGF0ZXMsIGV4dHJhY3RzIGFsbCBzdGF0ZS9wcm9wIHJlZmVyZW5jZXMsIGNyb3NzLXJlZmVyZW5jZXMgdGhlbSBhZ2FpbnN0IHlvdXIgYXBwbGljYXRpb24gc2NoZW1hIChUeXBlU2NyaXB0IG9yIEpTT04gU2NoZW1hKSwgYW5kIHN1Z2dlc3RzIGludGVuZGVkIG5hbWVzIGZvciB0eXBvcy4KCi0tLQoKIyMg8J+agCBRdWljayBVc2FnZQoKIyMjIDEuIENoZWNrIEFsbCBQcm9qZWN0IFRlbXBsYXRlcwpgYGBiYXNoCiMgQXV0b21hdGljYWxseSBmaW5kcyBzY2hlbWEuanNvbiwgdHlwZXMudHMsIHNjaGVtYS50cywgb3IgdHlwZXMuZC50cyBpbiBwcm9qZWN0IHJvb3QKbnB4IGJyZWV6ZS1mcmFtZXdvcmsgY2hlY2sgLS10eXBlcwpgYGAKCiMjIyAyLiBDaGVjayBTcGVjaWZpYyBUZW1wbGF0ZSB3aXRoIEN1c3RvbSBTY2hlbWEKYGBgYmFzaAparams breeze-framework check app.breeze --types --schema src/types.ts
```

### 3. Check with Plain JSON Schema
```bash
npx breeze-framework check app.breeze --types --schema schema.json
```

---

## 📋 Schema Formats Supported

### Option A: TypeScript Definitions (`.ts`, `.d.ts`)

You can provide a standard TypeScript file containing `interface` or `type` declarations:

```typescript
// types.ts
export interface User {
  id: number;
  name: string;
  email: string;
  profile?: {
    avatar: string;
    bio?: string;
  };
}

export interface AppState {
  count: number;
  user: User;
  users: User[];
  items: Array<{
    id: number;
    title: string;
  }>;
  showStudio: boolean;
}
```

### Option B: JSON Schema or Plain JSON (`.json`)

#### Standard JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "user": {
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "email": { "type": "string" }
      }
    },
    "count": { "type": "number" },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "number" },
          "title": { "type": "string" }
        }
      }
    }
  }
}
```

#### Plain State Object
```json
{
  "user": {
    "name": "Alex",
    "email": "alex@example.com"
  },
  "count": 0,
  "items": [{ "id": 1, "title": "First Item" }]
}
```

---

## 🧠 What Is Validated?

The static type checker inspects:
1. **Text bindings**: `{user.name}`, `{count}`, `{item.title}`
2. **Conditional directives**: `@if conditionKey`, `@elif user.isAdmin`
3. **Loop collections**: `@each item in users`, `@virtual each item in items`
4. **Loop item properties**: inside `@each item in users`, validates `{item.name}` against element fields in schema
5. **Component props**: `@def Card(title)` acknowledges `title` as valid in component scope
6. **Template state declarations**: `@state count = 0` establishes valid local state
7. **Action parameters**: `@click -> increment(count)`, `@click -> toggle(showStudio)`
8. **Directives**: `@model=v2email`, `@show=showStudio`, `bind=showStudio`

---

## 💡 Typo Detection & Near-Miss Suggestions

When an undefined reference is detected, Breeze calculates the Levenshtein edit-distance against all valid paths in your schema and template state:

```text
  🌊 Breeze Framework CLI v2.2.0
  Ultra-lightweight declarative web framework

  ▸ Checking template types for app.breeze…
  ✖ app.breeze:42 — Undefined reference "user.namee". Did you mean "user.name"?
  ✖ app.breeze:60 — Undefined reference "conut". Did you mean "count"?

  ✖ Type check failed with 2 errors.
```

---

## 🛡️ CI/CD Gating (GitHub Actions)

`breeze check --types` exits with a non-zero exit code (`1`) on any type errors, making it ideal for pull request checks and CI pipelines:

```yaml
name: CI Type Check
on: [push, pull_request]

jobs:
  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npx breeze-framework check --types --schema types.ts
```
