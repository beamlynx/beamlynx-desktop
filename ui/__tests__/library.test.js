// The sidebar's Library (components/recipes/LibraryPanel.tsx): the shared
// insert it uses (components/recipes/insertRecipe.ts),
// and the store state behind the panel (GlobalStore.showLibrary and friends).
//
// insertRecipe only reads agentSessionIds, activeSessionId, addTab() and
// sessions[...] from the store, so a plain fake stands in for it there: a
// real tab would build its new text against pine-lang. The store tests run a
// real GlobalStore.
//
// Run with: node -r tsx/cjs --test __tests__/library.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reaction } = require('mobx');
const { insertRecipe } = require('../components/recipes/insertRecipe.ts');
const { GlobalStore } = require('../store/global.store.ts');
const { getCommandById } = require('../utils/commands.ts');

/** A tab that records what is set on it, and fails if anything runs it. */
function fakeSession(id, expression = '') {
  const session = {
    id,
    expression,
    sets: [],
    setExpressionWithSelection(full, selection) {
      this.sets.push({ full, selection });
      this.expression = full;
    },
  };
  for (const run of ['evaluate', 'notifyCanvasCommit', 'run', 'execute']) {
    session[run] = () => assert.fail(`inserting a recipe must not run the tab (${run})`);
  }
  return session;
}

/** The parts of GlobalStore insertRecipe reads, with `agentIds` as the agent's tabs. */
function fakeGlobal(tabs, activeSessionId, agentIds = []) {
  const global = {
    sessions: Object.fromEntries(tabs.map(t => [t.id, t])),
    activeSessionId,
    agentSessionIds: agentIds,
    added: [],
    addTab() {
      const s = fakeSession(`new-${this.added.length + 1}`);
      this.added.push(s.id);
      this.sessions[s.id] = s;
      this.activeSessionId = s.id;
    },
  };
  return global;
}

const recipe = (expression, extra = {}) => ({
  id: 'r1',
  title: 'A recipe',
  explanation: '',
  expression,
  inputs: [],
  ...extra,
});

const atEnd = text => ({ anchor: text.length, head: text.length });

// --- insertRecipe ----------------------------------------------------------

test('an empty tab gets the recipe as it is, with the cursor at its end', () => {
  const tab = fakeSession('s1');
  const global = fakeGlobal([tab], 's1');
  const id = insertRecipe(global, recipe("company | where: name = 'Acme'"));
  assert.equal(id, 's1');
  assert.equal(tab.expression, "company | where: name = 'Acme'");
  assert.deepEqual(tab.sets, [{ full: tab.expression, selection: atEnd(tab.expression) }]);
  assert.deepEqual(global.added, [], 'no new tab');
  assert.equal(global.activeSessionId, 's1');
});

test('a tab of only whitespace counts as empty: no blank lines before the recipe', () => {
  const tab = fakeSession('s1', '  \n\n\t \n');
  const global = fakeGlobal([tab], 's1');
  insertRecipe(global, recipe('user | limit: 5'));
  assert.equal(tab.expression, 'user | limit: 5');
});

test('a tab with text gets the recipe after it, with one blank line between', () => {
  const tab = fakeSession('s1', 'user | count:');
  const global = fakeGlobal([tab], 's1');
  const id = insertRecipe(global, recipe('company | limit: 3'));
  assert.equal(id, 's1');
  assert.equal(tab.expression, 'user | count:\n\ncompany | limit: 3');
  assert.deepEqual(tab.sets[0].selection, atEnd(tab.expression));
});

test("the tab's trailing whitespace is trimmed first, so there is exactly one blank line", () => {
  const tab = fakeSession('s1', 'user | count:\n\n\n   \n\t');
  const global = fakeGlobal([tab], 's1');
  insertRecipe(global, recipe('company'));
  assert.equal(tab.expression, 'user | count:\n\ncompany');
  // Leading text and whitespace inside the tab stay as they are.
  const tab2 = fakeSession('s2', '\n  user\n\n\n | count:  \n');
  insertRecipe(fakeGlobal([tab2], 's2'), recipe('company'));
  assert.equal(tab2.expression, '\n  user\n\n\n | count:\n\ncompany');
});

