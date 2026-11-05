// Work the results pane does again and again: what a JSON cell shows (asked
// for on every draw of the grid), and resizing a panel (every mousemove).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { jsonCellDisplay } = require('../components/json-cell.util.ts');
const { resetPreferenceBackendForTests } = require('../store/preferences.ts');
const { useResizeDrag } = require('../hooks/useResizeDrag.ts');

test("a JSON cell's text is worked out once per row", () => {
  const row = { id: 1, data: '{ "plan": "pro",\n  "tags": ["a"] }', other: '[1, 2]' };
  const first = jsonCellDisplay(row, 'data');
  assert.deepEqual(first, { text: '{"plan":"pro","tags":["a"]}', opens: true });
  // The same answer, not worked out again.
  assert.equal(jsonCellDisplay(row, 'data'), first);
  // Each field of the row has its own.
  assert.deepEqual(jsonCellDisplay(row, 'other'), { text: '[1,2]', opens: true });
  // A new result is new rows.
  const next = { ...row, data: '{"plan":"free"}' };
  assert.deepEqual(jsonCellDisplay(next, 'data'), { text: '{"plan":"free"}', opens: true });
});

test('a JSON column cell that is not JSON shows as text and opens nothing', () => {
  assert.deepEqual(jsonCellDisplay({ data: null }, 'data'), { text: '', opens: false });
  assert.deepEqual(jsonCellDisplay({ data: 'plain' }, 'data'), { text: 'plain', opens: false });
  assert.deepEqual(jsonCellDisplay({ data: 7 }, 'data'), { text: '7', opens: false });
  // Already decoded by the server.
  assert.deepEqual(jsonCellDisplay({ data: { a: 1 } }, 'data'), { text: '{"a":1}', opens: true });
  assert.deepEqual(jsonCellDisplay(undefined, 'data'), { text: '', opens: false });
});

test('a drag sets the size once per frame and saves it once, on release', () => {
  const saved = [];
  const listeners = {};
  const frames = [];
  const original = {
    window: global.window,
    document: global.document,
    localStorage: global.localStorage,
    raf: global.requestAnimationFrame,
    caf: global.cancelAnimationFrame,
  };
  global.window = { addEventListener: () => {} };
  global.localStorage = { getItem: () => null, setItem: (k, v) => saved.push([k, v]), removeItem: () => {} };
  global.document = {
    body: { classList: { add: () => {}, remove: () => {} } },
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: type => delete listeners[type],
  };
  global.requestAnimationFrame = fn => frames.push(fn);
  global.cancelAnimationFrame = () => {};
  resetPreferenceBackendForTests();
  try {
    const set = [];
    const onMouseDown = useResizeDrag({
      value: 300,
      setValue: v => set.push(v),
      min: 100,
      max: 600,
      storageKey: 'width',
      axis: 'x',
    });
    onMouseDown({ preventDefault: () => {}, pageX: 0, pageY: 0 });
    for (const x of [10, 20, 30]) listeners.mousemove({ pageX: x, pageY: 0 });
    assert.deepEqual(set, []);
    assert.equal(frames.length, 1);
    frames.shift()();
    assert.deepEqual(set, [330]);
    assert.deepEqual(saved, []);

    listeners.mousemove({ pageX: 400, pageY: 0 });
    listeners.mouseup();
    // The last move is applied on release, clamped, and saved once.
    assert.deepEqual(set, [330, 600]);
    assert.deepEqual(saved, [['width', '600']]);
    assert.equal(listeners.mousemove, undefined);
  } finally {
    global.window = original.window;
    global.document = original.document;
    global.localStorage = original.localStorage;
    global.requestAnimationFrame = original.raf;
    global.cancelAnimationFrame = original.caf;
    resetPreferenceBackendForTests();
  }
});

test('table colors are worked out again only when the answer changes', () => {
  const { observable, reaction } = require('mobx');
  const { Session } = require('../store/session.ts');
  const original = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ast: null }) });
  try {
    const global_ = observable({ connections: [], accessPolicies: [], pineTableColorsEnabled: true });
    const session = new Session('colors', global_);
    session.rows = [{ id: 1 }];
    session.expression = 'company';
    session.expressionAtLastEval = 'company';
    const seen = [];
    const stop = reaction(
      () => session.tableColorsShown,
      shown => seen.push(shown),
    );
    // Typing: off once, then nothing more to tell anyone.
    for (const text of ['company ', 'company |', 'company | s', 'company | s:']) session.expression = text;
    // Back to what ran.
    session.expression = 'company';
    global_.pineTableColorsEnabled = false;
    stop();
    assert.deepEqual(seen, [false, true, false]);
  } finally {
    global.fetch = original;
  }
});
