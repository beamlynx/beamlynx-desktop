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
  resetPreferenceBackendForTests,
} = require('../store/preferences.ts');

function withStorage(items, fn, { throwing = false, desktop } = {}) {
  const originalWindow = global.window;
  const originalStorage = global.localStorage;
  const store = new Map(Object.entries(items));
  global.window = { beamlynxDesktop: desktop, addEventListener: () => {} };
  resetPreferenceBackendForTests();
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
  const restore = () => {
    resetPreferenceBackendForTests();
    global.window = originalWindow;
    global.localStorage = originalStorage;
  };
  let result;
  try {
    result = fn(store);
  } catch (error) {
    restore();
    throw error;
  }
  // An async test keeps the fakes until it finishes.
  if (result && typeof result.then === 'function') return result.finally(restore);
  restore();
  return result;
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

// A stand-in for beamlynx-desktop's appDb: the file is `file`, and every
// call to it is recorded in `calls`.
function fakeDesktop({ file = {}, imported = false, ok = true } = {}) {
  const calls = [];
  return {
    calls,
    file,
    api: {
      appDb: {
        loadStartupState: () => {
          calls.push(['load']);
          if (!ok) return { ok: false, reason: 'database is locked' };
          return { ok: true, preferences: { ...file }, status: { wasReset: false, importedFromLocalStorage: imported } };
        },
        setPreferences: async changes => {
          calls.push(['set', changes]);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null) delete file[k];
            else file[k] = v;
          }
        },
        markImportedFromLocalStorage: async () => {
          calls.push(['mark']);
        },
      },
    },
  };
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('on desktop, preferences are read from the app data file, loaded once', () => {
  const d = fakeDesktop({ file: { [STORAGE_KEYS.THEME]: '"sepia"' }, imported: true });
  withStorage({ [STORAGE_KEYS.THEME]: '"light"' }, () => {
    assert.equal(getUserPreference(STORAGE_KEYS.THEME, 'dark'), 'sepia');
    assert.equal(getUserPreference(STORAGE_KEYS.VIM_MODE, false), false);
    assert.deepEqual(d.calls, [['load']]);
  }, { desktop: d.api });
});

test('on desktop, writes are batched into one call, and localStorage still gets them', async () => {
  const d = fakeDesktop({ imported: true });
  await withStorage({}, async store => {
    setUserPreference(STORAGE_KEYS.SETTINGS_PANEL_WIDTH, 300);
    setUserPreference(STORAGE_KEYS.SETTINGS_PANEL_WIDTH, 320);
    setUserPreference(STORAGE_KEYS.VIM_MODE, true);
    // The cache answers at once, before anything reaches the file.
    assert.equal(getUserPreference(STORAGE_KEYS.SETTINGS_PANEL_WIDTH, 0), 320);
    assert.equal(store.get(STORAGE_KEYS.SETTINGS_PANEL_WIDTH), '320');
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.deepEqual(d.calls.slice(1), [
      ['set', { [STORAGE_KEYS.SETTINGS_PANEL_WIDTH]: '320', [STORAGE_KEYS.VIM_MODE]: 'true' }],
    ]);
  }, { desktop: d.api });
});

test('the first desktop launch imports localStorage, keeps what the file has, then marks it done', async () => {
  const d = fakeDesktop({ file: { [STORAGE_KEYS.THEME]: '"sepia"' } });
  await withStorage(
    { [STORAGE_KEYS.THEME]: '"light"', [STORAGE_KEYS.TEXT_SIZE]: '"large"', unrelated: '1' },
    async () => {
      assert.equal(getUserPreference(STORAGE_KEYS.TEXT_SIZE, 'medium'), 'large');
      assert.equal(getUserPreference(STORAGE_KEYS.THEME, 'dark'), 'sepia');
      await settle();
      assert.deepEqual(d.calls, [['load'], ['set', { [STORAGE_KEYS.TEXT_SIZE]: '"large"' }], ['mark']]);
    },
    { desktop: d.api },
  );
});

test('when the app data file will not open, localStorage is used', () => {
  const d = fakeDesktop({ ok: false });
  withStorage({ [STORAGE_KEYS.THEME]: '"light"' }, store => {
    assert.equal(getUserPreference(STORAGE_KEYS.THEME, 'dark'), 'light');
    setUserPreference(STORAGE_KEYS.THEME, 'sepia');
    assert.equal(store.get(STORAGE_KEYS.THEME), '"sepia"');
    assert.deepEqual(d.calls, [['load']]);
  }, { desktop: d.api });
});

test('on desktop, resetting removes from the file before it resolves, and keeps the open tabs', async () => {
  const d = fakeDesktop({
    file: { [STORAGE_KEYS.THEME]: '"neon"', [STORAGE_KEYS.SESSIONS]: '{"sessions":[]}' },
    imported: true,
  });
  await withStorage({}, async () => {
    await resetPreferences();
    assert.deepEqual(d.file, { [STORAGE_KEYS.SESSIONS]: '{"sessions":[]}' });
  }, { desktop: d.api });
});
