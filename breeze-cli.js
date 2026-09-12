#!/usr/bin/env node
/*!
 * Breeze CLI v2.2.0
 * Zero-dependency build tool, dev server, and toolkit for the Breeze Framework
 * MIT License
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const zlib = require('zlib');
const os   = require('os');
const { performance } = require('perf_hooks');

// Dynamically load framework version
let VERSION = '2.2.0';
try {
  VERSION = require('./package.json').version;
} catch (_) {}

// ═══════════════════════════════════════════════════════════════════════
// ANSI COLOR HELPERS & COLOR DETECTION
// ═══════════════════════════════════════════════════════════════════════
const hasNoColor = Boolean(
  process.env.NO_COLOR ||
  process.env.NODE_DISABLE_COLORS ||
  process.env.TERM === 'dumb' ||
  process.argv.includes('--no-color')
);

const C = hasNoColor ? {
  reset: '', bold: '', dim: '', red: '', green: '', yellow: '',
  blue: '', magenta: '', cyan: '', white: '', bgBlue: '', gray: ''
} : {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
  white:   '\x1b[37m',
  gray:    '\x1b[90m',
  bgBlue:  '\x1b[44m',
};

const col  = (color, str) => `${C[color] || ''}${str}${C.reset}`;
const bold = str => `${C.bold}${str}${C.reset}`;
const dim  = str => `${C.dim}${str}${C.reset}`;

const log  = (...a) => console.log(col('cyan', '  ▸'), ...a);
const ok   = (...a) => console.log(col('green', '  ✔'), ...a);
const warn = (...a) => console.log(col('yellow', '  ⚠'), ...a);
const err  = (...a) => console.error(col('red', '  ✖'), ...a);

function banner() {
  console.log('');
  console.log(col('cyan', bold(`  🌊 Breeze Framework CLI v${VERSION}`)));
  console.log(dim('  Ultra-lightweight declarative web framework'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// ZERO-DEPENDENCY ARGUMENT PARSER
// ═══════════════════════════════════════════════════════════════════════
/**
 * Robust argument parser supporting long flags, short flags, values with `=`,
 * boolean flags, negation (--no-foo), and positionals (`_`).
 */
function parseArgs(args = [], schema = {}) {
  const result = { _: [] };
  const aliases = schema.alias || {};
  const booleans = new Set(schema.boolean || []);
  const strings = new Set(schema.string || []);
  const numbers = new Set(schema.number || []);

  const resolveKey = (key) => aliases[key] || key;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--') {
      result._.push(...args.slice(i + 1));
      break;
    }

    // Long options: --flag or --flag=value or --no-flag
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const rawKey = arg.slice(2, eqIdx);
        const key = resolveKey(rawKey);
        const val = arg.slice(eqIdx + 1);
        result[key] = numbers.has(key) ? Number(val) : val;
      } else {
        const rawKey = arg.slice(2);
        if (rawKey.startsWith('no-')) {
          const key = resolveKey(rawKey.slice(3));
          result[key] = false;
        } else {
          const key = resolveKey(rawKey);
          if (booleans.has(key)) {
            result[key] = true;
          } else {
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith('-')) {
              result[key] = numbers.has(key) ? Number(next) : next;
              i++;
            } else {
              result[key] = true;
            }
          }
        }
      }
      continue;
    }

    // Short options: -f, -f value, -f=value, or combined -abc
    if (arg.startsWith('-') && arg.length > 1 && !/^-?\d+$/.test(arg)) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const rawKey = arg.slice(1, eqIdx);
        const key = resolveKey(rawKey);
        const val = arg.slice(eqIdx + 1);
        result[key] = numbers.has(key) ? Number(val) : val;
      } else {
        const flagGroup = arg.slice(1);
        if (flagGroup.length === 1) {
          const key = resolveKey(flagGroup);
          if (booleans.has(key)) {
            result[key] = true;
          } else {
            const next = args[i + 1];
            if (next !== undefined && !next.startsWith('-')) {
              result[key] = numbers.has(key) ? Number(next) : next;
              i++;
            } else {
              result[key] = true;
            }
          }
        } else {
          // Check if short flag has inline value like -p3000
          const firstKey = resolveKey(flagGroup[0]);
          if (numbers.has(firstKey) || strings.has(firstKey)) {
            const rest = flagGroup.slice(1);
            result[firstKey] = numbers.has(firstKey) ? Number(rest) : rest;
          } else {
            // Group of booleans: -rf -> -r -f
            for (const char of flagGroup) {
              const k = resolveKey(char);
              result[k] = true;
            }
          }
        }
      }
      continue;
    }

    // Positional argument
    result._.push(arg);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// MIME TYPE MAP & PATH SECURITY
// ═══════════════════════════════════════════════════════════════════════
const MIME = {
  '.html':        'text/html; charset=utf-8',
  '.css':         'text/css; charset=utf-8',
  '.js':          'text/javascript; charset=utf-8',
  '.mjs':         'text/javascript; charset=utf-8',
  '.cjs':         'text/javascript; charset=utf-8',
  '.ts':          'text/plain; charset=utf-8',
  '.json':        'application/json',
  '.breeze':      'text/plain; charset=utf-8',
  '.png':         'image/png',
  '.jpg':         'image/jpeg',
  '.jpeg':        'image/jpeg',
  '.gif':         'image/gif',
  '.svg':         'image/svg+xml',
  '.webp':        'image/webp',
  '.avif':        'image/avif',
  '.ico':         'image/x-icon',
  '.woff':        'font/woff',
  '.woff2':       'font/woff2',
  '.ttf':         'font/ttf',
  '.otf':         'font/otf',
  '.eot':         'application/vnd.ms-fontobject',
  '.wasm':        'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.mp4':         'video/mp4',
  '.webm':        'video/webm',
  '.mp3':         'audio/mpeg',
  '.ogg':         'audio/ogg',
  '.wav':         'audio/wav',
  '.txt':         'text/plain; charset=utf-8',
  '.md':          'text/plain; charset=utf-8',
  '.map':         'application/json',
  '.xml':         'application/xml; charset=utf-8',
  '.pdf':         'application/pdf',
};

function getMime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Security: resolve path within baseDir preventing directory traversal attacks
 */
function safeResolvePath(baseDir, reqPath) {
  try {
    const decoded = decodeURIComponent(reqPath).replace(/\0/g, '');
    const relativePath = decoded.replace(/^[/\\]+/, '');
    const resolved = path.resolve(baseDir, relativePath);
    const normalizedBase = path.resolve(baseDir);
    if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
      return null;
    }
    return resolved;
  } catch (_) {
    return null;
  }
}

/**
 * Open default browser cross-platform
 */
function openBrowser(targetUrl) {
  const { exec } = require('child_process');
  const platform = process.platform;
  let cmd = '';
  if (platform === 'darwin') cmd = `open "${targetUrl}"`;
  else if (platform === 'win32') cmd = `start "" "${targetUrl}"`;
  else cmd = `xdg-open "${targetUrl}"`;
  exec(cmd, () => {});
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: init / create
// ═══════════════════════════════════════════════════════════════════════
function cmdInit(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    string: ['template'],
    boolean: ['force', 'help'],
    alias: { t: 'template', f: 'force', h: 'help' }
  });

  if (parsed.help) {
    showHelp('init');
    return;
  }

  const rawName = parsed._[0] || 'my-breeze-app';
  const isCurrentDir = rawName === '.' || rawName === './';
  const dir = path.resolve(rawName);
  const name = isCurrentDir ? path.basename(dir) : rawName;
  const template = (parsed.template || 'default').toLowerCase();

  if (fs.existsSync(dir) && !isCurrentDir) {
    if (!parsed.force) {
      err(`Directory "${rawName}" already exists. Use ${bold('--force')} to overwrite.`);
      process.exit(1);
    }
  }

  if (isCurrentDir && fs.existsSync(dir) && !parsed.force) {
    const existing = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
    if (existing.length > 0) {
      err(`Current directory is not empty. Use ${bold('--force')} to initialize here.`);
      process.exit(1);
    }
  }

  fs.mkdirSync(dir, { recursive: true });
  log(`Initializing ${bold(name)} using template ${col('cyan', template)} in ${dim(dir)}`);

  // ── Templates ─────────────────────────────────────────────────────
  let appBreeze = '';

  if (template === 'minimal') {
    appBreeze = `@app "${name}"

@theme {
  primary: #0266d6
  bg: #ffffff
  text: #1f2937
}

@state count = 0

@section #main [pad-xl, center]
  h1 "Breeze Minimal"
  p "Counter: {count}"
  button "+ Click" [primary, @click -> increment(count)]
`;
  } else if (template === 'counter') {
    appBreeze = `@app "${name} Counter"

@theme {
  primary: #0266d6
  secondary: #4f46e5
  bg: #f8fafc
  text: #0f172a
  radius: 12px
}

@state count = 0
@state step = 1

@section #counter [pad-xl, center, hero]
  h1 "Reactive Counter"
  p "Fine-grained signals in action: {count}"

  card [shadow, pad-lg, center]
    p "Step: {step}"
    button "+ Increment" [primary, @click -> increment(count)]
    button "- Decrement" [secondary, @click -> decrement(count)]
    button "Reset" [danger, @click -> setState(count, 0)]
`;
  } else {
    // Default full template
    appBreeze = `@app "${name}"

@theme {
  primary: #0266d6
  secondary: #4f46e5
  accent: #f59e0b
  bg: #ffffff
  text: #1f2937
  radius: 8px
  font: "Inter, sans-serif"
}

@state count = 0

@nav [sticky]
  link "Home" -> #home
  link "About" -> #about

@section #home [hero, center, pad-xl]
  h1 "Hello from Breeze 🌊"
  p "Edit app.breeze to get started."
  button "Learn More" [primary, @click -> navigate(#about)]

@section #about [pad-lg, center, light]
  h2 "About"
  p "Built with the Breeze Framework — ultra-lightweight and declarative."
  p "Counter: {count}"
  button "+ Increment" [primary, @click -> increment(count)]
  button "- Decrement" [secondary, @click -> decrement(count)]

@footer [dark]
  p "© 2026 ${name}"
`;
  }

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <link rel="stylesheet" href="breeze.css">
</head>
<body>
  <div id="app"></div>
  <script src="breeze.js"></script>
  <script>
    Breeze.init('app.breeze', '#app');
  </script>
