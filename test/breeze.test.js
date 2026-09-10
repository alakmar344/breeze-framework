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

    const navNode = ast.find(n => n.type === 'nav');
    assert.ok(navNode);
    assert.ok(navNode.children.length > 3);
  });
});
