// beamlynx:// links can come from any web page, so only the one shape the app
// understands, beamlynx://run, is read. Runs against dist/ (see format.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDeepLink } = require('../dist/main/deep-link.js');

test('a run link yields its connection and expression', () => {
  assert.deepEqual(parseDeepLink('beamlynx://run?connection=a&expression=user%20%7C%20s%3A%20id'), {
    connection: 'a',
    expression: 'user | s: id',
  });
});

test('a run link without a connection leaves it undefined', () => {
  assert.deepEqual(parseDeepLink('beamlynx://run?expression=user'), { connection: undefined, expression: 'user' });
});

test('the opaque beamlynx:run form some launchers produce is accepted', () => {
  assert.deepEqual(parseDeepLink('beamlynx:run?expression=user'), { connection: undefined, expression: 'user' });
});

test('any other beamlynx:// target is ignored, whatever parameters it carries', () => {
  assert.equal(parseDeepLink('beamlynx://evil?expression=user%20%7C%20delete!'), null);
  assert.equal(parseDeepLink('beamlynx://evil/run?expression=x'), null);
  assert.equal(parseDeepLink('beamlynx://?expression=x'), null);
});

test('other schemes and garbage are ignored', () => {
  assert.equal(parseDeepLink('https://run?expression=x'), null);
  assert.equal(parseDeepLink('not a url'), null);
});