</body>
</html>
`;

  const pkg = JSON.stringify({
    name,
    version: '0.1.0',
    description: `A Breeze Framework app`,
    scripts: {
      dev:     'breeze dev',
      build:   'breeze build app.breeze --minify',
      preview: 'breeze serve dist',
      lint:    'breeze lint',
      format:  'breeze format',
      check:   'breeze check --types'
    }
  }, null, 2) + '\n';

  const gitignore = `dist/
node_modules/
.DS_Store
*.log
`;

  const readme = `# ${name}

Built with [Breeze Framework](https://github.com/alakmar344/breeze-framework) — ultra-lightweight declarative web framework.

## Getting Started

\`\`\`bash
# Start development server with live reload
breeze dev

# Build for production
breeze build app.breeze --minify

# Preview production build
breeze serve dist
\`\`\`
`;

  const files = {
    'index.html': indexHtml,
    'app.breeze': appBreeze,
    'package.json': pkg,
    '.gitignore': gitignore,
    'README.md': readme
  };

  for (const [fname, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, fname), content, 'utf8');
    ok(`Created ${bold(fname)}`);
  }

  // Copy runtime and types so the project runs immediately
  let runtimeOk = true;
  for (const runtime of ['breeze.js', 'breeze.css', 'breeze.d.ts']) {
    const srcPath = path.join(__dirname, runtime);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(dir, runtime));
      ok(`Added ${bold(runtime)} ${dim('(runtime/types)')}`);
    } else {
      runtimeOk = false;
      warn(`Could not find ${runtime} next to CLI.`);
    }
  }

  console.log('');
  ok(col('green', bold(`Project "${name}" created successfully!`)));
  console.log('');
  console.log('  Next steps:');
  if (!isCurrentDir) log(`cd ${name}`);
  log(`breeze dev            ${dim('# start dev server with live reload')}`);
  log(`breeze build          ${dim('# build production bundle in dist/')}`);
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: dev — static server + SSE live reload + port auto-recovery
// ═══════════════════════════════════════════════════════════════════════
function cmdDev(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    number: ['port'],
    string: ['host'],
    boolean: ['open', 'cors', 'strict-port', 'help'],
    alias: { p: 'port', H: 'host', o: 'open', h: 'help' }
  });

  if (parsed.help) {
    showHelp('dev');
    return;
  }

  let port = Number(parsed.port) || 3000;
  let host = parsed.host || 'localhost';
  let cwd = process.cwd();

  if (parsed._.length > 0) {
    const firstPos = parsed._[0];
    if (/^\d+$/.test(firstPos)) {
      port = parseInt(firstPos, 10);
    } else {
      cwd = path.resolve(firstPos);
    }
  }

  if (parsed._.length > 1 && /^\d+$/.test(parsed._[1])) {
    port = parseInt(parsed._[1], 10);
  }

  if (!fs.existsSync(cwd)) {
    err(`Directory not found: ${cwd}`);
    process.exit(1);
  }

  const sseClients = [];

  function triggerReload(changedFile) {
    const rel = path.relative(cwd, changedFile) || changedFile;
    log(`Change detected: ${dim(rel)} — reloading browser…`);
    const payload = `data: reload\n\n`;
    for (let i = sseClients.length - 1; i >= 0; i--) {
      const res = sseClients[i];
      try {
        res.write(payload);
      } catch (_) {
        sseClients.splice(i, 1);
      }
    }
  }

  const liveReloadScript = `
<script>
/* Breeze CLI live-reload */
(function () {
  var es = new EventSource('/__bz_sse__');
  es.onmessage = function (e) { if (e.data === 'reload') window.location.reload(); };
  es.onerror   = function ()  { setTimeout(function(){ window.location.reload(); }, 2000); };
})();
</script>`;

  const server = http.createServer((req, res) => {
    // Enable CORS if requested
    if (parsed.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    const parsedUrl = url.parse(req.url);
    let reqPath = parsedUrl.pathname || '/';

    // SSE endpoint
    if (reqPath === '/__bz_sse__') {
      res.writeHead(200, {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      res.write('data: connected\n\n');
      sseClients.push(res);
      req.on('close', () => {
        const idx = sseClients.indexOf(res);
        if (idx !== -1) sseClients.splice(idx, 1);
      });
      return;
    }

    // Security: resolve safely preventing path traversal
    let filePath = safeResolvePath(cwd, reqPath);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    // Check directory indexing
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch (_) {}

    // Smart SPA routing fallback: only fallback for HTML navigation requests
    const acceptHeader = req.headers['accept'] || '';
    const hasExtension = path.extname(reqPath).length > 0;
    const isNavigation = req.method === 'GET' && (acceptHeader.includes('text/html') || !hasExtension);

    if (!fs.existsSync(filePath)) {
      // Check if fallback to runtime files next to CLI
      const baseName = path.basename(reqPath);
      const runtimeFallback = path.join(__dirname, baseName);
      if (['breeze.js', 'breeze.css', 'breeze.d.ts'].includes(baseName) && fs.existsSync(runtimeFallback)) {
        filePath = runtimeFallback;
      } else if (isNavigation) {
        filePath = path.join(cwd, 'index.html');
      }
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = getMime(filePath);

    try {
      let content = fs.readFileSync(filePath);

      if (ext === '.html') {
        let htmlStr = content.toString('utf8');
        if (/<\/body>/i.test(htmlStr)) {
          htmlStr = htmlStr.replace(/<\/body>/i, liveReloadScript + '\n</body>');
        } else if (/<\/html>/i.test(htmlStr)) {
          htmlStr = htmlStr.replace(/<\/html>/i, liveReloadScript + '\n</html>');
        } else {
          htmlStr += liveReloadScript;
        }
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        });
        res.end(htmlStr, 'utf8');
      } else {
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Cache-Control': 'no-cache'
        });
        res.end(content);
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error: ' + e.message);
    }
  });

  // Keep-alive heartbeat for SSE connections
  const ssePingInterval = setInterval(() => {
    for (let i = sseClients.length - 1; i >= 0; i--) {
      try {
        sseClients[i].write(': ping\n\n');
      } catch (_) {
        sseClients.splice(i, 1);
      }
    }
  }, 15000);

  let currentPort = port;
  let attempts = 0;
  const maxAttempts = 10;

  function startServer() {
    server.removeAllListeners('error');
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        if (parsed['strict-port'] || attempts >= maxAttempts) {
          err(`Port ${currentPort} is already in use.`);
          process.exit(1);
        }
        warn(`Port ${currentPort} is in use, trying ${currentPort + 1}…`);
        currentPort++;
        attempts++;
        startServer();
      } else {
        err(`Server error: ${e.message}`);
        process.exit(1);
      }
    });

    const listenHost = host === 'localhost' ? '127.0.0.1' : host;
    server.listen(currentPort, listenHost, () => {
      const displayHost = host === 'localhost' ? 'localhost' : host;
      const urlStr = `http://${displayHost}:${currentPort}/`;
      ok(`Dev server running at ${bold(col('cyan', urlStr))}`);
      log(`Serving ${dim(cwd)}`);
      log('Press Ctrl+C to stop.\n');

      if (parsed.open) {
        openBrowser(urlStr);
      }
    });
  }

  startServer();

  // File watcher with debounce
  const WATCH_EXTS = new Set(['.html', '.breeze', '.css', '.js', '.json', '.ts']);
  let debounceTimer = null;

  function watchDir(dir) {
    try {
      fs.watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const ext = path.extname(filename).toLowerCase();
        if (!WATCH_EXTS.has(ext)) return;
        if (filename.includes('node_modules') || filename.includes('dist') || filename.startsWith('.')) return;

        const full = path.join(dir, filename);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => triggerReload(full), 80);
      });
    } catch (e) {
      warn(`Could not watch directory: ${e.message}`);
    }
  }

  watchDir(cwd);

  process.on('SIGINT', () => {
    clearInterval(ssePingInterval);
    console.log('');
    log('Shutting down dev server.');
    server.close();
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: build — compiler, optimizer, asset packager & SSG
// ═══════════════════════════════════════════════════════════════════════
function cmdBuild(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    string: ['out-dir', 'base'],
    boolean: ['spa', 'minify', 'min', 'watch', 'clean', 'no-compress', 'help'],
    alias: { o: 'out-dir', m: 'minify', w: 'watch', h: 'help' }
  });

  if (parsed.help) {
    showHelp('build');
    return;
  }

  const breezeSrc = parsed._[0] || 'app.breeze';
  const outDirName = parsed['out-dir'] || 'dist';
  const doSpa     = Boolean(parsed.spa);
  const doMinify  = Boolean(parsed.minify);
  const doMin     = Boolean(parsed.min);
  const noCompress = Boolean(parsed['no-compress']);
  const cwd       = process.cwd();
  const distDir   = path.resolve(cwd, outDirName);

  function executeBuild() {
    const startTime = performance.now();
    log(`Building ${bold(breezeSrc)}${doSpa ? ' [SPA]' : ''}${doMinify ? ' [minify]' : ''}${doMin ? ' [min runtime]' : ''} → ${dim(outDirName)}…`);

    const breezeFile = path.resolve(cwd, breezeSrc);
    if (!fs.existsSync(breezeFile)) {
      err(`File not found: ${breezeSrc}`);
      if (!parsed.watch) process.exit(1);
      return;
    }

    const breezeContent = fs.readFileSync(breezeFile, 'utf8');

    // Clean output directory if requested
    if (parsed.clean && fs.existsSync(distDir)) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
    fs.mkdirSync(distDir, { recursive: true });

    // Read breeze.css
    let css = '';
    const cssCandidates = [
      path.join(cwd, 'breeze.css'),
      path.join(path.dirname(breezeFile), 'breeze.css'),
      path.join(__dirname, 'breeze.css')
    ];
    for (const cand of cssCandidates) {
      if (fs.existsSync(cand)) {
        css = fs.readFileSync(cand, 'utf8');
        break;
      }
    }
    if (css && doMinify) {
      css = minifyCSS(css);
    }

    // Read breeze.js for SPA mode
    let js = '';
    if (doSpa) {
      const jsCandidates = [
        path.join(cwd, 'breeze.js'),
        path.join(path.dirname(breezeFile), 'breeze.js'),
        path.join(__dirname, 'breeze.js')
      ];
      for (const cand of jsCandidates) {
        if (fs.existsSync(cand)) {
          js = fs.readFileSync(cand, 'utf8');
          break;
        }
      }
      if (js && doMinify) {
        js = minifyJS(js);
      }
    }

    // Build the HTML
    const htmlContent = buildHTML({
      breezeSource: breezeContent,
      css,
      js,
      doSpa,
      doMinify
    });

    const outFile = path.join(distDir, 'index.html');
    fs.writeFileSync(outFile, htmlContent, 'utf8');

    const sizeHtml = Buffer.byteLength(htmlContent, 'utf8');
    ok(`Built ${bold(path.join(outDirName, 'index.html'))}      ${dim(formatSize(sizeHtml))}`);

    if (css) {
      ok(`Inlined CSS                   ${dim(formatSize(Buffer.byteLength(css, 'utf8')))}`);
    }
    if (js) {
      ok(`Inlined JS                    ${dim(formatSize(Buffer.byteLength(js, 'utf8')))}`);
    }

    // Compression: Gzip & Brotli
    if (!noCompress) {
      try {
        const htmlBuf = Buffer.from(htmlContent, 'utf8');
        const gzBuf   = zlib.gzipSync(htmlBuf, { level: 9 });
        const brBuf   = zlib.brotliCompressSync(htmlBuf, {
          params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
        });

        fs.writeFileSync(outFile + '.gz', gzBuf);
        fs.writeFileSync(outFile + '.br', brBuf);

        const gzSavings = (((sizeHtml - gzBuf.length) / sizeHtml) * 100).toFixed(1);
        const brSavings = (((sizeHtml - brBuf.length) / sizeHtml) * 100).toFixed(1);

        ok(`Auto-compressed  ${bold('gzip')}         ${dim(formatSize(gzBuf.length))}  ${col('green', `(-${gzSavings}%)`)}`);
        ok(`Auto-compressed  ${bold('brotli')}       ${dim(formatSize(brBuf.length))}  ${col('green', `(-${brSavings}%)`)}`);
      } catch (e) {
        warn(`Auto-compression skipped: ${e.message}`);
      }
    }

    // Native SEO, AEO & GEO Automation: Sitemap & Robots.txt
    try {
      const { canonicalUrl } = extractSeoAndHead(breezeContent);
      const baseUrl = canonicalUrl ? canonicalUrl.replace(/\/$/, '') : 'https://example.com';

      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>\n`;
      fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');
      ok(`Generated ${bold(path.join(outDirName, 'sitemap.xml'))}       ${dim('[SEO]')}`);

      const robotsTxt = `# Robots.txt — Generated by Breeze Framework (SEO, AEO & GEO)
User-agent: *
Allow: /

# Answer Engine & Generative AI Search Crawlers
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

Sitemap: ${baseUrl}/sitemap.xml
`;
      fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8');
      ok(`Generated ${bold(path.join(outDirName, 'robots.txt'))}        ${dim('[GEO & AEO]')}`);
    } catch (e) {
      warn(`Sitemap/Robots skipped: ${e.message}`);
    }

    // Minified runtime option
    if (doMin) {
      try {
        const jsCandidates = [path.join(cwd, 'breeze.js'), path.join(__dirname, 'breeze.js')];
        const jsFile = jsCandidates.find(f => fs.existsSync(f));
        if (jsFile) {
          const raw = fs.readFileSync(jsFile, 'utf8');
          const min = minifyJS(raw);
          const minFile = path.join(distDir, 'breeze.min.js');
          fs.writeFileSync(minFile, min, 'utf8');
          const gz = zlib.gzipSync(Buffer.from(min, 'utf8'), { level: 9 });
          fs.writeFileSync(minFile + '.gz', gz);
          ok(`Min runtime ${bold(path.join(outDirName, 'breeze.min.js'))}   ${dim(formatSize(Buffer.byteLength(min, 'utf8')) + ' / gzip ' + formatSize(gz.length))}`);
        }
      } catch (e) {
        warn(`Min runtime skipped: ${e.message}`);
      }
    }

    // Copy public / static directory if present
    for (const pubDir of ['public', 'static']) {
      const pubPath = path.join(cwd, pubDir);
      if (fs.existsSync(pubPath) && fs.statSync(pubPath).isDirectory()) {
        try {
          copyDirRecursive(pubPath, distDir);
          ok(`Copied static assets from ${bold(pubDir + '/')} → ${dim(outDirName + '/')}`);
        } catch (e) {
          warn(`Could not copy ${pubDir}: ${e.message}`);
        }
        break;
      }
    }

    const elapsed = (performance.now() - startTime).toFixed(1);
    console.log('');
    ok(col('green', bold(`Build complete in ${elapsed} ms!`)));
    log(`Output: ${dim(distDir)}\n`);
  }

  executeBuild();

  // Watch mode
  if (parsed.watch) {
    log(`Watching for changes in ${dim(cwd)}… (Press Ctrl+C to stop)`);
    const WATCH_EXTS = new Set(['.breeze', '.css', '.js', '.html']);
    let watchDebounce = null;
    fs.watch(cwd, { recursive: true }, (event, filename) => {
      if (!filename) return;
      if (filename.includes('node_modules') || filename.includes(outDirName)) return;
      const ext = path.extname(filename).toLowerCase();
      if (!WATCH_EXTS.has(ext)) return;

      if (watchDebounce) clearTimeout(watchDebounce);
      watchDebounce = setTimeout(() => {
        log(`File changed: ${dim(filename)} — rebuilding…`);
        executeBuild();
      }, 100);
    });
  }
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Escape a string for safe interpolation into an HTML attribute value. */
function escAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extract SEO, AEO, GEO, and Schema from .breeze source for static head pre-rendering */
function extractSeoAndHead(breezeSource) {
  let title = 'Breeze App';
  let metaTags = [];
  let jsonLd = null;
  let canonicalUrl = '';

  const lines = breezeSource.split('\n');
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('@app')) {
      const m = trimmed.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (m) title = m[1];
    }
    const blockM = trimmed.match(/^@(seo|schema|aeo|geo)\b/);
    if (blockM) {
      const type = blockM[1];
      const props = {};
      i++;
      while (i < lines.length) {
        const tl = lines[i].trim();
        if (tl === '}') { i++; break; }
        if (tl && !tl.startsWith('//') && !tl.startsWith('##')) {
          const ci = tl.indexOf(':');
          if (ci !== -1) {
            const k = tl.substring(0, ci).trim();
            let v = tl.substring(ci + 1).trim();
            try { v = JSON.parse(v); } catch (_) { v = v.replace(/^["']|["']$/g, ''); }
            props[k] = v;
          }
        }
        i++;
      }

      if (type === 'seo') {
        if (props.title) title = props.title;
        if (props.description) metaTags.push(`<meta name="description" content="${escAttr(props.description)}">`);
        if (props.keywords) metaTags.push(`<meta name="keywords" content="${escAttr(props.keywords)}">`);
        if (props.author) metaTags.push(`<meta name="author" content="${escAttr(props.author)}">`);
        metaTags.push(`<meta name="robots" content="${escAttr(props.robots || 'index, follow')}">`);

        if (props.canonical) {
          canonicalUrl = props.canonical;
          metaTags.push(`<link rel="canonical" href="${escAttr(props.canonical)}">`);
        }
        metaTags.push(`<meta property="og:title" content="${escAttr(props.ogTitle || props.title || title)}">`);
        if (props.description) metaTags.push(`<meta property="og:description" content="${escAttr(props.ogDescription || props.description)}">`);
        if (props.image) metaTags.push(`<meta property="og:image" content="${escAttr(props.image)}">`);
        if (props.canonical) metaTags.push(`<meta property="og:url" content="${escAttr(props.canonical)}">`);
        metaTags.push(`<meta property="og:type" content="${escAttr(props.type || 'website')}">`);

        metaTags.push(`<meta name="twitter:card" content="${escAttr(props.twitterCard || 'summary_large_image')}">`);
        metaTags.push(`<meta name="twitter:title" content="${escAttr(props.twitterTitle || props.title || title)}">`);
        if (props.description) metaTags.push(`<meta name="twitter:description" content="${escAttr(props.twitterDescription || props.description)}">`);
        if (props.image) metaTags.push(`<meta name="twitter:image" content="${escAttr(props.image)}">`);
      }

      if (type === 'aeo') {
        if (props.summary) metaTags.push(`<meta name="ai:summary" content="${escAttr(props.summary)}">`);
        if (props.topics) metaTags.push(`<meta name="ai:key_points" content="${escAttr(props.topics)}">`);
      }

      if (type === 'geo') {
        if (props.entities) metaTags.push(`<meta name="geo:entities" content="${escAttr(props.entities)}">`);
        if (props.facts) metaTags.push(`<meta name="geo:facts" content="${escAttr(props.facts)}">`);
      }

      if (type === 'schema') {
        jsonLd = Object.assign({ '@context': 'https://schema.org', '@type': props.type || 'WebSite' }, props);
      }
      continue;
    }
    i++;
  }

  return { title, metaTags, jsonLd, canonicalUrl };
}

/** Assemble the final HTML document */
function buildHTML({ breezeSource, css, js, doSpa, doMinify }) {
  const jsonSource = JSON.stringify(breezeSource).replace(/</g, '\\u003c');
  const { title, metaTags, jsonLd } = extractSeoAndHead(breezeSource);

  // Pre-render static HTML for instant SSG / FCP
  let preRenderedHtml = '';
  try {
    let bzMod;
    const candidates = [
      path.join(process.cwd(), 'breeze.js'),
      path.join(__dirname, 'breeze.js')
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        bzMod = require(cand);
        break;
      }
    }
    if (!bzMod) bzMod = require('./breeze.js');
    const Breeze = bzMod.Breeze || bzMod;
    if (Breeze && typeof Breeze.renderToString === 'function') {
      preRenderedHtml = Breeze.renderToString(breezeSource);
    }
  } catch (_) {}

  let styleTag = '';
  if (css) {
    styleTag = `<style>\n${css}\n</style>`;
  }

  const mountScript = `<script>
/* Breeze source — embedded at build time */
(function(){
  if(typeof Breeze!=='undefined') {
    var root = document.getElementById('app');
    if (root && root.children && root.children.length > 0 && typeof Breeze.hydrate === 'function') {
      Breeze.hydrate(${jsonSource},'#app');
    } else {
      Breeze.mount(${jsonSource},'#app');
    }
  }
})();
</script>`;

  let scriptTags = '';
  if (doSpa && js) {
    scriptTags = `<script>\n${js}\n</script>\n${mountScript}`;
  } else if (doSpa) {
    scriptTags =
      `<script src="https://unpkg.com/breeze-framework/breeze.js"></script>\n` +
      mountScript;
  } else {
    scriptTags = `  <script src="breeze.js"></script>\n${mountScript}`;
  }

  const headMetaHtml = metaTags.length ? '  ' + metaTags.join('\n  ') + '\n' : '';
  const jsonLdSafe = jsonLd
    ? JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c')
    : '';
  const schemaScript = jsonLd
    ? `  <script type="application/ld+json" data-breeze-schema>\n${jsonLdSafe}\n  </script>\n`
    : '';

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escAttr(title)}</title>
${headMetaHtml}${schemaScript}${css ? styleTag : '  <link rel="stylesheet" href="breeze.css">'}
</head>
<body>
  <div id="app">${preRenderedHtml}</div>
${scriptTags}
</body>
</html>
`;

  if (doMinify) html = minifyHTML(html);
  return html;
}

// ─── Naïve minifiers (no external deps) ──────────────────────────────

function minifyCSS(css) {
  const stash = [];
  const safe = String(css).replace(/(calc|min|max|clamp)\([^()]*\)/gi, m => {
    stash.push(m);
    return `__BZCALC${stash.length - 1}__`;
  });
  const min = safe
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*([{};:,>~+])\s*/g, '$1')
    .replace(/;\}/g, '}')
    .trim();
  return min.replace(/__BZCALC(\d+)__/g, (_, n) => stash[Number(n)]);
}

