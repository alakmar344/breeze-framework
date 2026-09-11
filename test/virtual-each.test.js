/*!
 * Breeze Framework - Built-in List Virtualization Tests (@virtual each ...)
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Breeze } = require('../breeze.js');

describe('Built-in List Virtualization (@virtual each)', () => {

  describe('1. Directive Parser', () => {
    it('parses @virtual each with height and overscan modifiers', () => {
      const ast = Breeze.parse(`
div.container
  @virtual each item in items [height=44, overscan=6, key=id]
    div.row "{item.name}"
`);
      assert.ok(ast);
      assert.equal(ast[0].children.length, 1);
      const node = ast[0].children[0];
      assert.equal(node.type, 'virtual-each');
      assert.equal(node.itemVar, 'item');
      assert.equal(node.listKey, 'items');
      assert.equal(node.keyProp, 'id');
      assert.equal(node.itemHeight, 44);
      assert.equal(node.overscan, 6);
      assert.equal(node.children.length, 1);
      assert.equal(node.children[0].type, 'div');
    });

    it('parses @virtual for and uses defaults when height/overscan omitted', () => {
      const ast = Breeze.parse(`
@virtual for user in users
  p "{user.email}"
`);
      assert.ok(ast);
      const node = ast[0];
      assert.equal(node.type, 'virtual-each');
      assert.equal(node.itemVar, 'user');
      assert.equal(node.listKey, 'users');
      assert.equal(node.itemHeight, 40);
      assert.equal(node.overscan, 3);
      assert.equal(node.keyProp, 'id');
    });

    it('leaves plain @each completely untouched as type: each', () => {
      const ast = Breeze.parse(`
@each item in regularList [key=uuid]
  span "{item.title}"
`);
      assert.ok(ast);
      const node = ast[0];
      assert.equal(node.type, 'each');
      assert.equal(node.itemVar, 'item');
      assert.equal(node.listKey, 'regularList');
      assert.equal(node.keyProp, 'uuid');
      assert.equal(node.itemHeight, undefined);
    });

    it('warns on malformed @virtual each without throwing', () => {
      const ast = Breeze.parse('@virtual each bad');
      assert.ok(Array.isArray(ast));
    });
  });

  describe('2. Window Calculation Math (calculateVirtualWindow)', () => {
    const { calculateVirtualWindow } = Breeze.testing;

    it('handles empty list (totalCount = 0)', () => {
      const win = calculateVirtualWindow({
        scrollTop: 0,
        viewportHeight: 400,
        totalCount: 0,
        itemHeight: 40,
        overscan: 3
      });
      assert.deepEqual(win, {
        startIndex: 0,
        endIndex: 0,
        visibleCount: 0,
        totalHeight: 0,
        offsetY: 0
      });
    });

    it('calculates top of viewport with overscan', () => {
      const win = calculateVirtualWindow({
        scrollTop: 0,
        viewportHeight: 400,
        totalCount: 100,
        itemHeight: 40,
        overscan: 3
      });
      assert.equal(win.startIndex, 0);
      assert.equal(win.endIndex, 13);
      assert.equal(win.visibleCount, 13);
      assert.equal(win.totalHeight, 4000);
      assert.equal(win.offsetY, 0);
    });

    it('calculates scrolled viewport position with top and bottom overscan', () => {
      const win = calculateVirtualWindow({
        scrollTop: 400,
        viewportHeight: 400,
        totalCount: 1000,
        itemHeight: 40,
        overscan: 4
      });
      assert.equal(win.startIndex, 6);
      assert.equal(win.endIndex, 24);
      assert.equal(win.visibleCount, 18);
      assert.equal(win.totalHeight, 40000);
      assert.equal(win.offsetY, 240);
    });

    it('clamps to bottom boundary without exceeding totalCount', () => {
      const win = calculateVirtualWindow({
        scrollTop: 3800,
        viewportHeight: 400,
        totalCount: 100,
        itemHeight: 40,
        overscan: 5
      });
      assert.ok(win.endIndex <= 100);
      assert.equal(win.endIndex, 100);
      assert.ok(win.startIndex >= 0);
    });

    it('scales to 1,000,000 items with instant O(1) arithmetic', () => {
      const t0 = performance.now();
      const win = calculateVirtualWindow({
        scrollTop: 20000000,
        viewportHeight: 800,
        totalCount: 1000000,
        itemHeight: 40,
        overscan: 5
      });
      const elapsed = performance.now() - t0;
      assert.ok(elapsed < 2, `Window calculation took ${elapsed}ms, expected <2ms`);
      assert.equal(win.totalHeight, 40000000);
      assert.equal(win.startIndex, 500000 - 5);
      assert.equal(win.endIndex, 500000 + 20 + 5);
      assert.equal(win.visibleCount, 30);
      assert.equal(win.offsetY, (500000 - 5) * 40);
    });
  });

  describe('3. Runtime Virtual Scrolling & DOM Node Clamping', () => {
    function createMockElement(tagName = 'div') {
      return {
        tagName: tagName.toUpperCase(),
        nodeType: 1,
        className: '',
        style: {},
        id: '',
        dataset: {},
        _attrs: {},
        get classList() {
          const self = this;
          return {
            add(c) { if (!self.className.includes(c)) self.className = (self.className + ' ' + c).trim(); },
            remove(c) { self.className = self.className.replace(new RegExp('\\b' + c + '\\b', 'g'), '').trim(); },
            contains(c) { return self.className.split(/\s+/).includes(c); }
          };
        },
        setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'id') this.id = String(v); },
        getAttribute(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; },
        removeAttribute(k) { delete this._attrs[k]; },
        children: [],
        childNodes: [],
        scrollTop: 0,
        clientHeight: 400,
        scrollHeight: 0,
        _listeners: {},
        appendChild(child) {
          if (!child) return;
          if (child.nodeType === 11) {
            const kids = [...child.children];
            kids.forEach(k => this.appendChild(k));
            child.children = [];
            return;
          }
          child.parentNode = this;
          this.children.push(child);
          this.childNodes.push(child);
          return child;
        },
        removeChild(child) {
          const idx = this.children.indexOf(child);
          if (idx !== -1) this.children.splice(idx, 1);
          const cidx = this.childNodes.indexOf(child);
          if (cidx !== -1) this.childNodes.splice(cidx, 1);
          child.parentNode = null;
          return child;
        },
        addEventListener(event, fn) {
          if (!this._listeners[event]) this._listeners[event] = [];
          this._listeners[event].push(fn);
        },
        dispatchEvent(event) {
          const list = this._listeners[event.type || event] || [];
          list.forEach(fn => fn(event));
        },
        get firstElementChild() {
          return this.children[0] || null;
        },
        get nextElementSibling() {
          if (!this.parentNode) return null;
          const idx = this.parentNode.children.indexOf(this);
          return this.parentNode.children[idx + 1] || null;
        },
        set textContent(val) {
          this.children = [];
          this.childNodes = [];
          if (val) {
            this.childNodes.push({ nodeType: 3, nodeValue: String(val) });
          }
        },
        get textContent() {
          return this.childNodes.map(n => n.nodeValue || n.textContent || '').join('');
        },
        set innerHTML(html) {
          this.children = [];
          this.childNodes = [];
          const matches = html.match(/<([a-z0-9]+)[^>]*>(.*?)<\/\1>/gi);
          if (matches) {
            matches.forEach(m => {
              const el = createMockElement('div');
              el.textContent = m.replace(/<[^>]+>/g, '');
              this.appendChild(el);
            });
          }
        }
      };
    }

    let origDoc;
    beforeEach(() => {
      origDoc = global.document;
      global.document = {
        createElement: (tag) => createMockElement(tag),
        createDocumentFragment: () => {
          const frag = createMockElement('fragment');
          frag.nodeType = 11;
          return frag;
        },
        createComment: (text) => ({ nodeType: 8, nodeValue: text }),
        createTextNode: (text) => ({ nodeType: 3, nodeValue: text })
      };
    });

    afterEach(() => {
      global.document = origDoc;
    });

    it('renders only a small slice of DOM nodes for a 10,000 item list', () => {
      const items = [];
      for (let i = 0; i < 10000; i++) {
        items.push({ id: i, name: `Item ${i}` });
      }

      Breeze.state({ vitems: items });

      const ast = Breeze.parse(`
@virtual each itm in vitems [height=40, overscan=3]
  div.row "{itm.name}"
`);
      const vnode = ast[0];
      const container = Breeze.render(vnode);

      assert.ok(container, 'Container element should be created');
      assert.ok(container.className.includes('bz-virtual-each'));

      const phantom = container.children[0];
      const content = container.children[1];

      assert.ok(phantom, 'Phantom spacer element exists');
      assert.ok(content, 'Content slice container exists');
      assert.equal(phantom.style.height, '400000px');
      assert.ok(content.children.length <= 16, `Rendered ${content.children.length} rows, expected <= 16`);
      assert.ok(content.children.length > 0, 'Rendered at least 1 row');

      container.scrollTop = 20000;
      container._bzVirtual.renderSlice();

      assert.equal(content.style.transform, 'translateY(19880px)');
      assert.ok(content.children.length <= 18, `Node count remained clamped: ${content.children.length}`);
    });

    it('updates dynamically when state changes (fine-grained reactivity)', () => {
      Breeze.state({ dynamicList: [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }] });

      const ast = Breeze.parse(`
@virtual each itm in dynamicList [height=50, overscan=2]
  div.row "{itm.name}"
`);
      const container = Breeze.render(ast[0]);
      const phantom = container.children[0];
      assert.equal(phantom.style.height, '100px');

      const newItems = Array.from({ length: 100 }, (_, i) => ({ id: i, name: `Row ${i}` }));
      Breeze.state({ dynamicList: newItems });

      assert.equal(phantom.style.height, '5000px');
    });
  });

  describe('4. Server-Side Rendering (SSR Parity)', () => {
    it('renders phantom spacer and initial slice in Breeze.renderToString', () => {
      const items = Array.from({ length: 50 }, (_, i) => ({ id: i, label: `Row ${i}` }));
      const template = `
@virtual each r in rows [height=30, overscan=2]
  span "{r.label}"
`;
      const html = Breeze.renderToString(template, { rows: items });
      assert.ok(html.includes('class="bz-each bz-virtual-each"'), 'Includes virtual container class');
      assert.ok(html.includes('bz-virtual-phantom'), 'Includes phantom spacer');
      assert.equal(html.includes('height:1500px'), true, 'Phantom height matches 50 items * 30px = 1500px');
      assert.ok(html.includes('bz-virtual-content'), 'Includes content slice');
      assert.ok(html.includes('Row 0'), 'Renders initial visible items');
    });
  });
});