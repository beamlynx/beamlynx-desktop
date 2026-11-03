// unnest: on the canvas. An `unnest:` step works on the table the pipe is
// on, so a step after it, even one on the elements, belongs to the table.
// Its chips list the table's own items apart from the elements' (`e.field`),
// and every edit has to keep the two apart.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { segmentsFromAst } = require('../store/canvas/pine-text.ts');
const actions = require('../store/canvas/pine-actions.ts');

// pine-lang's /build for this expression.
const expression =
  "activity as a | unnest: a.data as e | where: e.field = 'giin' | where: a.type = 'x' | s: a.id, e.field | o: e.field desc, a.id desc";
const ast = {
  'selected-tables': [{ schema: null, table: 'activity', alias: 'a' }],
  current: 'a',
  context: null,
  ranges: [
    { alias: 'a', start: { line: 0, character: 0 }, end: { line: 0, character: 13 } },
    { alias: 'a', start: { line: 0, character: 16 }, end: { line: 0, character: 35 } },
    { alias: 'a', start: { line: 0, character: 38 }, end: { line: 0, character: 61 } },
    { alias: 'a', start: { line: 0, character: 64 }, end: { line: 0, character: 83 } },
    { alias: 'a', start: { line: 0, character: 86 }, end: { line: 0, character: 102 } },
    { alias: 'a', start: { line: 0, character: 105 }, end: { line: 0, character: 131 } },
  ],
  unnests: [
    { alias: 'e', table: 'a', index: 1, source: 'a', column: 'data', path: [], text: 'data' },
  ],
  checkpoints: [],
  operation: {
    type: 'order',
    value: [
      { column: 'field', alias: 'e', direction: 'DESC' },
      { column: 'id', alias: 'a', direction: 'DESC' },
    ],
  },
  where: [
    {
      alias: 'e',
      column: 'value',
      cast: null,
      operator: '=',
      value: { type: 'jsonb', value: '"giin"', 'json-type': 'string' },
      path: ['field'],
    },
    {
      alias: 'a',
      column: 'type',
      cast: null,
      operator: '=',
      value: { type: 'string', value: 'x' },
    },
  ],
  order: [
    {
      column: 'value',
      alias: 'e',
      direction: 'DESC',
      path: ['field'],
      'column-alias': 'field',
      'operation-index': 5,
    },
    { column: 'id', alias: 'a', direction: 'DESC', 'operation-index': 5 },
  ],
  group: [],
  joins: [],
};
const base = () => ({
  expression,
  ast,
  segments: segmentsFromAst(expression, ast),
  aliasMap: new Map(),
});

test('an unnest: step is its own kind, and the steps after it stay with the table', () => {
  const segments = base().segments;
  assert.deepEqual(
    segments.map(s => [s.kind, s.owner]),
    [
      ['table', 'a'],
      ['unnest', 'a'],
      ['where', 'a'],
      ['where', 'a'],
      ['select', 'a'],
      ['order', 'a'],
    ],
  );
});

test('the table own columns leave out the elements, and editing them keeps e.field', () => {
  assert.deepEqual(actions.getSelectColumns(base(), 'a'), ['id']);
  assert.match(
    actions.setSelectColumns(base(), 'a', ['id', 'type']),
    /select: a\.id, a\.type, e\.field/,
  );
  assert.deepEqual(actions.getOrderColumns(base(), 'a'), ['id']);
  assert.match(actions.removeOrderColumnAt(base(), 'a', 0), /\| order: e\.field desc$/);
  assert.match(
    actions.setOrderDirectionAt(base(), 'a', 0, 'asc'),
    /order: e\.field desc, a\.id asc$/,
  );
});

test('the where chips of the table and of the elements are counted apart', () => {
  const ownRemoved = actions.removeWhereConditionAt(base(), 'a', 0);
  assert.ok(ownRemoved.includes("where: e.field = 'giin'") && !ownRemoved.includes("a.type = 'x'"));
  const elementRemoved = actions.removeElementWhereAt(base(), 'a', 0);
  assert.ok(!elementRemoved.includes('e.field =') && elementRemoved.includes("a.type = 'x'"));
});

test('the x on an element chip removes that item only', () => {
  assert.match(actions.removeElementPart(base(), 'a', 'select', 'e.field'), /\| select: a\.id \|/);
  assert.match(
    actions.removeElementPart(base(), 'a', 'order', 'e.field DESC'),
    /\| order: a\.id desc$/,
  );
});

