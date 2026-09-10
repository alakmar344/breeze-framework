/*!
 * Breeze Framework Showcase & Interactive Studio Engine
 * Demonstrates plugins, reactive state, live playground, and developer tooling
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  // PLUGIN 1: Zero-dependency Confetti Engine
  // ═══════════════════════════════════════════════════════════════════════
  function initConfetti() {
    let canvas = document.getElementById('bz-confetti-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'bz-confetti-canvas';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext('2d');
    let particles = [];
    let animationId = null;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const colors = ['#6366f1', '#ec4899', '#06b6d4', '#10b981', '#f59e0b', '#38bdf8', '#a855f7'];

    window.triggerConfetti = function () {
      const count = 120;
      const originX = canvas.width / 2;
      const originY = canvas.height * 0.45;

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 4 + Math.random() * 9;
        particles.push({
          x: originX,
          y: originY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 3,
          size: 6 + Math.random() * 8,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rotationSpeed: (Math.random() - 0.5) * 12,
          opacity: 1,
          gravity: 0.18,
          drag: 0.96
        });
      }

      if (!animationId) loop();
    };

    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.vx *= p.drag;
        p.vy = (p.vy * p.drag) + p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;
        p.opacity -= 0.012;

        if (p.opacity <= 0 || p.y > canvas.height) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      if (particles.length > 0) {
        animationId = requestAnimationFrame(loop);
      } else {
        animationId = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  }

  // Register Confetti Plugin with Breeze
  if (typeof Breeze !== 'undefined') {
    Breeze.plugin('confetti', {
      install() {
        initConfetti();
      },
      actions: {
        confetti() {
          if (window.triggerConfetti) window.triggerConfetti();
          window.showToast('🎉 Confetti Plugin fired via Breeze action!');
        }
      }
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // PLUGIN 2: Modern Glass Toast Notifications
  // ═══════════════════════════════════════════════════════════════════════
  window.showToast = function (message) {
    let container = document.getElementById('bz-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'bz-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'bz-toast';
    toast.innerHTML = `<span>✨</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  };

  // Register Toast Plugin with Breeze
  if (typeof Breeze !== 'undefined') {
    Breeze.plugin('toast', {
      actions: {
        toast(actionStr) {
          const match = actionStr.match(/toast\((.*)\)/);
          const msg = match ? match[1].replace(/^["']|["']$/g, '') : 'Notification from Breeze!';
          window.showToast(msg);
        }
      }
    });
  }


  // ═══════════════════════════════════════════════════════════════════════
  // COPY CLIPBOARD HELPER
  // ═══════════════════════════════════════════════════════════════════════
  window.copyCommand = function (text) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        window.showToast(`📋 Copied: "${text}"`);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      window.showToast(`📋 Copied: "${text}"`);
    }
  };


  // ═══════════════════════════════════════════════════════════════════════
  // INTERACTIVE LIVE STUDIO / PLAYGROUND CONTROLLER
  // ═══════════════════════════════════════════════════════════════════════
  const PRESETS = {
    counter: `@state counter = 5

div [center, pad-md]
  h2 "Interactive Live Counter"
  p "Current value: {counter}"
  div [flex, gap-md, mt-md]
    button "+ Increment" [primary, @click -> increment(counter)]
    button "- Decrement" [secondary, @click -> decrement(counter)]
    button "Reset"      [outline, @click -> setState(counter, 0)]
    button "Party! 🎉"   [accent, @click -> confetti()]`,

    todo: `@state totalTasks = 3

div [pad-md]
  h3 "Task Tracker ({totalTasks} active)"
  div [grid-1, gap-sm, mt-sm]
    card [shadow, hover-lift]
      p "🚀 Clone breeze-framework repository"
    card [shadow, hover-lift]
      p "⚡ Build lightning fast apps with 0 deps"
    card [shadow, hover-lift]
      p "🌊 Deploy directly to Vercel in 1 click"
  div [flex, gap-md, mt-md]
    button "+ Add Task"   [primary, @click -> increment(totalTasks)]
    button "Complete All" [success, @click -> setState(totalTasks, 0)]`,

    hero: `@theme {
  primary: #6366f1
  bg: #ffffff
}

div [center, pad-lg]
  h1 "Build Faster with 🌊 Breeze" [fade-in]
  p "Zero configuration. Zero node_modules. Instant declarative reactivity." [slide-up]
  div [flex, gap-md, mt-md]
    button "Start Building" [primary, @click -> confetti()]
    button "Documentation"  [outline]`,

    cards: `div [grid-2, gap-md, pad-md]
  card [shadow, hover-lift]
    h3 "⚡ Ultra-Fast"
    p "Only ~8KB minified. Zero dependencies to download."
  card [shadow, hover-lift]
    h3 "🧩 Declarative"
    p "Indentation-based syntax with reactive state bindings."
  card [shadow, hover-lift]
    h3 "🛣️ Hash Routing"
    p "Built-in SPA routing with smooth scroll out-of-the-box."
  card [shadow, hover-lift]
    h3 "🔌 Plugin Ready"
    p "Easily add custom actions, effects, and lifecycle hooks."`
  };

  window.setupStudio = function () {
    const editor = document.getElementById('studio-editor');
    const preview = document.getElementById('studio-preview');
    const astView = document.getElementById('studio-ast');
    const htmlView = document.getElementById('studio-html');
    const presetSelect = document.getElementById('studio-preset');

    if (!editor || !preview) return;

    // Load initial code
    editor.value = PRESETS.counter;

    function compileAndRender() {
      const source = editor.value;
      try {
        if (typeof Breeze !== 'undefined') {
          const ast = Breeze.parse(source);

          // Update AST view
          if (astView) {
            astView.textContent = JSON.stringify(ast, null, 2);
          }

          // Mount into preview sandbox
          preview.innerHTML = '';
          const sandbox = document.createElement('div');
          sandbox.className = 'studio-sandbox';
          preview.appendChild(sandbox);
          Breeze.mount(source, sandbox);

          // Update HTML view
          if (htmlView) {
            htmlView.textContent = sandbox.innerHTML;
          }
        }
      } catch (err) {
        preview.innerHTML = `<div class="bz-alert bz-alert-danger" style="margin: 1rem; color: #ef4444; background: #fee2e2; padding: 1rem; border-radius: 8px;"><strong>Syntax Error:</strong> ${err.message}</div>`;
      }
    }

    editor.addEventListener('input', () => {
      clearTimeout(editor._debounce);
      editor._debounce = setTimeout(compileAndRender, 150);
    });

    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const key = e.target.value;
        if (PRESETS[key]) {
          editor.value = PRESETS[key];
          compileAndRender();
        }
      });
    }

    // Tab switcher
    window.switchStudioTab = function (tabName, btn) {
      document.querySelectorAll('.studio-tab').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');

      if (tabName === 'preview') {
        preview.style.display = 'block';
        if (astView) astView.style.display = 'none';
        if (htmlView) htmlView.style.display = 'none';
      } else if (tabName === 'ast') {
        preview.style.display = 'none';
        if (astView) astView.style.display = 'block';
        if (htmlView) htmlView.style.display = 'none';
      } else if (tabName === 'html') {
        preview.style.display = 'none';
        if (astView) astView.style.display = 'none';
        if (htmlView) htmlView.style.display = 'block';
      }
    };

    // Initial compile
    compileAndRender();
  };

  // ═══════════════════════════════════════════════════════════════════════
  // CLI TERMINAL TABS
  // ═══════════════════════════════════════════════════════════════════════
  const TERMINAL_COMMANDS = {
    init: {
      cmd: 'npx breeze-framework init my-app',
      desc: '# Scaffold a lightning-fast new Breeze application with 0 dependencies',
      output: `  🌊 Breeze Framework CLI v1.0.0
  ▸ Creating project my-app in ./my-app
  ✔ Created index.html
  ✔ Created app.breeze
  ✔ Created package.json

  ✔ Project "my-app" created successfully!`
    },
    dev: {
      cmd: 'npx breeze-framework dev',
      desc: '# Starts development server with Server-Sent Events (SSE) live reload',
      output: `  🌊 Breeze Framework CLI v1.0.0
  ✔ Dev server running at http://localhost:3000
  ▸ Watching ./ for changes (.breeze, .html, .css, .js)…
  ▸ Change detected: app.breeze -> Hot reloaded in 12ms`
    },
    build: {
      cmd: 'npx breeze-framework build app.breeze --spa --minify',
      desc: '# Compiles your entire application into a single self-contained HTML file',
      output: `  🌊 Breeze Framework CLI v1.0.0
  ▸ Building app.breeze [SPA mode] [minify] …
  ✔ Built dist/index.html (38.2 KB)
  ✔ Inlined CSS (32.6 KB)
  ✔ Inlined JS  (8.4 KB)
  ✔ Build complete in 42ms! Ready for production deployment.`
    },
    serve: {
      cmd: 'npx breeze-framework serve dist 8080',
      desc: '# Instantly hosts your production build with zero external server dependencies',
      output: `  🌊 Breeze Framework CLI v1.0.0
  ✔ Serving ./dist at http://localhost:8080
  ▸ SPA routing enabled with automatic fallback`
    }
  };

  window.switchCliTab = function (cmdKey, btn) {
    document.querySelectorAll('.cli-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const data = TERMINAL_COMMANDS[cmdKey];
    if (!data) return;

    const termBody = document.getElementById('terminal-content');
    if (termBody) {
      termBody.innerHTML = `
        <div class="comment">${data.desc}</div>
        <div><span class="prompt">$</span> <span class="cmd">${data.cmd}</span></div>
        <pre class="success" style="background: transparent; padding: 0.5rem 0 0; margin: 0; font-size: 0.85rem;">${data.output}</pre>
      `;
    }
    window._currentCliCmd = data.cmd;
  };

  window.copyCurrentCli = function () {
    const cmd = window._currentCliCmd || TERMINAL_COMMANDS.init.cmd;
    window.copyCommand(cmd);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE BOOTSTRAP
  // ═══════════════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', () => {
    initConfetti();
    setTimeout(() => {
      window.setupStudio();
      window.switchCliTab('init');
    }, 200);
  });

})();
