// run_query waiting on the user to allow a hidden column
// (src/main/mcp/approval-wait.ts). Runs against dist/; `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'mcp', 'approval-wait.js');
assert.ok(fs.existsSync(DIST), 'dist/main/mcp/approval-wait.js is missing -- run `npm run build` first (npm test does).');
const { runWithApprovals } = require(DIST);

const format = result => (result.error ? `ERROR ${result.error}` : `ROWS ${result.rows}`);
const refusedFor = (column, id) => ({
  error: `${column} is hidden`,
  approval: { id, column, table: { schema: 'public', table: 'activity' } },
});

/** A control plane that answers /query in turn from `queries`, and each approval from `answers`. */
function fakeControlPlane(queries, answers) {
  const calls = [];
  const request = async (method, route) => {
    calls.push(`${method} ${route}`);
    if (route === '/query') return { result: queries.shift() };
    const id = route.split('/').pop();
    const answer = answers[id]?.shift();
    return answer ? { status: 'resolved', outcome: answer } : { status: 'pending' };
  };
  return { request, calls };
}

test('a query that needs no approval returns at once', async () => {
  const { request, calls } = fakeControlPlane([{ rows: 3 }], {});
  assert.deepEqual(await runWithApprovals(request, {}, format, 1000), { isError: false, text: 'ROWS 3' });
  assert.deepEqual(calls, ['POST /query']);
});

test('allowed: the query runs again and the agent is told why it worked', async () => {
  const { request, calls } = fakeControlPlane([refusedFor('type', 'a1'), { rows: 7 }], { a1: [undefined, { allowed: true }] });
  const out = await runWithApprovals(request, {}, format, 10000);
  assert.equal(out.isError, false);
  assert.match(out.text, /^The user allowed you to see activity\.type, and the query ran again\.\n\nROWS 7$/);
  assert.deepEqual(calls, ['POST /query', 'GET /approval/a1', 'GET /approval/a1', 'POST /query']);
});

test('a re-run refused for a second hidden column waits for that one too', async () => {
  const { request } = fakeControlPlane(
    [refusedFor('type', 'a1'), refusedFor('kind', 'a2'), { rows: 1 }],
    { a1: [{ allowed: true }], a2: [{ allowed: true }] },
  );
  const out = await runWithApprovals(request, {}, format, 10000);
  assert.equal(out.isError, false);
  assert.match(out.text, /activity\.type and activity\.kind/);
  assert.match(out.text, /ROWS 1$/);
});

test('declined: the refusal and the user\'s reason, as an error', async () => {
  const { request } = fakeControlPlane([refusedFor('type', 'a1')], { a1: [{ allowed: false, comment: 'not in prod' }] });
  const out = await runWithApprovals(request, {}, format, 10000);
  assert.equal(out.isError, true);
  assert.match(out.text, /ERROR type is hidden/);
  assert.match(out.text, /declined to show you activity\.type: "not in prod"$/);
});

test('no answer before the deadline: the refusal, and how to keep waiting', async () => {
  let clock = 0;
  const { request } = fakeControlPlane([refusedFor('type', 'a1')], {});
  const timed = async (...args) => {
    clock += 400;
    return request(...args);
  };
  const out = await runWithApprovals(timed, {}, format, 1000, () => clock);
  assert.equal(out.isError, true);
  assert.match(out.text, /hasn't answered yet/);
});
