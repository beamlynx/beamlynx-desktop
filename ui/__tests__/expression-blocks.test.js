// Regression tests for how the editor's text is split into expression blocks
// (store/session.ts's splitExpressions) and for keeping a tab's doc comment
// attached through a canvas gesture (store/canvas/pine-text.ts).
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitExpressions } = require('../store/session.ts');
const { leadingDoc, withDoc } = require('../store/canvas/pine-text.ts');

const texts = blocks => blocks.map(b => b.text);

test('splitExpressions: blank line separates blocks', () => {
  const blocks = splitExpressions('company | count:\n\nemployee | count:');
  assert.deepEqual(texts(blocks), ['company | count:', 'employee | count:']);
  assert.deepEqual(blocks.map(b => b.startLine), [0, 2]);
});

test('splitExpressions: a blank line inside a block comment is not a boundary', () => {
  const text = [
    '/*',
    ' Tenants that signed up last month.',
    '',
    ' Excludes the internal test tenant.',
    '*/',
    'tenant | count:',
  ].join('\n');
  const blocks = splitExpressions(text);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, text);
  assert.equal(blocks[0].startLine, 0);
});

test('splitExpressions: a real boundary after a doc comment still splits', () => {
  const text = ['/* doc', '', 'more doc */', 'tenant |= x', '', 'x | count:'].join('\n');
  const blocks = splitExpressions(text);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].text, 'x | count:');
  assert.equal(blocks[1].startLine, 5);
});

test('splitExpressions: an unterminated block comment swallows the rest', () => {
  // Not a correctness claim so much as the safe failure: the text is one
  // broken expression, which the server reports as one parse error, rather
  // than two separately-broken ones.
  const blocks = splitExpressions('/* never closed\n\ntenant');
  assert.equal(blocks.length, 1);
});

test('leadingDoc: block comment at the top', () => {
  assert.equal(leadingDoc('/* Active tenants */ tenant'), '/* Active tenants */');
  assert.equal(leadingDoc('  /* a\n b */\ntenant'), '/* a\n b */');
});

test('leadingDoc: run of line comments at the top', () => {
  assert.equal(leadingDoc('-- one\n-- two\ntenant'), '-- one\n-- two');
  assert.equal(leadingDoc('-- only\n'), '-- only');
});

test('leadingDoc: a comment that is not at the top is not a doc', () => {
  assert.equal(leadingDoc('tenant -- trailing'), '');
  assert.equal(leadingDoc('tenant | /* mid */ count:'), '');
  assert.equal(leadingDoc('tenant'), '');
  assert.equal(leadingDoc(''), '');
});

test('withDoc: re-attaches the previous doc to a doc-less rebuild', () => {
  const prev = '/* Active tenants */\ntenant\n | count:';
  assert.equal(withDoc(prev, 'tenant | limit: 5'), '/* Active tenants */\ntenant | limit: 5');
});

test('withDoc: leaves a rebuild that already has its own doc alone', () => {
  const prev = '/* old */\ntenant';
  assert.equal(withDoc(prev, '/* new */ tenant | count:'), '/* new */ tenant | count:');
});

test('withDoc: no doc anywhere is a passthrough', () => {
  assert.equal(withDoc('tenant', 'tenant | count:'), 'tenant | count:');
});

test('withDoc: a line-comment doc survives too', () => {
  assert.equal(withDoc('-- why\ntenant', 'tenant | count:'), '-- why\ntenant | count:');
});

const { replaceDoc } = require('../store/canvas/pine-text.ts');

test('replaceDoc: adds a note to an expression that has none', () => {
  assert.equal(replaceDoc('company | count:', 'Active companies'), '/* Active companies */\ncompany | count:');
});

test('replaceDoc: replaces an existing note', () => {
  assert.equal(replaceDoc('/* old */\ncompany', 'new'), '/* new */\ncompany');
  assert.equal(replaceDoc('-- old\ncompany', 'new'), '/* new */\ncompany');
});

test('replaceDoc: empty text removes the note', () => {
  assert.equal(replaceDoc('/* old */\ncompany | count:', ''), 'company | count:');
  assert.equal(replaceDoc('/* old */\ncompany', '   '), 'company');
});

test('replaceDoc: a multi-line note becomes a block comment', () => {
  assert.equal(replaceDoc('company', 'one\ntwo'), '/*\n   one\n   two\n */\ncompany');
});

test('replaceDoc: a comment terminator in the text cannot close the comment early', () => {
  const out = replaceDoc('company', 'rate is 50*/month');
  assert.equal(out, '/* rate is 50* /month */\ncompany');
  // The real property: the comment runs to the end of the note, so the query
  // that follows is still the whole query and none of the note leaked into it.
  assert.equal(leadingDoc(out), '/* rate is 50* /month */');
  assert.equal(out.slice(leadingDoc(out).length).trim(), 'company');
});

test('replaceDoc: round-trips through leadingDoc', () => {
  for (const text of ['one line', 'one\ntwo', 'has . a period. and more']) {
    const expression = replaceDoc('company | count:', text);
    assert.equal(
      expression.slice(leadingDoc(expression).length).trim(),
      'company | count:',
      `body survived for ${JSON.stringify(text)}`,
    );
  }
});

test('replaceDoc: a note with no query yet is still valid Pine', () => {
  assert.equal(replaceDoc('', 'thinking out loud'), '/* thinking out loud */');
});
