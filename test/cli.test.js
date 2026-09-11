'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const CLI_PATH = path.resolve(__dirname, '..', 'breeze-cli.js');
const {
  parseArgs,
  safeResolvePath,
  formatSize,
  collectDiagnostics,
  VERSION
} = require('../breeze-cli.js');

function runCLI(args, options = {}) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: options.cwd || path.resolve(__dirname, '..'),
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    ...options
  });
  return {
    code: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

test('CLI parseArgs: long flags, short flags, aliases and positionals', () => {
  const schema = {
    number: ['port'],
    string: ['out-dir', 'host', 'template', 'schema'],
    boolean: ['spa', 'minify', 'watch', 'clean', 'force', 'help'],
    alias: { p: 'port', o: 'out-dir', m: 'minify', w: 'watch', f: 'force', t: 'template', s: 'schema', h: 'help' }
  };

  // 1. Long flags with space and equals
  const res1 = parseArgs(['build', 'app.breeze', '--out-dir', 'dist-prod', '--minify', '--spa'], schema);
  assert.equal(res1._[0], 'build');
  assert.equal(res1._[1], 'app.breeze');
  assert.equal(res1['out-dir'], 'dist-prod');
  assert.equal(res1.minify, true);
  assert.equal(res1.spa, true);

  // 2. Short flags and aliases
  const res2 = parseArgs(['dev', '-p', '4000', '-m', '-w'], schema);
  assert.equal(res2._[0], 'dev');
  assert.equal(res2.port, 4000);
  assert.equal(res2.minify, true);
  assert.equal(res2.watch, true);

  // 3. Flags with = syntax
  const res3 = parseArgs(['build', '--out-dir=custom_dir', '--port=8080', '--schema=types.ts'], schema);
  assert.equal(res3['out-dir'], 'custom_dir');
  assert.equal(res3.port, 8080);
  assert.equal(res3.schema, 'types.ts');

  // 4. Negated boolean flags
  const res4 = parseArgs(['build', '--no-compress'], { boolean: ['compress'] });
  assert.equal(res4.compress, false);

  // 5. Short flag with attached value
  const res5 = parseArgs(['-p5000'], schema);
  assert.equal(res5.port, 5000);
});

test('CLI Security: safeResolvePath blocks path traversal', () => {
  const base = path.resolve(__dirname, '..');

  // Normal safe path
  const safe = safeResolvePath(base, '/app.breeze');
  assert.ok(safe);
  assert.equal(safe, path.join(base, 'app.breeze'));

  // Traversal attack with relative dots
  const escape1 = safeResolvePath(base, '/../../../../etc/passwd');
  assert.equal(escape1, null);

  // Traversal with encoded characters
  const escape2 = safeResolvePath(base, '/..%2f..%2fpackage.json');
  assert.equal(escape2, null);

  // Null byte injection
  const escape3 = safeResolvePath(base, '/app.breeze\0.png');
  assert.ok(escape3);
  assert.ok(!escape3.includes('\0'));
});

test('CLI Version: flags and commands output correct version', () => {
  const res1 = runCLI(['--version']);
  assert.equal(res1.code, 0);
  assert.equal(res1.stdout.trim(), VERSION);

  const res2 = runCLI(['-v']);
  assert.equal(res2.code, 0);
  assert.equal(res2.stdout.trim(), VERSION);

  const res3 = runCLI(['-V']);
  assert.equal(res3.code, 0);
  assert.equal(res3.stdout.trim(), VERSION);

  const res4 = runCLI(['version']);
  assert.equal(res4.code, 0);
  assert.equal(res4.stdout.trim(), VERSION);
});

test('CLI Help: top-level and subcommand manuals', () => {
  const resHelp = runCLI(['--help']);
  assert.equal(resHelp.code, 0);
  assert.ok(resHelp.stdout.includes('Usage:  breeze <command>'));
  assert.ok(resHelp.stdout.includes('init'));
  assert.ok(resHelp.stdout.includes('dev'));
  assert.ok(resHelp.stdout.includes('build'));
  assert.ok(resHelp.stdout.includes('doctor'));

  const resHelpCmd = runCLI(['help', 'dev']);
  assert.equal(resHelpCmd.code, 0);
  assert.ok(resHelpCmd.stdout.includes('breeze dev [dir] [port]'));
  assert.ok(resHelpCmd.stdout.includes('--port, -p'));
  assert.ok(resHelpCmd.stdout.includes('--strict-port'));

  const resHelpBuild = runCLI(['build', '--help']);
  assert.equal(resHelpBuild.code, 0);
  assert.ok(resHelpBuild.stdout.includes('breeze build [file]'));
  assert.ok(resHelpBuild.stdout.includes('--out-dir, -o'));
});

test('CLI Unknown Command: prints friendly error and exits with 1', () => {
  const res = runCLI(['nonexistent-command']);
  assert.equal(res.code, 1);
  assert.ok(res.stderr.includes('Unknown command: nonexistent-command'));
});

test('CLI Doctor: reports system, project structure, and health', () => {
  const res = runCLI(['doctor']);
  assert.equal(res.code, 0);
  assert.ok(res.stdout.includes('System & Node:'));
  assert.ok(res.stdout.includes('Node.js:'));
  assert.ok(res.stdout.includes('Project Structure:'));
  assert.ok(res.stdout.includes('app.breeze'));
  assert.ok(res.stdout.includes('All doctor checks passed!'));
});

test('CLI Init: scaffolds project with template and runtime files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-test-init-'));
  const appName = 'test-scaffold-app';
  const targetDir = path.join(tempDir, appName);

  try {
    const res = runCLI(['init', targetDir, '--template', 'counter'], { cwd: tempDir });
    assert.equal(res.code, 0);
    assert.ok(fs.existsSync(path.join(targetDir, 'package.json')));
    assert.ok(fs.existsSync(path.join(targetDir, 'app.breeze')));
    assert.ok(fs.existsSync(path.join(targetDir, 'index.html')));
    assert.ok(fs.existsSync(path.join(targetDir, 'breeze.js')));
    assert.ok(fs.existsSync(path.join(targetDir, 'breeze.css')));
    assert.ok(fs.existsSync(path.join(targetDir, 'breeze.d.ts')));
    assert.ok(fs.existsSync(path.join(targetDir, 'README.md')));

    const breezeContent = fs.readFileSync(path.join(targetDir, 'app.breeze'), 'utf8');
    assert.ok(breezeContent.includes('Reactive Counter'));
    assert.ok(breezeContent.includes('@state step = 1'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI Generate: scaffolds component, page, route, store, service, test', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-test-gen-'));

  try {
    // 1. Component
    const resComp = runCLI(['generate', 'component', 'HeaderWidget', tempDir]);
    assert.equal(resComp.code, 0);
    assert.ok(fs.existsSync(path.join(tempDir, 'HeaderWidget.breeze')));

    // 2. Route
    const resRoute = runCLI(['g', 'route', 'profile', tempDir]);
    assert.equal(resRoute.code, 0);
    assert.ok(fs.existsSync(path.join(tempDir, 'profile.route.breeze')));

    // 3. Store
    const resStore = runCLI(['g', 'store', 'cart', tempDir]);
    assert.equal(resStore.code, 0);
    assert.ok(fs.existsSync(path.join(tempDir, 'cart.store.js')));

    // 4. Test
    const resTest = runCLI(['g', 'test', 'navbar', tempDir]);
    assert.equal(resTest.code, 0);
    assert.ok(fs.existsSync(path.join(tempDir, 'navbar.test.js')));

    // 5. Existing file without --force fails
    const resDup = runCLI(['g', 'c', 'HeaderWidget', tempDir]);
    assert.equal(resDup.code, 1);
    assert.ok(resDup.stderr.includes('File already exists'));

    // 6. Existing file with --force succeeds
    const resForce = runCLI(['g', 'c', 'HeaderWidget', tempDir, '--force']);
    assert.equal(resForce.code, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI Build: supports custom --out-dir and static asset copying', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-test-build-'));
  const appFile = path.join(tempDir, 'app.breeze');
  fs.writeFileSync(appFile, '@app "Build Test"\n\n@section #main [pad-md]\n  h1 "Hello Build"\n');

  // Create public static asset
  const pubDir = path.join(tempDir, 'public');
  fs.mkdirSync(pubDir, { recursive: true });
  fs.writeFileSync(path.join(pubDir, 'logo.svg'), '<svg>logo</svg>');

  const customOut = path.join(tempDir, 'my_dist');

  try {
    const res = runCLI(['build', appFile, '--out-dir', customOut, '--minify'], { cwd: tempDir });
    assert.equal(res.code, 0);
    assert.ok(fs.existsSync(path.join(customOut, 'index.html')));
    assert.ok(fs.existsSync(path.join(customOut, 'index.html.gz')));
    assert.ok(fs.existsSync(path.join(customOut, 'index.html.br')));
    assert.ok(fs.existsSync(path.join(customOut, 'sitemap.xml')));
    assert.ok(fs.existsSync(path.join(customOut, 'robots.txt')));
    assert.ok(fs.existsSync(path.join(customOut, 'logo.svg')));

    const html = fs.readFileSync(path.join(customOut, 'index.html'), 'utf8');
    assert.ok(html.includes('Hello Build'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI Lint & Format: handles directories without EISDIR crash', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-test-lint-'));
  const file1 = path.join(tempDir, 'page1.breeze');
  // File with tabs and trailing spaces
  fs.writeFileSync(file1, '@app "Page 1"\t\n@section #main  \n\th1 "Tabs"\n');

  try {
    // 1. Lint on directory should not crash with EISDIR
    const resLint = runCLI(['lint', tempDir]);
    assert.equal(resLint.code, 0); // warnings only, no fatal syntax errors
    assert.ok(resLint.stdout.includes('tab indentation') || resLint.stdout.includes('warning'));

    // 2. Format with --check should detect unformatted file
    const resCheck = runCLI(['format', tempDir, '--check']);
    assert.equal(resCheck.code, 1);
    assert.ok(resCheck.stderr.includes('need formatting') || resCheck.stdout.includes('needs formatting'));

    // 3. Lint --fix should fix tabs
    const resFix = runCLI(['lint', tempDir, '--fix']);
    assert.equal(resFix.code, 0);

    const fixedContent = fs.readFileSync(file1, 'utf8');
    assert.ok(!fixedContent.includes('\t'));

    // 4. Format --check should now pass cleanly
    const resCheck2 = runCLI(['format', tempDir, '--check']);
    assert.equal(resCheck2.code, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('CLI Clean: cleans output directories', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'breeze-test-clean-'));
  const distDir = path.join(tempDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, 'dummy.txt'), 'data');

  try {
    assert.ok(fs.existsSync(distDir));
    const res = runCLI(['clean'], { cwd: tempDir });
    assert.equal(res.code, 0);
    assert.ok(!fs.existsSync(distDir));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
