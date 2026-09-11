#!/usr/bin/env node
/*!
 * Breeze CLI v1.0.0
 * Zero-dependency build tool and dev server for the Breeze Framework
 * MIT License
 *
 * Commands:
 *   breeze init [name]    — Scaffold a new project
 *   breeze dev  [port]    — Dev server with live reload (SSE)
 *   breeze build [file]   — Build to dist/
 *   breeze serve [dir]    — Serve a static directory
 */

'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');
const zlib = require('zlib');

// ═══════════════════════════════════════════════════════════════════════
// ANSI COLOR HELPERS
// ═══════════════════════════════════════════════════════════════════════
const C = {
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
  console.log(col('cyan', bold('  🌊 Breeze Framework CLI v1.0.0')));
  console.log(dim('  Ultra-lightweight declarative web framework'));
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// MIME TYPE MAP
// ═══════════════════════════════════════════════════════════════════════
const MIME = {
  '.html':   'text/html; charset=utf-8',
  '.css':    'text/css; charset=utf-8',
  '.js':     'text/javascript; charset=utf-8',
  '.mjs':    'text/javascript; charset=utf-8',
  '.json':   'application/json',
  '.breeze': 'text/plain; charset=utf-8',
  '.png':    'image/png',
  '.jpg':    'image/jpeg',
  '.jpeg':   'image/jpeg',
  '.gif':    'image/gif',
  '.svg':    'image/svg+xml',
  '.webp':   'image/webp',
  '.ico':    'image/x-icon',
  '.woff':   'font/woff',
  '.woff2':  'font/woff2',
  '.ttf':    'font/ttf',
  '.txt':    'text/plain; charset=utf-8',
  '.md':     'text/plain; charset=utf-8',
  '.map':    'application/json',
};

function getMime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}