test('a recipe goes in at the cursor: on a blank line there, inside a query just after it', () => {
  const TAB = 'user | count:\n\ncompany\n | limit: 5\n\norder';
  const at = line => {
    const tab = fakeSession('s1', TAB);
    tab.cursorPosition = { line, character: 0 };
    insertRecipe(fakeGlobal([tab], 's1'), recipe('tenant'));
    return tab;
  };
  // On the blank line between the first two queries.
  assert.equal(at(1).expression, 'user | count:\n\ntenant\n\ncompany\n | limit: 5\n\norder');
  // Inside the multi-line query: after its last line, never inside it.
  assert.equal(at(2).expression, 'user | count:\n\ncompany\n | limit: 5\n\ntenant\n\norder');
  assert.equal(at(3).expression, at(2).expression);
  // In the last query: at the end.
  assert.equal(at(5).expression, `${TAB}\n\ntenant`);
  // The cursor is left at the end of what was added.
  const tab = at(1);
  const end = 'user | count:\n\ntenant'.length;
  assert.deepEqual(tab.sets[0].selection, { anchor: end, head: end });
});

test('an old recipe with inputs goes in with its values block above the query', () => {
  const tab = fakeSession('s1', 'user');
  const global = fakeGlobal([tab], 's1');
  insertRecipe(
    global,
    recipe('company | where: name = $n | where: id = $id', {
      inputs: [
        { name: 'n', example: 'Acme', kind: 'string' },
        { name: 'id', example: '7', kind: 'number' },
      ],
    }),
  );
  assert.equal(tab.expression, "user\n\n$n = 'Acme'\n$id = 7\n\ncompany | where: name = $n | where: id = $id");
});

test("a $name the tab already sets keeps the tab's value (textToInsert)", () => {
  const tab = fakeSession('s1', "$x = 'Acme'\n\ncompany | where: name = $x");
  const global = fakeGlobal([tab], 's1');
  insertRecipe(global, recipe("$x = 'Globex'\n$y = 5\n\nemployee | where: id = $y"));
  assert.equal(tab.expression, "$x = 'Acme'\n\ncompany | where: name = $x\n\n$y = 5\n\nemployee | where: id = $y");
});

test('inserting the same recipe twice adds the query again, but not its values', () => {
  const tab = fakeSession('s1');
  const global = fakeGlobal([tab], 's1');
  const r = recipe("-- the company\n$x = 'Acme'\n\ncompany | where: name = $x");
  insertRecipe(global, r);
  insertRecipe(global, r);
  assert.equal(tab.expression, "-- the company\n$x = 'Acme'\n\ncompany | where: name = $x\n\ncompany | where: name = $x");
  assert.deepEqual(tab.sets[1].selection, atEnd(tab.expression));
});

test("on the agent's tab, the recipe goes into a new tab and the agent's is left alone", () => {
  const agentTab = fakeSession('agent', 'agent | where: id = 1');
  const mine = fakeSession('mine', 'user');
  const global = fakeGlobal([mine, agentTab], 'agent', ['agent']);
  const id = insertRecipe(global, recipe('company | limit: 3'));
  assert.deepEqual(global.added, ['new-1'], 'exactly one new tab');
  assert.equal(id, 'new-1');
  assert.equal(global.activeSessionId, 'new-1');
  assert.equal(global.sessions['new-1'].expression, 'company | limit: 3', 'the new tab is empty, so no blank line');
  assert.deepEqual(global.sessions['new-1'].sets[0].selection, atEnd('company | limit: 3'));
  assert.equal(agentTab.expression, 'agent | where: id = 1');
  assert.deepEqual(agentTab.sets, []);
  assert.equal(mine.expression, 'user');
});

