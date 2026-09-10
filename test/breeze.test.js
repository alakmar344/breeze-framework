const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Breeze } = require('../breeze.js');

describe('Breeze Framework Core', () => {
  it('should expose the public API object', () => {
    assert.ok(Breeze);
    assert.equal(typeof Breeze.parse, 'function');
    assert.equal(Breeze.version, '1.0.0');
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
