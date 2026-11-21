// Ctrl+K's Switch Connection: lists the connections and switches the active
// tab to the one picked, as the sidebar's connection menu does.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runInAction } = require('mobx');
const { GlobalStore } = require('../store/global.store.ts');
const { getAllCommands } = require('../utils/commands.ts');

const command = () => getAllCommands().find(c => c.id === 'switch-connection');

function store() {
  const s = new GlobalStore();
  runInAction(() => {
    s.connections = [
      { id: 'a', label: 'shop', dbName: 'shop' },
      { id: 'b', label: 'billing', dbName: 'billing' },
    ];
    s.connectionsLoaded = true;
  });
  const switched = [];
  s.switchActiveTabConnection = async id => void switched.push(id);
  return { s, switched };
}

test('it lists every connection, marks the one this tab is on, and switches to the one picked', async () => {
  const { s, switched } = store();
  runInAction(() => (s.sessions[s.activeSessionId].connectionId = 'a'));
  const options = await command().handler(s, s.sessions[s.activeSessionId]);
  assert.deepEqual(options.map(o => o.label), ['shop (this tab)', 'billing']);
  options[1].handler(s, s.sessions[s.activeSessionId]);
  assert.deepEqual(switched, ['b']);
});

test('switching a tab that has a query in it asks first', async () => {
  const s = new GlobalStore();
  runInAction(() => {
    s.connections = [{ id: 'b', label: 'billing' }];
    s.sessions[s.activeSessionId].connectionId = 'a';
    s.sessions[s.activeSessionId].expression = 'company';
  });
  await s.switchActiveTabConnection('b');
  // With the tab it was asked for: confirming applies it there.
  assert.deepEqual(s.pendingConnectionSwitch, { kind: 'select', connectionId: 'b', sessionId: s.activeSessionId });
});

test('confirming a switch applies it to the tab it was asked for, not the one open by then', async () => {
  const s = new GlobalStore();
  const asked = s.activeSessionId;
  runInAction(() => {
    s.connections = [{ id: 'b', label: 'billing' }];
    s.sessions[asked].connectionId = 'a';
    s.sessions[asked].expression = 'company';
  });
  await s.switchActiveTabConnection('b');
  s.addTab(); // a deep link opened a tab while the question was up
  let switchedIn;
  s.selectConnection = async () => void (switchedIn = s.activeSessionId);
  await s.confirmPendingConnectionSwitch();
  assert.equal(switchedIn, asked);
});