test("each of several agent tabs (Agent, Needs approval) counts as the agent's", () => {
  const a = fakeSession('agent-a', 'x');
  const b = fakeSession('agent-b', 'y');
  const global = fakeGlobal([a, b], 'agent-b', ['agent-a', 'agent-b']);
  assert.equal(insertRecipe(global, recipe('company')), 'new-1');
  assert.equal(b.expression, 'y');
});

test("the user's own tab gets the recipe even while agent tabs exist", () => {
  const agentTab = fakeSession('agent', 'agent');
  const mine = fakeSession('mine', 'user');
  const global = fakeGlobal([mine, agentTab], 'mine', ['agent']);
  assert.equal(insertRecipe(global, recipe('company')), 'mine');
  assert.deepEqual(global.added, []);
  assert.equal(mine.expression, 'user\n\ncompany');
  assert.equal(agentTab.expression, 'agent');
});

test('with no active tab, nothing is inserted and it returns null', () => {
  const other = fakeSession('other', 'user');
  const global = fakeGlobal([other], 'gone');
  assert.equal(insertRecipe(global, recipe('company')), null);
  assert.deepEqual(global.added, []);
  assert.deepEqual(other.sets, []);
  assert.equal(other.expression, 'user');
});

test("inserting reads the recipe's text only, and never changes the recipe", () => {
  const r = recipe("$a = 1\n\ncompany | where: id = $a", { inputs: [{ name: 'b', example: '2', kind: 'number' }] });
  const before = JSON.parse(JSON.stringify(r));
  insertRecipe(fakeGlobal([fakeSession('s1', '$a = 9\n\nuser')], 's1'), r);
  assert.deepEqual(r, before);
});

// --- GlobalStore: Library's place in Settings' slot ------------------------

test('Library starts closed, with no recipe changes counted', () => {
  const store = new GlobalStore();
  assert.equal(store.showLibrary, false);
  assert.equal(store.recipesChangedCount, 0);
});

test('opening Library closes Settings, and closing it does not bring Settings back', () => {
  const store = new GlobalStore();
  store.setShowSettings(true, 'theme');
  assert.equal(store.showSettings, true);
  store.setShowLibrary(true);
  assert.equal(store.showLibrary, true);
  assert.equal(store.showSettings, false);
  store.setShowLibrary(false);
  assert.equal(store.showLibrary, false);
  assert.equal(store.showSettings, false);
  assert.equal(store.settingsSection, 'theme', "Settings' last section is kept");
});

test('clicking Library again closes it (the sidebar toggles setShowLibrary)', () => {
  const store = new GlobalStore();
  store.setShowLibrary(!store.showLibrary);
  assert.equal(store.showLibrary, true);
  store.setShowLibrary(!store.showLibrary);
  assert.equal(store.showLibrary, false);
  assert.equal(store.showSettings, false);
});

test('opening a Settings section replaces Library, and Library replaces it again', () => {
  const store = new GlobalStore();
  store.setShowLibrary(true);
  store.setShowSettings(true, 'theme');
  assert.equal(store.showSettings, true);
  assert.equal(store.settingsSection, 'theme');
  assert.equal(store.showLibrary, false);
  store.setShowLibrary(true);
  assert.equal(store.showLibrary, true);
  assert.equal(store.showSettings, false);
});

test('closing Settings leaves Library as it is', () => {
  const store = new GlobalStore();
  store.setShowLibrary(true);
  store.setShowSettings(false);
  assert.equal(store.showLibrary, true, 'closing Settings must not close an open Library');
  assert.equal(store.showSettings, false);
});

