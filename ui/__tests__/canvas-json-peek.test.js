// A peek at a JSON column while a key inside it is typed, in a canvas picker
// or in the Pine panel: the first value, fetched by a query of its own
// (store/canvas/json-peek.ts).
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { panelPeekTarget, peekExpression, peekOutcome, peekValue } = require('../store/canvas/json-peek.ts');

test('the peek reads the first row with a value, from the select probe', () => {
  assert.equal(
    peekExpression('company as c | w: c.active = true | s:', 'c', 'data'),
    'company as c | w: c.active = true | w: c.data is not null | s: c.data | l: 1',
  );
  // A node that isn't the current table is focused with from: first.
  assert.equal(
    peekExpression('company as c | document as d | from: c | s:', 'c', 'options'),
    'company as c | document as d | from: c | w: c.options is not null | s: c.options | l: 1',
  );
  assert.equal(peekExpression('company as c | select: ', 'c', 'data'), 'company as c | w: c.data is not null | s: c.data | l: 1');
});

test('the value is found by its header, past the columns Pine adds', () => {
  const result = [
    ['__c__id', 'data'],
    [1, '{"plan":"pro","tags":["a"]}'],
  ];
  assert.deepEqual(peekValue(result, 'data'), { found: true, value: { plan: 'pro', tags: ['a'] } });
  // Another header than expected: the first one Pine didn't add.
  assert.deepEqual(peekValue([['__c__id', 'c_data'], [1, '[1,2]']], 'data'), { found: true, value: [1, 2] });
  // Text that isn't a JSON object or array is shown as it is.
  assert.deepEqual(peekValue([['data'], ['plain']], 'data'), { found: true, value: 'plain' });
});

test('no row, or a null, is no value', () => {
  assert.deepEqual(peekValue([['data']], 'data'), { found: false });
  assert.deepEqual(peekValue([['data'], [null]], 'data'), { found: false });
  assert.deepEqual(peekValue(undefined, 'data'), { found: false });
});

test('an error or a missing value says so', () => {
  assert.deepEqual(peekOutcome({ error: 'boom' }, 'data'), { status: 'error', error: 'boom' });
  assert.deepEqual(peekOutcome({ result: [['data']] }, 'data'), { status: 'empty', value: undefined });
  assert.deepEqual(peekOutcome({ result: [['data'], ['{"a":1}']] }, 'data'), { status: 'found', value: { a: 1 } });
});

// The Pine panel: the text up to the cursor names the column.
const at = (text, marker = '^') => panelPeekTarget(text.replace(marker, ''), text.indexOf(marker));

test('the Pine panel peeks at a column, or an alias and its column', () => {
  assert.deepEqual(at('public.documents_package as dp | s: content.^'), {
    context: [],
    prefix: 'public.documents_package as dp',
    candidates: [{ column: 'content' }],
  });
  assert.deepEqual(at('dp | t | w: id = 1 | where: dp.content.address.ci^ | l: 5'), {
    context: [],
    prefix: 'dp | t | w: id = 1',
    candidates: [{ alias: 'dp', column: 'content' }, { column: 'dp' }],
  });
  assert.deepEqual(at('c | s: id, data[1].tags.^').candidates, [{ column: 'data' }]);
  assert.deepEqual(at('c | o: data.^').prefix, 'c');
  assert.deepEqual(at('c | unnest: data.^').prefix, 'c');
});

test('the Pine panel peeks only after a dotted name in a select, where, order, group or unnest', () => {
  assert.equal(at('c | s: data^'), null);
  assert.equal(at('c | s: data. ^'), null);
  assert.equal(at('public.^'), null);
  assert.equal(at('c | public.^'), null);
  assert.equal(at('c | l: 1.^'), null);
  assert.equal(at("c | w: data.a = 'x.^'"), null);
});

test('the Pine panel sends the earlier blocks and values blocks along', () => {
  const target = at('$x = 1\n\ncompany | g: id |= ids\n\nids | s: data.^\n\nother | s: a\n\n$y = 2');
  assert.deepEqual(target.context, ['$x = 1', 'company | g: id |= ids', '$y = 2']);
  assert.equal(target.prefix, 'ids');
});