function minifyHTML(html) {
  const blocks = [];
  const stash = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, m => {
    blocks.push(m);
    return ` BZBLOCK${blocks.length - 1} `;
  });

  const minified = stash
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();

  return minified.replace(/ BZBLOCK(\d+) /g, (_, n) => blocks[Number(n)]);
}

function minifyJS(js) {
  return js
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: serve / preview — static file server
// ═══════════════════════════════════════════════════════════════════════
function cmdServe(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    number: ['port'],
    string: ['host', 'dir'],
    boolean: ['open', 'cors', 'strict-port', 'help'],
    alias: { p: 'port', H: 'host', o: 'open', d: 'dir', h: 'help' }
  });

  if (parsed.help) {
    showHelp('serve');
    return;
  }

  let port = Number(parsed.port) || 8080;
  let host = parsed.host || 'localhost';
  let targetDir = parsed.dir || parsed._[0] || 'dist';

  if (parsed._.length > 1 && /^\d+$/.test(parsed._[1])) {
    port = parseInt(parsed._[1], 10);
  } else if (/^\d+$/.test(targetDir)) {
    port = parseInt(targetDir, 10);
    targetDir = 'dist';
  }

  const serveDir = path.resolve(process.cwd(), targetDir);

  if (!fs.existsSync(serveDir)) {
    err(`Directory not found: ${serveDir}`);
    err('Run `breeze build` first, or specify a valid directory.');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    if (parsed.cors) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
    }

    const parsedUrl = url.parse(req.url);
    let reqPath = parsedUrl.pathname || '/';

    let filePath = safeResolvePath(serveDir, reqPath);
    if (!filePath) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('403 Forbidden');
      return;
    }

    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }
    } catch (_) {}

    // SPA fallback only for HTML navigation
    const acceptHeader = req.headers['accept'] || '';
    const hasExtension = path.extname(reqPath).length > 0;
    const isNavigation = req.method === 'GET' && (acceptHeader.includes('text/html') || !hasExtension);

    if (!fs.existsSync(filePath) && isNavigation) {
      filePath = path.join(serveDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`404 Not Found: ${reqPath}`);
      return;
    }

    try {
      const acceptEncoding = req.headers['accept-encoding'] || '';
      let servePath = filePath;
      const headers = {
        'Content-Type':  getMime(filePath),
        'Cache-Control': 'public, max-age=3600',
        'Vary':          'Accept-Encoding'
      };

      if (acceptEncoding.includes('br') && fs.existsSync(filePath + '.br')) {
        servePath = filePath + '.br';
        headers['Content-Encoding'] = 'br';
      } else if (acceptEncoding.includes('gzip') && fs.existsSync(filePath + '.gz')) {
        servePath = filePath + '.gz';
        headers['Content-Encoding'] = 'gzip';
      }

      const stat = fs.statSync(servePath);
      const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
      headers['ETag'] = etag;

      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, headers);
        res.end();
        return;
      }

      const content = fs.readFileSync(servePath);
      res.writeHead(200, headers);
      res.end(content);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error: ' + e.message);
    }
  });

  let currentPort = port;
  let attempts = 0;
  const maxAttempts = 10;

  function startServer() {
    server.removeAllListeners('error');
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        if (parsed['strict-port'] || attempts >= maxAttempts) {
          err(`Port ${currentPort} is already in use.`);
          process.exit(1);
        }
        warn(`Port ${currentPort} is in use, trying ${currentPort + 1}…`);
        currentPort++;
        attempts++;
        startServer();
      } else {
        err(`Server error: ${e.message}`);
        process.exit(1);
      }
    });

    const listenHost = host === 'localhost' ? '127.0.0.1' : host;
    server.listen(currentPort, listenHost, () => {
      const displayHost = host === 'localhost' ? 'localhost' : host;
      const urlStr = `http://${displayHost}:${currentPort}/`;
      ok(`Serving ${bold(serveDir)} at ${bold(col('cyan', urlStr))}`);
      log('Press Ctrl+C to stop.\n');

      if (parsed.open) {
        openBrowser(urlStr);
      }
    });
  }

  startServer();

  process.on('SIGINT', () => {
    console.log('');
    log('Server stopped.');
    server.close();
    process.exit(0);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: profile
// ═══════════════════════════════════════════════════════════════════════
function cmdProfile(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, { boolean: ['help'], alias: { h: 'help' } });
  if (parsed.help) {
    showHelp('profile');
    return;
  }

  const file = parsed._[0] || 'app.breeze';
  const fullPath = path.resolve(file);
  if (!fs.existsSync(fullPath)) {
    err(`File not found: ${file}`);
    process.exit(1);
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  log(`Profiling ${bold(file)} (${dim(formatSize(Buffer.byteLength(content, 'utf8')))})…\n`);

  let Breeze;
  try {
    const bzMod = require('./breeze.js');
    Breeze = bzMod.Breeze || bzMod;
  } catch (e) {
    err(`Could not load breeze.js: ${e.message}`);
    process.exit(1);
  }

  const ITERS = 100;
  const t0 = performance.now();
  let ast;
  for (let i = 0; i < ITERS; i++) {
    ast = Breeze.parse(content);
  }
  const parseMs = performance.now() - t0;
  const avgParse = (parseMs / ITERS).toFixed(2);
  const throughput = ((Buffer.byteLength(content, 'utf8') * ITERS / 1024 / 1024) / (parseMs / 1000)).toFixed(2);

  ok(`Parser Speed:          ${bold(avgParse + ' ms/parse')}  ${dim(`(${throughput} MB/sec, ${ast.length} root AST nodes)`)}`);

  const t1 = performance.now();
  let html = '';
  for (let i = 0; i < ITERS; i++) {
    html = Breeze.renderToString(ast);
  }
  const ssrMs = performance.now() - t1;
  const avgSsr = (ssrMs / ITERS).toFixed(2);
  ok(`SSR renderToString:    ${bold(avgSsr + ' ms/render')} ${dim(`(Output: ${formatSize(Buffer.byteLength(html, 'utf8'))})`)}`);

  if (process.memoryUsage) {
    const mem = process.memoryUsage();
    ok(`Node Heap Used:        ${bold((mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB')}`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: bench
// ═══════════════════════════════════════════════════════════════════════
function cmdBench() {
  banner();
  log(`Running Breeze Performance Benchmark Suite…\n`);
  require('./bench.js');
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: generate (g)
// ═══════════════════════════════════════════════════════════════════════
function cmdGenerate(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    string: ['dir'],
    boolean: ['force', 'help'],
    alias: { d: 'dir', f: 'force', h: 'help' }
  });

  if (parsed.help) {
    showHelp('generate');
    return;
  }

  const kindAlias = {
    c: 'component', comp: 'component',
    p: 'page',
    r: 'route',
    s: 'store',
    t: 'test',
    adapter: 'service', srv: 'service'
  };

  let rawKind = (parsed._[0] || '').toLowerCase();
  rawKind = kindAlias[rawKind] || rawKind;
  const validKinds = ['component', 'page', 'route', 'store', 'service', 'test'];

  if (!rawKind || !validKinds.includes(rawKind)) {
    err(`Invalid generation kind: "${rawKind || ''}"`);
    console.log(`  Available kinds: ${bold(validKinds.join(', '))}`);
    console.log(`  Usage: ${col('cyan', 'breeze generate <kind> <name> [dir]')}\n`);
    process.exit(1);
  }

  const kind = rawKind;
  const name = parsed._[1] || `My${kind.charAt(0).toUpperCase() + kind.slice(1)}`;
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  const targetDir = parsed.dir || parsed._[2] || '.';
  const outDir = path.resolve(process.cwd(), targetDir);

  fs.mkdirSync(outDir, { recursive: true });

  const templates = {
    component: `@def ${capName}(title)\n  card [shadow, pad-md]\n    h3 "{title}"\n    @slot\n`,
    route: `@section #${name.toLowerCase()} [pad-xl]\n  h2 "${capName}"\n  p "Route: /${name.toLowerCase()}"\n`,
    store: `// ${name} store — zero-dep slice via Breeze.store\nconst ${name} = Breeze.store('${name}', { items: [] });\n${name}.watch(v => console.log('${name}:', v));\n`,
    page: `@app "${capName}"\n\n@theme {\n  primary: #0266d6\n}\n\n@section #main [pad-xl, center]\n  h1 "${capName}"\n  p "Built with Breeze v2."\n`,
    service: `// ${capName} service / adapter\nclass ${capName}Service {\n  constructor(options = {}) {\n    this.options = options;\n  }\n  async fetch() {\n    return [];\n  }\n}\nif (typeof module !== 'undefined') module.exports = { ${capName}Service };\n`,
    test: `const test = require('node:test');\nconst assert = require('node:assert/strict');\nconst { Breeze } = require('breeze-framework');\n\ntest('${capName} renders properly', () => {\n  const ast = Breeze.parse('@section #main\\n  h1 "${capName}"');\n  assert.ok(ast.length > 0);\n});\n`
  };

  const ext = (kind === 'store' || kind === 'service' || kind === 'test') ? 'js' : 'breeze';
  const fileName = kind === 'component' ? `${capName}.breeze`
    : kind === 'route' ? `${name.toLowerCase()}.route.breeze`
    : kind === 'store' ? `${name.toLowerCase()}.store.js`
    : kind === 'service' ? `${name.toLowerCase()}.service.js`
    : kind === 'test' ? `${name.toLowerCase()}.test.js`
    : `${name.toLowerCase()}.page.breeze`;

  const fp = path.join(outDir, fileName);
  if (fs.existsSync(fp) && !parsed.force) {
    err(`File already exists: ${fp}`);
    log(`Use ${bold('--force')} to overwrite.\n`);
    process.exit(1);
  }

  fs.writeFileSync(fp, templates[kind] || templates.component, 'utf8');
  ok(`Generated ${bold(kind)} ${bold(fileName)} → ${dim(fp)}\n`);
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: lint
// ═══════════════════════════════════════════════════════════════════════
function collectDiagnostics(source) {
  const diags = [];
  const lines = String(source).split('\n');
  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    if (/\t/.test(raw)) diags.push({ line: lineNo, level: 'warn', message: 'tab indentation — use 2 spaces' });
    const m = raw.match(/^(\s*)\S/);
    if (m && m[1].length % 2 === 1 && !raw.trim().startsWith('//')) {
      diags.push({ line: lineNo, level: 'warn', message: `odd indentation (${m[1].length} spaces)` });
    }
    if (/^\s*@(state|each|if)\b/.test(raw)) {
      if (/^\s*@state\s+\w+\s*$/.test(raw)) diags.push({ line: lineNo, level: 'error', message: 'malformed @state — expected @state name = value' });
      if (/^\s*@each\s+\S+\s*$/.test(raw)) diags.push({ line: lineNo, level: 'error', message: 'malformed @each — expected @each item in list' });
    }
  });
  return diags;
}

function cmdLint(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    boolean: ['fix', 'help'],
    alias: { f: 'fix', h: 'help' }
  });

  if (parsed.help) {
    showHelp('lint');
    return;
  }

  const targetPath = parsed._[0] || (fs.existsSync('app.breeze') ? 'app.breeze' : '.');
  const fp = path.resolve(targetPath);
  if (!fs.existsSync(fp)) {
    err(`Path not found: ${targetPath}`);
    process.exit(1);
  }

  const files = findBreezeFiles(fp);
  if (files.length === 0) {
    warn(`No .breeze files found in ${dim(targetPath)}`);
    return;
  }

  let totalErrors = 0;
  let totalWarns = 0;
  let fixedCount = 0;

  for (const file of files) {
    let src = fs.readFileSync(file, 'utf8');

    if (parsed.fix) {
      const fixed = src.replace(/\t/g, '  ').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
      if (fixed !== src) {
        fs.writeFileSync(file, fixed, 'utf8');
        src = fixed;
        fixedCount++;
        ok(`Auto-fixed whitespace in ${bold(path.relative(process.cwd(), file))}`);
      }
    }

    const diags = collectDiagnostics(src);
    const parserWarns = [];
    const origWarn = console.warn;
    console.warn = (...a) => parserWarns.push(a.join(' '));
    try {
      require('./breeze.js').Breeze.parse(src, { noCache: true });
    } catch (_) {}
    finally {
      console.warn = origWarn;
    }

    parserWarns.forEach(w => diags.push({ line: null, level: 'warn', message: w }));

    const rel = path.relative(process.cwd(), file) || file;
    if (diags.length > 0) {
      console.log(`\n  ${bold(rel)}:`);
      diags.forEach(d => {
        if (d.level === 'error') totalErrors++;
        else totalWarns++;
        const tag = d.level === 'error' ? col('red', 'error') : col('yellow', 'warn');
        console.log(`    ${tag}${d.line ? ` line ${d.line}` : ''}: ${d.message}`);
      });
    }
  }

  console.log('');
  if (totalErrors > 0) {
    err(`Lint failed: ${totalErrors} error${totalErrors === 1 ? '' : 's'}, ${totalWarns} warning${totalWarns === 1 ? '' : 's'}.`);
    process.exit(1);
  } else if (totalWarns > 0) {
    warn(`Lint passed with ${totalWarns} warning${totalWarns === 1 ? '' : 's'} across ${files.length} file${files.length === 1 ? '' : 's'}.`);
  } else {
    ok(`Clean: ${bold(files.length)} file${files.length === 1 ? '' : 's'} checked (0 diagnostics).`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: format (fmt)
// ═══════════════════════════════════════════════════════════════════════
function cmdFormat(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    boolean: ['check', 'help'],
    alias: { c: 'check', h: 'help' }
  });

  if (parsed.help) {
    showHelp('format');
    return;
  }

  const targets = parsed._.length ? parsed._ : (fs.existsSync('app.breeze') ? ['app.breeze'] : ['.']);
  const allFiles = [];

  for (const t of targets) {
    const fp = path.resolve(t);
    if (!fs.existsSync(fp)) {
      warn(`Skip missing: ${t}`);
      continue;
    }
    const found = findBreezeFiles(fp);
    allFiles.push(...found);
  }

  const uniqueFiles = Array.from(new Set(allFiles));
  if (uniqueFiles.length === 0) {
    log('No .breeze files found to format.');
    return;
  }

  let unformattedCount = 0;
  let formattedCount = 0;

  for (const file of uniqueFiles) {
    const src = fs.readFileSync(file, 'utf8');
    const out = src.replace(/\t/g, '  ').split('\n').map(l => l.replace(/[ \t]+$/, '')).join('\n');
    const rel = path.relative(process.cwd(), file) || file;

    if (out !== src) {
      unformattedCount++;
      if (parsed.check) {
        warn(`File needs formatting: ${bold(rel)}`);
      } else {
        fs.writeFileSync(file, out, 'utf8');
        formattedCount++;
        ok(`Formatted ${bold(rel)}`);
      }
    } else if (!parsed.check) {
      log(`No changes: ${dim(rel)}`);
    }
  }

  console.log('');
  if (parsed.check) {
    if (unformattedCount > 0) {
      err(`${unformattedCount} file${unformattedCount === 1 ? '' : 's'} need formatting.`);
      process.exit(1);
    } else {
      ok(`All ${uniqueFiles.length} files are properly formatted.`);
    }
  } else {
    if (formattedCount > 0) {
      ok(`Formatted ${formattedCount} file${formattedCount === 1 ? '' : 's'}.`);
    } else {
      ok(`All files already formatted.`);
    }
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// SCHEMA & TYPE CHECKER
// ═══════════════════════════════════════════════════════════════════════
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = new Array(n + 1);
    dp[i][0] = i;
  }
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function findBestSuggestion(target, candidates) {
  let best = null;
  let minDistance = Infinity;
  for (const c of candidates) {
    if (c === target) continue;
    const d = levenshtein(target, c);
    if (d < minDistance) {
      minDistance = d;
      best = c;
    }
  }
  const threshold = Math.max(1, Math.min(3, Math.floor(target.length / 2) + 1));
  if (best && minDistance <= threshold && minDistance < target.length) {
    return best;
  }
  return null;
}

function parseTypeScriptSchema(content) {
  const clean = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  const interfaces = {};
  const re = /(?:export\s+)?(?:interface|type)\s+([A-Za-z0-9_$]+)(?:\s*=\s*)?\s*\{/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    const name = m[1];
    let depth = 1;
    let i = re.lastIndex;
    const start = i;
    while (i < clean.length && depth > 0) {
      if (clean[i] === '{') depth++;
      else if (clean[i] === '}') depth--;
      i++;
    }
    interfaces[name] = clean.slice(start, i - 1);
  }

  const parsed = {};
  for (const [name, body] of Object.entries(interfaces)) {
    const fields = {};
    const fieldRe = /([A-Za-z0-9_$]+)\s*\??\s*:\s*([^;,\n]+)/g;
    let fm;
    while ((fm = fieldRe.exec(body)) !== null) {
      fields[fm[1]] = fm[2].trim();
    }
    parsed[name] = fields;
  }

  const paths = new Set();
  const arrayItemProps = {};

  function expand(typeName, prefix, visited = new Set()) {
    if (visited.has(typeName)) return;
    visited.add(typeName);
    const iface = parsed[typeName];
    if (!iface) return;
    for (const [key, rawType] of Object.entries(iface)) {
      const full = prefix ? prefix + '.' + key : key;
      paths.add(full);

      const arrMatch = rawType.match(/^([A-Za-z0-9_$]+)\[\]$/) || rawType.match(/^Array<([A-Za-z0-9_$]+)>$/);
      if (arrMatch) {
        const itemType = arrMatch[1];
        if (parsed[itemType]) {
          if (!arrayItemProps[full]) arrayItemProps[full] = new Set();
          for (const itemKey of Object.keys(parsed[itemType])) {
            arrayItemProps[full].add(itemKey);
            paths.add(full + '.' + itemKey);
          }
        }
      } else if (parsed[rawType]) {
        expand(rawType, full, new Set(visited));
      }
    }
  }

  for (const name of Object.keys(parsed)) {
    expand(name, '');
  }

  return { paths: Array.from(paths), arrayItemProps };
}

function parseJsonSchema(content) {
  let data;
  try {
    data = typeof content === 'string' ? JSON.parse(content) : content;
  } catch (e) {
    throw new Error(`Invalid JSON schema: ${e.message}`);
  }

  const paths = new Set();
  const arrayItemProps = {};

  if (data && typeof data === 'object' && data.properties) {
    function walkJsonSchema(props, prefix = '') {
      for (const [key, def] of Object.entries(props)) {
        const full = prefix ? prefix + '.' + key : key;
        paths.add(full);
        if (def && typeof def === 'object') {
          if (def.type === 'object' && def.properties) {
            walkJsonSchema(def.properties, full);
          } else if (def.type === 'array' && def.items && def.items.properties) {
            if (!arrayItemProps[full]) arrayItemProps[full] = new Set();
            for (const itemKey of Object.keys(def.items.properties)) {
              arrayItemProps[full].add(itemKey);
              paths.add(full + '.' + itemKey);
            }
          }
        }
      }
    }
    walkJsonSchema(data.properties);
  } else if (data && typeof data === 'object' && !Array.isArray(data)) {
    function walkObject(obj, prefix = '') {
      for (const [key, val] of Object.entries(obj)) {
        const full = prefix ? prefix + '.' + key : key;
        paths.add(full);
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            if (val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
              if (!arrayItemProps[full]) arrayItemProps[full] = new Set();
              for (const itemKey of Object.keys(val[0])) {
                arrayItemProps[full].add(itemKey);
                paths.add(full + '.' + itemKey);
              }
            }
          } else {
            walkObject(val, full);
          }
        }
      }
    }
    walkObject(data);
  }

  return { paths: Array.from(paths), arrayItemProps };
}

function loadSchema(schemaPath, projectDir = process.cwd()) {
  if (schemaPath) {
    const fp = path.resolve(schemaPath);
    if (!fs.existsSync(fp)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }
    const content = fs.readFileSync(fp, 'utf8');
    const ext = path.extname(fp).toLowerCase();
    if (ext === '.ts' || ext === '.d.ts') {
      return parseTypeScriptSchema(content);
    }
    return parseJsonSchema(content);
  }

  const candidates = [
    path.join(projectDir, 'schema.json'),
    path.join(projectDir, 'schema.ts'),
    path.join(projectDir, 'types.ts'),
    path.join(projectDir, 'types.d.ts')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      const content = fs.readFileSync(candidate, 'utf8');
      const ext = path.extname(candidate).toLowerCase();
      if (ext === '.ts' || ext === '.d.ts') {
        return parseTypeScriptSchema(content);
      }
      return parseJsonSchema(content);
    }
  }

  return { paths: [], arrayItemProps: {} };
}

