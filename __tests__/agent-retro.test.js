// The retro on agents' calls (src/main/agent-retro.ts): how failures are
// sorted, and the numbers per session.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze, classifyFailure, formatReport } = require('../dist/main/agent-retro');

const call = (over) => ({
  id: Math.random().toString(36), investigationId: 'i1', tool: 'run_query', input: 'user', databaseKey: null,
  question: null, finding: null, startedAt: 0, endedAt: 1, ok: true, error: null, rows: null, ...over,
});

test('failures are sorted by where they point', () => {
  assert.equal(classifyFailure("The SQL didn't convert to Pine, so nothing ran. Line 6: EXISTS isn't in Pine."), 'pine-gap');
  assert.equal(classifyFailure('Uncaught Error: An object could not be cloned.'), 'bug');
  assert.equal(classifyFailure('connect ECONNREFUSED 127.0.0.1:43334'), 'environment');
  assert.equal(classifyFailure('Parse error at line 3, column 143: ...'), 'unclear');
  assert.equal(classifyFailure('`u_0.email` is hidden by the access policy'), 'unclear');
  assert.equal(classifyFailure('Something new'), 'unclassified');
});

test('a session counts its failures, retries, calls before the first rows, and its finding', () => {
  const report = analyze([
    call({ tool: 'list_connections', startedAt: 1 }),
    call({ tool: 'set_question', question: 'Latest login per tenant?', startedAt: 2 }),
    call({ ok: false, error: 'Parse error at line 1', startedAt: 3 }),
    call({ ok: false, error: 'Parse error at line 1', startedAt: 4 }),
    call({ rows: 0, startedAt: 5 }),
    call({ rows: 12, startedAt: 6 }),
    call({ tool: 'note_finding', finding: 'Acme last logged in on 3 Nov', startedAt: 7 }),
    call({ investigationId: 'i2', tool: 'list_connections', ok: false, error: 'connect ECONNREFUSED', startedAt: 8 }),
  ]);
  const [s1, s2] = report.sessions;
  assert.equal(s1.calls, 7);
  assert.equal(s1.failed, 2);
  assert.equal(s1.retriesAfterError, 2, 'each parse error was followed by another run_query');
  assert.equal(s1.callsBeforeFirstAnswer, 5, 'a query with no rows is not an answer');
  assert.equal(s1.question, 'Latest login per tenant?');
  assert.deepEqual(s1.findings, ['Acme last logged in on 3 Nov']);
  assert.equal(s2.callsBeforeFirstAnswer, null);
  assert.equal(report.totals.byKind.unclear, 2);
  assert.equal(report.totals.byKind.environment, 1);
  assert.equal(report.totals.sessionsWithFinding, 1);
  assert.deepEqual(report.totals.byTool.run_query, { calls: 4, failed: 2 });

  const text = formatReport(report);
  assert.match(text, /2 sessions, 8 calls, 3 failed \(38%\)/);
  assert.match(text, /2x run_query: Parse error at line 1/);
  assert.doesNotMatch(text, /ECONNREFUSED/, 'environment failures are counted, not listed');
});

test('an empty log says so', () => {
  assert.match(formatReport(analyze([])), /No agent calls saved yet/);
});