// ═══════════════════════════════════════════════════════════════════════
// COMMAND: init
// ═══════════════════════════════════════════════════════════════════════
function cmdInit(args) {
  banner();
  const name    = args[0] || 'my-breeze-app';
  const dir     = path.resolve(name);

  if (fs.existsSync(dir)) {
    err(`Directory "${name}" already exists.`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });
  log(`Creating project ${bold(name)} in ${dim(dir)}`);

  // ── index.html ────────────────────────────────────────────────────
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

  // ── app.breeze ────────────────────────────────────────────────────
  const appBreeze = `@app "${name}"

@theme {
  primary: #6366f1
  secondary: #8b5cf6
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

  // ── package.json ──────────────────────────────────────────────────
  const pkg = JSON.stringify({
    name,
    version: '0.1.0',
    description: `A Breeze Framework app`,
    scripts: {
      dev:   'npx breeze-framework dev',
      build: 'npx breeze-framework build app.breeze',
      start: 'npx breeze-framework serve dist'
    }
  }, null, 2) + '\n';

  const gitignore = `dist/
node_modules/
.DS_Store
*.log
`;

  const files = {
    'index.html': indexHtml,
    'app.breeze': appBreeze,
    'package.json': pkg,
    '.gitignore': gitignore,
  };

  for (const [fname, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, fname), content, 'utf8');
    ok(`Created ${bold(fname)}`);
  }

  // ── Copy the runtime so the project runs immediately ──────────────
  // Previously users had to manually copy breeze.js/breeze.css, which
  // meant a freshly-scaffolded project was broken out of the box.
  let runtimeOk = true;
  for (const runtime of ['breeze.js', 'breeze.css']) {
    const srcPath = path.join(__dirname, runtime);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(dir, runtime));
      ok(`Added ${bold(runtime)} ${dim('(runtime)')}`);
    } else {
      runtimeOk = false;
      warn(`Could not find ${runtime} next to the CLI — copy it in manually.`);
    }
  }

  console.log('');
  ok(col('green', bold(`Project "${name}" created successfully!`)));
  console.log('');
  console.log('  Next steps:');
  log(`cd ${name}`);
  if (!runtimeOk) log('Copy breeze.js and breeze.css into the folder');
  log(`npx breeze-framework dev   ${dim('# start the dev server with live reload')}`);
  console.log('');
}


// ═══════════════════════════════════════════════════════════════════════
// COMMAND: dev — static server + SSE live reload
// ═══════════════════════════════════════════════════════════════════════
function cmdDev(args) {
  banner();
  const port  = parseInt(args[0]) || 3000;
  const cwd   = process.cwd();

  // SSE client list — each entry is a ServerResponse
  const sseClients = [];

  // Notify all SSE clients to reload
  function triggerReload(changedFile) {
    log(`Change detected: ${dim(path.relative(cwd, changedFile))}`);
    const payload = `data: reload\n\n`;
    sseClients.forEach(res => {
      try { res.write(payload); } catch (_) {}
    });
    // Clear the list; clients re-register after reload
    sseClients.length = 0;
  }

  // ── Live-reload script injected into HTML responses ──────────────
  const liveReloadScript = `
<script>
/* Breeze CLI live-reload */
(function () {
  var es = new EventSource('/__bz_sse__');
  es.onmessage = function (e) { if (e.data === 'reload') window.location.reload(); };
  es.onerror   = function ()  { setTimeout(function(){ window.location.reload(); }, 2000); };
})();
</script>
</body>`;

  // ── HTTP server ───────────────────────────────────────────────────
  const server = http.createServer((req, res) => {
    const parsedUrl  = url.parse(req.url);
    let   reqPath    = decodeURIComponent(parsedUrl.pathname);

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

    // Resolve file path
    if (reqPath.endsWith('/')) reqPath += 'index.html';
    let filePath = path.join(cwd, reqPath);

    // Fall back to index.html for SPA-style routing
    if (!fs.existsSync(filePath)) {
      const withHtml = filePath + '.html';
      if (fs.existsSync(withHtml)) {
        filePath = withHtml;
      } else {
        filePath = path.join(cwd, 'index.html');
      }
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext      = path.extname(filePath).toLowerCase();
    const mimeType = getMime(filePath);

    try {
      let content = fs.readFileSync(filePath);

      // Inject live-reload script before </body>
      if (ext === '.html') {
        content = content.toString('utf8')
          .replace('</body>', liveReloadScript);
        res.writeHead(200, { 'Content-Type': mimeType, 'Cache-Control': 'no-cache' });
        res.end(content, 'utf8');
      } else {
        res.writeHead(200, { 'Content-Type': mimeType });
        res.end(content);
      }
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error: ' + e.message);
    }
  });

  server.listen(port, () => {
    ok(`Dev server running at ${bold(col('cyan', `http://localhost:${port}`))}`);
    log(`Watching ${dim(cwd)} for changes…`);
    log('Press Ctrl+C to stop.');
    console.log('');
  });

  // ── File watcher ──────────────────────────────────────────────────
  const WATCH_EXTS = new Set(['.html', '.breeze', '.css', '.js', '.json']);

  function watchDir(dir) {
    try {
      fs.watch(dir, { recursive: true }, (event, filename) => {
        if (!filename) return;
        const ext = path.extname(filename).toLowerCase();
        if (!WATCH_EXTS.has(ext)) return;
        // Debounce: ignore rapid successive events
        const full = path.join(dir, filename);
        if (watchDir._debounce) clearTimeout(watchDir._debounce);
        watchDir._debounce = setTimeout(() => triggerReload(full), 80);
      });
    } catch (e) {
      warn(`Could not watch directory: ${e.message}`);
    }
  }

  watchDir(cwd);

  process.on('SIGINT', () => {
    console.log('');
    log('Shutting down dev server.');
    server.close();
    process.exit(0);
  });
}


// ═══════════════════════════════════════════════════════════════════════
// COMMAND: build
// ═══════════════════════════════════════════════════════════════════════
function cmdBuild(args) {
  banner();

  const flags   = args.filter(a => a.startsWith('--'));
  const nonFlag = args.filter(a => !a.startsWith('--'));
  const breezeSrc = nonFlag[0] || 'app.breeze';
  const doSpa     = flags.includes('--spa');
  const doMinify  = flags.includes('--minify');
  const cwd       = process.cwd();
  const distDir   = path.join(cwd, 'dist');

  log(`Building ${bold(breezeSrc)}${doSpa ? ' [SPA mode]' : ''}${doMinify ? ' [minify]' : ''} …`);

  // Read source files
  const breezeFile = path.join(cwd, breezeSrc);
  if (!fs.existsSync(breezeFile)) {
    err(`File not found: ${breezeSrc}`);
    process.exit(1);
  }

  const breezeContent = fs.readFileSync(breezeFile, 'utf8');

  // Read breeze.css (optional — inline it)
  let css = '';
  const cssFile = path.join(cwd, 'breeze.css');
  if (fs.existsSync(cssFile)) {
    css = fs.readFileSync(cssFile, 'utf8');
    if (doMinify) css = minifyCSS(css);
  } else {
    warn('breeze.css not found — skipping inline CSS.');
  }

  // Read breeze.js (only in SPA mode)
  let js = '';
  if (doSpa) {
    const jsFile = path.join(cwd, 'breeze.js');
    if (fs.existsSync(jsFile)) {
      js = fs.readFileSync(jsFile, 'utf8');
      if (doMinify) js = minifyJS(js);
    } else {
      warn('breeze.js not found — SPA mode will reference CDN.');
      js = null;
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

  // Write to dist/
  fs.mkdirSync(distDir, { recursive: true });
  const outFile = path.join(distDir, 'index.html');
  fs.writeFileSync(outFile, htmlContent, 'utf8');

  // Report
  const sizeHtml = Buffer.byteLength(htmlContent, 'utf8');
  ok(`Built ${bold('dist/index.html')}      ${dim(formatSize(sizeHtml))}`);

  if (css) {
    ok(`Inlined CSS      ${dim(formatSize(Buffer.byteLength(css, 'utf8')))}`);
  }
  if (js) {
    ok(`Inlined JS       ${dim(formatSize(Buffer.byteLength(js, 'utf8')))}`);
  }

  // ── Auto-Compression: Gzip & Brotli (Zero Dependencies) ─────────
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

    ok(`Auto-compressed  ${bold('gzip')}    ${dim(formatSize(gzBuf.length))}  ${col('green', `(-${gzSavings}%)`)}`);
    ok(`Auto-compressed  ${bold('brotli')}  ${dim(formatSize(brBuf.length))}  ${col('green', `(-${brSavings}%)`)}`);
  } catch (err) {
    warn(`Auto-compression skipped: ${err.message}`);
  }

  // ── Native SEO, AEO & GEO Automation: Sitemap & Robots.txt ───────
  try {
    const { canonicalUrl } = extractSeoAndHead(breezeContent);
    const baseUrl = canonicalUrl ? canonicalUrl.replace(/\/$/, '') : 'https://example.com';

    // 1. Sitemap.xml
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
    ok(`Generated ${bold('dist/sitemap.xml')}  ${dim('[SEO]')}`);

    // 2. Robots.txt (optimized for Web Search & AI Crawlers)
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
    ok(`Generated ${bold('dist/robots.txt')}   ${dim('[GEO & AEO]')}`);
  } catch (err) {
    warn(`Sitemap/Robots generation skipped: ${err.message}`);
  }

  console.log('');
  ok(col('green', bold('Build complete!')));
  log(`Output: ${dim(outFile)}`);
  console.log('');
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
  // Escape "<" so a "</script>" inside .breeze text can't terminate the
  // embedding <script> tag early. JSON.stringify does not escape "/".
  const jsonSource = JSON.stringify(breezeSource).replace(/</g, '\\u003c');
  const { title, metaTags, jsonLd } = extractSeoAndHead(breezeSource);

  let styleTag = '';
  if (css) {
    styleTag = `<style>\n${css}\n</style>`;
  }

  const mountScript = `<script>
/* Breeze source — embedded at build time */
(function(){ if(typeof Breeze!=='undefined') Breeze.mount(${jsonSource},'#app'); })();
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
  // Escape "<" in JSON-LD so a malicious/typo'd "</script>" in the data can't
  // terminate the surrounding <script> element early.
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
  <div id="app"></div>
${scriptTags}
</body>
</html>
`;

  if (doMinify) html = minifyHTML(html);
  return html;
}

// ─── Naïve minifiers (no external deps) ──────────────────────────────

function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')   // strip comments
    .replace(/\s{2,}/g, ' ')            // collapse whitespace
    .replace(/\s*([{};:,>~+])\s*/g, '$1')  // strip spaces around symbols
    .replace(/;\}/g, '}')               // remove trailing semicolons
    .trim();
}

function minifyHTML(html) {
  // Collapse whitespace ONLY in the markup — never inside <script>/<style>,
  // where newlines are load-bearing (a trailing `// comment` would swallow the
  // next line, and template literals/regex can carry significant whitespace).
  // We slice out those blocks, minify the surrounding markup, then restore.
  const blocks = [];
  const stash = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, m => {
    blocks.push(m);
    return ` BZBLOCK${blocks.length - 1} `;
  });

  const minified = stash
    .replace(/<!--[\s\S]*?-->/g, '')   // strip HTML comments
    .replace(/\s{2,}/g, ' ')
    .replace(/>\s+</g, '><')
    .trim();

  return minified.replace(/ BZBLOCK(\d+) /g, (_, n) => blocks[Number(n)]);
}