function extractTemplateReferences(source) {
  const lines = String(source).split(/\r?\n/);
  const references = [];
  const templateState = new Set();
  const defParams = new Map();

  const scopeStack = [{ indent: -1, locals: new Set(), loopSources: new Map() }];

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('##')) return;

    const rawIndent = rawLine.search(/\S/);
    const indent = Math.floor(rawIndent / 2);

    while (scopeStack.length > 1 && scopeStack[scopeStack.length - 1].indent >= indent) {
      scopeStack.pop();
    }
    const curScope = scopeStack[scopeStack.length - 1];

    const stateMatch = trimmed.match(/^@state\s+([A-Za-z0-9_$]+)/);
    if (stateMatch) {
      templateState.add(stateMatch[1]);
      curScope.locals.add(stateMatch[1]);
    }

    const defMatch = trimmed.match(/^@(def|component)\s+([A-Z][A-Za-z0-9_$]*)(?:\(([^)]*)\))?/);
    if (defMatch) {
      const params = defMatch[3] ? defMatch[3].split(',').map(s => s.trim()).filter(Boolean) : [];
      defParams.set(defMatch[2], new Set(params));
      scopeStack.push({
        indent,
        locals: new Set(params),
        loopSources: new Map()
      });
      return;
    }

    const loopMatch = trimmed.match(/^@(virtual\s+)?(each|for)\s+([A-Za-z0-9_$]+)\s+in\s+([A-Za-z0-9_$.-]+)/);
    if (loopMatch) {
      const itemVar = loopMatch[3];
      const listKey = loopMatch[4];
      references.push({
        path: listKey,
        line: lineNo,
        raw: listKey,
        context: 'loop-source',
        scopeLocals: new Set(curScope.locals),
        loopSources: new Map(curScope.loopSources)
      });

      const nextLoopSources = new Map(curScope.loopSources);
      nextLoopSources.set(itemVar, listKey);
      const nextLocals = new Set(curScope.locals);
      nextLocals.add(itemVar);

      scopeStack.push({
        indent,
        locals: nextLocals,
        loopSources: nextLoopSources
      });
      return;
    }

    const ifMatch = trimmed.match(/^@(if|elif|elseif)\s+(!?)([A-Za-z0-9_$.-]+)/);
    if (ifMatch) {
      const condKey = ifMatch[3];
      references.push({
        path: condKey,
        line: lineNo,
        raw: condKey,
        context: 'conditional',
        scopeLocals: new Set(curScope.locals),
        loopSources: new Map(curScope.loopSources)
      });
    }

    const modDirectives = trimmed.match(/@?(show|model|bind)\s*=\s*([A-Za-z0-9_$.-]+)/g);
    if (modDirectives) {
      modDirectives.forEach(md => {
        const parts = md.split('=');
        const v = parts[1].trim().replace(/^["']|["']$/g, '');
        if (v && !/^(true|false|null|\d+)$/.test(v)) {
          references.push({
            path: v,
            line: lineNo,
            raw: md,
            context: 'directive',
            scopeLocals: new Set(curScope.locals),
            loopSources: new Map(curScope.loopSources)
          });
        }
      });
    }

    const actionMatches = trimmed.match(/->\s*([A-Za-z0-9_$]+)\(([^)]*)\)/g);
    if (actionMatches) {
      actionMatches.forEach(am => {
        const m = am.match(/->\s*([A-Za-z0-9_$]+)\(([^)]*)\)/);
        if (m) {
          const fn = m[1];
          const rawArgs = m[2] ? m[2].split(',').map(s => s.trim()).filter(Boolean) : [];
          if (['increment', 'decrement', 'toggle', 'setState', 'push', 'remove'].includes(fn) && rawArgs.length > 0) {
            const stateArg = rawArgs[0];
            if (stateArg && !/^["']|^#|^\d+$/.test(stateArg)) {
              references.push({
                path: stateArg,
                line: lineNo,
                raw: am,
                context: 'action',
                scopeLocals: new Set(curScope.locals),
                loopSources: new Map(curScope.loopSources)
              });
            }
          }
        }
      });
    }

    const tokenRe = /\{([\w.$-]+)\}/g;
    let tm;
    while ((tm = tokenRe.exec(trimmed)) !== null) {
      references.push({
        path: tm[1],
        line: lineNo,
        raw: tm[0],
        context: 'interpolation',
        scopeLocals: new Set(curScope.locals),
        loopSources: new Map(curScope.loopSources)
      });
    }
  });

  return { references, templateState, defParams };
}