test('every other way into Settings closes Library too', () => {
  const ways = {
    openAddConnection: s => s.openAddConnection(),
    showSettingsSection: s => s.showSettingsSection('connections'),
    openAgentDatabase: s => s.openAgentDatabase('db-1'),
    'command: open-settings': s => getCommandById('open-settings').handler(s, s.sessions[s.activeSessionId]),
    'command: open-appearance': s => getCommandById('open-appearance').handler(s, s.sessions[s.activeSessionId]),
    'command: list-connections': s => getCommandById('list-connections').handler(s, s.sessions[s.activeSessionId]),
  };
  for (const [name, open] of Object.entries(ways)) {
    const store = new GlobalStore();
    store.setShowLibrary(true);
    open(store);
    assert.equal(store.showSettings, true, `${name} opens Settings`);
    assert.equal(store.showLibrary, false, `${name} closes Library`);
  }
});

test('openAddConnection opens Connections at "add" and closes Library', () => {
  const store = new GlobalStore();
  store.setShowLibrary(true);
  store.openAddConnection();
  assert.equal(store.showLibrary, false);
  assert.equal(store.showSettings, true);
  assert.equal(store.settingsSection, 'connections');
  assert.equal(store.settingsConnectionsAdding, true);
});

test('a saved recipe is counted, so an open Library can list them again', () => {
  const store = new GlobalStore();
  const seen = [];
  const stop = reaction(
    () => store.recipesChangedCount,
    n => seen.push(n),
  );
  try {
    store.noteRecipesChanged();
    store.noteRecipesChanged();
    store.noteRecipesChanged();
  } finally {
    stop();
  }
  assert.equal(store.recipesChangedCount, 3);
  assert.deepEqual(seen, [1, 2, 3], 'each save is observed, for LibraryPanel to load the list again');
});

test('opening and closing Library is observable, for the sidebar and the dock', () => {
  const store = new GlobalStore();
  const seen = [];
  const stop = reaction(
    () => [store.showLibrary, store.showSettings].join(','),
    v => seen.push(v),
  );
  try {
    store.setShowLibrary(true);
    store.setShowSettings(true, 'theme');
    store.setShowLibrary(false);
  } finally {
    stop();
  }
  // Closing Library while Settings shows changes neither.
  assert.deepEqual(seen, ['true,false', 'false,true']);
});

// --- GlobalStore.activeKeyboardPanel while Library is open -----------------

test("while Library is open, it owns the keys, so the canvas and Settings' don't fire", () => {
  const store = new GlobalStore();
  store.setShowLibrary(true);
  for (const focus of [null, 'library', 'settings']) {
    store.setFocusedPanelId(focus);
    assert.equal(store.activeKeyboardPanel, 'library', `focus ${focus}`);
  }
});

test('focus in the canvas, or in a visible input panel, still wins over an open Library', () => {
  const store = new GlobalStore();
  store.setShowLibrary(true);
  store.setFocusedPanelId('graph');
  assert.equal(store.activeKeyboardPanel, 'graph');

  store.newLayoutPanelVisible = true;
  store.setFocusedPanelId('input');
  assert.equal(store.activeKeyboardPanel, 'input');

  // An input panel that is hidden doesn't take the keys: Library keeps them.
  store.newLayoutPanelVisible = false;
  assert.equal(store.activeKeyboardPanel, 'library');
});

test('closing Library hands the keys back: to Settings if it replaced Library, else the canvas', () => {
  const store = new GlobalStore();
  store.setShowLibrary(true);
  store.setFocusedPanelId('library');
  store.setShowSettings(true, 'theme');
  assert.equal(store.activeKeyboardPanel, 'settings');

  store.setShowLibrary(true);
  assert.equal(store.activeKeyboardPanel, 'library');
  store.setShowLibrary(false);
  assert.equal(store.activeKeyboardPanel, 'graph');
});

test("the focused panel can be 'library' (data-keyboard-panel on Library's root)", () => {
  const store = new GlobalStore();
  store.setFocusedPanelId('library');
  assert.equal(store.focusedPanelId, 'library');
  // Library closed with focus left on it: back to the canvas.
  assert.equal(store.activeKeyboardPanel, 'graph');
});
