// How much the canvas does while someone types. It lays the graph out again
// only when a build brings a new AST, or the query it draws changes: a
// keystroke on its own changes neither. The layout (dagre) is counted by
// wrapping dagre.layout itself.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reaction } = require('mobx');
const dagre = require('dagre');

let layouts = 0;
const layout = dagre.layout;
dagre.layout = (...args) => {
  layouts++;
  return layout(...args);
};

// Every build fails: these tests set the ASTs themselves.
global.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ast: null }) });

const asts = require('./fixtures/checkpoint-asts.json');
const named = require('./fixtures/named-block-asts.json');
const { Session } = require('../store/session.ts');
const { CanvasStore } = require('../store/canvas/canvas.store.ts');

function setup(expression, ast) {
  const session = new Session('keys', { connections: [], accessPolicies: [] });
  session.connectionId = 'conn-1';
  session.expression = expression;
  session.ast = ast;
  const store = new CanvasStore(session);
  const stop = store.start();
  let graphs = 0;
  const stopCount = reaction(
    () => store.canvasGraph,
    () => graphs++,
  );
  return {
    session,
    store,
    graphs: () => graphs,
    stop: () => {
      stopCount();
      stop();
    },
  };
}

test('typing in a one-query tab lays nothing out until the build comes back', () => {
  const { session, store, graphs, stop } = setup('company as c', asts['company as c']);
  assert.equal(store.canvasGraph.nodes.length, 1);
  const before = store.canvasGraph;

  layouts = 0;
  for (const ch of ' | limit: 5') session.expression += ch;
  assert.equal(layouts, 0);
  assert.equal(graphs(), 0);
  assert.equal(store.canvasGraph, before);

  // The build of what was typed: one layout.
  session.ast = asts['company as c | limit: 5'];
  assert.equal(layouts, 1);
  assert.deepEqual(
    store.canvasGraph.nodes.map(n => n.id),
    ['result_1'],
  );
  stop();
});

test('clearing the text empties the canvas at once', () => {
  const { session, store, stop } = setup('company as c', asts['company as c']);
  layouts = 0;
  session.expression = '';
  assert.equal(store.canvasGraph.nodes.length, 0);
  assert.equal(layouts, 0);

  // Typing again draws the last build at once, as before.
  session.expression = 'c';
  assert.equal(store.canvasGraph.nodes.length, 1);
  stop();
});

const TAB = '$n = 1\n\ncompany as c | where: id = 1 | limit: 10 |= top\n\ntop | employee as e';

function multiBlock() {
  const t = setup(TAB, null);
  t.store.blockAsts = [
    { text: t.store.textOf(0), ast: named.block },
    { text: t.store.textOf(1), ast: named.main },
  ];
  return t;
}

test('in a tab of several queries, typing dims the canvas once and lays nothing out', () => {
  const { session, store, graphs, stop } = multiBlock();
  assert.equal(store.mainBlock, 1);
  assert.ok(store.canvasGraph.nodes.some(n => n.id === 'top'));
  assert.notEqual(store.canvasGraph.parsing, false);

  layouts = 0;
  const before = graphs();
  for (const ch of ' | l: 3') session.expression += ch;
  assert.equal(layouts, 0);
  // Dimmed on the first keystroke, then left alone.
  assert.equal(store.canvasGraph.parsing, false);
  assert.equal(graphs() - before, 1);
  stop();
});

test('moving the cursor to another query draws that query', () => {
  const { session, store, stop } = multiBlock();
  layouts = 0;
  // The strip's chip for the first query (CanvasStore.selectQuery).
  store.selectQuery(0);
  assert.equal(store.mainBlock, 0);
  assert.ok(layouts > 0);
  // The first query ends in its checkpoint, top; the second query's e is gone.
  assert.ok(store.canvasGraph.nodes.some(n => n.id === 'top'));
  assert.ok(!store.canvasGraph.nodes.some(n => n.id === 'e'));

  // And back, by the editor's own cursor.
  layouts = 0;
  session.updateCursorPosition(4, 0);
  assert.equal(store.mainBlock, 1);
  assert.ok(layouts > 0);
  assert.ok(store.canvasGraph.nodes.some(n => n.id === 'e'));
  stop();
});

test('a cursor that did not move is not a change', () => {
  const { session, stop } = setup('company as c', asts['company as c']);
  session.updateCursorPosition(0, 3);
  const cursor = session.cursorPosition;
  session.updateCursorPosition(0, 3);
  assert.equal(session.cursorPosition, cursor);
  session.updateCursorPosition(0, 4);
  assert.notEqual(session.cursorPosition, cursor);
  assert.deepEqual(session.cursorPosition, { line: 0, character: 4 });
  stop();
});
