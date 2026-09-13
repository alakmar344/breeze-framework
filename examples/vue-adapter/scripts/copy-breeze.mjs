// Copies the REAL repo-root breeze.js / breeze.css into this example's
// public/vendor/ folder so index.html can load them with a plain
// <script src="/vendor/breeze.js"> tag — exactly like the CDN usage
// documented in the root README's "Option B" quick start.
//
// This is a build-time copy step, not a fork: the source of truth stays
// at the repo root and is re-copied fresh on every `npm run dev` / `build`.
// No root files are modified by this script.

import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(exampleRoot, '../..');
const vendorDir = path.join(exampleRoot, 'public', 'vendor');

mkdirSync(vendorDir, { recursive: true });

for (const file of ['breeze.js', 'breeze.css']) {
  const src = path.join(repoRoot, file);
  const dest = path.join(vendorDir, file);
  if (!existsSync(src)) {
    throw new Error(`[copy-breeze] Expected to find "${file}" at repo root: ${src}`);
  }
  copyFileSync(src, dest);
  console.log(`[copy-breeze] ${path.relative(repoRoot, src)} -> ${path.relative(exampleRoot, dest)}`);
}
