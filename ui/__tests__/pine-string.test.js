// A cell edit is written into a Pine expression as a string literal
// (Result.tsx's createUpdateExpression). Pine reads '' inside a string as one
// apostrophe, as SQL does, and has no other escapes. The helper this replaced
// turned every apostrophe into an underscore: O'Brien was saved as O_Brien.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pineString } = require('../store/util.ts');

test('an apostrophe is doubled, not replaced', () => {
  assert.equal(pineString("O'Brien"), "'O''Brien'");
});

test('text without apostrophes is only wrapped', () => {
  assert.equal(pineString('Acme'), "'Acme'");
  assert.equal(pineString(''), "''");
});

test('nothing in the value can end the literal early', () => {
  // Undoing the doubling inside the outer quotes gives back exactly the input,
  // for inputs built to break out of a naive literal.
  for (const value of ["'", "''", "a' | delete! .id | '", "x'); --", 'line\nbreak', '{"k": "it\'s"}']) {
    const literal = pineString(value);
    assert.ok(literal.startsWith("'") && literal.endsWith("'"));
    const inner = literal.slice(1, -1);
    assert.doesNotMatch(inner.replace(/''/g, ''), /'/, value);
    assert.equal(inner.replace(/''/g, "'"), value);
  }
});
