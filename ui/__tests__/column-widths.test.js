// A dragged column width is remembered by table and heading, not by the
// column's position, so it applies again the next time that column shows up.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  columnWidthKey,
  loadColumnWidths,
  saveColumnWidth,
  resetColumnWidthsForTests,
} = require('../store/column-widths.ts');

const ast = (extra = {}) => ({
  'selected-tables': [],
  current: 'u_0',
  operation: { type: 'select', value: [] },
  ...extra,
});

test('a column from a selected table is named after that table', () => {
  const a = ast({ 'selected-tables': [{ schema: 'public', table: 'user', alias: 'u' }] });
  assert.equal(columnWidthKey(a, 'u', 'email'), 'user.email');
});

test('a query ending on a table still names it, from the operation', () => {
  const a = ast({ current: 'u_0', operation: { type: 'table', value: { table: 'user' } } });
  assert.equal(columnWidthKey(a, 'u_0', 'email'), 'user.email');
});

test('a column with no known table is named after its heading alone', () => {
  assert.equal(columnWidthKey(ast(), '', 'count'), 'expr:count');
  assert.equal(columnWidthKey(null, 'u_0', 'email'), 'expr:email');
});

function withDesktop(file, fn) {
  const originalWindow = global.window;
  const calls = [];
  global.window = {
    beamlynxDesktop: {
      appDb: {
        getColumnWidths: async connection => {
          calls.push(['get', connection]);
          return { ...(file[connection] ?? {}) };
        },
        setColumnWidths: async (connection, changes) => {
          calls.push(['set', connection, changes]);
          file[connection] = { ...(file[connection] ?? {}), ...changes };
        },
      },
    },
  };
  resetColumnWidthsForTests();
  return Promise.resolve(fn(calls)).finally(() => {
    resetColumnWidthsForTests();
    global.window = originalWindow;
  });
}

test('widths load once per connection, and a saved width is rounded and kept', () =>
  withDesktop({ db1: { 'user.email': 240 } }, async calls => {
    assert.deepEqual(await loadColumnWidths('db1'), { 'user.email': 240 });
    saveColumnWidth('db1', 'user.name', 180.6);
    assert.deepEqual(await loadColumnWidths('db1'), { 'user.email': 240, 'user.name': 181 });
    assert.deepEqual(calls, [
      ['get', 'db1'],
      ['set', 'db1', { 'user.name': 181 }],
    ]);
  }));

test('the web build remembers nothing', async () => {
  const originalWindow = global.window;
  global.window = {};
  try {
    assert.deepEqual(await loadColumnWidths('db1'), {});
    assert.doesNotThrow(() => saveColumnWidth('db1', 'user.email', 200));
  } finally {
    global.window = originalWindow;
  }
});
