// The agent activity feed (src/main/mcp/activity.ts): what the person sees
// for each MCP tool call, and the check on what the control plane accepts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describeCall, outcomeOf, readActivity } = require('../dist/main/mcp/activity');

test('each call says what it does, with what the agent sent', () => {
  assert.deepEqual(describeCall('find_tables', { query: 'ten' }), { summary: 'Searching for tables like "ten"' });
  assert.deepEqual(describeCall('run_sql_as_pine', { sql: 'SELECT 1', connection_id: 'x' }), {
    summary: 'Converting SQL to Pine and running it',
    detail: 'SELECT 1',
  });
  assert.equal(describeCall('something_new', {}).summary, 'Calling something_new');
});

test('a result with isError is a failure, though nothing was thrown', () => {
  assert.deepEqual(outcomeOf({ content: [{ type: 'text', text: 'No such table' }], isError: true }), {
    ok: false,
    outcome: 'No such table',
  });
  assert.deepEqual(outcomeOf({ content: [{ type: 'text', text: '\n3 rows\nid | name' }] }), { ok: true, outcome: '3 rows' });
  assert.deepEqual(outcomeOf(undefined), { ok: true, outcome: undefined });
});

test('the control plane only passes on a well-formed event, cut to size', () => {
  const event = { id: 'a1', tool: 'run_query', phase: 'start', at: 1, summary: 'Running a query', detail: 'x'.repeat(5000) };
  const read = readActivity(event);
  assert.equal(read.detail.length, 4000);
  assert.equal(readActivity({ ...event, tool: 'Run Query' }), null);
  assert.equal(readActivity({ ...event, phase: 'middle' }), null);
  assert.equal(readActivity({ ...event, id: '' }), null);
  assert.equal(readActivity(null), null);
  assert.equal(readActivity({ ...event, at: 'now' }), null);
});