function minifyJS(js) {
  // Conservative and safe without a real parser: strip block comments and
  // collapse runs of blank lines. We deliberately do NOT strip `//` line
  // comments (they may appear inside strings/regex/URLs) nor collapse
  // significant whitespace — gzip/brotli reclaim the rest at build time.
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
// COMMAND: serve — simple static file server for dist/
// ═══════════════════════════════════════════════════════════════════════
function cmdServe(args) {
  banner();
  const serveDir = path.resolve(args[0] || 'dist');
  const port     = parseInt(args[1]) || 8080;

  if (!fs.existsSync(serveDir)) {
    err(`Directory not found: ${serveDir}`);
    err('Run `breeze build` first, or specify a directory.');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    let reqPath = decodeURIComponent(parsedUrl.pathname);
    if (reqPath.endsWith('/')) reqPath += 'index.html';

    let filePath = path.join(serveDir, reqPath);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(serveDir, 'index.html'); // SPA fallback
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    try {
      // Content-Encoding auto-negotiation for pre-compressed assets
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

      const content = fs.readFileSync(servePath);
      res.writeHead(200, headers);
      res.end(content);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error');
    }
  });

  server.listen(port, () => {
    ok(`Serving ${bold(serveDir)} at ${bold(col('cyan', `http://localhost:${port}`))}`);
    log('Press Ctrl+C to stop.');
    console.log('');
  });

  process.on('SIGINT', () => {
    console.log('');
    log('Server stopped.');
    server.close();
    process.exit(0);
  });
}


// ═══════════════════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════════════════
function showHelp() {
  banner();
  console.log(`  ${bold('Usage:')}  breeze <command> [options]\n`);
  console.log(`  ${bold('Commands:')}`);
  console.log(`    ${col('cyan', 'init')}  [name]              Scaffold a new project (alias: create)`);
  console.log(`    ${col('cyan', 'dev')}   [port]              Start dev server with live reload (default: 3000)`);
  console.log(`    ${col('cyan', 'build')} [file] [flags]      Build to dist/`);
  console.log(`    ${col('cyan', 'serve')} [dir]  [port]       Serve a static directory (default: dist, port: 8080)`);
  console.log('');
  console.log(`  ${bold('Build flags:')}`);
  console.log(`    ${col('yellow', '--spa')}                   Inline breeze.js into the HTML (single self-contained file)`);
  console.log(`    ${col('yellow', '--minify')}                Minify HTML, CSS and JS output`);
  console.log('');
  console.log(`  ${bold('Global flags:')}`);
  console.log(`    ${col('yellow', '--help, -h')}              Show this help`);
  console.log(`    ${col('yellow', '--version, -v')}           Print the installed version`);
  console.log('');
  console.log(`  ${bold('Examples:')}`);
  console.log(`    breeze init my-app          ${dim('# scaffold + copy the runtime, ready to run')}`);
  console.log(`    breeze dev 4000`);
  console.log(`    breeze build app.breeze --spa --minify`);
  console.log(`    breeze serve dist 9000`);
  console.log('');
}


// ═══════════════════════════════════════════════════════════════════════
// ENTRY POINT & MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    extractSeoAndHead,
    buildHTML,
    minifyHTML,
    minifyCSS,
    minifyJS
  };
}

if (typeof require !== 'undefined' && require.main === module) {
  const [,, command, ...args] = process.argv;

  // Global flags work in any position: `breeze --version`, `breeze dev -h`
  const allArgs = [command, ...args];
  if (allArgs.includes('--version') || allArgs.includes('-v')) {
    console.log(require('./package.json').version);
    process.exit(0);
  }
  if (command === undefined || allArgs.includes('--help') || allArgs.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  switch (command) {
    case 'init':
    case 'create': cmdInit(args);  break;
    case 'dev':    cmdDev(args);   break;
    case 'build':  cmdBuild(args); break;
    case 'serve':  cmdServe(args); break;
    default:
      err(`Unknown command: ${bold(command)}`);
      console.log(`  Run ${col('cyan', 'breeze --help')} to see available commands.\n`);
      process.exit(1);
  }
}
