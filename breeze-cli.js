#!/usr/bin/env node
/*!
 * Breeze CLI v2.1.0
 * Zero-dependency build tool and dev server for the Breeze Framework
 * MIT License
 *
 * Commands:
 *   breeze init [name]            — Scaffold a new project
 *   breeze dev  [port]            — Dev server with live reload (SSE)
 *   breeze build [file]           — Build to dist/
 *   breeze serve [dir]            — Serve a static directory
 *   breeze generate <kind> <name> — Scaffold component/route/store/page (alias: g)
 *   breeze lint [file]            — Check .breeze diagnostics (tabs, indent, directives)
 *   breeze format [file]          — Normalize indentation/tabs in .breeze files
 *   breeze check [file]           — Strict parse + SSR smoke test (CI-friendly)
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
  console.log(col('cyan', bold('  🌊 Breeze Framework CLI v2.1.0')));
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
  // Accept `dev [dir] [port]` in any order: a numeric arg is the port,
  // a non-numeric arg is the root directory to serve.
  let port = 3000;
  let root = process.cwd();
  for (const a of args) {
    if (/^\d+$/.test(a)) port = parseInt(a, 10);
    else root = path.resolve(a);
  }
  const cwd = root;

  if (!fs.existsSync(cwd)) {
    err(`Directory not found: ${cwd}`);
    process.exit(1);
  }

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
  const doMin     = flags.includes('--min');
  const cwd       = process.cwd();
  const distDir   = path.join(cwd, 'dist');

  log(`Building ${bold(breezeSrc)}${doSpa ? ' [SPA mode]' : ''}${doMinify ? ' [minify]' : ''}${doMin ? ' [min runtime]' : ''} …`);

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

  // ── v2: optional minified runtime (comment-stripped, zero-dep safe) ──
  if (doMin) {
    try {
      const jsFile = path.join(cwd, 'breeze.js');
      if (fs.existsSync(jsFile)) {
        const raw = fs.readFileSync(jsFile, 'utf8');
        const min = minifyJS(raw);
        const minFile = path.join(distDir, 'breeze.min.js');
        fs.writeFileSync(minFile, min, 'utf8');
        const gz = zlib.gzipSync(Buffer.from(min, 'utf8'), { level: 9 });
        fs.writeFileSync(minFile + '.gz', gz);
        ok(`Min runtime ${bold('dist/breeze.min.js')} ${dim(formatSize(Buffer.byteLength(min, 'utf8')) + ' / gzip ' + formatSize(gz.length))}`);
      }
    } catch (e) {
      warn(`Min runtime skipped: ${e.message}`);
    }
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

  // Pre-render static HTML for instant SSG / FCP
  let preRenderedHtml = '';
  try {
    const bzMod = require('./breeze.js');
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
  // Preserve spaces inside calc()/min()/max()/clamp() where + - * / are load-bearing
  // (e.g. `calc(100% - 2rem)` breaks as `calc(100%-2rem)`). Stash those parens first.
  const stash = [];
  const safe = String(css).replace(/(calc|min|max|clamp)\([^()]*\)/gi, m => {
    stash.push(m);
    return `__BZCALC${stash.length - 1}__`;
  });
  const min = safe
    .replace(/\/\*[\s\S]*?\*\//g, '')   // strip comments
    .replace(/\s{2,}/g, ' ')            // collapse whitespace
    .replace(/\s*([{};:,>~+])\s*/g, '$1')  // strip spaces around symbols
    .replace(/;\}/g, '}')               // remove trailing semicolons
    .trim();
  return min.replace(/__BZCALC(\d+)__/g, (_, n) => stash[Number(n)]);
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
// COMMAND: profile — Benchmark compiler, SSR & memory for a template
// ═══════════════════════════════════════════════════════════════════════
function cmdProfile(args) {
  banner();
  const file = args[0] || 'app.breeze';
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

  // 1. Parser throughput
  const ITERS = 100;
  const { performance } = require('perf_hooks');
  const t0 = performance.now();
  let ast;
  for (let i = 0; i < ITERS; i++) {
    ast = Breeze.parse(content);
  }
  const parseMs = performance.now() - t0;
  const avgParse = (parseMs / ITERS).toFixed(2);
  const throughput = ((Buffer.byteLength(content, 'utf8') * ITERS / 1024 / 1024) / (parseMs / 1000)).toFixed(2);

  ok(`Parser Speed:          ${bold(avgParse + ' ms/parse')}  ${dim(`(${throughput} MB/sec, ${ast.length} root AST nodes)`)}`);

  // 2. SSR renderToString throughput
  const t1 = performance.now();
  let html = '';
  for (let i = 0; i < ITERS; i++) {
    html = Breeze.renderToString(ast);
  }
  const ssrMs = performance.now() - t1;
  const avgSsr = (ssrMs / ITERS).toFixed(2);
  ok(`SSR renderToString:    ${bold(avgSsr + ' ms/render')} ${dim(`(Output: ${formatSize(Buffer.byteLength(html, 'utf8'))})`)}`);

  // 3. Memory snapshot
  if (process.memoryUsage) {
    const mem = process.memoryUsage();
    ok(`Node Heap Used:        ${bold((mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB')}`);
  }
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// COMMAND: bench — Run benchmark suite
// ═══════════════════════════════════════════════════════════════════════
function cmdBench() {
  banner();
  log(`Running Breeze Performance Benchmark Suite…\n`);
  require('./bench.js');
}

// ═══════════════════════════════════════════════════════════════════════
// COMMANDS v2: generate, lint, format, check
// ═══════════════════════════════════════════════════════════════════════
function cmdGenerate(args) {
  banner();
  const kind = (args[0] || 'component').toLowerCase();
  const name = args[1] || 'MyWidget';
  const capName = name.charAt(0).toUpperCase() + name.slice(1);
  const outDir = path.resolve(args[2] || '.');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const templates = {
    component: `@def ${capName}(title)\n  card [shadow, pad-md]\n    h3 "{title}"\n    @slot\n`,
    route: `@section #${name.toLowerCase()} [pad-xl]\n  h2 "${capName}"\n  p "New route — wire with Breeze.route('#${name.toLowerCase()}', handler) and Breeze.outlet('#app')."\n`,
    store: `// ${name} store — zero-dep slice via Breeze.store\nconst ${name} = Breeze.store('${name}', { items: [] });\n${name}.watch(v => console.log('${name}:', v));\n`,
    page: `@app "${capName}"\n\n@theme {\n  primary: #6366f1\n}\n\n@section #main [pad-xl, center]\n  h1 "${capName}"\n  p "Built with Breeze v2."\n`
  };
  const ext = (kind === 'store') ? 'js' : 'breeze';
  const fileName = kind === 'component' ? `${capName}.breeze`
    : kind === 'route' ? `${name.toLowerCase()}.route.breeze`
    : kind === 'store' ? `${name.toLowerCase()}.store.js`
    : `${name.toLowerCase()}.page.breeze`;
  const fp = path.join(outDir, fileName);
  if (fs.existsSync(fp)) {
    err(`File already exists: ${fp}`);
    process.exit(1);
  }
  fs.writeFileSync(fp, templates[kind] || templates.component);
  ok(`Generated ${bold(kind)} ${bold(fileName)} → ${dim(fp)}`);
  console.log('');
}

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

function cmdLint(args) {
  banner();
  const file = args[0] || 'app.breeze';
  const fp = path.resolve(file);
  if (!fs.existsSync(fp)) { err(`File not found: ${file}`); process.exit(1); }
  const src = fs.readFileSync(fp, 'utf8');
  const diags = collectDiagnostics(src);
  // Plus parser warnings
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(' '));
  try { require('./breeze.js').Breeze.parse(src, { noCache: true }); } catch (_) {}
  console.warn = orig;
  warns.forEach(w => diags.push({ line: null, level: 'warn', message: w }));
  if (!diags.length) { ok(`Clean: ${bold(file)} (0 diagnostics)`); return; }
  diags.forEach(d => {
    const tag = d.level === 'error' ? col('red', 'error') : col('yellow', 'warn');
    console.log(`  ${tag}${d.line ? ` line ${d.line}` : ''}: ${d.message}`);
  });
  console.log('');
  if (diags.some(d => d.level === 'error')) process.exit(1);
}

