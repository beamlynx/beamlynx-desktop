// The agent activity log (store/agent-activity.ts): each MCP tool call from
// its start to its end, and when the agent counts as working.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AgentActivityStore, MAX_ENTRIES, STALE_MS } = require('../store/agent-activity.ts');

const start = (id, tool = 'find_tables', at = Date.now()) => ({ id, tool, phase: 'start', at, summary: `${tool} ${id}` });
const end = (id, ok = true, at = Date.now(), tool = 'find_tables') => ({ id, tool, phase: 'end', at, summary: `${tool} ${id}`, ok });

test('a call runs from its start to its end, newest first', () => {
  const store = new AgentActivityStore();
  store.apply(start('a'));
  store.apply(start('b', 'run_query'));
  assert.deepEqual(store.entries.map(e => e.id), ['b', 'a']);
  assert.equal(store.working, true);
  assert.equal(store.current.id, 'b');
  store.apply(end('b', false));
  store.apply(end('a'));
  assert.equal(store.working, false);
  assert.equal(store.entries[0].ok, false);
  store.tick();
});

test('an end with no start is still logged', () => {
  const store = new AgentActivityStore();
  store.apply(end('x'));
  assert.equal(store.entries.length, 1);
  assert.equal(store.working, false);
});

test('waiting for the person is not working', () => {
  const store = new AgentActivityStore();
  store.apply(start('r', 'check_reveal'));
  assert.equal(store.working, false);
  assert.equal(store.current.id, 'r');
  store.tick(Date.now() + STALE_MS);
});

test('a call that never ends stops counting as running', () => {
  const store = new AgentActivityStore();
  const at = Date.now();
  store.apply(start('a', 'run_query', at));
  store.tick(at + STALE_MS + 1);
  assert.equal(store.working, false);
  assert.equal(store.isStale(store.entries[0]), true);
});

test('the log keeps the newest calls', () => {
  const store = new AgentActivityStore();
  for (let i = 0; i < MAX_ENTRIES + 5; i++) store.apply(end(`e${i}`));
  assert.equal(store.entries.length, MAX_ENTRIES);
  assert.equal(store.entries[0].id, `e${MAX_ENTRIES + 4}`);
});
