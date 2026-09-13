#!/usr/bin/env node
/**
 * Shared Chrome/Chromium discovery + launch helpers for Breeze's Chrome-based
 * benchmark runners (krausest, dbmonster, page-load, workload-families,
 * animation-stress, memory-leak, todomvc, data-grid, append-profile).
 *
 * Previously every runner hand-rolled its own copy of this ~15-line function,
 * and several of the copies fell back to a hardcoded Windows install path
 * when nothing was found — silently unusable on Linux/CI/macOS unless
 * CHROME_PATH was set. Centralizing it here means: (1) one bug fix covers
 * every runner, (2) the fallback is documented and actionable instead of a
 * platform-specific guess.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');

/**
 * Resolve a Chrome/Chromium binary to launch headless.
 * Resolution order: CHROME_PATH env var -> CHROME_BIN env var -> common
 * per-OS install locations -> `which`/`where` on PATH.
 * Throws a descriptive error (with install hints) if nothing is found,
 * instead of silently returning a guessed path that then fails to spawn.
 */
function resolveChromePath() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = [
    process.env.CHROME_BIN,
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
  ].filter(Boolean);

  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch (_) { /* ignore */ }
  }

  try {
    const cmd = process.platform === 'win32'
      ? 'where chrome'
      : 'which google-chrome || which google-chrome-stable || which chromium || which chromium-browser || which chrome';
    const out = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (out.length && fs.existsSync(out[0])) return out[0];
  } catch (_) { /* ignore */ }

  throw new Error(
    'No Chrome/Chromium binary found. Install one and re-run, or point at it explicitly:\n' +
    '  Debian/Ubuntu:  sudo apt-get install -y chromium\n' +
    '  macOS:          brew install --cask chromium\n' +
    '  Any OS:         set CHROME_PATH=/path/to/chrome-or-chromium\n'
  );
}

/** Poll the CDP `/json/version` endpoint until Chrome answers (or timeout). */
async function waitForCdp(cdpPort, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (res.ok) {
        const info = await res.json().catch(() => ({}));
        return info.Browser || 'unknown';
      }
    } catch (_) { /* not up yet */ }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`CDP not reachable on :${cdpPort} after ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 200));
  }
}

/**
 * Launch headless Chrome/Chromium with a fresh, throwaway profile dir and
 * wait until its CDP endpoint responds. Returns { proc, chromePath,
 * browserVersion, cdpPort, cleanup() }.
 */
async function launchChrome(cdpPort, extraFlags = []) {
  const chromePath = resolveChromePath();
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-chrome-'));
  const proc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--js-flags=--expose-gc',
    `--user-data-dir=${profileDir}`,
    ...extraFlags
  ]);
  proc.on('error', (e) => console.error(`Chrome launch failed: ${e.message}`));

  let browserVersion = 'unknown';
  try {
    browserVersion = await waitForCdp(cdpPort, 20000);
  } catch (err) {
    try { proc.kill(); } catch (_) { /* ignore */ }
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
    throw err;
  }

  const cleanup = () => {
    try { proc.kill(); } catch (_) { /* ignore */ }
    try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  };

  return { proc, chromePath, browserVersion, cdpPort, cleanup };
}

module.exports = { resolveChromePath, waitForCdp, launchChrome };
