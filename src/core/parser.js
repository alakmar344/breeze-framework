  // ═══════════════════════════════════════════════════════════════════════
  // PARSER — Converts .breeze source text into an Abstract Syntax Tree
  // ═══════════════════════════════════════════════════════════════════════

  export const Parser = {
    _components: {}, // Component definitions registered via @def / @component
    _cache: new Map(), // source-string → AST (LRU, v2 perf)
    _cacheLimit: 500,
    _diagnostics: [],

    /** Emit a non-fatal parser diagnostic (collected for tooling) */
    _warn(msg, line) {
      this._diagnostics.push({ message: msg, line: line || null });
      if (this._diagnostics.length > 200) this._diagnostics.shift();
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[Breeze] ' + msg);
      }
    },

    clearCache() {
      this._cache.clear();
      this._diagnostics = [];
    },

    getDiagnostics() {
      return this._diagnostics.slice();
    },

    /**
     * Precompile a text template with {tokens} into static parts + keys.
     * v2 fast-path: avoids per-row RegExp construction in lists/SSR.
     * Returns { parts: string[], keys: string[] } so that
     *   render = parts[0] + val(keys[0]) + parts[1] + ...
     */
    compileTemplate(str) {
      if (!str || typeof str !== 'string' || str.indexOf('{') === -1) {
        return { parts: [str], keys: [], static: true };
      }
      const parts = [], keys = [];
      let last = 0;
      const re = /\{([\w.$-]+)\}/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        parts.push(str.slice(last, m.index));
        keys.push(m[1]);
        last = m.index + m[0].length;
      }
      parts.push(str.slice(last));
      return { parts, keys, static: keys.length === 0 };
    },

    renderCompiled(tpl, lookup) {
      if (!tpl || tpl.static) return tpl.parts[0];
      let out = tpl.parts[0];
      for (let i = 0; i < tpl.keys.length; i++) {
        const v = lookup(tpl.keys[i]);
        out += (v !== undefined && v !== null ? String(v) : '') + tpl.parts[i + 1];
      }
      return out;
    },

    _hashString(str) {
      let hash = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(36);
    },

    _getPersistedAST(hash) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem('bz_ast_' + hash);
          if (raw) return JSON.parse(raw);
        }
      } catch (_) {}
      return null;
    },

    _setPersistedAST(hash, ast) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('bz_ast_' + hash, JSON.stringify(ast));
        }
      } catch (_) {}
    },

    /**
     * Parse a full .breeze source string into an array of AST nodes.
     * Indentation (2 spaces per level) determines parent-child nesting.
     * v2: LRU-caches small sources; pass { noCache: true } to bypass.
     * v2.2: Persisted content-hash cache + zero-backtracking tokenizing.
     */
    parse(source, opts) {
      if (!source) return [];
      const useCache = !(opts && opts.noCache) && source.length < 500000;
      let hash = null;
      if (useCache) {
        if (this._cache.has(source)) {
          const hit = this._cache.get(source);
          this._cache.delete(source);
          this._cache.set(source, hit);
          return hit;
        }
        hash = this._hashString(source);
        const persisted = this._getPersistedAST(hash);
        if (persisted) {
          this._cache.set(source, persisted);
          return persisted;
        }
      }

      // Normalize line endings (\r\n -> \n, \r -> \n)
      const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalized.split('\n');
      const root  = [];
      const stack = [{ children: root, indent: -1 }];
      let i = 0;

      while (i < lines.length) {
        const rawLine = lines[i];
        let spaces = 0;
        let j = 0;
        let tabDetected = false;
        const len = rawLine.length;

        // Fast whitespace and indent scanner — eliminates per-line regex allocations
        while (j < len) {
          const ch = rawLine.charCodeAt(j);
          if (ch === 32) {
            spaces++;
          } else if (ch === 9) {
            spaces += 2;
            tabDetected = true;
          } else {
            break;
          }
          j++;
        }

        if (j === len) {
          i++;
          continue;
        }

        const c0 = rawLine.charCodeAt(j);
        const c1 = j + 1 < len ? rawLine.charCodeAt(j + 1) : 0;
        if ((c0 === 47 && c1 === 47) || (c0 === 35 && c1 === 35)) {
          i++;
          continue;
        }

        if (tabDetected) {
          Parser._warn(
            `Line ${i + 1}: tab indentation detected. Breeze uses 2 spaces per ` +
            `level — tabs were expanded to 2 spaces; please convert to spaces.`
          );
        }

        if (spaces % 2 !== 0) {
          Parser._warn(
            `Line ${i + 1}: odd indentation (${spaces} spaces). Breeze uses 2 spaces per ` +
            `level — rounding down to level ${Math.floor(spaces / 2)}.`
          );
        }
        const indent = Math.floor(spaces / 2);
        const trimmed = rawLine.slice(j).trimEnd();
        const isDirective = c0 === 64; // '@'

        // ── Block directives: @theme, @seo, @schema, @aeo, @geo { key: value ... }
        if (isDirective && (
          trimmed.startsWith('@theme') ||
          trimmed.startsWith('@seo') ||
          trimmed.startsWith('@schema') ||
          trimmed.startsWith('@aeo') ||
          trimmed.startsWith('@geo')
        )) {
          const blockMatch = trimmed.match(/^@(theme|seo|schema|aeo|geo)\b/);
          if (blockMatch) {
            const blockType = blockMatch[1];
            if (!trimmed.includes('{')) {
              Parser._warn(`Line ${i + 1}: @${blockType} must open a block with "{" on the same line.`);
            }
            const blockNode = { type: blockType, props: {} };
            const blockStart = i;
            let closed = false;
            i++;
            while (i < lines.length) {
              const tl = lines[i].trim();
              if (tl === '}') { i++; closed = true; break; }
              if (tl && !tl.startsWith('//') && !tl.startsWith('##')) {
                const ci = tl.indexOf(':');
                if (ci !== -1) {
                  const k = tl.substring(0, ci).trim();
                  let v = tl.substring(ci + 1).trim();
                  try {
                    v = JSON.parse(v);
                  } catch (_) {
                    v = v.replace(/^["']|["']$/g, '');
                  }
                  blockNode.props[k] = v;
                }
              }
              i++;
            }
            if (!closed) {
              Parser._warn(`Line ${blockStart + 1}: @${blockType} block is missing a closing "}".`);
            }
            root.push(blockNode);
            continue;
          }
        }

        // ── Component Definition: @def ComponentName(prop1, prop2) ─────
        if (isDirective && (trimmed.startsWith('@def') || trimmed.startsWith('@component'))) {
          const compM = trimmed.match(/@(def|component)\s+([A-Z]\w*)(?:\(([^)]*)\))?/);
          if (compM) {
            const compName = compM[2];
            const rawProps = compM[3] ? compM[3].split(',').map(s => s.trim()).filter(Boolean) : [];
            const compNode = {
              type: 'def',
              name: compName,
              params: rawProps,
              children: [],
              indent
            };
            Parser._components[compName] = compNode;
            while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
              stack.pop();
            }
            const parent = stack[stack.length - 1];
            if (!parent.children) parent.children = [];
            parent.children.push(compNode);
            stack.push({ children: compNode.children, indent });
            i++;
            continue;
          }
        }

        // ── Adjust stack: pop entries whose indent >= current indent ───
        while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
          stack.pop();
        }

        const parent = stack[stack.length - 1];
        const node   = Parser.parseLine(trimmed, indent);

        if (node) {
          if (!parent.children) parent.children = [];
          parent.children.push(node);
          if (Array.isArray(node.children)) {
            stack.push({ children: node.children, indent });
          }
        }

        i++;
      }

      if (useCache) {
        this._cache.set(source, root);
        if (this._cache.size > this._cacheLimit) {
          const oldest = this._cache.keys().next().value;
          this._cache.delete(oldest);
        }
        if (hash) {
          this._setPersistedAST(hash, root);
        }
      }
      return root;
    },

    /** Route a single trimmed line to directive or element parser */
    parseLine(content, indent) {
      return content.startsWith('@')
        ? Parser.parseDirective(content, indent)
        : Parser.parseElement(content, indent);
    },

    // ── Directive parser (@nav, @section, @state, @each, @if, …) ─────

    parseDirective(content, indent) {
      if (content.startsWith('@app')) {
        return { type: 'app', text: Parser.extractQuoted(content), children: [], indent };
      }

      if (content.startsWith('@nav')) {
        return {
          type: 'nav', tag: 'nav',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@section')) {
        return {
          type: 'section', tag: 'section',
          id: Parser.extractId(content),
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@footer')) {
        return {
          type: 'footer', tag: 'footer',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@header')) {
        return {
          type: 'header', tag: 'header',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@main')) {
        return {
          type: 'main', tag: 'main',
          text: Parser.extractQuoted(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      if (content.startsWith('@state')) {
        const m = content.match(/@state\s+(\w+)\s*=\s*(.+)/);
        if (m) {
          let val = m[2].trim();
          try { val = JSON.parse(val); } catch (e) {
            val = val.replace(/^["']|["']$/g, '');
          }
          return { type: 'state', key: m[1], value: val, indent };
        }
        Parser._warn(`Malformed @state: "${content}". Expected: @state name = value`);
        return null;
      }

      if (content.startsWith('@style')) {
        return { type: 'style', text: Parser.extractQuoted(content), indent };
      }

      if (content.startsWith('@slot')) {
        return { type: 'slot', indent };
      }

      if (content.startsWith('@error')) {
        return {
          type: 'error',
          text: Parser.extractQuoted(content),
          children: [],
          indent
        };
      }

      // @virtual each item in listKey [height=40, overscan=5, key=id]
      if (content.startsWith('@virtual')) {
        const m = content.match(/@virtual(?:-|\s+)(?:(?:each|for)\s+)?([\w$-]+)\s+in\s+([\w.$-]+)/);
        if (m) {
          const mods = Parser.extractModifiers(content);
          let keyProp = 'id';
          let itemHeight = 40;
          let overscan = 3;
          let containerHeight = null;
          for (let k = 0; k < mods.length; k++) {
            const mod = mods[k];
            if (mod.startsWith('key=')) {
              keyProp = mod.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            } else if (mod.startsWith('height=')) {
              const hVal = parseFloat(mod.split('=')[1]);
              if (!isNaN(hVal) && hVal > 0) itemHeight = hVal;
            } else if (mod.startsWith('overscan=')) {
              const oVal = parseInt(mod.split('=')[1], 10);
              if (!isNaN(oVal) && oVal >= 0) overscan = oVal;
            } else if (mod.startsWith('containerHeight=')) {
              const chVal = parseFloat(mod.split('=')[1]);
              if (!isNaN(chVal) && chVal > 0) containerHeight = chVal;
            }
          }
          return {
            type: 'virtual-each',
            itemVar: m[1],
            listKey: m[2],
            keyProp,
            itemHeight,
            overscan,
            containerHeight,
            modifiers: mods,
            children: [],
            indent
          };
        }
        Parser._warn(`Malformed @virtual each: "${content}". Expected: @virtual each item in listKey [height=40, overscan=3]`);
        return null;
      }

      // @each item in listKey [key=id]
      if (content.startsWith('@each') || content.startsWith('@for')) {
        const m = content.match(/@(each|for)\s+([\w$-]+)\s+in\s+([\w.$-]+)/);
        if (m) {
          const mods = Parser.extractModifiers(content);
          let keyProp = 'id';
          for (let k = 0; k < mods.length; k++) {
            if (mods[k].startsWith('key=')) {
              keyProp = mods[k].split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '');
            }
          }
          return {
            type: 'each',
            itemVar: m[2],
            listKey: m[3],
            keyProp,
            modifiers: mods,
            children: [],
            indent
          };
        }
        Parser._warn(`Malformed @each: "${content}". Expected: @each item in listKey`);
        return null;
      }

      // @if conditionKey
      if (content.startsWith('@if')) {
        const m = content.match(/@if\s+(!?)([\w.]+)/);
        if (m) {
          return {
            type: 'if',
            negate: m[1] === '!',
            conditionKey: m[2],
            children: [],
            indent
          };
        }
        Parser._warn(`Malformed @if: "${content}". Expected: @if conditionKey or @if !conditionKey`);
        return null;
      }

      // @elif / @elseif conditionKey
      if (content.startsWith('@elif') || content.startsWith('@elseif')) {
        const m = content.match(/@(elif|elseif)\s+(!?)([\w.]+)/);
        if (m) {
          return {
            type: 'elif',
            negate: m[2] === '!',
            conditionKey: m[3],
            children: [],
            indent
          };
        }
        return null;
      }

      // @else
      if (content.startsWith('@else')) {
        return {
          type: 'else',
          children: [],
          indent
        };
      }

      // Generic directive fallback — treat as custom tag
      const sp = content.indexOf(' ');
      const directive = sp !== -1 ? content.substring(1, sp) : content.substring(1);
      const rest      = sp !== -1 ? content.substring(sp + 1) : '';
      return {
        type: directive, tag: directive,
        id: Parser.extractId(rest),
        text: Parser.extractQuoted(rest),
        modifiers: Parser.extractModifiers(rest),
        children: [], indent
      };
    },

    // ── Element parser (h1, p, button, card, link, input, components) ─

    parseElement(content, indent) {
      if (content.startsWith('link')) {
        return {
          type: 'link', tag: 'a',
          text: Parser.extractQuoted(content),
          target: Parser.extractArrowTarget(content),
          modifiers: Parser.extractModifiers(content),
          children: [], indent
        };
      }

      // Check if starts with a capitalized Component name: Card [shadow] or Card("a", badge="b")
      let fwEnd = 0;
      while (fwEnd < content.length) {
        const c = content.charCodeAt(fwEnd);
        if (c === 32 || c === 91 || c === 40 || c === 34) break;
        fwEnd++;
      }
      const firstWord = fwEnd === content.length ? content : content.slice(0, fwEnd);
      if (/^[A-Z]\w*$/.test(firstWord)) {
        return {
          type: 'component',
          name: firstWord,
          id: Parser.extractId(content),
          text: Parser.extractQuoted(content),
          args: Parser.extractParenArgs(content),
          modifiers: Parser.extractModifiers(content),
          children: [],
          indent
        };
      }

      // Generic element: tagName.class1.class2#id "text" [mod1, mod2] #id
      const head = firstWord;
      let tag = head;
      let id = Parser.extractId(content);
      const dotClasses = [];

      if (head && (head.includes('.') || head.includes('#'))) {
        const parts = head.split(/([.#][^.#\s]+)/).filter(Boolean);
        tag = parts[0] || 'div';
        for (let p = 1; p < parts.length; p++) {
          const part = parts[p];
          if (part.startsWith('.')) {
            dotClasses.push(part.slice(1));
          } else if (part.startsWith('#') && !id) {
            id = part.slice(1);
          }
        }
      }

      const tagClean = (tag && !/[^a-zA-Z0-9_-]/.test(tag)) ? tag : (tag.replace(/[^a-zA-Z0-9_-]/g, '') || 'div');
      const bracketMods = Parser.extractModifiers(content);
      const dotMods = dotClasses.map(c => `class="${typeof BZ_CLASS_MAP !== 'undefined' && BZ_CLASS_MAP[c] ? BZ_CLASS_MAP[c] : c}"`);
      const allMods = dotMods.length > 0 ? [...dotMods, ...bracketMods] : bracketMods;

      return {
        type: tagClean, tag: tagClean,
        id: id,
        text: Parser.extractQuoted(content),
        classes: dotClasses,
        modifiers: allMods,
        children: [], indent
      };
    },

    // ── Extraction helpers ────────────────────────────────────────────

    extractQuoted(str) {
      if (!str) return null;
      const len = str.length;
      const bracketIdx = str.indexOf('[');
      const searchEnd = bracketIdx === -1 ? len : bracketIdx;
      const q1 = str.indexOf('"');
      const q2 = str.indexOf("'");
      if ((q1 === -1 || q1 >= searchEnd) && (q2 === -1 || q2 >= searchEnd)) return null;

      let quoteChar = 34; // '"'
      let startIdx = q1;
      if (q1 === -1 || (q2 !== -1 && q2 < q1)) {
        quoteChar = 39; // "'"
        startIdx = q2;
      }
      if (startIdx >= searchEnd) return null;

      let escaped = false;
      for (let i = startIdx + 1; i < len; i++) {
        const code = str.charCodeAt(i);
        if (code === 92) {
          escaped = !escaped;
        } else if (code === quoteChar && !escaped) {
          return str.slice(startIdx + 1, i);
        } else {
          escaped = false;
        }
      }
      return null;
    },

    extractId(str) {
      if (!str) return null;
      const bracket = str.indexOf('[');
      const searchEnd = bracket === -1 ? str.length : bracket;
      const hashIdx = str.indexOf('#');
      if (hashIdx === -1 || hashIdx >= searchEnd) return null;
      let end = hashIdx + 1;
      while (end < searchEnd) {
        const c = str.charCodeAt(end);
        if ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 45) {
          end++;
        } else {
          break;
        }
      }
      return end > hashIdx + 1 ? str.slice(hashIdx + 1, end) : null;
    },

    extractModifiers(str) {
      if (!str) return [];
      const start = str.indexOf('[');
      const end   = str.lastIndexOf(']');
      if (start === -1 || end === -1 || end <= start) return [];

      const inner  = str.slice(start + 1, end);
      const tokens = [];
      let   depth  = 0;
      let   cur    = '';
      let   inSingle = false;
      let   inDouble = false;

      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        const prev = i > 0 ? inner[i - 1] : '';
        const escaped = prev === '\\';
        if (ch === '"' && !inSingle && !escaped) { inDouble = !inDouble; cur += ch; continue; }
        if (ch === "'" && !inDouble && !escaped) { inSingle = !inSingle; cur += ch; continue; }
        if (inSingle || inDouble) { cur += ch; continue; }
        if      (ch === '(' || ch === '{')              depth++;
        else if (ch === ')' || ch === '}')              depth = depth > 0 ? depth - 1 : 0;
        else if (ch === ',' && depth === 0) {
          const t = cur.trim();
          if (t) tokens.push(t);
          cur = '';
          continue;
        }
        cur += ch;
      }
      const last = cur.trim();
      if (last) tokens.push(last);
      return tokens;
    },

    extractArrowTarget(str) {
      if (!str) return null;
      const m = str.match(/->\s*(#?[\w-]+)/);
      return m ? m[1] : null;
    },

    /** Split a comma list respecting single/double quotes and ()/[]/{} depth */
    splitArgs(inner) {
      const out = [];
      let depth = 0, cur = '', inSingle = false, inDouble = false;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        const prev = i > 0 ? inner[i - 1] : '';
        const escaped = prev === '\\';
        if (ch === '"' && !inSingle && !escaped) { inDouble = !inDouble; cur += ch; continue; }
        if (ch === "'" && !inDouble && !escaped) { inSingle = !inSingle; cur += ch; continue; }
        if (inSingle || inDouble) { cur += ch; continue; }
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth = depth > 0 ? depth - 1 : 0;
        else if (ch === ',' && depth === 0) {
          const t = cur.trim();
          if (t) out.push(t);
          cur = '';
          continue;
        }
        cur += ch;
      }
      const last = cur.trim();
      if (last) out.push(last);
      return out;
    },

    /** Extract positional/named args from Component invocation parens: Card("a", badge="b") */
    extractParenArgs(str) {
      if (!str) return [];
      // Find first '(' that is not inside [...] or quotes, before '[' if present
      const bracketIdx = str.indexOf('[');
      const searchEnd = bracketIdx === -1 ? str.length : bracketIdx;
      const openIdx = str.indexOf('(', searchEnd > 0 ? 0 : 0);
      if (openIdx === -1 || openIdx > searchEnd) return [];
      let depth = 0, inSingle = false, inDouble = false;
      for (let i = openIdx; i < str.length; i++) {
        const ch = str[i];
        const prev = i > 0 ? str[i - 1] : '';
        const escaped = prev === '\\';
        if (ch === '"' && !inSingle && !escaped) inDouble = !inDouble;
        else if (ch === "'" && !inDouble && !escaped) inSingle = !inSingle;
        else if (!inSingle && !inDouble) {
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (depth === 0) {
              const inner = str.slice(openIdx + 1, i);
              return Parser.splitArgs(inner);
            }
          }
        }
      }
      return [];
    },

    escapeRegExp(s) {
      return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  };


