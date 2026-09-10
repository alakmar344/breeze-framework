/*!
 * Build script for Breeze Showcase
 * Bundles the showcase assets into dist/ for production and Vercel deployments
 */

'use strict';

const fs = require('fs');
const path = require('path');

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
  { src: path.join(rootDir, 'breeze.css'), dest: path.join(distDir, 'breeze.css') }
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

console.log('\n  ✨ Production build complete! Ready for Vercel deployment.\n');
