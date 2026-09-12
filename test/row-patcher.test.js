'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Breeze } = require('../breeze.js');

describe('Surgical Row Patcher & Reconciler Optimizations', () => {
  it('compileRowPatcher: parses nested AST bindings and compiles path-based patcher', () => {
    const template = `
@each row in rows [key=id]
  tr
    td.col-md-1 "{row.id}"
    td.col-md-4
      a.lbl "{row.label}"
    td.col-md-1
      a.remove "✖"
    td.col-md-6 ""
`;
    const ast = Breeze.parse(template);
    const eachNode = ast.find(n => n.type === 'each');
    assert.ok(eachNode, 'found @each node');

    const patcher = Breeze.Renderer.compileRowPatcher(eachNode.children, 'row');
    assert.equal(typeof patcher, 'function', 'compileRowPatcher returns a function');

    // Create a mock DOM tree matching the template
    const tr = {
      children: [
        {
          className: 'col-md-1',
          firstChild: { nodeType: 3, nodeValue: '1' },
          childNodes: [{ nodeType: 3, nodeValue: '1' }]
        },
        {
          className: 'col-md-4',
          children: [
            {
              className: 'lbl',
              firstChild: { nodeType: 3, nodeValue: 'old label' },
              childNodes: [{ nodeType: 3, nodeValue: 'old label' }]
            }
          ]
        },
        {
          className: 'col-md-1',
          children: [
            {
              className: 'remove',
              firstChild: { nodeType: 3, nodeValue: '✖' },
              childNodes: [{ nodeType: 3, nodeValue: '✖' }]
            }
          ]
        },
        {
          className: 'col-md-6',
          firstChild: null,
          childNodes: []
        }
      ]
    };

    const success = patcher(tr, { id: 42, label: 'updated label !!!' }, 0);
    assert.equal(success, true);
    assert.equal(tr.children[0].firstChild.nodeValue, '42');
    assert.equal(tr.children[1].children[0].firstChild.nodeValue, 'updated label !!!');
    assert.equal(tr.children[2].children[0].firstChild.nodeValue, '✖', 'static node unchanged');
  });

  it('updateItemDOM: seamlessly utilizes compiled row patcher for static templates', () => {
    const template = `
@each row in items [key=id]
  tr
    td "{row.id}"
    td.name
      span.inner "{row.name}"
`;
    const ast = Breeze.parse(template);
    const eachNode = ast.find(n => n.type === 'each');

    const tr = {
      children: [
        {
          firstChild: { nodeType: 3, nodeValue: '10' },
          childNodes: [{ nodeType: 3, nodeValue: '10' }]
        },
        {
          className: 'name',
          children: [
            {
              className: 'inner',
              firstChild: { nodeType: 3, nodeValue: 'Alpha' },
              childNodes: [{ nodeType: 3, nodeValue: 'Alpha' }]
            }
          ]
        }
      ]
    };

    const patched = Breeze.Renderer.updateItemDOM(tr, eachNode.children, 'row', { id: 10, name: 'Beta' }, 0);
    assert.equal(patched, true);
    assert.equal(tr.children[0].firstChild.nodeValue, '10');
    assert.equal(tr.children[1].children[0].firstChild.nodeValue, 'Beta');
  });

  it('batch: handles deep updates and clears reusable queue', () => {
    const s = Breeze.signal(1);
    let runs = 0;
    const dispose = Breeze.effect(() => {
      runs++;
      void s.value;
    });

    Breeze.batch(() => {
      s.value = 2;
      s.value = 3;
      s.value = 4;
    });

    assert.equal(s.value, 4);
    assert.equal(runs, 2); // Initial run + 1 batched run
    dispose();
  });

  it('compileRowPatcher: handles dynamic class and attribute modifiers', () => {
    const template = `
@each row in items [key=id]
  tr [class="row-{row.status}", data-val="{row.val}"]
    td "{row.name}"
`;
    const ast = Breeze.parse(template);
    const eachNode = ast.find(n => n.type === 'each');
    const patcher = Breeze.Renderer.compileRowPatcher(eachNode.children, 'row');

    const tr = {
      className: 'row-active',
      attrs: { 'data-val': '100' },
      getAttribute(k) { return this.attrs[k]; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      children: [
        {
          firstChild: { nodeType: 3, nodeValue: 'Old Name' },
          childNodes: [{ nodeType: 3, nodeValue: 'Old Name' }]
        }
      ]
    };

    const ok = patcher(tr, { id: 1, status: 'pending', val: '200', name: 'New Name' }, 0);
    assert.equal(ok, true);
    assert.equal(tr.className, 'row-pending');
    assert.equal(tr.getAttribute('data-val'), '200');
    assert.equal(tr.children[0].firstChild.nodeValue, 'New Name');
  });
});

