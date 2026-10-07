// Stored preferences reach the app's first render. A value it can't use (an
// old theme id, a hand edit, a blocked localStorage) used to throw there and
// leave a blank page. Now every one falls back to its default.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getUserPreference,
  setUserPreference,
  resetPreferences,
  oneOf,
  isBoolean,
  isFiniteNumber,
  isStringArray,
  isStringRecord,
  STORAGE_KEYS,
} = require('../store/preferences.ts');

function withStorage(items, fn, { throwing = false } = {}) {
  const originalWindow = global.window;
  const originalStorage = global.localStorage;
  const store = new Map(Object.entries(items));
  global.window = {};
  global.localStorage = {
    getItem: k => {
      if (throwing) throw new Error('SecurityError');
      return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => {
      if (throwing) throw new Error('QuotaExceededError');
      store.set(k, v);
    },
    removeItem: k => store.delete(k),
  };
  try {
    return fn(store);
  } finally {
    global.window = originalWindow;
    global.localStorage = originalStorage;
  }
}

test('a valid stored value is returned', () =>
  withStorage({ t: '"sepia"' }, () => {
    assert.equal(getUserPreference('t', 'dark', oneOf(['dark', 'light', 'sepia'])), 'sepia');
  }));

test('an unknown enum value, a wrong type, or invalid JSON gives the default', () =>
  withStorage({ theme: '"neon"', flag: '"yes"', width: '"wide"', broken: '{nope', list: '[1, 2]' }, () => {
    assert.equal(getUserPreference('theme', 'dark', oneOf(['dark', 'light'])), 'dark');
    assert.equal(getUserPreference('flag', false, isBoolean), false);
    assert.equal(getUserPreference('width', 300, isFiniteNumber), 300);
    assert.equal(getUserPreference('broken', 'x'), 'x');
    assert.deepEqual(getUserPreference('list', [], isStringArray), []);
  }));

test('a stored null gives the default', () =>
  withStorage({ colors: 'null' }, () => {
    assert.deepEqual(getUserPreference('colors', {}, isStringRecord), {});
  }));

test('storage that throws gives the default on read and is ignored on write', () =>
  withStorage(
    {},
    () => {
      assert.equal(getUserPreference('t', 'dark'), 'dark');
      assert.doesNotThrow(() => setUserPreference('t', 'light'));
    },
    { throwing: true },
  ));

test('resetting preferences keeps the open tabs', () =>
  withStorage({ [STORAGE_KEYS.THEME]: '"neon"', [STORAGE_KEYS.SESSIONS]: '{"sessions":[]}' }, store => {
    resetPreferences();
    assert.equal(store.has(STORAGE_KEYS.THEME), false);
    assert.equal(store.has(STORAGE_KEYS.SESSIONS), true);
  }));

test('isFiniteNumber rejects NaN and Infinity', () => {
  assert.equal(isFiniteNumber(NaN), false);
  assert.equal(isFiniteNumber(Infinity), false);
  assert.equal(isFiniteNumber(12), true);
});
