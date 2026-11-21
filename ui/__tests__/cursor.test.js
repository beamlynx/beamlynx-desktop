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

test('a | ends its query when only whitespace follows it before a blank line', () => {
  const { isAtEndOfBlock } = require('../utils/cursor.ts');
  const text = 'company |\n\nuser\n | where: id = 1';
  assert.equal(isAtEndOfBlock(text, 'company |'.length), true, 'a new query above another one');
  assert.equal(isAtEndOfBlock('user |  ', 'user |'.length), true, 'the end of the editor');
  assert.equal(isAtEndOfBlock('user | where: id = 1', 'user |'.length), false, 'before another step');
  assert.equal(isAtEndOfBlock('user |\n | where: id = 1', 'user |'.length), false, 'the next line is the same query');
});

test('an offset comes from a line and a character', () => {
  const { offsetOf } = require('../utils/cursor.ts');
  assert.equal(offsetOf('ab\ncd', 1, 1), 4);
  assert.equal(offsetOf('ab\ncd', 0, 9), 2, 'past the end of a line, its end');
  assert.equal(offsetOf('ab\ncd', 5, 0), 5, 'past the last line, the end');
});

test('a format that dropped a comment is not whitespace only', () => {
  const { sameApartFromWhitespace } = require('../utils/cursor.ts');
  // What pine-lang's prettifier returns for these.
  assert.equal(sameApartFromWhitespace('company | employee |', 'company\n | employee\n | '), true);
  assert.equal(sameApartFromWhitespace('company\n -- note\n | employee |', 'company\n | employee\n | '), false);
});

test('after a | the cursor goes past the space that follows it', () => {
  const { pastSpaceAfterPipe } = require('../utils/cursor.ts');
  const text = 'company\n | \n\nuser';
  assert.equal(pastSpaceAfterPipe(text, 'company\n |'.length), 'company\n | '.length);
  assert.equal(pastSpaceAfterPipe(text, 'company'.length), 'company'.length, 'not after a |');
});
