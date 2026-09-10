/*!
 * Build script for Breeze Showcase
 * Bundles the showcase assets into dist/ for production and Vercel deployments
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const rootDir = __dirname;
const distDir = path.join(rootDir, 'dist');
const showcaseDir = path.join(rootDir, 'showcase');

console.log('\n  🌊 Breeze Framework — Building Showcase for Production…\n');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Files to copy to dist/
const files = [
  { src: path.join(showcaseDir, 'index.html'), dest: path.join(distDir, 'index.html') },
  { src: path.join(showcaseDir, 'showcase.css'), dest: path.join(distDir, 'showcase.css') },
  { src: path.join(showcaseDir, 'showcase.js'), dest: path.join(distDir, 'showcase.js') },
  { src: path.join(showcaseDir, 'app.breeze'), dest: path.join(distDir, 'app.breeze') },
  { src: path.join(rootDir, 'breeze.js'), dest: path.join(distDir, 'breeze.js') },
  { src: path.join(rootDir, 'breeze.css'), dest: path.join(distDir, 'breeze.css') },
  { src: path.join(rootDir, 'llms.txt'), dest: path.join(distDir, 'llms.txt') },
  { src: path.join(rootDir, 'llms-full.txt'), dest: path.join(distDir, 'llms-full.txt') }
];

for (const { src, dest } of files) {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    const size = (fs.statSync(dest).size / 1024).toFixed(1);
    console.log(`  ✔ Copied ${path.basename(dest).padEnd(16)} (${size} KB) -> dist/`);
  } else {
    console.warn(`  ⚠ Source not found: ${src}`);
  }
}

// Generate sitemap.xml and robots.txt in dist/
try {
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://breeze-framework.org/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>\n`;
  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), sitemapXml, 'utf8');
  console.log('  ✔ Generated sitemap.xml -> dist/');

  const robotsTxt = `# Robots.txt — Breeze Framework Showcase
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

Sitemap: https://breeze-framework.org/sitemap.xml
`;
  fs.writeFileSync(path.join(distDir, 'robots.txt'), robotsTxt, 'utf8');
  console.log('  ✔ Generated robots.txt -> dist/');
} catch (err) {
  console.warn('  ⚠ Sitemap/robots warning:', err.message);
}

// Auto-compress index.html into .gz and .br
try {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    const raw = fs.readFileSync(indexHtmlPath);
    const gz = zlib.gzipSync(raw, { level: 9 });
    const br = zlib.brotliCompressSync(raw, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
    });
    fs.writeFileSync(indexHtmlPath + '.gz', gz);
    fs.writeFileSync(indexHtmlPath + '.br', br);
    console.log(`  ✔ Auto-compressed index.html.gz (${(gz.length / 1024).toFixed(1)} KB)`);
    console.log(`  ✔ Auto-compressed index.html.br (${(br.length / 1024).toFixed(1)} KB)`);
  }
} catch (err) {
  console.warn('  ⚠ Pre-compression warning:', err.message);
}

console.log('\n  ✨ Production build complete! Ready for Vercel deployment.\n');
