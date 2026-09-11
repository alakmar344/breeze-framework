# AI Assistant & Developer Prompt Guide for Breeze Framework

This guide provides instructions and system prompt templates for AI models (Claude, ChatGPT, Gemini, Cursor, GitHub Copilot) generating code for the **Breeze Framework**.

---

## 🤖 System Prompt Snippet for AI Coding Assistants

If you are using Cursor, Claude, or ChatGPT to generate Breeze code, add this snippet to your `.cursorrules`, custom instructions, or prompt:

```markdown
You are an expert in Breeze Framework (v2.2.0).
Breeze is an ultra-lightweight (~34.1 KB gzip, zero dependencies) declarative web framework.

CRITICAL SYNTAX RULES FOR .breeze FILES:
1. NEVER emit closing tags (no </div>, </section>, </p>, </button>). Indentation establishes hierarchy.
2. ALWAYS use exactly 2 spaces per indentation level (tabs are expanded with a warning).
3. Directives begin with @ (@app, @theme, @state, @nav, @section, @footer, @each, @virtual each, @if/@elif/@else, @def, @slot, @error).
4. Elements follow: tag "text with {stateBinding}" [modifiers] #id
5. Modifiers in brackets: [primary, hero, center, pad-lg, grid-2, shadow, hover-lift, ref=name, @show=key, @model=key, @cloak, @transition=fade-in].
6. Event actions in brackets: [@click -> increment(key)], [@click -> navigate(#id)], [@click -> push(arrayKey, value)].
7. Loops: @each item in listKey [key=id] or virtualized @virtual each item in listKey [height=40, overscan=5] (use {item}, {item.prop} and {item.index} in children).
8. Conditionals: @if key / @if !key with @elif / @else chains (first-truthy wins, dotted keys ok).
9. Components: @def Card(title, badge) + Card("Hi", badge="New") + @slot for children.
10. Shorthand: tag.class1.class2#id supported directly (e.g. td.col-md-1, button.btn.primary#run).
11. Modern UI: use Cerulean Ocean tokens (--bz-primary, --bz-blueberry), card-glass, switch, badge-blueberry, btn-glow.
12. Web Components: export native custom elements via Breeze.defineElement('tag-name', template, opts).
```

---

## ⚠️ Common AI Hallucinations to Avoid

| What AI Might Try To Do (Wrong) | How to do it in Breeze (Correct) |
|---|---|
| Adding closing tags: `<div>...</div>` | Use 2 spaces indentation under `div` |
| Writing JSX: `<button onClick={...}>` | `button "Label" [primary, @click -> action()]` |
| Using React hooks: `const [x, setX] = useState()` | `@state x = 0` at top level |
| Importing npm modules: `import confetti from ...` | Register via `Breeze.plugin('name', { ... })` |
| Writing HTML entities: `&copy;` | Write direct unicode characters like `©` or `"© 2026"` |

---

## 📋 Full Component Templates for AI Generation

### 1. Hero with Navigation
```breeze
@app "My Startup"

@theme {
  primary: #EF4444
  bg: #FAF8F5
  text: #1E293B
}

@nav [sticky]
  link "Features" -> #features
  link "Docs"     -> #docs

@section #hero [hero, center, pad-xl]
  h1 "The Declarative Web"
  p "Zero build tools. Zero node_modules."
  button "Get Started" [primary, @click -> navigate(#features)]
```

### 2. State & Dynamic List Iteration
```breeze
@state score = 10
@state features = ["Declarative Syntax", "Reactive State", "Auto Compression"]

@section #features [pad-lg, center]
  h2 "Capabilities"
  p "Score: {score}"
  button "+ Point" [primary, @click -> increment(score)]

  div [grid-3, gap-md, mt-md]
    @each feat in features
      card [shadow, hover-lift]
        p "{feat}"
```