function checkTemplateTypes(source, schema = {}, options = {}) {
  const { references, templateState } = extractTemplateReferences(source);
  const schemaPaths = new Set(schema.paths || []);
  const arrayItemProps = schema.arrayItemProps || {};
  const errors = [];

  const knownCandidates = new Set([
    ...Array.from(schemaPaths),
    ...Array.from(templateState)
  ]);

  for (const ref of references) {
    const fullPath = ref.path;
    const parts = fullPath.split('.');
    const base = parts[0];

    if (ref.scopeLocals && ref.scopeLocals.has(base)) {
      if (parts.length === 1) continue;
      const listSource = ref.loopSources ? ref.loopSources.get(base) : null;
      if (listSource && arrayItemProps[listSource]) {
        const validItemProps = arrayItemProps[listSource];
        const prop = parts.slice(1).join('.');
        if (validItemProps.has(prop)) continue;

        const suggestion = findBestSuggestion(prop, Array.from(validItemProps));
        errors.push({
          line: ref.line,
          path: fullPath,
          raw: ref.raw,
          suggestion: suggestion ? `${base}.${suggestion}` : null,
          message: suggestion
            ? `Undefined property "${fullPath}". Did you mean "${base}.${suggestion}"?`
            : `Undefined property "${fullPath}" on ${base} (element of ${listSource}).`
        });
        continue;
      }
      continue;
    }

    if (templateState.has(base)) {
      if (parts.length === 1) continue;
      if (schemaPaths.has(fullPath)) continue;
      const hasSubPaths = Array.from(schemaPaths).some(p => p.startsWith(base + '.'));
      if (!hasSubPaths) continue;
    }

    if (schemaPaths.has(fullPath) || schemaPaths.has(base)) {
      if (parts.length === 1 || schemaPaths.has(fullPath)) continue;
      const validSubProps = Array.from(schemaPaths)
        .filter(p => p.startsWith(base + '.'))
        .map(p => p.slice(base.length + 1));
      if (validSubProps.length > 0) {
        const sub = parts.slice(1).join('.');
        const suggestion = findBestSuggestion(sub, validSubProps);
        errors.push({
          line: ref.line,
          path: fullPath,
          raw: ref.raw,
          suggestion: suggestion ? `${base}.${suggestion}` : null,
          message: suggestion
            ? `Undefined property "${fullPath}". Did you mean "${base}.${suggestion}"?`
            : `Undefined property "${fullPath}" on schema object "${base}".`
        });
        continue;
      }
      continue;
    }

    const suggestion = findBestSuggestion(fullPath, Array.from(knownCandidates));
    errors.push({
      line: ref.line,
      path: fullPath,
      raw: ref.raw,
      suggestion,
      message: suggestion
        ? `Undefined reference "${fullPath}". Did you mean "${suggestion}"?`
        : `Undefined reference "${fullPath}" — not declared in @state or schema.`
    });
  }

  return { errors, referenceCount: references.length };
}

function findBreezeFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    return [targetPath];
  }

  const results = [];
  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.breeze')) {
        results.push(full);
      }
    }
  }
  walk(targetPath);
  return results;
}

function checkTypes(targetPath, options = {}) {
  const schema = loadSchema(options.schema, options.projectDir || process.cwd());
  const files = findBreezeFiles(targetPath);
  const results = [];
  let totalErrors = 0;

  for (const fp of files) {
    const src = fs.readFileSync(fp, 'utf8');
    const { errors, referenceCount } = checkTemplateTypes(src, schema, options);
    totalErrors += errors.length;
    results.push({ file: fp, errors, referenceCount });
  }

  return { files: results, totalErrors, schemaPathsCount: schema.paths.length };
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: check
// ═══════════════════════════════════════════════════════════════════════
function cmdCheck(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    string: ['schema'],
    boolean: ['types', 'strict', 'help'],
    alias: { s: 'schema', h: 'help' }
  });

  if (parsed.help) {
    showHelp('check');
    return;
  }

  const isTypes = Boolean(parsed.types);
  const schemaPath = parsed.schema || null;
  const fileOrDir = parsed._[0] || (isTypes ? '.' : 'app.breeze');
  const fp = path.resolve(fileOrDir);

  if (!fs.existsSync(fp)) {
    err(`Path not found: ${fileOrDir}`);
    process.exit(1);
  }

  const isDirectory = fs.statSync(fp).isDirectory();

  if (isTypes) {
    log(`Checking template types for ${bold(fileOrDir)}…`);
    const { files, totalErrors, schemaPathsCount } = checkTypes(fp, { schema: schemaPath });

    let errorCount = 0;
    files.forEach(res => {
      const rel = path.relative(process.cwd(), res.file) || res.file;
      if (res.errors.length > 0) {
        errorCount += res.errors.length;
        res.errors.forEach(e => {
          console.log(`  ${col('red', '✖')} ${bold(rel)}:${e.line} — ${e.message}`);
        });
      }
    });

    console.log('');
    if (errorCount > 0) {
      err(`Type check failed with ${errorCount} error${errorCount === 1 ? '' : 's'}.`);
      process.exit(1);
    }

    ok(`Type check passed: ${bold(files.length)} template${files.length === 1 ? '' : 's'} verified against schema (${schemaPathsCount} paths, 0 errors)\n`);
    if (isDirectory) return;
  }

  if (isDirectory) return;

  const src = fs.readFileSync(fp, 'utf8');
  const diags = collectDiagnostics(src);
  const errors = diags.filter(d => d.level === 'error');
  const { Breeze } = require('./breeze.js');
  let ssrOk = true, ssrErr = '';
  try {
    const html = Breeze.renderToString(src);
    if (typeof html !== 'string') throw new Error('SSR returned non-string');
  } catch (e) { ssrOk = false; ssrErr = e.message; }

  if (errors.length || !ssrOk) {
    errors.forEach(d => console.log(`  ${col('red', 'error')} line ${d.line}: ${d.message}`));
    if (!ssrOk) err(`SSR failed: ${ssrErr}`);
    process.exit(1);
  }

  if (parsed.strict && diags.length > 0) {
    err(`Strict mode failed: ${diags.length} warnings detected.`);
    process.exit(1);
  }

  ok(`Check passed: ${bold(fileOrDir)} (${diags.length} warnings, SSR ok)\n`);
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: doctor / info — environment & diagnostic inspector
// ═══════════════════════════════════════════════════════════════════════
function cmdDoctor(rawArgs) {
  banner();
  log('Inspecting Breeze Framework environment & project health…\n');

  // 1. Environment info
  console.log(`  ${bold('System & Node:')}`);
  console.log(`    Breeze CLI:    ${col('cyan', 'v' + VERSION)}`);
  console.log(`    Node.js:       ${col('green', process.version)} (${process.platform} ${process.arch})`);
  console.log(`    OS:            ${os.type()} ${os.release()}`);
  console.log(`    V8 Engine:     v${process.versions.v8}`);

  // 2. Project info
  console.log(`\n  ${bold('Project Structure:')}`);
  const cwd = process.cwd();
  console.log(`    Root Dir:      ${dim(cwd)}`);

  const keyFiles = [
    { name: 'app.breeze', role: 'Entry template' },
    { name: 'breeze.js', role: 'Core runtime' },
    { name: 'breeze.css', role: 'Styles & tokens' },
    { name: 'breeze.d.ts', role: 'TypeScript declarations' },
    { name: 'package.json', role: 'Package manifest' },
    { name: 'schema.json', role: 'Data schema' },
    { name: 'types.ts', role: 'TypeScript types' },
  ];

  for (const item of keyFiles) {
    const exists = fs.existsSync(path.join(cwd, item.name));
    const status = exists ? col('green', '✔ found') : col('gray', '○ not found');
    console.log(`    ${item.name.padEnd(16)} ${status.padEnd(20)} ${dim('(' + item.role + ')')}`);
  }

  // 3. Breeze templates count
  const breezeFiles = findBreezeFiles(cwd);
  console.log(`    Templates:     ${bold(breezeFiles.length)} .breeze file${breezeFiles.length === 1 ? '' : 's'} detected`);

  // 4. Health checks
  console.log(`\n  ${bold('Diagnostic Checks:')}`);
  let healthy = true;

  if (breezeFiles.length === 0) {
    warn('No .breeze files found in current directory. Run `breeze init` to create one.');
    healthy = false;
  } else {
    ok(`Found ${breezeFiles.length} template(s) ready for build/dev.`);
  }

  // Verify core runtime
  const hasLocalRuntime = fs.existsSync(path.join(cwd, 'breeze.js'));
  const hasCliRuntime = fs.existsSync(path.join(__dirname, 'breeze.js'));
  if (hasLocalRuntime || hasCliRuntime) {
    ok(`Runtime available (${hasLocalRuntime ? 'local' : 'bundled with CLI'}).`);
  } else {
    err('Runtime breeze.js missing from both project and CLI directory.');
    healthy = false;
  }

  console.log('');
  if (healthy) {
    ok(col('green', bold('All doctor checks passed! Everything is ready.')));
  } else {
    warn('Doctor found potential issues noted above.');
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: clean — wipe build artifacts & caches
// ═══════════════════════════════════════════════════════════════════════
function cmdClean(rawArgs) {
  banner();
  const parsed = parseArgs(rawArgs, {
    boolean: ['all', 'help'],
    alias: { a: 'all', h: 'help' }
  });

  if (parsed.help) {
    showHelp('clean');
    return;
  }

  const cwd = process.cwd();
  const targets = ['dist', '.breeze'];

  if (parsed.all) {
    targets.push('.cache');
  }

  let cleaned = 0;
  for (const t of targets) {
    const fp = path.join(cwd, t);
    if (fs.existsSync(fp)) {
      fs.rmSync(fp, { recursive: true, force: true });
      ok(`Removed ${bold(t + '/')}`);
      cleaned++;
    }
  }

  // Clean .gz and .br in dist or root if present
  try {
    const rootFiles = fs.readdirSync(cwd);
    for (const f of rootFiles) {
      if (f.endsWith('.breeze.gz') || f.endsWith('.breeze.br')) {
        fs.unlinkSync(path.join(cwd, f));
        ok(`Removed ${bold(f)}`);
        cleaned++;
      }
    }
  } catch (_) {}

  console.log('');
  if (cleaned > 0) {
    ok(col('green', bold(`Cleaned ${cleaned} artifact target${cleaned === 1 ? '' : 's'}.`)));
  } else {
    log('Nothing to clean. Workspace is already pristine.');
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// HELP & MANUALS
// ═══════════════════════════════════════════════════════════════════════
function showHelp(subcommand) {
  if (subcommand) {
    const manuals = {
      init: [
        `  ${bold('breeze init')} [name] [flags]`,
        `  Scaffold a new Breeze Framework project with ready-to-run templates.\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--template, -t <tpl>')}    Template to use: default, minimal, counter (default: default)`,
        `    ${col('yellow', '--force, -f')}             Overwrite existing files or initialize in non-empty directory`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze init my-app`,
        `    breeze init . --force`,
        `    breeze init my-counter --template counter`
      ],
      dev: [
        `  ${bold('breeze dev')} [dir] [port] [flags]`,
        `  Start zero-dependency live reload dev server with SSE and port auto-recovery.\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--port, -p <number>')}     Port to listen on (default: 3000, auto-increments if busy)`,
        `    ${col('yellow', '--host, -H <host>')}       Host address to bind to (default: localhost)`,
        `    ${col('yellow', '--open, -o')}              Open default browser on start`,
        `    ${col('yellow', '--cors')}                  Enable CORS headers for all origins`,
        `    ${col('yellow', '--strict-port')}           Do not attempt next port if chosen port is occupied`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze dev`,
        `    breeze dev 4000 --open`,
        `    breeze dev showcase --port 5000 --cors`
      ],
      build: [
        `  ${bold('breeze build')} [file] [flags]`,
        `  Compile and package a Breeze project to high-performance static HTML.\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--out-dir, -o <dir>')}     Output directory (default: dist)`,
        `    ${col('yellow', '--minify, -m')}            Minify HTML, CSS, and JS output`,
        `    ${col('yellow', '--spa')}                   Inline runtime into self-contained single-file HTML`,
        `    ${col('yellow', '--min')}                   Emit dist/breeze.min.js stripped runtime`,
        `    ${col('yellow', '--watch, -w')}             Watch files and rebuild automatically`,
        `    ${col('yellow', '--clean')}                 Clean output directory before build`,
        `    ${col('yellow', '--no-compress')}           Skip generating .gz and .br compressed assets`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze build app.breeze --minify`,
        `    breeze build --out-dir dist-prod --spa`,
        `    breeze build --watch`
      ],
      serve: [
        `  ${bold('breeze serve')} [dir] [port] [flags]`,
        `  ${bold('breeze preview')} [dir] [port] [flags]`,
        `  Serve a static production directory with Brotli/Gzip content negotiation.\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--port, -p <number>')}     Port to listen on (default: 8080)`,
        `    ${col('yellow', '--host, -H <host>')}       Host address to bind to (default: localhost)`,
        `    ${col('yellow', '--dir, -d <dir>')}         Directory to serve (default: dist)`,
        `    ${col('yellow', '--open, -o')}              Open default browser on start`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze serve dist`,
        `    breeze preview --port 9000 --open`
      ],
      generate: [
        `  ${bold('breeze generate')} <kind> <name> [dir] [flags]`,
        `  Scaffold components, pages, routes, stores, services, or tests.\n`,
        `  ${bold('Kinds:')}`,
        `    component (alias: c), page (alias: p), route (alias: r)`,
        `    store (alias: s), service (alias: adapter), test (alias: t)\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--dir, -d <dir>')}         Output directory (default: .)`,
        `    ${col('yellow', '--force, -f')}             Overwrite existing files`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze generate component UserCard`,
        `    breeze g page Settings`,
        `    breeze g test Header`
      ],
      lint: [
        `  ${bold('breeze lint')} [target] [flags]`,
        `  Analyze Breeze templates for syntax anomalies, tabs, odd indentation, and directives.\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--fix, -f')}               Automatically fix tabs and trailing whitespace`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze lint`,
        `    breeze lint src/ --fix`
      ],
      format: [
        `  ${bold('breeze format')} [targets...] [flags]`,
        `  Normalize indentation (2 spaces) and clean trailing whitespace in .breeze files.\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--check, -c')}             Verify formatting without writing (exits 1 if unformatted)`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze format`,
        `    breeze format --check`
      ],
      check: [
        `  ${bold('breeze check')} [target] [flags]`,
        `  Strict parse + SSR smoke test, or static type-checking against schema.\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--types')}                 Statically check template variable paths against schema`,
        `    ${col('yellow', '--schema, -s <file>')}     Path to TypeScript types (.ts, .d.ts) or schema.json`,
        `    ${col('yellow', '--strict')}                Fail on warnings as well as errors`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze check app.breeze`,
        `    breeze check --types`,
        `    breeze check --types --schema types.ts`
      ],
      doctor: [
        `  ${bold('breeze doctor')}`,
        `  ${bold('breeze info')}`,
        `  Inspect environment, Node version, project configuration, and framework health.\n`,
        `  ${bold('Examples:')}`,
        `    breeze doctor`
      ],
      clean: [
        `  ${bold('breeze clean')} [flags]`,
        `  Remove build artifacts (dist/, .breeze/, .gz, .br).\n`,
        `  ${bold('Flags:')}`,
        `    ${col('yellow', '--all, -a')}               Remove all temporary caches`,
        `    ${col('yellow', '--help, -h')}              Show this help\n`,
        `  ${bold('Examples:')}`,
        `    breeze clean`,
        `    breeze clean --all`
      ]
    };

    const cmdKey = subcommand === 'create' ? 'init'
      : subcommand === 'preview' ? 'serve'
      : subcommand === 'g' ? 'generate'
      : subcommand === 'fmt' ? 'format'
      : subcommand === 'info' ? 'doctor'
      : subcommand;

    if (manuals[cmdKey]) {
      console.log(manuals[cmdKey].join('\n') + '\n');
      return;
    }
  }

  // Top-level help
  console.log(`  ${bold('Usage:')}  breeze <command> [options]\n`);
  console.log(`  ${bold('Commands:')}`);
  console.log(`    ${col('cyan', 'init')}       [name] [flags]     Scaffold a new project (alias: create)`);
  console.log(`    ${col('cyan', 'dev')}        [dir] [port]       Start live reload dev server (default: 3000)`);
  console.log(`    ${col('cyan', 'build')}      [file] [flags]     Compile and build to dist/`);
  console.log(`    ${col('cyan', 'serve')}      [dir] [port]       Serve static directory (alias: preview)`);
  console.log(`    ${col('cyan', 'generate')}   <kind> <name>      Scaffold component|page|route|store|service|test (alias: g)`);
  console.log(`    ${col('cyan', 'lint')}       [target] [--fix]   Check diagnostics (default: app.breeze / project)`);
  console.log(`    ${col('cyan', 'format')}     [files] [--check]  Normalize tabs and whitespace (alias: fmt)`);
  console.log(`    ${col('cyan', 'check')}      [file] [--types]   Strict parse + SSR smoke test or static type check`);
  console.log(`    ${col('cyan', 'doctor')}                        Inspect system, project setup, and health (alias: info)`);
  console.log(`    ${col('cyan', 'clean')}      [--all]            Remove build output and cache directories`);
  console.log(`    ${col('cyan', 'profile')}    [file]             Profile parser, SSR throughput, and memory`);
  console.log(`    ${col('cyan', 'bench')}                         Run the framework benchmark suite`);
  console.log(`    ${col('cyan', 'help')}       [command]          Show help manual for a specific command`);
  console.log('');
  console.log(`  ${bold('Global Flags:')}`);
  console.log(`    ${col('yellow', '--help, -h')}                  Show help`);
  console.log(`    ${col('yellow', '--version, -v, -V')}           Print the installed version`);
  console.log(`    ${col('yellow', '--no-color')}                  Disable ANSI colored output`);
  console.log('');
  console.log(`  ${bold('Examples:')}`);
  console.log(`    breeze init my-app`);
  console.log(`    breeze dev --port 4000 --open`);
  console.log(`    breeze build app.breeze --minify --spa`);
  console.log(`    breeze preview --port 8080`);
  console.log(`    breeze check --types`);
  console.log(`    breeze lint --fix`);
  console.log(`    breeze doctor`);
  console.log(`    breeze help dev`);
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// ENTRY POINT & MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    VERSION,
    parseArgs,
    safeResolvePath,
    findBreezeFiles,
    formatSize,
    extractSeoAndHead,
    buildHTML,
    minifyHTML,
    minifyCSS,
    minifyJS,
    collectDiagnostics,
    levenshtein,
    findBestSuggestion,
    parseTypeScriptSchema,
    parseJsonSchema,
    loadSchema,
    extractTemplateReferences,
    checkTemplateTypes,
    checkTypes,
    showHelp
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  const rawArgs = process.argv.slice(2);
  const command = rawArgs[0];
  const commandArgs = rawArgs.slice(1);

  // Global flags
  if (rawArgs.includes('--version') || rawArgs.includes('-v') || rawArgs.includes('-V') || command === 'version') {
    console.log(VERSION);
    process.exit(0);
  }

  if (command === undefined || (command !== 'help' && (rawArgs.includes('--help') || rawArgs.includes('-h')) && !command)) {
    showHelp();
    process.exit(0);
  }

  switch (command) {
    case 'init':
    case 'create':
      cmdInit(commandArgs);
      break;

    case 'dev':
      cmdDev(commandArgs);
      break;

    case 'build':
      cmdBuild(commandArgs);
      break;

    case 'serve':
    case 'preview':
      cmdServe(commandArgs);
      break;

    case 'profile':
      cmdProfile(commandArgs);
      break;

    case 'bench':
      cmdBench();
      break;

    case 'generate':
    case 'g':
      cmdGenerate(commandArgs);
      break;

    case 'lint':
      cmdLint(commandArgs);
      break;

    case 'format':
    case 'fmt':
      cmdFormat(commandArgs);
      break;

    case 'check':
      cmdCheck(commandArgs);
      break;

    case 'doctor':
    case 'info':
      cmdDoctor(commandArgs);
      break;

    case 'clean':
      cmdClean(commandArgs);
      break;

    case 'help':
      showHelp(commandArgs[0]);
      break;

    default:
      if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
        showHelp();
        process.exit(0);
      }
      banner();
      err(`Unknown command: ${bold(command)}`);
      console.log(`  Run ${col('cyan', 'breeze help')} or ${col('cyan', 'breeze --help')} to see available commands.\n`);
      process.exit(1);
  }
}