function cmdFormat(args) {
  banner();
  const files = args.length ? args : ['app.breeze'];
  let fixed = 0;
  files.forEach(f => {
    const fp = path.resolve(f);
    if (!fs.existsSync(fp)) { warn(`Skip missing: ${f}`); return; }
    const src = fs.readFileSync(fp, 'utf8');
    const out = src.replace(/\t/g, '  ').split('\n').map(line => {
      // Normalize trailing whitespace; keep content intact
      return line.replace(/[ \t]+$/g, '');
    }).join('\n');
    if (out !== src) { fs.writeFileSync(fp, out); fixed++; ok(`Formatted ${bold(f)}`); }
    else log(`No changes: ${dim(f)}`);
  });
  console.log('');
  if (!fixed) log('Nothing to format.');
}

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
  const defParams = new Map(); // compName -> Set of params

  // Scope tracking for @each and @def blocks
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

    // Top-level / inline state declarations: @state name = value
    const stateMatch = trimmed.match(/^@state\s+([A-Za-z0-9_$]+)/);
    if (stateMatch) {
      templateState.add(stateMatch[1]);
      curScope.locals.add(stateMatch[1]);
    }

    // Component definitions: @def CompName(param1, param2)
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

    // Loop blocks: @each item in listKey or @virtual each item in items
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

    // Conditionals: @if conditionKey, @elif conditionKey
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

    // Directive modifiers: @show=var, @model=var, bind=var
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

    // Actions in modifiers: @click -> increment(count), @click -> toggle(studio), @click -> setState(count, 0)
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

    // Text bindings: {path}
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

  // Union of all known valid paths for suggestion matching
  const knownCandidates = new Set([
    ...Array.from(schemaPaths),
    ...Array.from(templateState)
  ]);

  for (const ref of references) {
    const fullPath = ref.path;
    const parts = fullPath.split('.');
    const base = parts[0];

    // 1. In-scope local variable (loop variable or component prop)
    if (ref.scopeLocals && ref.scopeLocals.has(base)) {
      if (parts.length === 1) {
        continue;
      }
      // Accessing a property on a loop variable: item.prop
      const listSource = ref.loopSources ? ref.loopSources.get(base) : null;
      if (listSource && arrayItemProps[listSource]) {
        const validItemProps = arrayItemProps[listSource];
        const prop = parts.slice(1).join('.');
        if (validItemProps.has(prop)) {
          continue;
        }
        // Near-miss suggestion on item property
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
      // If listSource has no restrictive schema, local property access is allowed
      continue;
    }

    // 2. Declared in template @state
    if (templateState.has(base)) {
      if (parts.length === 1) {
        continue;
      }
      // Dotted sub-path on template state: check if explicitly known
      if (schemaPaths.has(fullPath)) {
        continue;
      }
      // If schema has no restrictive properties for this base, allow it
      const hasSubPaths = Array.from(schemaPaths).some(p => p.startsWith(base + '.'));
      if (!hasSubPaths) {
        continue;
      }
    }

    // 3. Defined in schema
    if (schemaPaths.has(fullPath) || schemaPaths.has(base)) {
      if (parts.length === 1 || schemaPaths.has(fullPath)) {
        continue;
      }
      // Check if schema explicitly defines child properties for this base
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

    // 4. Undefined reference
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

function cmdCheck(args) {
  banner();
  const isTypes = args.includes('--types');
  let schemaPath = null;
  const schemaIdx = args.indexOf('--schema');
  if (schemaIdx !== -1 && args[schemaIdx + 1]) {
    schemaPath = args[schemaIdx + 1];
  }

  const cleanArgs = args.filter((a, idx) => {
    if (a === '--types' || a === '--schema') return false;
    if (schemaIdx !== -1 && idx === schemaIdx + 1) return false;
    return true;
  });

  const fileOrDir = cleanArgs[0] || (isTypes ? '.' : 'app.breeze');
  const fp = path.resolve(fileOrDir);
  if (!fs.existsSync(fp)) { err(`Path not found: ${fileOrDir}`); process.exit(1); }

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

    ok(`Type check passed: ${bold(files.length)} template${files.length === 1 ? '' : 's'} verified against schema (${schemaPathsCount} paths, 0 errors)`);
    console.log('');
    if (cleanArgs.length === 0 || isDirectory) return;
  }

  if (isDirectory) {
    return;
  }

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
  ok(`Check passed: ${bold(fileOrDir)} (${diags.length} warnings, SSR ok)`);
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════
// HELP
// ═══════════════════════════════════════════════════════════════════════
function showHelp() {
  banner();
  console.log(`  ${bold('Usage:')}  breeze <command> [options]\n`);
  console.log(`  ${bold('Commands:')}`);
  console.log(`    ${col('cyan', 'init')}    [name]            Scaffold a new project (alias: create)`);
  console.log(`    ${col('cyan', 'dev')}     [port]            Start dev server with live reload (default: 3000)`);
  console.log(`    ${col('cyan', 'build')}   [file] [flags]    Build to dist/`);
  console.log(`    ${col('cyan', 'serve')}   [dir]  [port]     Serve a static directory (default: dist, port: 8080)`);
  console.log(`    ${col('cyan', 'profile')} [file]            Profile parser, SSR throughput, and memory`);
  console.log(`    ${col('cyan', 'bench')}                     Run the framework benchmark suite`);
  console.log(`    ${col('cyan', 'generate')} <kind> <name> [dir]  Scaffold component|route|store|page (alias: g)`);
  console.log(`    ${col('cyan', 'lint')}    [file]            Check diagnostics (default: app.breeze)`);
  console.log(`    ${col('cyan', 'format')}  [files...]        Normalize tabs/trailing spaces`);
  console.log(`    ${col('cyan', 'check')}   [file] [--types]  Strict parse + SSR smoke test or static type check`);
  console.log('');
  console.log(`  ${bold('Type-check flags (breeze check --types):')}`);
  console.log(`    ${col('yellow', '--types')}                  Statically check template variable paths against schema`);
  console.log(`    ${col('yellow', '--schema <file>')}          Path to TypeScript types (.ts, .d.ts) or schema.json`);
  console.log('');
  console.log(`  ${bold('Build flags:')}`);
  console.log(`    ${col('yellow', '--spa')}                   Inline breeze.js into the HTML (single self-contained file)`);
  console.log(`    ${col('yellow', '--minify')}                Minify HTML, CSS and JS output`);
  console.log(`    ${col('yellow', '--min')}                   Also emit dist/breeze.min.js (stripped comments)`);
  console.log('');
  console.log(`  ${bold('Global flags:')}`);
  console.log(`    ${col('yellow', '--help, -h')}              Show this help`);
  console.log(`    ${col('yellow', '--version, -v')}           Print the installed version`);
  console.log('');
  console.log(`  ${bold('Examples:')}`);
  console.log(`    breeze init my-app          ${dim('# scaffold + copy the runtime, ready to run')}`);
  console.log(`    breeze dev 4000`);
  console.log(`    breeze check --types        ${dim('# verify all project templates against types/schema')}`);
  console.log(`    breeze check app.breeze --types --schema types.ts`);
  console.log(`    breeze lint app.breeze && breeze check app.breeze`);
  console.log(`    breeze profile app.breeze`);
  console.log(`    breeze build app.breeze --spa --minify --min`);
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
    minifyJS,
    collectDiagnostics,
    levenshtein,
    findBestSuggestion,
    parseTypeScriptSchema,
    parseJsonSchema,
    loadSchema,
    extractTemplateReferences,
    checkTemplateTypes,
    checkTypes
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
    case 'create':  cmdInit(args);    break;
    case 'dev':     cmdDev(args);     break;
    case 'build':   cmdBuild(args);   break;
    case 'serve':   cmdServe(args);   break;
    case 'profile': cmdProfile(args); break;
    case 'bench':   cmdBench();       break;
    case 'generate':
    case 'g':       cmdGenerate(args); break;
    case 'lint':    cmdLint(args);    break;
    case 'format':
    case 'fmt':     cmdFormat(args);  break;
    case 'check':   cmdCheck(args);   break;
    default:
      err(`Unknown command: ${bold(command)}`);
      console.log(`  Run ${col('cyan', 'breeze --help')} to see available commands.\n`);
      process.exit(1);
  }
}
