// The agent activity log (store/agent-activity.ts): each MCP tool call from
// its start to its end, and when the agent counts as working.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AgentActivityStore, MAX_ENTRIES, STALE_MS, LINGER_MS } = require('../store/agent-activity.ts');

const start = (id, tool = 'find_tables', at = Date.now()) => ({ id, tool, phase: 'start', at, summary: `${tool} ${id}` });
const end = (id, ok = true, at = Date.now(), tool = 'find_tables') => ({ id, tool, phase: 'end', at, summary: `${tool} ${id}`, ok });

test('a call runs from its start to its end, newest first', () => {
  const store = new AgentActivityStore();
  store.apply(start('a'));
  store.apply(start('b', 'run_query'));
  assert.deepEqual(store.entries.map(e => e.id), ['b', 'a']);
  assert.equal(store.working, true);
  assert.equal(store.current.id, 'b');
  const at = Date.now();
  store.apply(end('b', false, at));
  store.apply(end('a', true, at));
  assert.equal(store.running.length, 0);
  assert.equal(store.entries[0].ok, false);
  store.tick(at + LINGER_MS);
  assert.equal(store.working, false);
});

test('the agent counts as working between calls, while it thinks', () => {
  const store = new AgentActivityStore();
  const at = Date.now();
  store.apply(start('a', 'find_tables', at));
  store.apply(end('a', true, at + 50));
  store.tick(at + 5_000);
  assert.equal(store.working, true);
  assert.equal(store.current, undefined);
  store.tick(at + 50 + LINGER_MS);
  assert.equal(store.working, false);
});

test('an end with no start is still logged', () => {
  const store = new AgentActivityStore();
  const at = Date.now();
  store.apply(end('x', true, at));
  assert.equal(store.entries.length, 1);
  store.tick(at + LINGER_MS);
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

test('each investigation says what its own agent is doing', () => {
  const store = new AgentActivityStore();
  const at = Date.now();
  store.apply({ ...start('a', 'find_tables', at), investigationId: 'claude-a' });
  store.apply({ ...start('b', 'run_query', at), investigationId: 'claude-b' });
  assert.equal(store.workingFor('claude-a'), true);
  assert.equal(store.currentFor('claude-a').id, 'a');
  assert.equal(store.currentFor('claude-b').id, 'b');
  store.apply({ ...end('a', true, at + 5), investigationId: 'claude-a' });
  store.tick(at + LINGER_MS + 10);
  assert.equal(store.workingFor('claude-a'), false);
  assert.equal(store.workingFor('claude-b'), true, 'its call still runs');
  // An event from a relay too old to name its investigation.
  store.apply(start('c', 'find_tables', at + LINGER_MS + 10));
  assert.equal(store.currentFor('default').id, 'c');
});
