// The agent activity feed (src/main/mcp/activity.ts): what the person sees
// for each MCP tool call, and the check on what the control plane accepts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { callContext, describeCall, outcomeOf, readActivity } = require('../dist/main/mcp/activity');

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
  assert.deepEqual(outcomeOf({ content: [{ type: 'text', text: '\n3 rows\nid | name' }] }), {
    ok: true,
    outcome: '3 rows',
    rows: 3,
  });
  assert.deepEqual(outcomeOf(undefined), { ok: true, outcome: undefined });
});

test('a result says how many rows came back, after any "Ran as Pine" lines, never the rows', () => {
  const sqlResult = { content: [{ type: 'text', text: 'Ran as Pine:\nuser | l: 2\n\n2 rows\n\n["id"]\n[1]\n[2]' }] };
  assert.equal(outcomeOf(sqlResult).rows, 2);
  assert.equal(outcomeOf({ content: [{ type: 'text', text: 'No rows.' }] }).rows, 0);
  assert.equal(outcomeOf({ content: [{ type: 'text', text: '7 rows, showing the first 5' }] }).rows, 7);
  assert.equal(outcomeOf({ content: [{ type: 'text', text: 'Tables:\nuser' }] }).rows, undefined);
});

test('a call says which connection it used, and the question or finding it stated', () => {
  assert.deepEqual(callContext({ connection_id: 'abc', expression: 'user' }), { connectionId: 'abc' });
  assert.deepEqual(callContext({ question: '  Who signed?  ' }), { question: 'Who signed?' });
  assert.deepEqual(callContext({ finding: 'Acme', connection_id: '' }), { finding: 'Acme' });
  const read = readActivity({
    id: 'a1', tool: 'run_query', phase: 'end', at: 1, summary: 's', rows: 3, connectionId: 'abc', question: 'q',
  });
  assert.equal(read.rows, 3);
  assert.equal(read.connectionId, 'abc');
  assert.equal(read.question, 'q');
  assert.equal(readActivity({ id: 'a1', tool: 'run_query', phase: 'end', at: 1, summary: 's', rows: -1 }).rows, undefined);
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
