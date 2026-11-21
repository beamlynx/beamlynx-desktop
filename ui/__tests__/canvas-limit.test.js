// Setting and clearing a limit: from the canvas (UI #65), and what removing
// a checkpoint's last limit:/group: does to the name the canvas pinned on it
// (pine-lang's auto name, result_1, ...).
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

test('changing a limit keeps its per columns', () => {
  const segments = [seg('company as c', 'table', 'c'), seg('limit: 1 per c.id', 'limit'), seg('= result_1', 'assign')];
  assert.equal(setLimit(base(segments), 3), 'company as c | limit: 3 per c.id | = result_1');
  assert.equal(setLimit(base([segments[0], seg('l: 1 per c.id, c.name', 'limit')]), 2), 'company as c | limit: 2 per c.id, c.name');
  assert.equal(currentLimit([segments[0], segments[1]]), 1);
});

test('a limit is added, replaced in place, and read back', () => {
  const table = seg('company as c', 'table', 'c');
  assert.equal(setLimit(base([table]), 5), 'company as c | limit: 5');
  assert.equal(
    setLimit(base([table, seg('limit: 5', 'limit'), seg('= result_1', 'assign')]), 9),
    'company as c | limit: 9 | = result_1',
  );
  assert.equal(currentLimit([table, seg('limit: 5', 'limit')]), 5);
  assert.equal(currentLimit([table]), null);
});

test('clearing the only limit drops the name the canvas pinned on it', () => {
  const segments = [
    seg('company as c', 'table', 'c'),
    seg('limit: 5', 'limit'),
    seg('= result_1', 'assign'),
  ];
  assert.equal(setLimit(base(segments), null), 'company as c');
});

test('removing the last group column does the same', () => {
  const segments = [
    seg('company as c', 'table', 'c'),
    seg('group: c.country', 'group'),
    seg('= result_2', 'assign'),
  ];
  assert.equal(setGroupColumns(base(segments), 'c', []), 'company as c');
});

test('the name stays while the checkpoint still has a group: or limit:', () => {
  const segments = [
    seg('company as c', 'table', 'c'),
    seg('group: c.country', 'group'),
    seg('limit: 5', 'limit'),
    seg('= result_1', 'assign'),
  ];
  assert.equal(setLimit(base(segments), null), 'company as c | group: c.country | = result_1');
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
    seg('= result_1', 'assign'),
    seg('employee as e', 'table', 'e'),
  ];
  assert.equal(setLimit(base(used), null), 'company as c | = result_1 | employee as e');
});

test('the limit editor sets, changes and clears per', () => {
  const { limitPer } = require('../store/canvas/pine-actions.ts');
  const table = seg('company as c', 'table', 'c');
  assert.equal(setLimit(base([table]), 1, undefined, undefined, ['c.id']), 'company as c | limit: 1 per c.id');
  const segments = [table, seg('limit: 1 per c.id', 'limit', 'result_1'), seg('= result_1', 'assign', 'result_1')];
  assert.equal(
    setLimit(base(segments), 2, undefined, 'result_1', ['c.id', 'c.name']),
    'company as c | limit: 2 per c.id, c.name | = result_1',
  );
  assert.equal(setLimit(base(segments), 2, undefined, 'result_1', []), 'company as c | limit: 2 | = result_1');
  assert.deepEqual(limitPer('limit: 1 per c.id, data.region'), ['c.id', 'data.region']);
  assert.deepEqual(limitPer('l: 3'), []);
});
