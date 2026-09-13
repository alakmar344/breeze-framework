import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Vue SFC templates are compiled AHEAD OF TIME by @vitejs/plugin-vue,
          // so this is the option that actually matters for `<breeze-*>` tags
          // used inside .vue files: it tells Vue's compiler "these are native
          // custom elements, not unresolved Vue components" so it emits plain
          // DOM element creation code instead of a component-resolution
          // warning/no-op. See src/App.vue for where `<breeze-toggle-counter>`
          // is used.
          isCustomElement: (tag) => tag.startsWith('breeze-')
        }
      }
    })
  ]
});
