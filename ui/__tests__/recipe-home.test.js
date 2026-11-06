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

test('saved from another of your connections: it opens in a new tab connected there', async () => {
  const { s, connected } = store('staging');
  const first = s.activeSessionId;
  const tab = await openRecipe(s, recipe(PROD.databaseKeyHash));
  assert.notEqual(tab, first, 'a new tab');
  assert.deepEqual(connected, [{ id: 'prod', tab }]);
  assert.match(s.sessions[tab].expression, /company \| limit: 1/);
  assert.equal(s.sessions[first].expression, '', 'the first tab is untouched');
});

test('"Use in this tab" keeps it on the current tab and its database', async () => {
  const { s, connected } = store('staging');
  const first = s.activeSessionId;
  assert.equal(await openRecipe(s, recipe(PROD.databaseKeyHash), true), first);
  assert.deepEqual(connected, []);
});

test('already on its database, or saved from one you have no connection to: the current tab', async () => {
  for (const savedFrom of [PROD.databaseKeyHash, 'c'.repeat(64), null]) {
    const { s, connected } = store('prod');
    const first = s.activeSessionId;
    assert.equal(await openRecipe(s, recipe(savedFrom)), first);
    assert.deepEqual(connected, []);
  }
});
