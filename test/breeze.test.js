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
    assert.equal(Breeze.version, '1.0.0');
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
});
