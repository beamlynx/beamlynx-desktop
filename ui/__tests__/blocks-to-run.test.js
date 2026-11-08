// Which blocks Run runs (store/blocks.ts's blocksToRun): every query block,
// or the ones a selection in the Pine editor touches.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { blocksToRun, splitExpressions } = require('../store/blocks.ts');

const text = [
  'company | where: id = 1 |= c', // line 0
  '',
  '$status = \'active\'', // line 2
  '',
  'c | employee', // line 4
  '  | select: id', // line 5
  '',
  'user | count:', // line 7
].join('\n');
const blocks = splitExpressions(text);

test('blocksToRun: no selection runs every query block, not values blocks', () => {
  assert.deepEqual(blocksToRun(blocks, null), [0, 2, 3]);
});

test('blocksToRun: a selection runs the blocks it touches', () => {
  assert.deepEqual(blocksToRun(blocks, { from: 5, to: 5 }), [2]);
  assert.deepEqual(blocksToRun(blocks, { from: 4, to: 7 }), [2, 3]);
  assert.deepEqual(blocksToRun(blocks, { from: 0, to: 0 }), [0]);
});

test('blocksToRun: a selection on blank lines or a values block runs every query block', () => {
  assert.deepEqual(blocksToRun(blocks, { from: 2, to: 3 }), [0, 2, 3]);
  assert.deepEqual(blocksToRun(blocks, { from: 6, to: 6 }), [0, 2, 3]);
});

test('describesTable: the last block ends in describe:', () => {
  const { describesTable } = require('../store/blocks.ts');
  assert.equal(describesTable('user | describe:'), true);
  assert.equal(describesTable('user | document | describe: -- its columns'), true);
  assert.equal(describesTable('user | describe:\n\nuser | count:'), false);
  assert.equal(describesTable('describe'), false);
});
