// Prettifying a Pine expression in the editor keeps the cursor where it was,
// not at the end of the text.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cursorAfterReformat } = require('../utils/cursor.ts');

test('the cursor stays after the same characters', () => {
  const before = 'company | employee| document';
  const after = 'company\n | employee\n | document';
  // Right after the `|` typed after `employee`.
  assert.equal(cursorAfterReformat(before, after, 'company | employee|'.length), 'company\n | employee\n |'.length);
  assert.equal(cursorAfterReformat(before, after, 'company'.length), 'company'.length);
});

test('at the end it stays at the end, and at the start at the start', () => {
  assert.equal(cursorAfterReformat('a | b', 'a\n | b\n | ', 5), 'a\n | b\n | '.length);
  assert.equal(cursorAfterReformat('a | b', 'a\n | b', 0), 0);
});

test('text that lost characters keeps the cursor inside it', () => {
  assert.equal(cursorAfterReformat('a | b -- note', 'a\n | b', 10), 'a\n | b'.length);
});