test('an unnest is added after the table own steps, and removed by its name', () => {
  assert.match(
    actions.addUnnest(base(), 'a', 'data.changes', 'change'),
    /\| unnest: a\.data\.changes as change$/,
  );
  assert.equal(
    actions.removeUnnest(base(), 'e'),
    "activity as a | where: e.field = 'giin' | where: a.type = 'x' | s: a.id, e.field | o: e.field desc, a.id desc",
  );
});

test('an unnest can be a path inside a column, or start at elements unnested on the node', () => {
  assert.match(
    actions.addUnnest(base(), 'a', 'options.officers', 'officer'),
    /\| unnest: a\.options\.officers as officer$/,
  );
  assert.match(actions.addUnnest(base(), 'a', 'e.items', 'item', true), /\| unnest: e\.items as item$/);
  assert.deepEqual(actions.typedPath('options.officers', ['data', 'options', 'e']), {
    start: 'options',
    text: 'options.officers',
  });
  assert.equal(actions.typedPath('other.officers', ['data', 'options']), null, 'Not a JSON column');
});

test('the elements are named after the array in the singular', () => {
  const none = new Set();
  assert.equal(actions.unnestName('changes', none), 'change');
  assert.equal(actions.unnestName('data.companies', none), 'company');
  assert.equal(actions.unnestName('addresses', none), 'address');
  assert.equal(actions.unnestName('boxes', none), 'box');
  assert.equal(actions.unnestName('status', none), 'status_1');
  assert.equal(actions.unnestName('data', none), 'data_1');
  assert.equal(actions.unnestName('changes', new Set(['change'])), 'change_1');
  assert.equal(actions.unnestName("options.'home addresses'", none), 'home_address');
});

test('a typed key of the elements becomes Pine, each step quoted when it needs to be', () => {
  assert.deepEqual(actions.typedPath('e.address.city', ['e']), {
    start: 'e',
    text: 'e.address.city',
  });
  assert.deepEqual(actions.typedPath("e.home address.it's", ['e']), {
    start: 'e',
    text: "e.'home address'.'it''s'",
  });
  assert.deepEqual(actions.typedPath('e', ['e']), { start: 'e', text: 'e' });
  assert.equal(actions.typedPath('a.id', ['e']), null, 'Not an element');
  assert.equal(actions.typedPath('e.', ['e']), null, 'No key yet');
});

test('a typed path inside a JSON column is written so it can only be read as keys', () => {
  const columns = ['id', 'data'];
  assert.deepEqual(actions.typedPath('data.address.city', columns), { start: 'data', text: 'data.address.city' });
  assert.deepEqual(actions.typedPath('data.tags[0]', columns), { start: 'data', text: 'data.tags[0]' });
  assert.deepEqual(actions.typedPath('data[1].name', columns), { start: 'data', text: 'data[1].name' });
  assert.deepEqual(actions.typedPath("data.x' or 1=1 --", columns), {
    start: 'data',
    text: "data.'x'' or 1=1 --'",
  });
  assert.deepEqual(actions.typedPath('data.a | delete!', columns), { start: 'data', text: "data.'a | delete!'" });
  assert.equal(actions.typedPath('data..x', columns), null, 'An empty step');
  assert.equal(actions.typedPath('other.x', columns), null, 'Not a column of the table');
});

test('a condition on a typed path, or on an index of an element, is written after its alias', () => {
  assert.equal(
    actions.whereSegmentText([{ alias: 'a', column: "data.'home address'.city", operator: '=', value: 'Oslo' }]),
    "where: a.data.'home address'.city = 'Oslo'",
  );
  assert.equal(
    actions.whereSegmentText([{ alias: 'e', column: '[0]', operator: '=', value: 'x' }]),
    "where: e[0] = 'x'",
  );
});

test('a typed path is added to the select step like a column', () => {
  assert.match(actions.setSelectColumns(base(), 'a', ['id', "data.'home address'"]), /select: a\.id, a\.data\.'home address', e\.field/);
});

