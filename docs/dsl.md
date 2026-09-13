# The Breeze DSL — grammar reference

This is the single authoritative reference for `.breeze` template syntax.
Other docs (README.md, AI_GUIDE.md, llms.txt/llms-full.txt) should describe
*how to use* the language; this file describes *what the language is*,
including the parts that are easy to get wrong.

If you only read one section, read
[Canonical spellings vs. deprecated aliases](#canonical-spellings-vs-deprecated-aliases)
and [The `[...]` modifier list](#the--modifier-list) — those are the two
places the grammar is genuinely ambiguous or has more than one accepted
spelling, and where an LLM generating Breeze code is most likely to guess
wrong.

## File shape

A `.breeze` file is plain text, parsed top-to-bottom, indentation-significant
(2 spaces per level — tabs are auto-converted with a warning). There is no
`<script>`/`<template>`/`<style>` split like `.vue`/`.svelte`: directives,
state, and markup are interleaved directly.

```
@app "My App"
@state count = 0
@nav "My App"
  link "Home" -> #home
@section #home
  h1 "Count: {count}"
  button "+1" [primary, @click -> increment(count)]
```

## Directives

| Directive | Purpose | Canonical? |
| :--- | :--- | :--- |
| `@app "Title"` | Declares the app / page title | yes |
| `@theme { ... }` | CSS custom-property tokens | yes |
| `@state key = value` | Declares a piece of reactive state with an initial value | yes |
| `@def Name(params)` / `@component Name(params)` | Defines a reusable component | both accepted, no functional difference — prefer `@def` (shorter, used in most examples) |
| `@slot` | Marks a component's content-insertion point | yes |
| `@nav [modifiers]` | Top-level navigation bar | yes |
| `@section #id [modifiers]` | A page section | yes |
| `@footer [modifiers]` | Page footer | yes |
| `@each item in list [key=id]` | Loop over a list | **canonical** |
| `@for item in list` | Same as `@each` | **deprecated alias** — parser emits a warning; `breeze lint` flags it |
| `@virtual each item in list [height=40, overscan=3]` | Virtualized (windowed) loop for large lists | yes |
| `@if key` / `@if !key` | Conditional | yes |
| `@elif key` | Else-if branch | **canonical** |
| `@elseif key` | Same as `@elif` | **deprecated alias** — parser emits a warning; `breeze lint` flags it |
| `@else` | Else branch | yes |
| `@seo{}` / `@schema{}` / `@aeo{}` / `@geo{}` | SEO meta / JSON-LD / AI-answer-engine / geo meta blocks | yes |

### Canonical spellings vs. deprecated aliases

`@each`/`@elif` are canonical: every doc, example, and the syntax highlighter
(`breeze.tmLanguage.json`) uses them, and they're what `breeze generate`
scaffolds. `@for`/`@elseif` are accepted for backward compatibility (some
early Breeze code used them) but the parser now emits a non-fatal warning
when it sees them (`src/core/parser.js`), and `breeze lint` surfaces that
warning as a lint diagnostic. New code — hand-written or LLM-generated —
should always use `@each`/`@elif`. There is no plan to remove the aliases
(removing a working alias in a 0-build-step, no-migration-tool framework is
a breaking change with no clean upgrade path), but don't teach a model or a
new contributor the alias form.

## Elements

```
tag "text with {binding}" [modifiers] #id
tag.class1.class2#id "text"
```

- `tag` is any HTML tag name.
- `.class` and `#id` shorthand mirror CSS selector syntax, but — unlike CSS —
  this is parsed as part of the *element declaration*, not a selector. A
  class name that matches a recognized Breeze design token resolves to that
  token's styling; any other class name passes through verbatim as a plain
  CSS class. There is no visual distinction in the source between the two —
  check `breeze.css`'s token list if a class name doesn't look like it's
  doing anything.
- `{path.to.value}` inside a text string is a **bare interpolation token
  only** — no ternaries, arithmetic, or function calls. If you need
  computed display logic, compute it into a `@state`/computed value or a
  registered method first, then interpolate the result.

## The `[...]` modifier list

This is the part of the grammar most likely to confuse a new reader (or an
LLM): a single comma-separated bracket list can hold three *semantically
different* kinds of tokens, distinguished only by shape:

```
button "Submit" [primary, pad-lg, type=submit, @click -> submitForm()]
         └──────────────┬──────────────┘  └───┬───┘  └───────┬───────┘
                  style modifiers        HTML attribute   event binding
```

1. **Bare word** (`primary`, `pad-lg`, `hover-lift`) → a style modifier,
   resolved against Breeze's design-token classes (see `breeze.css`).
2. **`key=value`** (`type=submit`, `placeholder="Your name"`) → a literal
   HTML attribute passed straight through, **except** inside `@each`/
   `@virtual each`, where `key=`/`height=`/`overscan=` instead configure the
   loop/virtualization itself (see the directive table above). The syntax is
   identical; the meaning depends entirely on which directive the bracket
   list is attached to. There is no marker distinguishing "this is a real
   HTML attribute" from "this is loop config" other than context.
3. **`@event -> action(...)`** → an event binding (see
   [Actions](#actions-the-closed-verb-vocabulary) below). The `->` arrow
   here means "dispatch this action" — note that the *same* arrow token
   means "navigate to this target" in `link "Features" -> #features`. Two
   different meanings for one operator, disambiguated only by which
   construct it appears in.

When writing or generating a modifier list, mentally sort tokens into these
three buckets first; the parser doesn't require any particular order, but
grouping them (styles, then attributes, then bindings) makes the ambiguity
easier for a human reviewer to resolve at a glance.

## Actions: the closed verb vocabulary

`@click -> action(...)` (and other `@event -> ...` bindings) can call:

| Verb | Effect |
| :--- | :--- |
| `navigate(target)` | Client-side route change |
| `setState(key, value)` | `State.set(key, value)` |
| `increment(key)` / `decrement(key)` | `key += 1` / `key -= 1` |
| `toggle(key)` | `key = !key` |
| `push(key, value)` | Append to array state |
| `remove(key, index)` | Remove array item by index |
| `emit(eventName, payload?)` | Fire an `EventBus` event |
| *(any other bare name)* | Looked up in `Breeze.method(name, fn)`-registered custom methods, called as `fn(...parsedArgs)` (or `fn(event, el)` with no args) |

**There is no way to write inline arbitrary JS expressions in an action** —
this is a deliberate, closed vocabulary, not an oversight. Anything not in
this list must be registered ahead of time via `Breeze.method('name', fn)`
and then called by that bare name. This is the single biggest divergence
from how `onClick={...}`-style frameworks work, and the most common source
of hallucinated-but-wrong Breeze code from an LLM that hasn't seen this list
(see `AI_GUIDE.md`'s "Common AI Hallucinations to Avoid").

## Where to go next

- `AI_GUIDE.md` — common mistakes when generating Breeze code (JSX habits,
  `useState()`, closing tags, etc.) that don't apply here.
- `breeze.tmLanguage.json` — the TextMate grammar used for editor syntax
  highlighting; useful as a second, machine-checked description of valid
  tokens.
- `docs/type-checking.md` — the external `breeze check --types` schema/type
  checker, which is a separate, more strongly-typed way to declare component
  props than the untyped `@def Name(params)` comma list described above.
- `llms-full.txt` — a condensed EBNF-style grammar summary intended for
  loading into an LLM's context window alongside a prompt.
