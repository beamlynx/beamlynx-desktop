// Setting and clearing the pipeline's limit: from the canvas (UI #65), and
// what removing a checkpoint's last limit:/group: does to the name the
// canvas pinned on it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setLimit, setGroupColumns } = require('../store/canvas/pine-actions.ts');
const { currentLimit } = require('../store/canvas/pine-text.ts');

const seg = (text, kind, owner = null) => ({ text, start: -1, end: -1, kind, owner });
const base = segments => ({
  expression: '',
  ast: null,
  segments,
  aliasMap: new Map(),
  checkpointName: null,
});

test('a limit is added, replaced in place, and read back', () => {
  const table = seg('company as c', 'table', 'c');
  assert.equal(setLimit(base([table]), 5), 'company as c | limit: 5');
  assert.equal(
    setLimit(base([table, seg('limit: 5', 'limit'), seg('= agg', 'assign')]), 9),
    'company as c | limit: 9 | = agg',
  );
  assert.equal(currentLimit([table, seg('limit: 5', 'limit')]), 5);
  assert.equal(currentLimit([table]), null);
});

test('clearing the only limit drops the name the canvas pinned on it', () => {
  const segments = [
    seg('company as c', 'table', 'c'),
    seg('limit: 5', 'limit'),
    seg('= agg', 'assign'),
  ];
  assert.equal(setLimit(base(segments), null), 'company as c');
});

test('removing the last group column does the same', () => {
  const segments = [
    seg('company as c', 'table', 'c'),
    seg('group: c.country', 'group'),
    seg('= agg2', 'assign'),
  ];
  assert.equal(setGroupColumns(base(segments), 'c', []), 'company as c');
});

test('the name stays while the checkpoint still has a group: or limit:', () => {
  const segments = [
    seg('company as c', 'table', 'c'),
    seg('group: c.country', 'group'),
    seg('limit: 5', 'limit'),
    seg('= agg', 'assign'),
  ];
  assert.equal(setLimit(base(segments), null), 'company as c | group: c.country | = agg');
});

test('a name someone wrote, or one later steps use, stays', () => {
  const own = [
    seg('company as c', 'table', 'c'),
    seg('limit: 5', 'limit'),
    seg('= top5', 'assign'),
  ];
  assert.equal(setLimit(base(own), null), 'company as c | = top5');
  const used = [
    seg('company as c', 'table', 'c'),
    seg('limit: 5', 'limit'),
    seg('= agg', 'assign'),
    seg('employee as e', 'table', 'e'),
  ];
  assert.equal(setLimit(base(used), null), 'company as c | = agg | employee as e');
});
