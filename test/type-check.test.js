'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  checkTemplateTypes,
  loadSchema,
  parseTypeScriptSchema,
  parseJsonSchema,
  extractTemplateReferences,
  findBestSuggestion,
  levenshtein,
  checkTypes
} = require('../breeze-cli.js');

test('Type Checker: Levenshtein distance & suggestions', () => {
  assert.equal(levenshtein('user.name', 'user.name'), 0);
  assert.equal(levenshtein('user.namee', 'user.name'), 1);
  assert.equal(levenshtein('conut', 'count'), 2);

  const candidates = ['user.name', 'user.email', 'count', 'items'];
  assert.equal(findBestSuggestion('user.namee', candidates), 'user.name');
  assert.equal(findBestSuggestion('conut', candidates), 'count');
  assert.equal(findBestSuggestion('user.emial', candidates), 'user.email');
  assert.equal(findBestSuggestion('totally_different_thing_xyz', candidates), null);
});

test('Type Checker: TypeScript schema parsing', () => {
  const ts = `
    export interface User {
      id: number;
      name: string;
      email: string;
      profile?: {
        avatar: string;
      };
    }
    export type AppState = {
      count: number;
      user: User;
      items: User[];
    };
  `;
  const schema = parseTypeScriptSchema(ts);
  assert.ok(schema.paths.includes('count'));
  assert.ok(schema.paths.includes('user'));
  assert.ok(schema.paths.includes('user.name'));
  assert.ok(schema.paths.includes('user.email'));
  assert.ok(schema.paths.includes('items'));
  assert.ok(schema.arrayItemProps['items']);
  assert.ok(schema.arrayItemProps['items'].has('name'));
});

test('Type Checker: JSON schema parsing', () => {
  const jsonSchema = JSON.stringify({
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      },
      count: { type: 'number' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' }
          }
        }
      }
    }
  });

  const schema = parseJsonSchema(jsonSchema);
  assert.ok(schema.paths.includes('user'));
  assert.ok(schema.paths.includes('user.name'));
  assert.ok(schema.paths.includes('user.age'));
  assert.ok(schema.paths.includes('count'));
  assert.ok(schema.paths.includes('items'));
  assert.ok(schema.arrayItemProps['items'].has('title'));
});

test('Type Checker: Plain JSON object parsing', () => {
  const plainJson = JSON.stringify({
    user: { name: 'Alice', email: 'alice@example.com' },
    count: 10,
    items: [{ id: 1, title: 'Test' }]
  });

  const schema = parseJsonSchema(plainJson);
  assert.ok(schema.paths.includes('user.name'));
  assert.ok(schema.paths.includes('count'));
  assert.ok(schema.paths.includes('items'));
  assert.ok(schema.arrayItemProps['items'].has('title'));
});

test('Type Checker: Reference extraction from .breeze template', () => {
  const template = `@app "Test App"
@state count = 0
@def Card(title)
  h3 "{title}"
main
  p "Count: {count}"
  @if showDetails
    p "Details visible"
  @each item in items
    p "Item: {item.title}"
  button "Increment" [@click -> increment(count)]
  input [type=text, @model=email]
`;

  const { references, templateState } = extractTemplateReferences(template);
  assert.ok(templateState.has('count'));
  const paths = references.map(r => r.path);
  assert.ok(paths.includes('count'));
  assert.ok(paths.includes('showDetails'));
  assert.ok(paths.includes('items'));
  assert.ok(paths.includes('item.title'));
  assert.ok(paths.includes('email'));
});

test('Type Checker: Exact typo detection and suggestion accuracy', () => {
  const template = `-test
  p "Hello {user.namee}!"
  p "Count: {conut}"
`;
  const schema = {
    paths: ['user', 'user.name', 'user.email', 'count']
  };

  const result = checkTemplateTypes(template, schema);
  assert.equal(result.errors.length, 2);

  const typo1 = result.errors.find(e => e.path === 'user.namee');
  assert.ok(typo1);
  assert.equal(typo1.suggestion, 'user.name');
  assert.ok(typo1.message.includes('Did you mean "user.name"'));

  const typo2 = result.errors.find(e => e.path === 'conut');
  assert.ok(typo2);
  assert.equal(typo2.suggestion, 'count');
  assert.ok(typo2.message.includes('Did you mean "count"'));
});

test('Type Checker: Array item property validation in @each', () => {
  const template = `@each item in users
  p "{item.name}"
  p "{item.emial}"
`;
  const schema = {
    paths: ['users'],
    arrayItemProps: {
      users: new Set(['name', 'email'])
    }
  };

  const result = checkTemplateTypes(template, schema);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].path, 'item.emial');
  assert.equal(result.errors[0].suggestion, 'item.email');
});

test('Type Checker: Existing example apps pass with 0 errors', () => {
  const root = path.resolve(__dirname, '..');
  const result = checkTypes(root);
  assert.equal(result.totalErrors, 0);
  assert.ok(result.files.length >= 3);
});