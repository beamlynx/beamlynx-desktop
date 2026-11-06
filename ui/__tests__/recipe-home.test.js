// Use puts a recipe on the database it was saved from (openRecipe in
// components/recipes/insertRecipe.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runInAction } = require('mobx');
const { GlobalStore } = require('../store/global.store.ts');
const { openRecipe } = require('../components/recipes/insertRecipe.ts');

const PROD = { id: 'prod', label: 'Production', databaseKey: 'postgres://prod:5432/shop', databaseKeyHash: 'a'.repeat(64) };
const STAGING = { id: 'staging', label: 'Staging', databaseKey: 'postgres://staging:5432/shop', databaseKeyHash: 'b'.repeat(64) };
const recipe = savedFrom => ({ id: 'r', title: 'Waiting', explanation: '', expression: 'company | limit: 1', inputs: [], savedFrom });

// A store with two saved connections, its active tab on `on`. connectToSavedProfile
// is stubbed: it records which tab it connected and to what.
function store(on) {
  const s = new GlobalStore();
  const connected = [];
  runInAction(() => {
    s.connections = [PROD, STAGING];
    s.sessions[s.activeSessionId].profileId = on;
  });
  s.connectToSavedProfile = async id => {
    connected.push({ id, tab: s.activeSessionId });
    runInAction(() => (s.sessions[s.activeSessionId].profileId = id));
    return 'c';
  };
  return { s, connected };
}

test('saved from another of your connections, "Switch this tab": the tab moves there and gets the query', async () => {
  const { s, connected } = store('staging');
  const first = s.activeSessionId;
  assert.equal(await openRecipe(s, recipe(PROD.databaseKeyHash), 'switch'), first);
  assert.deepEqual(connected, [{ id: 'prod', tab: first }]);
  assert.match(s.sessions[first].expression, /company \| limit: 1/);
});

test('"Open in a new tab": a new tab connected there', async () => {
  const { s, connected } = store('staging');
  const first = s.activeSessionId;
  const tab = await openRecipe(s, recipe(PROD.databaseKeyHash), 'new');
  assert.notEqual(tab, first, 'a new tab');
  assert.deepEqual(connected, [{ id: 'prod', tab }]);
  assert.match(s.sessions[tab].expression, /company \| limit: 1/);
  assert.equal(s.sessions[first].expression, '', 'the first tab is untouched');
});

test('"Use in this tab" keeps it on the current tab and its database', async () => {
  const { s, connected } = store('staging');
  const first = s.activeSessionId;
  assert.equal(await openRecipe(s, recipe(PROD.databaseKeyHash), 'here'), first);
  assert.deepEqual(connected, []);
});

test('already on its database, or saved from one you have no connection to: the current tab, whatever was asked', async () => {
  for (const savedFrom of [PROD.databaseKeyHash, 'c'.repeat(64), null]) {
    for (const target of ['switch', 'new']) {
      const { s, connected } = store('prod');
      const first = s.activeSessionId;
      assert.equal(await openRecipe(s, recipe(savedFrom), target), first);
      assert.deepEqual(connected, []);
    }
  }
});