test('an element item is added to, or removed from, the step the table owns', () => {
  assert.match(
    actions.toggleElementPart(base(), 'a', 'select', 'e.after'),
    /s: a\.id, e\.field, e\.after|select: a\.id, e\.field, e\.after/,
  );
  assert.match(actions.toggleElementPart(base(), 'a', 'select', 'e.field'), /\| select: a\.id \|/);
  assert.match(
    actions.toggleElementPart(base(), 'a', 'order', 'e.after'),
    /order: e\.field desc, a\.id desc, e\.after desc$/,
  );
  assert.match(actions.toggleElementPart(base(), 'a', 'group', 'e.field'), /\| group: e\.field$/);
});

test('an unnest with :left shows it on its chip, and its name and x still work', () => {
  assert.equal(actions.unnestChipName('data.changes as change :left'), 'change');
  assert.equal(actions.unnestChipName('data as e'), 'e');
  const expression = 'activity as a | unnest: a.data as e :left | where: a.type = 1';
  const leftAst = { ...ast, unnests: [{ ...ast.unnests[0], left: true }] };
  const b = {
    expression,
    ast: leftAst,
    segments: segmentsFromAst(expression, {
      ...leftAst,
      ranges: [
        { alias: 'a', start: { line: 0, character: 0 }, end: { line: 0, character: 13 } },
        { alias: 'a', start: { line: 0, character: 16 }, end: { line: 0, character: 41 } },
        { alias: 'a', start: { line: 0, character: 44 }, end: { line: 0, character: 61 } },
      ],
    }),
    aliasMap: new Map(),
  };
  assert.equal(actions.removeUnnest(b, 'e'), 'activity as a | where: a.type = 1');
});

test('a select column picked again goes before the elements, and a picked element is added only once', () => {
  assert.match(actions.addSelectColumn(base(), 'a', 'id'), /select: a\.id, a\.id, e\.field/);
  assert.equal(actions.toggleElementPart(base(), 'a', 'select', 'e.field', true), expression);
});

test('an element select item is named with as, and its name dropped', () => {
  assert.match(actions.setElementSelectName(base(), 'a', 'e.field', 0, 'company_id'), /\| s(elect)?: a\.id, e\.field as company_id \|/);
  // A name made safe, as for a column's item.
  assert.match(actions.setElementSelectName(base(), 'a', 'e.field', 0, 'company id'), /e\.field as company_id \|/);
  assert.match(actions.setElementSelectName(base(), 'a', 'e.field', 0, ''), /\| s(elect)?: a\.id, e\.field \|/);
  // A table's own column isn't an element item: nothing changes.
  assert.equal(actions.setElementSelectName(base(), 'a', 'a.id', 0, 'x').includes(' as x'), false);
});

// A column picked before the `unnest:` was added leaves a select: step in
// front of it. Element items can't go there: Pine can't read the elements
// before the `unnest:`.
const range = (start, end) => ({ alias: 'c_0', start: { line: 0, character: start }, end: { line: 0, character: end } });
const companies = { alias: 'company', table: 'c_0', index: 2, source: 'c_0', column: 'data', path: ['companies'], left: false, text: 'data.companies' };
const baseOf = (text, ranges) => {
  const shaped = { ...ast, 'selected-tables': [{ schema: null, table: 'customer', alias: 'c_0' }], current: 'c_0', ranges, unnests: [companies], where: [], order: [] };
  return { expression: text, ast: shaped, segments: segmentsFromAst(text, shaped), aliasMap: new Map() };
};
const before = 'customer | select: c_0.id | unnest: c_0.data.companies as company';
const both = `${before} | select: company.id`;
const beforeBase = () => baseOf(before, [range(0, 8), range(11, 25), range(28, 65)]);
const bothBase = () => baseOf(both, [range(0, 8), range(11, 25), range(28, 65), range(68, 86)]);

test('an element item picked after a select: before the unnest: gets its own step after it', () => {
  assert.equal(actions.toggleElementPart(beforeBase(), 'c_0', 'select', 'company.id', true), both);
  // Picked again, it is already there.
  assert.equal(actions.toggleElementPart(bothBase(), 'c_0', 'select', 'company.id', true), both);
});

test('an element item in the step after the unnest: is named and removed there', () => {
  assert.equal(actions.setElementSelectName(bothBase(), 'c_0', 'company.id', 0, 'company_id'), `${both} as company_id`);
  assert.equal(actions.removeElementPart(bothBase(), 'c_0', 'select', 'company.id'), before);
});
