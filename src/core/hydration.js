import { BreezeConfig } from './config.js';
import { Parser } from './parser.js';
import { State } from './state.js';
import { Renderer } from './renderer.js';
import { Router } from './router.js';
import { Lifecycle, EventBus } from './registries.js';

  export function hydrate(sourceOrAst, rootSelector) {
    rootSelector = rootSelector || '#app';
    const root = typeof rootSelector === 'string'
      ? document.querySelector(rootSelector)
      : rootSelector;
    if (!root) return;

    const ast = typeof sourceOrAst === 'string' ? Parser.parse(sourceOrAst) : sourceOrAst;
    Router.init();
    const hasSSR = root && root.children && root.children.length > 0;
    if (hasSSR) {
      // Non-destructive hydrate: keep SSR DOM, wire state/bindings/events.
      try {
        attachHydration(ast, root);
      } catch (_) {
        Renderer.render(ast, root);
      }
    } else {
      Renderer.render(ast, root);
    }
    Lifecycle.triggerMount(root);
    EventBus.emit('breeze:hydrated', { root, ast, reused: hasSSR });
  }

  // Walk SSR DOM + AST in parallel to attach reactivity without wiping content.
  // Covers: text bindings, @click actions, bind: inputs, each/if watchers, nav/route.
  function attachHydration(ast, root) {
    // Seed text bindings + actions by re-rendering bindings metadata:
    // We traverse AST and mirror DOM order (best-effort for static + each/if shells).
    const walk = (nodes, parentEl) => {
      if (!nodes || !parentEl) return;
      let childIdx = 0;
      for (let ni = 0; ni < nodes.length; ni++) {
        const node = nodes[ni];
        if (!node) continue;
        if (['theme', 'seo', 'schema', 'aeo', 'geo', 'app', 'state', 'style', 'def'].includes(node.type)) {
          // Still apply side-effects (theme/title/state) during hydrate
          Renderer.renderNode(node);
          continue;
        }
        if (node.type === 'if' || node.type === 'elif' || node.type === 'else') {
          // Ensure conditional reactivity: create hidden watcher container if missing.
          // Simplest robust approach: watch condition keys and force full re-render on change
          // only when the SSR shell diverges (lazy). Register watchers now.
          const keys = [];
          if (node.conditionKey) keys.push(String(node.conditionKey).split('.')[0]);
          // Look ahead for elif/else keys at this level
          for (let k = ni + 1; k < nodes.length; k++) {
            const s = nodes[k];
            if (s.type === 'elif' && s.conditionKey) keys.push(String(s.conditionKey).split('.')[0]);
            else if (s.type === 'else') continue;
            else break;
          }
          keys.forEach(k => {
            State.watch(k, () => {
              // On first conditional change post-hydrate, upgrade to full client render
              // (SSR shell is static; keyed/full render takes over from here).
              // Guard against loops with a flag on root.
              if (!root._bzHydratedUpgraded) {
                root._bzHydratedUpgraded = true;
                Renderer.render(ast, root);
              }
            });
          });
          // Skip elif/else siblings in walk (they belong to this chain)
          while (ni + 1 < nodes.length && (nodes[ni + 1].type === 'elif' || nodes[ni + 1].type === 'else')) ni++;
          childIdx++;
          continue;
        }
        if (node.type === 'each' || node.type === 'virtual-each') {
          // Lists are dynamic: watch list key and upgrade to full render on change
          const baseKey = String(node.listKey).split('.')[0];
          State.watch(baseKey, () => {
            if (!root._bzHydratedUpgraded) {
              root._bzHydratedUpgraded = true;
              Renderer.render(ast, root);
            }
          });
          childIdx++;
          continue;
        }
        let domChild = parentEl.children ? parentEl.children[childIdx] : null;
        if (domChild) {
          const expectedTag = (node.tag || node.type || 'div').toLowerCase();
          const actualTag = (domChild.tagName || '').toLowerCase();
          if (expectedTag !== 'component' && actualTag && expectedTag !== actualTag) {
            if (BreezeConfig.warn && typeof console !== 'undefined' && console.warn) {
              console.warn(`[Breeze Hydration] Mismatch at <${actualTag}> (expected <${expectedTag}>). Attempting recovery...`);
            }
            let found = null;
            for (let s = childIdx + 1; s < parentEl.children.length; s++) {
              if ((parentEl.children[s].tagName || '').toLowerCase() === expectedTag) {
                found = parentEl.children[s];
                childIdx = s;
                break;
              }
            }
            domChild = found || domChild;
          }
          // Re-attach text bindings + actions/inputs for this node
          try {
            if (node.text && /\{([\w.$-]+)\}/.test(node.text)) {
              Renderer.setTextWithBindings(domChild, node.text);
              // Restore SSR text (setTextWithBindings already resolves current state)
            }
            if (node.modifiers) Renderer.applyModifiers(domChild, node.modifiers);
          } catch (_) {}
          if (node.children && node.children.length && domChild.children) {
            walk(node.children, domChild);
          }
        }
        childIdx++;
        // Cap walk to avoid O(n²) on huge SSR pages
        if (childIdx > 5000) break;
      }
    };
    // Apply @state nodes first so bindings resolve to correct values
    ast.filter(n => n && n.type === 'state').forEach(n => State.set(n.key, n.value));
    walk(ast, root);
  }


