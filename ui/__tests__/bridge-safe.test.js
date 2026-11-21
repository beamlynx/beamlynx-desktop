// What the page hands the desktop app must survive a structured clone
// (utils/bridge-safe.ts). Electron's contextBridge can't copy MobX state, and
// Node's structuredClone fails on it the same way, so it stands in here.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { observable } = require('mobx');
const { bridgeSafe } = require('../utils/bridge-safe.ts');

test('MobX state does not survive a structured clone, and bridgeSafe makes it plain', () => {
  const state = observable({ hidden: { column: 'email', table: { schema: 'public', table: 'user' } } });
  // The value an agent's result carried in Oct 2026, when it failed.
  const result = { approval: { column: state.hidden.column, table: state.hidden.table } };
  assert.throws(() => structuredClone(result), /could not be cloned/);
  assert.deepEqual(structuredClone(bridgeSafe(result)), {
    approval: { column: 'email', table: { schema: 'public', table: 'user' } },
  });
});

test('bridgeSafe keeps undefined, and plain data as it is', () => {
  assert.equal(bridgeSafe(undefined), undefined);
  const rows = { columns: ['id'], rows: [[1], [null]], error: '', warnings: ['w'] };
  assert.deepEqual(bridgeSafe(rows), rows);
});
