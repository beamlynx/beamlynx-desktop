// The Pine editor's table colors: one field for the editor's lifetime, set
// by an effect, so a build never has to reconfigure the editor.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EditorState } = require('@codemirror/state');
const { tableColors, setTableColors } = require('../components/table-colors.ts');

const ast = {
  'selected-tables': [{ alias: 'c' }, { alias: 'e' }],
  ranges: [
    { alias: 'c', start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
    { alias: 'e', start: { line: 0, character: 10 }, end: { line: 0, character: 18 } },
  ],
};

// Enough of an EditorView for setTableColors: it only dispatches.
function editor(doc) {
  const view = { state: EditorState.create({ doc, extensions: [tableColors] }) };
  view.dispatch = spec => (view.state = view.state.update(spec).state);
  return view;
}

const marks = state => {
  const out = [];
  state.field(tableColors).between(0, state.doc.length, (from, to, d) => {
    out.push([from, to, d.spec.attributes.style]);
  });
  return out;
};

test('colors come from the effect, and clear with a null AST', () => {
  const view = editor('company | employee');
  assert.deepEqual(marks(view.state), []);

  setTableColors(view, ast, false);
  const colored = marks(view.state);
  assert.deepEqual(
    colored.map(([from, to]) => [from, to]),
    [
      [0, 7],
      [10, 18],
    ],
  );
  // Each table has its own color.
  assert.notEqual(colored[0][2], colored[1][2]);

  // The theme changes the colors, not the ranges.
  setTableColors(view, ast, true);
  assert.notEqual(marks(view.state)[0][2], colored[0][2]);

  setTableColors(view, null, false);
  assert.deepEqual(marks(view.state), []);
});

test('an edit moves the colors with the text until the next effect', () => {
  const view = editor('company | employee');
  setTableColors(view, ast, false);
  view.dispatch({ changes: { from: 0, insert: '  ' } });
  assert.deepEqual(
    marks(view.state).map(([from, to]) => [from, to]),
    [
      [2, 9],
      [12, 20],
    ],
  );
});
