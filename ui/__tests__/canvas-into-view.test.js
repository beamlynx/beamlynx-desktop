// Moving between tables with the keys walks the view along with them: the
// focused table is panned into view, by as little as it takes, at the same zoom.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { intoView } = require('../store/canvas/into-view.ts');

const node = { x: 0, y: 0, width: 200, height: 80 };
const size = { width: 600, height: 400 };

test('a table already in view leaves the view alone', () => {
  assert.equal(intoView({ ...size, node, current: { x: 100, y: 100, zoom: 1 } }), null);
});

test('a table below the canvas comes up just inside its bottom edge', () => {
  // On screen 500..580; the canvas ends at 400.
  const next = intoView({ ...size, node, current: { x: 100, y: 500, zoom: 1 } });
  assert.deepEqual(next, { x: 100, y: 400 - 24 - 80, zoom: 1 });
});

test('a table above the canvas comes down just inside its top edge', () => {
  const next = intoView({ ...size, node, current: { x: 100, y: -300, zoom: 1 } });
  assert.deepEqual(next, { x: 100, y: 24, zoom: 1 });
});

test('a table off to the side moves in sideways, at the same zoom', () => {
  // Zoom 0.5: on screen 700..800 wide.
  const next = intoView({ ...size, node, current: { x: 700, y: 100, zoom: 0.5 } });
  assert.deepEqual(next, { x: 600 - 24 - 100, y: 100, zoom: 0.5 });
});

test('a line wider than the canvas stays put while part of it shows', () => {
  const line = { x: 0, y: 0, width: 1500, height: 20 };
  assert.equal(intoView({ ...size, node: line, current: { x: -400, y: 100, zoom: 1 } }), null);
});

test('a line wider than the canvas, off to the side, brings in its near edge', () => {
  const line = { x: 0, y: 0, width: 1500, height: 20 };
  // On screen -1600..-100: its right end comes in to 24.
  const next = intoView({ ...size, node: line, current: { x: -1600, y: 100, zoom: 1 } });
  assert.deepEqual(next, { x: -1600 + 124, y: 100, zoom: 1 });
});
