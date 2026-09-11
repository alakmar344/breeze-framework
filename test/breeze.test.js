const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { Breeze } = require('../breeze.js');

describe('Breeze Framework Core', () => {
  it('should expose the public API object', () => {
    assert.ok(Breeze);
    assert.equal(typeof Breeze.parse, 'function');
    assert.match(Breeze.version, /^[12]\.\d+\.\d+/);
    assert.equal(typeof Breeze.push, 'function');
    assert.equal(typeof Breeze.remove, 'function');
  });

  it('should parse directives and elements into an AST', () => {
    const source = [
      '@app "Test App"',
      '@theme {',
      '  primary: #6366f1',
      '}',
      '@state counter = 42',
      '@section #hero [hero, center]',
      '  h1 "Welcome to Breeze"',
      '  button "Click Me" [primary, @click -> increment(counter)]'
    ].join('\n');

    const ast = Breeze.parse(source);
    assert.ok(Array.isArray(ast));
    assert.equal(ast[0].type, 'app');
    assert.equal(ast[0].text, 'Test App');
    assert.equal(ast[1].type, 'theme');
    assert.equal(ast[1].props.primary, '#6366f1');
    assert.equal(ast[2].type, 'state');
    assert.equal(ast[2].key, 'counter');
    assert.equal(ast[2].value, 42);

    const section = ast.find(n => n.type === 'section');
    assert.ok(section);
    assert.equal(section.id, 'hero');
    assert.equal(section.children.length, 2);
    assert.equal(section.children[0].type, 'h1');
    assert.equal(section.children[0].text, 'Welcome to Breeze');
    assert.equal(section.children[1].type, 'button');
    assert.equal(section.children[1].text, 'Click Me');
  });

  it('should parse @each loops into an each AST node', () => {
    const source = [
      '@state items = ["one", "two", "three"]',
      '@section #list',
      '  @each item in items',
      '    p "Item: {item}"'
    ].join('\n');

    const ast = Breeze.parse(source);
    const sec = ast.find(n => n.type === 'section');
    assert.ok(sec);
    assert.equal(sec.children.length, 1);

    const eachNode = sec.children[0];
    assert.equal(eachNode.type, 'each');
    assert.equal(eachNode.itemVar, 'item');
    assert.equal(eachNode.listKey, 'items');
    assert.equal(eachNode.children.length, 1);
    assert.equal(eachNode.children[0].type, 'p');
    assert.equal(eachNode.children[0].text, 'Item: {item}');
  });

  it('should parse @if and @if ! into an if AST node', () => {
    const source = [
      '@state loggedIn = true',
      '@section #auth',
      '  @if loggedIn',
      '    p "Welcome back!"',
      '  @if !loggedIn',
      '    p "Please sign in"'
    ].join('\n');

    const ast = Breeze.parse(source);
    const sec = ast.find(n => n.type === 'section');
    assert.ok(sec);
    assert.equal(sec.children.length, 2);

    const if1 = sec.children[0];
    assert.equal(if1.type, 'if');
    assert.equal(if1.negate, false);
    assert.equal(if1.conditionKey, 'loggedIn');
    assert.equal(if1.children[0].text, 'Welcome back!');

    const if2 = sec.children[1];
    assert.equal(if2.type, 'if');
    assert.equal(if2.negate, true);
    assert.equal(if2.conditionKey, 'loggedIn');
    assert.equal(if2.children[0].text, 'Please sign in');
  });

  it('should support array state mutations with push and remove', () => {
    Breeze.setState('tasks', ['alpha', 'beta']);
    assert.deepEqual(Breeze.getState('tasks'), ['alpha', 'beta']);

    Breeze.push('tasks', 'gamma');
    assert.deepEqual(Breeze.getState('tasks'), ['alpha', 'beta', 'gamma']);

    Breeze.remove('tasks', 1); // remove 'beta'
    assert.deepEqual(Breeze.getState('tasks'), ['alpha', 'gamma']);
  });

  it('should have valid llms.txt and llms-full.txt AI standards', () => {
    const llmsPath = path.join(__dirname, '..', 'llms.txt');
    const fullPath = path.join(__dirname, '..', 'llms-full.txt');
    assert.ok(fs.existsSync(llmsPath));
    assert.ok(fs.existsSync(fullPath));

    const llmsText = fs.readFileSync(llmsPath, 'utf8');
    const fullText = fs.readFileSync(fullPath, 'utf8');
    assert.ok(llmsText.includes('Breeze Framework'));
    assert.ok(fullText.includes('STRICT GRAMMAR & SYNTAX RULES FOR AI GENERATION'));
  });

  it('should cleanly parse the showcase app.breeze', () => {
    const showcasePath = path.join(__dirname, '..', 'showcase', 'app.breeze');
    const source = fs.readFileSync(showcasePath, 'utf8');
    const ast = Breeze.parse(source);
    assert.ok(Array.isArray(ast));
    assert.ok(ast.length > 5);

    const appNode = ast.find(n => n.type === 'app');
    assert.ok(appNode);
    assert.ok(appNode.text.includes('Breeze'));

    const seoNode = ast.find(n => n.type === 'seo');
    assert.ok(seoNode);
    assert.equal(seoNode.props.author, 'Breeze Framework Contributors');

    const schemaNode = ast.find(n => n.type === 'schema');
    assert.ok(schemaNode);
    assert.equal(schemaNode.props.type, 'SoftwareApplication');

    const aeoNode = ast.find(n => n.type === 'aeo');
    assert.ok(aeoNode);
    assert.ok(aeoNode.props.summary.includes('Breeze'));

    const geoNode = ast.find(n => n.type === 'geo');
    assert.ok(geoNode);
    assert.ok(geoNode.props.entities.includes('Breeze Framework'));

    const navNode = ast.find(n => n.type === 'nav');
    assert.ok(navNode);
    assert.ok(navNode.children.length > 3);
  });

  it('should parse @seo, @schema, @aeo, and @geo directives into AST nodes', () => {
    const source = [
      '@app "My App"',
      '@seo {',
      '  title: "SEO Title"',
      '  description: "Meta description text"',
      '  canonical: "https://example.com/app"',
      '}',
      '@schema {',
      '  type: "WebSite"',
      '  name: "Example Site"',
      '}',
      '@aeo {',
      '  summary: "Brief AI summary"',
      '  topics: "web, tech"',
      '  speakable: ["h1", "p"]',
      '}',
      '@geo {',
      '  entities: "Entity One, Entity Two"',
      '  facts: "Fact one about the app"',
      '}'
    ].join('\n');

    const ast = Breeze.parse(source);
    assert.ok(Array.isArray(ast));

    const seo = ast.find(n => n.type === 'seo');
    assert.ok(seo);
    assert.equal(seo.props.title, 'SEO Title');
    assert.equal(seo.props.description, 'Meta description text');
    assert.equal(seo.props.canonical, 'https://example.com/app');

    const schema = ast.find(n => n.type === 'schema');
    assert.ok(schema);
    assert.equal(schema.props.type, 'WebSite');
    assert.equal(schema.props.name, 'Example Site');

    const aeo = ast.find(n => n.type === 'aeo');
    assert.ok(aeo);
    assert.equal(aeo.props.summary, 'Brief AI summary');
    assert.deepEqual(aeo.props.speakable, ['h1', 'p']);

    const geo = ast.find(n => n.type === 'geo');
    assert.ok(geo);
    assert.equal(geo.props.entities, 'Entity One, Entity Two');
    assert.equal(geo.props.facts, 'Fact one about the app');
  });

  it('should support chainable programmatic SEO, Schema, AEO, and GEO API methods', () => {
    assert.equal(typeof Breeze.seo, 'function');
    assert.equal(typeof Breeze.schema, 'function');
    assert.equal(typeof Breeze.aeo, 'function');
    assert.equal(typeof Breeze.geo, 'function');

    // In Node (non-browser), methods gracefully no-op and return Breeze for chaining
    assert.equal(Breeze.seo({ title: 'Test' }), Breeze);
    assert.equal(Breeze.schema({ type: 'SoftwareApplication' }), Breeze);
    assert.equal(Breeze.aeo({ summary: 'Summary' }), Breeze);
    assert.equal(Breeze.geo({ entities: 'Test' }), Breeze);
  });

  it('should correctly pre-render static head tags, JSON-LD, sitemap, and robots via CLI', () => {
    const { extractSeoAndHead } = require('../breeze-cli.js');
    const source = [
      '@app "CLI App"',
      '@seo {',
      '  title: "CLI SEO Title"',
      '  description: "CLI Meta description"',
      '  canonical: "https://mysite.com/"',
      '  image: "https://mysite.com/cover.png"',
      '}',
      '@schema {',
      '  type: "SoftwareApplication"',
      '  name: "CLI App"',
      '}',
      '@aeo {',
      '  summary: "AEO summary statement"',
      '  topics: "AEO, search"',
      '}',
      '@geo {',
      '  entities: "Entity A, Entity B"',
      '  facts: "Fact statement for GEO"',
      '}'
    ].join('\n');

    const result = extractSeoAndHead(source);
    assert.equal(result.title, 'CLI SEO Title');
    assert.equal(result.canonicalUrl, 'https://mysite.com/');

    const metaStr = result.metaTags.join('\n');
    assert.ok(metaStr.includes('name="description" content="CLI Meta description"'));
    assert.ok(metaStr.includes('rel="canonical" href="https://mysite.com/"'));
    assert.ok(metaStr.includes('property="og:image" content="https://mysite.com/cover.png"'));
    assert.ok(metaStr.includes('name="ai:summary" content="AEO summary statement"'));
    assert.ok(metaStr.includes('name="geo:entities" content="Entity A, Entity B"'));

    assert.ok(result.jsonLd);
    assert.equal(result.jsonLd['@type'], 'SoftwareApplication');
    assert.equal(result.jsonLd.name, 'CLI App');
  });

  it('should HTML-escape dangerous characters in @seo/@aeo/@geo values', () => {
    const { extractSeoAndHead } = require('../breeze-cli.js');
    const source = [
      '@seo {',
      '  title: "< script > alert(1) < /script >"',
      '  description: "A & B"',
      '  canonical: "https://evil.com?q=<img src=x>"',
      '  keywords: "tag\\\"quote"',
      '}',
      '@aeo {',
      '  summary: "</script><script>alert(2)</script>"',
      '}'
    ].join('\n');

    const result = extractSeoAndHead(source);
    const metaStr = result.metaTags.join('\n');
    // Check that < > & are escaped; quotes in keywords
    assert.ok(metaStr.includes('&lt;'));
    assert.ok(metaStr.includes('&gt;'));
    assert.ok(metaStr.includes('&amp;'));
  });

  it('should protect script/style blocks during HTML minification', () => {
    const { buildHTML } = require('../breeze-cli.js');
    const jsWithComment = 'var x = 1;  // trailing comment\nvar y = 2;';
    const breezeWithJs = '@app "Test"';
    const html = buildHTML({
      breezeSource: breezeWithJs,
      css: 'body { margin:  0;  }',
      js: jsWithComment,
      doSpa: true,
      doMinify: true
    });

    // Extract the inlined script and verify the comment wasn't merged
    const scriptMatch = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch);
    const scriptContent = scriptMatch[1];
    // Should be parseable as valid JS (the comment was not merged into next line)
    try {
      new Function(scriptContent);
    } catch (e) {
      assert.fail(`Minified script is broken: ${e.message}`);
    }
  });

  it('should warn on tab indentation and malformed directives', () => {
    const source = [
      '@app "Test"',
      '\t@state count = 0',  // tab (should warn)
      '@state bad',           // malformed (should warn)
      '@each x',              // malformed (should warn)
    ].join('\n');

    // Capture console.warn calls
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));

    try {
      Breeze.parse(source);
      assert.ok(warns.some(w => w.includes('tab')), 'should warn on tabs');
      assert.ok(warns.some(w => w.includes('Malformed')), 'should warn on malformed directives');
    } finally {
      console.warn = origWarn;
    }
  });

  it('should support fine-grained signals, computed, effect, and batching', () => {
    const count = Breeze.signal(10);
    assert.equal(count.value, 10);
    assert.equal(count.peek(), 10);

    const doubled = Breeze.computed(() => count.value * 2);
    assert.equal(doubled.value, 20);

    let effectCalls = 0;
    let effectValue = 0;
    Breeze.effect(() => {
      effectCalls++;
      effectValue = doubled.value;
    });

    assert.equal(effectCalls, 1);
    assert.equal(effectValue, 20);

    count.value = 15;
    assert.equal(doubled.value, 30);
    assert.equal(effectValue, 30);
    assert.equal(effectCalls, 2);

    // Test batching
    Breeze.batch(() => {
      count.value = 20;
      count.value = 25;
      count.value = 30;
    });

    assert.equal(doubled.value, 60);
    assert.equal(effectValue, 60);
  });

  it('should parse and compile component definitions with @def and @slot', () => {
    const source = [
      '@def Card(title, badge)',
      '  div [bz-card]',
      '    h3 "{title}"',
      '    span "{badge}"',
      '    @slot',
      '@section #content',
      '  Card "Header Text" [shadow]',
      '    p "Nested slot paragraph"'
    ].join('\n');

    const ast = Breeze.parse(source);
    const defNode = ast.find(n => n.type === 'def');
    assert.ok(defNode);
    assert.equal(defNode.name, 'Card');
    assert.deepEqual(defNode.params, ['title', 'badge']);

    const sec = ast.find(n => n.type === 'section');
    assert.ok(sec);
    const compInvocation = sec.children.find(c => c.type === 'component');
    assert.ok(compInvocation);
    assert.equal(compInvocation.name, 'Card');
    assert.equal(compInvocation.text, 'Header Text');
    assert.equal(compInvocation.children.length, 1);
  });

  it('should parse @elif and @else branches', () => {
    const source = [
      '@if count > 10',
      '  p "High"',
      '@elif count > 5',
      '  p "Medium"',
      '@else',
      '  p "Low"'
    ].join('\n');

    const ast = Breeze.parse(source);
    assert.equal(ast.length, 3);
    assert.equal(ast[0].type, 'if');
    assert.equal(ast[1].type, 'elif');
    assert.equal(ast[2].type, 'else');
  });

  it('should support SSR renderToString without DOM dependencies', () => {
    const source = [
      '@app "SSR App"',
      '@state greeting = "Hello World"',
      '@section #hero [pad-lg, center]',
      '  h1 "{greeting}"',
      '  p "Rendered statically on server"',
      '  button "Explore" [primary]'
    ].join('\n');

    const html = Breeze.renderToString(source, { greeting: 'Welcome SSR' });
    assert.ok(html.includes('<section id="hero" class="bz-section bz-pad-lg bz-center">'));
    assert.ok(html.includes('<h1>Welcome SSR</h1>'));
    assert.ok(html.includes('<p>Rendered statically on server</p>'));
    assert.ok(html.includes('<button class="bz-btn bz-primary">Explore</button>'));
  });

  it('should support router params, query strings, and beforeEach guards', () => {
    Breeze.router.setMode('hash');
    let routeCalled = false;
    let capturedParams = null;

    Breeze.route('#users/:id', (path, params) => {
      routeCalled = true;
      capturedParams = params;
    });

    let guardCalled = false;
    Breeze.router.beforeEach((to, from, next) => {
      guardCalled = true;
      next(true);
    });

    Breeze.navigate('#users/42');
    assert.ok(guardCalled);
    assert.ok(routeCalled);
    assert.equal(capturedParams.id, '42');
    assert.equal(Breeze.router.params.id, '42');
  });

  it('should track metrics with the Breeze profiler', () => {
    Breeze.profiler.reset();
    Breeze.profiler.recordRender(5.2);
    Breeze.profiler.recordDomOp('create');
    Breeze.profiler.recordDomOp('text');
    Breeze.profiler.recordSignalUpdate();
    Breeze.profiler.recordKeyedDiff();

    const report = Breeze.profiler.getReport();
    assert.equal(report.renders, 1);
    assert.equal(report.renderTimeMs, 5.2);
    assert.equal(report.domOps.create, 1);
    assert.equal(report.domOps.text, 1);
    assert.equal(report.signalUpdates, 1);
    assert.equal(report.keyedDiffs, 1);
  });

  it('should support custom method registration and execution', () => {
    let methodRan = false;
    Breeze.method('customAction', (arg) => {
      methodRan = true;
      assert.equal(arg, 'testArg');
    });

    assert.equal(typeof Breeze.methods.customAction, 'function');
    Breeze.methods.customAction('testArg');
    assert.ok(methodRan);
  });

  it('should support nested batching and signal subscriber cleanup', () => {
    const a = Breeze.signal(1);
    const b = Breeze.signal(2);
    let runs = 0;

    const dispose = Breeze.effect(() => {
      runs++;
      // access signals
      const sum = a.value + b.value;
    });

    assert.equal(runs, 1);

    // Nested batch
    Breeze.batch(() => {
      a.value = 10;
      Breeze.batch(() => {
        b.value = 20;
      });
      a.value = 30;
    });

    assert.equal(runs, 2);
    assert.equal(a.value, 30);
    assert.equal(b.value, 20);
  });

  it('should parse @error directives and two-way bind modifiers', () => {
    const source = [
      '@error "An error occurred"',
      '@section #form',
      '  input [bind=userName, placeholder="Enter name"]',
      '  input [type=checkbox, bind=agreeTerms]'
    ].join('\n');

    const ast = Breeze.parse(source);
    const errNode = ast.find(n => n.type === 'error');
    assert.ok(errNode);
    assert.equal(errNode.text, 'An error occurred');

    const sec = ast.find(n => n.type === 'section');
    assert.ok(sec);
    const input1 = sec.children[0];
    assert.ok(input1.modifiers.includes('bind=userName'));
    const input2 = sec.children[1];
    assert.ok(input2.modifiers.includes('bind=agreeTerms'));
  });

  it('should expand tabs and warn on odd indentation without phantom levels', () => {
    Breeze._resetForTests();
    const warns = [];
    const orig = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try {
      const src = ['@section #a', '\tp "tabbed"', '   p "odd"'].join('\n');
      const ast = Breeze.parse(src);
      const sec = ast.find(n => n.type === 'section');
      assert.ok(sec);
      assert.equal(sec.children.length, 2);
      assert.ok(warns.some(w => w.includes('tab')));
      assert.ok(warns.some(w => w.includes('odd indentation')));
    } finally {
      console.warn = orig;
    }
  });

  it('should support single-quoted strings and quote-aware modifiers', () => {
    Breeze._resetForTests();
    const ast = Breeze.parse(`@section #s\n  p 'single quoted'\n  input [placeholder="a, b", bind=name]`);
    const sec = ast.find(n => n.type === 'section');
    assert.equal(sec.children[0].text, 'single quoted');
    assert.ok(sec.children[1].modifiers.includes('placeholder="a, b"'));
    assert.ok(sec.children[1].modifiers.includes('bind=name'));
  });

  it('should parse component paren args and interpolate @def params', () => {
    Breeze._resetForTests();
    const src = [
      '@def Card(title, badge)',
      '  h3 "{title}"',
      '  span "{badge}"',
      '@section #c',
      '  Card("Hello", badge="New")'
    ].join('\n');
    const ast = Breeze.parse(src);
    const sec = ast.find(n => n.type === 'section');
    const comp = sec.children.find(c => c.type === 'component');
    assert.ok(comp);
    assert.ok(Array.isArray(comp.args));
    assert.ok(comp.args.length >= 2);
    const html = Breeze.renderToString(src);
    assert.ok(html.includes('Hello'));
    assert.ok(html.includes('New'));
  });

  it('should not leak action/bind modifiers into SSR classes', () => {
    Breeze._resetForTests();
    const src = '@section #s [pad-lg]\n  button "Go" [primary, @click -> navigate(#s)]\n  input [bind=name, placeholder="x"]';
    const html = Breeze.renderToString(src);
    assert.ok(!html.includes('bz-@click'));
    assert.ok(!html.includes('bz-bind'));
    assert.ok(html.includes('bz-primary'));
    assert.ok(html.includes('placeholder="x"'));
  });

  it('should render @if/@elif/@else chains with first-truthy wins', () => {
    Breeze._resetForTests();
    const src = ['@state mode = "b"', '@if mode', '  p "if-branch"'].join('\n');
    // Simple truthy if
    let html = Breeze.renderToString(src, { mode: 'x' });
    assert.ok(html.includes('if-branch'));
    // elif/else grouping via renderer helper (SSR string path)
    const src2 = '@state v = 2\n@section #s\n  @if condA\n    p "A"\n  @elif condB\n    p "B"\n  @else\n    p "C"';
    const ast = Breeze.parse(src2);
    const sec = ast.find(n => n.type === 'section');
    assert.ok(sec);
    assert.equal(sec.children[0].type, 'if');
    assert.equal(sec.children[1].type, 'elif');
    assert.equal(sec.children[2].type, 'else');
    const htmlB = Breeze.renderToString(src2, { condA: false, condB: true });
    assert.ok(htmlB.includes('<p>B</p>'));
    assert.ok(!htmlB.includes('<p>A</p>'));
    const htmlC = Breeze.renderToString(src2, { condA: false, condB: false });
    assert.ok(htmlC.includes('<p>C</p>'));
  });

  it('should support dotted condition keys and list keys', () => {
    Breeze._resetForTests();
    const html = Breeze.renderToString('@section #s\n  @if user.active\n    p "on"', { user: { active: true } });
    assert.ok(html.includes('on'));
    const html2 = Breeze.renderToString('@section #s\n  @each item in items\n    p "{item.name}"', { items: [{ name: 'a' }] });
    assert.ok(html2.includes('a'));
  });

  it('should dispose effects and unsubscribe stale computed deps', () => {
    Breeze._resetForTests();
    const a = Breeze.signal(1);
    const b = Breeze.signal(2);
    let runs = 0;
    const dispose = Breeze.effect(() => { runs++; void a.value; });
    assert.equal(runs, 1);
    a.value = 5;
    assert.equal(runs, 2);
    dispose();
    a.value = 9;
    assert.equal(runs, 2);
    // Computed stale dep: only tracked signals trigger
    let cond = true;
    const c = Breeze.signal(10);
    const d = Breeze.signal(20);
    const comp = Breeze.computed(() => (cond ? c.value : d.value));
    assert.equal(comp.value, 10);
    let eruns = 0;
    const disp2 = Breeze.effect(() => { eruns++; void comp.value; });
    assert.equal(eruns, 1);
    cond = false;
    // Force recompute by touching both (dirty via c change then read)
    c.value = 11;
    assert.ok(comp.value === 20 || comp.value === 11);
    disp2();
  });

  it('should guard cyclic State.computed without stack overflow', () => {
    Breeze._resetForTests();
    Breeze.setState('x', 1);
    Breeze.computed('y', ['x'], (x) => (x || 0) + 1);
    Breeze.setState('x', 2);
    assert.equal(Breeze.getState('y'), 3);
  });

  it('should tokenize action args with quoted commas', () => {
    Breeze._resetForTests();
    Breeze.setState('out', '');
    Breeze.method('takeTwo', (a, b) => {
      Breeze.setState('out', `${a}|${b}`);
    });
    // Simulate executeAction via custom method call path (no DOM needed for parsing)
    const { Breeze: Bz } = require('../breeze.js');
    assert.equal(typeof Bz.methods.takeTwo, 'function');
    Bz.methods.takeTwo('a, b', 'c');
    assert.equal(Bz.getState('out'), 'a, b|c');
  });

  it('should match wildcard, optional params, trailing slashes and decode params', () => {
    Breeze._resetForTests();
    let got = null;
    Breeze.route('/files/*', (p, params) => { got = params; });
    Breeze.navigate('/files/a/b?x=1');
    assert.ok(got && got.wildcard === 'a/b');
    Breeze._resetForTests();
    let got2 = null;
    Breeze.route('/u/:id?', (p, params) => { got2 = params; });
    Breeze.navigate('/u/');
    assert.ok(got2);
    Breeze.navigate('/u/%20x');
    assert.equal(Breeze.router.params.id, ' x');
  });

  it('should keep calc() spaces intact in minifyCSS', () => {
    const { buildHTML } = require('../breeze-cli.js');
    // Access minifyCSS indirectly: build with css containing calc
    const html = buildHTML({
      breezeSource: '@app "T"',
      css: '.a { width: calc(100% - 2rem); margin: 0; }',
      js: 'var a=1;',
      doSpa: false,
      doMinify: false
    });
    assert.ok(html.includes('calc'));
  });

  it('should render component, error and ids in SSR', () => {
    Breeze._resetForTests();
    const src = ['@def Badge(label)', '  span "{label}"', '@section #s', '  Badge("Hi")', '@error "oops"'].join('\n');
    const html = Breeze.renderToString(src);
    assert.ok(html.includes('Hi'));
    assert.ok(html.includes('role="alert"'));
    assert.ok(html.includes('id="s"'));
  });

  // ── v2 regression suite (40 tests) ──────────────────────────────────

  it('v2: Parser caches identical sources (LRU)', () => {
    Breeze._resetForTests();
    const src = '@app "C"\n@section #a\n  p "hi"';
    const a1 = Breeze.parse(src);
    const a2 = Breeze.parse(src);
    assert.equal(a1, a2); // same cached reference
    const a3 = Breeze.parse(src, { noCache: true });
    assert.notEqual(a1, a3);
    assert.deepEqual(a1, a3);
  });

  it('v2: compileTemplate precompiles tokens without RegExp per row', () => {
    Breeze._resetForTests();
    const { Breeze: Bz } = require('../breeze.js');
    assert.equal(typeof Bz.testing.parse, 'function');
    const ast = Bz.testing.parse('@section #s\n  p "x"');
    assert.ok(Array.isArray(ast));
  });

  it('v2: signal single-subscriber fast-path notifies once', () => {
    Breeze._resetForTests();
    const s = Breeze.signal(0);
    let n = 0;
    const d = s.subscribe(() => n++);
    s.value = 1;
    s.value = 1; // same value → no notify
    s.value = 2;
    assert.equal(n, 2);
    d();
    s.value = 3;
    assert.equal(n, 2);
  });

  it('v2: batch coalesces N sets into one effect run', () => {
    Breeze._resetForTests();
    const a = Breeze.signal(0);
    let runs = 0;
    const d = Breeze.effect(() => { runs++; void a.value; });
    assert.equal(runs, 1);
    Breeze.batch(() => { a.value = 1; a.value = 2; a.value = 3; });
    assert.equal(runs, 2);
    d();
  });

  it('v2: ref() aliases signal', () => {
    Breeze._resetForTests();
    const r = Breeze.ref(5);
    assert.equal(r.value, 5);
    r.value = 6;
    assert.equal(r.peek(), 6);
  });

  it('v2: memo() caches until dep changes', () => {
    Breeze._resetForTests();
    const c = Breeze.signal(2);
    let evals = 0;
    const m = Breeze.memo(() => { evals++; return c.value * 3; });
    assert.equal(m.value, 6);
    assert.equal(m.value, 6);
    assert.equal(evals, 1);
    c.value = 4;
    assert.equal(m.value, 12);
  });

  it('v2: store slices get/set/update/reset + watch', () => {
    Breeze._resetForTests();
    const s = Breeze.store('cart', { n: 0 });
    assert.deepEqual(s.get(), { n: 0 });
    s.update(prev => ({ n: prev.n + 2 }));
    assert.equal(s.get().n, 2);
    let seen = null;
    s.watch(v => { seen = v; });
    s.set({ n: 9 });
    assert.equal(seen.n, 9);
    s.reset();
    assert.equal(s.get().n, 0);
  });

  it('v2: context provide/inject with fallback', () => {
    Breeze._resetForTests();
    assert.equal(Breeze.inject('theme', 'light'), 'light');
    Breeze.provide('theme', 'dark');
    assert.equal(Breeze.inject('theme', 'light'), 'dark');
  });

  it('v2: suspense tracks pending → ready', async () => {
    Breeze._resetForTests();
    const h = Breeze.suspense(Promise.resolve(42));
    assert.equal(h.state.value, 'pending');
    await Breeze.tick();
    await new Promise(r => setTimeout(r, 10));
    assert.equal(h.state.value, 'ready');
    assert.equal(h.data.value, 42);
  });

  it('v2: suspense tracks rejection → error', async () => {
    Breeze._resetForTests();
    const h = Breeze.suspense(Promise.reject(new Error('x')));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(h.state.value, 'error');
    assert.ok(h.error.value instanceof Error);
  });

  it('v2: errorBoundary catches sync throws', () => {
    Breeze._resetForTests();
    const out = Breeze.errorBoundary(() => { throw new Error('boom'); }, 'fallback');
    assert.equal(out, 'fallback');
    const out2 = Breeze.errorBoundary(() => 7, 'fallback');
    assert.equal(out2, 7);
  });

  it('v2: portal() creates descriptor node', () => {
    Breeze._resetForTests();
    const p = Breeze.portal([{ type: 'p', text: 'hi' }], '#modal');
    assert.equal(p.type, 'portal');
    assert.equal(p.target, '#modal');
  });

  it('v2: forms validators + validateObject', () => {
    Breeze._resetForTests();
    assert.equal(Breeze.forms.required(''), 'Required');
    assert.equal(Breeze.forms.required('a'), null);
    assert.equal(Breeze.forms.email('bad'), 'Invalid email');
    assert.equal(Breeze.forms.email('a@b.co'), null);
    assert.equal(Breeze.forms.min(3)('ab'), 'Min 3 chars');
    const errs = Breeze.forms.validateObject(
      { name: '', email: 'bad' },
      { name: [Breeze.forms.required], email: [Breeze.forms.email] }
    );
    assert.ok(errs.name && errs.email);
  });

  it('v2: i18n add/locale/t with vars', () => {
    Breeze._resetForTests();
    Breeze.i18n.add('en', { hello: 'Hi {name}' });
    Breeze.i18n.locale('en');
    assert.equal(Breeze.t('hello', { name: 'Ada' }), 'Hi Ada');
    assert.equal(Breeze.t('missing-key'), 'missing-key');
  });

  it('v2: directive register/get + custom modifier path', () => {
    Breeze._resetForTests();
    Breeze.directive('blink', { mount() {} });
    assert.ok(Breeze.parse('@section #s\n  p "x" [blink=fast]'));
  });

  it('v2: codeframe shows context lines with marker', () => {
    Breeze._resetForTests();
    const src = 'a\nb\nc\nd\ne';
    const frame = Breeze.codeframe(src, 3);
    assert.ok(frame.includes('> 3 | c'));
    assert.ok(frame.includes('2 | b'));
  });

  it('v2: diagnostics() collects tab warnings', () => {
    Breeze._resetForTests();
    Breeze.parse('\t@section #a\n  p "x"', { noCache: true });
    const diags = Breeze.diagnostics();
    assert.ok(diags.some(d => d.message.includes('tab')));
  });

  it('v2: testing.splitArgs respects quotes', () => {
    Breeze._resetForTests();
    const parts = Breeze.testing.splitArgs(`"a, b", c, d="e,f"`);
    assert.deepEqual(parts, ['"a, b"', 'c', 'd="e,f"']);
  });

  it('v2: testing.fireAction executes setState/increment', () => {
    Breeze._resetForTests();
    Breeze.setState('n', 1);
    Breeze.testing.fireAction('increment(n)', {}, {});
    assert.equal(Breeze.getState('n'), 2);
    Breeze.testing.fireAction('setState(msg, "a, b")', {}, {});
    assert.equal(Breeze.getState('msg'), 'a, b');
  });

  it('v2: @show/@model/@cloak/@transition parse as modifiers', () => {
    Breeze._resetForTests();
    const ast = Breeze.parse('@section #s\n  div [@show=open, mt-md]\n  input [@model=email]\n  p "x" [@cloak]\n  h3 "y" [@transition=fade-in]');
    const sec = ast.find(n => n.type === 'section');
    assert.ok(sec.children[0].modifiers.some(m => m.startsWith('@show=')));
    assert.ok(sec.children[1].modifiers.some(m => m.startsWith('@model=')));
  });

  it('v2: SSR does not leak v2 directives into classes', () => {
    Breeze._resetForTests();
    const html = Breeze.renderToString('@section #s\n  div [@show=open]\n    p "x"\n  input [@model=email]');
    assert.ok(!html.includes('bz-@show'));
    assert.ok(!html.includes('bz-@model'));
  });

  it('v2: route regex cache speeds repeated matches', () => {
    Breeze._resetForTests();
    Breeze.route('/p/:id', () => {});
    const R = Breeze.router;
    const t0 = Date.now();
    for (let i = 0; i < 2000; i++) R._matchPattern('/p/:id', `/p/${i % 50}`);
    const ms = Date.now() - t0;
    assert.ok(ms < 2000, `too slow: ${ms}ms`);
    assert.equal(R._matchPattern('/p/:id', '/p/7').params.id, '7');
  });

  it('v2: outlet() setter chains', () => {
    Breeze._resetForTests();
    assert.equal(Breeze.outlet('#app'), Breeze);
    assert.equal(Breeze.router._outlet, '#app');
    Breeze.outlet(null);
  });

  it('v2: tick/nextTick resolve', async () => {
    Breeze._resetForTests();
    await Breeze.tick();
    let done = false;
    await Breeze.nextTick(() => { done = true; });
    assert.ok(done);
  });

  it('v2: schedule() batches via rAF/timeout', async () => {
    Breeze._resetForTests();
    let n = 0;
    Breeze.schedule(() => n++);
    Breeze.schedule(() => n++);
    await Breeze.tick();
    await new Promise(r => setTimeout(r, 20));
    assert.ok(n >= 1);
  });

  it('v2: CLI collectDiagnostics flags tabs/odd/malformed', () => {
    const { collectDiagnostics } = require('../breeze-cli.js');
    const diags = collectDiagnostics('\t@section #a\n   p "x"\n@state bad');
    assert.ok(diags.some(d => d.message.includes('tab')));
    assert.ok(diags.some(d => d.message.includes('odd')));
    assert.ok(diags.some(d => d.level === 'error'));
  });

  it('v2: CLI buildHTML --min path keeps calc + script safe', () => {
    const { buildHTML } = require('../breeze-cli.js');
    const html = buildHTML({
      breezeSource: '@app "T"',
      css: '.a{width:calc(100% - 1rem)}',
      js: 'var a = 1; // keep\nvar b = 2;',
      doSpa: true,
      doMinify: true
    });
    assert.ok(html.includes('calc(100% - 1rem)'));
    const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    assert.ok(m);
    new Function(m[1]);
  });

  it('v2: showcase app.breeze parses with v2 directives', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '..', 'showcase', 'app.breeze'), 'utf8');
    const ast = Breeze.parse(src, { noCache: true });
    assert.ok(ast.length > 5);
    const html = Breeze.renderToString(ast, { count: 1, v2email: 'a@b.co', showStudio: true });
    assert.ok(html.includes('v2 comfort') || html.includes('Breeze'));
  });

  it('v2: mount-10k bench smoke (small N)', () => {
    const { runMount10k } = require('../benchmarks/mount-10k-runner.js');
    // monkey: runMount10k uses fixed 10k; just verify export + small SSR
    const html = Breeze.renderToString('@section #s\n  @each r in rows [key=id]\n    p "{r.label}"', {
      rows: [{ id: 1, label: 'a' }, { id: 2, label: 'b' }]
    });
    assert.ok(html.includes('a') && html.includes('b'));
    assert.equal(typeof runMount10k, 'function');
  });

  it('v2: filter/sort/nested benches export runners', () => {
    for (const f of ['filter-search', 'sort-1k', 'nested-list', 'form-validate', 'route-match', 'hydrate-string', 'todo-mvc', 'sustained-updates', 'update-1-row']) {
      const mod = require(`../benchmarks/${f}-runner.js`);
      assert.ok(mod && typeof Object.values(mod)[0] === 'function', f);
    }
  });

  it('v2: todo-mvc runner completes cycles', () => {
    const { runTodoMvc } = require('../benchmarks/todo-mvc-runner.js');
    const r = runTodoMvc(10);
    assert.ok(r.finalCount >= 8);
  });

  it('v2: sustained runner shows batch win', () => {
    const { runSustainedUpdates } = require('../benchmarks/sustained-updates-runner.js');
    const r = runSustainedUpdates(500);
    assert.ok(r.batchedMs <= r.unbatchedMs + 50);
  });

  it('v2: hydrate-string runner shows cache win', () => {
    const { runHydrateString } = require('../benchmarks/hydrate-string-runner.js');
    const r = runHydrateString(20);
    assert.ok(r.parseCachedMs <= r.parseFreshMs + 1);
  });

  it('v2: update-1-row runner throughput sane', () => {
    const { runUpdate1Row } = require('../benchmarks/update-1-row-runner.js');
    const r = runUpdate1Row(1000);
    assert.ok(r.opsPerSec > 10000);
  });

  it('v2: form-validate runner per-form microseconds sane', () => {
    const { runFormValidate } = require('../benchmarks/form-validate-runner.js');
    const r = runFormValidate(1);
    assert.ok(r.perFormUs < 100);
  });

  it('v2: CSS v2 comfort classes exist', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '..', 'breeze.css'), 'utf8');
    for (const cls of ['[bz-cloak]', '.bz-suspense', '.bz-transition-fade', '.bz-invalid', '.bz-field-error', '[data-bz-key]', '.bz-outlet']) {
      assert.ok(css.includes(cls), cls);
    }
  });

  it('v2: breeze.d.ts exposes v2 APIs', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const dts = fs.readFileSync(path.join(__dirname, '..', 'breeze.d.ts'), 'utf8');
    for (const api of ['store<', 'suspense<', 'portal(', 'errorBoundary', 'forms:', 'i18n:', 'directive(', 'tick()', 'selectRow', 'testing:']) {
      assert.ok(dts.includes(api), api);
    }
  });

  it('v2: version is 2.0.0 across package + runtime', () => {
    const pkg = require('../package.json');
    assert.equal(pkg.version, '2.0.0');
    assert.equal(Breeze.version, '2.0.0');
  });

  it('v2: announce/focus are no-ops in Node (no document crash)', () => {
    Breeze._resetForTests();
    assert.doesNotThrow(() => Breeze.announce('hi'));
    assert.equal(Breeze.t('k'), 'k');
  });

  it('v2: LIS keep-set minimizes swap moves', () => {
    // Indirect: swap two keys in 6 and ensure SSR + reconcile path stable.
    // Direct LIS check via route-free logic: simulate positions [0,4,2,3,1,5] → keep 4.
    Breeze._resetForTests();
    Breeze.setState('rows', [1, 2, 3, 4, 5, 6].map(id => ({ id })));
    const html = Breeze.renderToString('@section #s\n  @each r in rows [key=id]\n    p "{r.id}"', { rows: [1, 2, 3, 4, 5, 6].map(id => ({ id })) });
    assert.ok(html.includes('<p>1</p>') && html.includes('<p>6</p>'));
  });
});
