// A list opened from the bar rises from the bottom of the canvas. The graph
// moves up out of its way, and zooms out when it doesn't fit above it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { roomForList } = require('../store/canvas/room-for-list.ts');

const one = { x: 0, y: 0, width: 220, height: 80 };
const base = { width: 640, minZoom: 0.5, focus: null };

test('a graph that already clears the list stays put', () => {
  // The table spans 100..180 on screen; the space above the list ends at 300.
  const current = { x: 200, y: 100, zoom: 1 };
  assert.equal(roomForList({ ...base, graph: one, freeBottom: 300, current }), null);
});

test('one table under the list moves up just above it, at the same zoom', () => {
  // Centred by fitView: 250..330 on screen, and the list starts at 260.
  const current = { x: 200, y: 250, zoom: 1.2 };
  const graph = { x: 0, y: 0, width: 220, height: 66 };
  const next = roomForList({ ...base, graph, freeBottom: 260, current });
  assert.equal(next.zoom, 1.2);
  assert.equal(next.x, 200);
  // Its bottom lands 16px above the list: 260 - 16 = 244.
  assert.equal(next.y + 66 * 1.2, 244);
});

test('a graph taller than the space zooms out to fit, centred', () => {
  const graph = { x: 0, y: 0, width: 300, height: 600 };
  const current = { x: 0, y: 0, zoom: 1 };
  const next = roomForList({ ...base, graph, freeBottom: 432, current });
  // 400px of space between the 16px pads: 600 tall fits at 2/3.
  assert.ok(Math.abs(next.zoom - 400 / 600) < 1e-9);
  assert.ok(Math.abs(next.y - 16) < 1e-9);
  assert.ok(Math.abs(next.x - (16 + (608 - 300 * next.zoom) / 2)) < 1e-9);
});

test('it never zooms in to fit', () => {
  const graph = { x: 0, y: 0, width: 300, height: 380 };
  const current = { x: 0, y: 100, zoom: 0.9 };
  const next = roomForList({ ...base, graph, freeBottom: 432, current });
  assert.ok(next.zoom <= 0.9);
});

test('too tall even at the smallest zoom: zoomed out, the table the list is about just above it', () => {
  const graph = { x: 0, y: 0, width: 300, height: 3000 };
  const focus = { x: 0, y: 2000, width: 220, height: 80 };
  const current = { x: 50, y: -1800, zoom: 1 };
  // The table is at 200..280 on screen, the space ends at 232.
  const next = roomForList({ ...base, graph, focus, freeBottom: 232, current });
  assert.equal(next.zoom, 0.5);
  // Its bottom lands 16px above the list, and its centre stays across (160).
  assert.equal(2080 * 0.5 + next.y, 216);
  assert.equal(110 * 0.5 + next.x, 160);
});
