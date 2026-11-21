// A view the user panned or zoomed to is kept, like a dragged table, until
// reset layout. The canvas then stops refitting the view to the graph.
const { test } = require('node:test');
const assert = require('node:assert/strict');

global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ error: 'offline' }) });

const { Session } = require('../store/session.ts');
const { CanvasStore } = require('../store/canvas/canvas.store.ts');

test("the user's view is kept until reset layout, which offers itself meanwhile", () => {
  const session = new Session('view', { connections: [], accessPolicies: [] });
  const store = new CanvasStore(session);
  assert.equal(store.userView, undefined);
  assert.equal(store.hasMovedLayout, false);

  store.setUserView({ x: 10, y: 20, zoom: 0.8 });
  assert.deepEqual(store.userView, { x: 10, y: 20, zoom: 0.8 });
  assert.equal(store.hasMovedLayout, true);

  store.resetLayout();
  assert.equal(store.userView, undefined);
  assert.equal(store.hasMovedLayout, false);
});
