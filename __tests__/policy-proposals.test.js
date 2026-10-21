// An agent's proposed change to its connection's access policy
// (src/main/mcp/policy-proposals.ts): checked against the policy before the
// user sees it, then waiting for the user's answer. Nothing here writes a
// policy. Runs against dist/; `npm test` builds first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'mcp', 'policy-proposals.js');
assert.ok(fs.existsSync(DIST), 'dist/main/mcp/policy-proposals.js is missing -- run `npm run build` first (npm test does).');
const { checkChanges, createProposal, resolveProposal, waitForProposal, expireProposal, countPendingProposals, proposeAndWait } =
  require(DIST);
const { formatPolicy } = require(path.join(__dirname, '..', 'dist', 'main', 'mcp', 'format.js'));

const policy = {
  id: 'pol',
  name: 'Default for Prod',
  connectionId: 'p1',
  template: { id: 'tpl', name: 'Default' },
  rules: [
    { id: 'h1', type: 'hide', match: { type: 'column-name', contains: 'token' }, enabled: true },
    { id: 'fk', type: 'foreign-key', enabled: true, builtIn: true },
    { id: 'c1', type: 'column', schema: 'public', table: 'order', column: 'status', enabled: false },
  ],
};

test('a valid proposal comes back as clean changes, with unknown fields dropped', () => {
  const checked = checkChanges(policy, [
    { add: { type: 'column', table: 'user', column: 'email', extra: 'dropped' } },
    { add: { type: 'hide', match: { type: 'column-name', suffix: '_ssn' } } },
    { disable: 'h1' },
    { remove: 'c1' },
  ]);
  assert.deepEqual(checked, {
    changes: [
      { add: { type: 'column', schema: null, table: 'user', column: 'email' } },
      { add: { type: 'hide', match: { type: 'column-name', suffix: '_ssn' } } },
      { disable: 'h1' },
      { remove: 'c1' },
    ],
  });
});

test('a proposal is refused for an unknown rule, a built-in removal, a bad rule, or no policy', () => {
  assert.match(checkChanges(policy, [{ remove: 'nope' }]).error, /no rule with id "nope"/);
  assert.match(checkChanges(policy, [{ remove: 'fk' }]).error, /built in/);
  assert.match(checkChanges(policy, [{ add: { type: 'column-name', contains: 'a', suffix: 'b' } }]).error, /not a rule/);
  assert.match(checkChanges(policy, [{ add: { type: 'hide', match: { type: 'hide' } } }]).error, /not a rule/);
  assert.match(checkChanges(policy, [{ add: { type: 'column', table: 'user' } }]).error, /not a rule/);
  assert.match(checkChanges(policy, [{ add: {}, remove: 'h1' }]).error, /exactly one/);
  assert.match(checkChanges(policy, [{ rename: 'h1' }]).error, /isn't a change/);
  assert.match(checkChanges(policy, []).error, /at least one/);
  assert.match(checkChanges(null, [{ disable: 'h1' }]).error, /no access policy/);
});

test('a proposal that would leave no rule on is refused: the agent would lock itself out', () => {
  assert.match(checkChanges(policy, [{ disable: 'h1' }, { disable: 'fk' }]).error, /no rule would be on/);
  // Turning one back on, or adding one, keeps a rule on.
  assert.ok('changes' in checkChanges(policy, [{ disable: 'h1' }, { disable: 'fk' }, { enable: 'c1' }]));
  assert.ok('changes' in checkChanges(policy, [{ disable: 'h1' }, { disable: 'fk' }, { add: { type: 'foreign-key' } }]));
});

test('a proposal waits for the user\'s answer, which is handed over once', async () => {
  const proposal = createProposal({ profileId: 'p1', policyId: 'pol', reason: '  need status  ', changes: [{ enable: 'c1' }] });
  assert.equal(proposal.reason, 'need status');
  assert.equal(countPendingProposals('p1'), 1);
  assert.equal(await waitForProposal(proposal.id, 10), 'pending');
  const waiting = waitForProposal(proposal.id, 5000);
  assert.equal(resolveProposal(proposal.id, { applied: false, comment: 'not now' }), true);
  assert.deepEqual(await waiting, { applied: false, comment: 'not now' });
  assert.equal(countPendingProposals('p1'), 0);
  assert.equal(resolveProposal(proposal.id, { applied: true }), false, 'answered already');
  assert.equal(await waitForProposal(proposal.id, 10), 'unknown');
});

test('an expired proposal can no longer be answered', async () => {
  const proposal = createProposal({ profileId: 'p2', policyId: 'pol', reason: '', changes: [{ enable: 'c1' }] });
  expireProposal(proposal.id);
  assert.equal(resolveProposal(proposal.id, { applied: true }), false);
  assert.equal(await waitForProposal(proposal.id, 10), 'unknown');
});

test('the agent\'s call sends the proposal, then waits until the user answers', async () => {
  const sent = [];
  let polls = 0;
  const request = async (method, route, body) => {
    sent.push(`${method} ${route}`);
    if (route === '/policy-proposal') return { proposalId: 'pp-1' };
    polls++;
    return polls < 3 ? { status: 'pending' } : { status: 'applied' };
  };
  const result = await proposeAndWait(request, { profileId: 'p1', reason: 'r', changes: [] }, 60000);
  assert.deepEqual(result, { isError: false, text: 'The user applied your changes to the access policy. Run your query again.' });
  assert.deepEqual(sent, ['POST /policy-proposal', 'GET /policy-proposal/pp-1', 'GET /policy-proposal/pp-1', 'GET /policy-proposal/pp-1']);

  const declined = await proposeAndWait(
    async route => (route === 'POST' ? { proposalId: 'pp-2' } : { status: 'declined', comment: 'too wide' }),
    { profileId: 'p1', reason: 'r', changes: [] },
    60000,
  );
  assert.deepEqual(declined, { isError: true, text: 'The user declined your proposed policy change: "too wide"' });

  let t = 0;
  const late = await proposeAndWait(
    async route => (route === 'POST' ? { proposalId: 'pp-3' } : { status: 'pending' }),
    { profileId: 'p1', reason: 'r', changes: [] },
    100,
    () => (t += 60),
  );
  assert.equal(late.isError, true);
  assert.match(late.text, /withdrawn/);
});

test('the agent reads the policy as rules with ids, never data', () => {
  const text = formatPolicy('Prod', policy);
  assert.match(text, /first copied from the "Default" template/);
  assert.match(text, /- \[fk\] foreign key columns \(built in\)/);
  assert.match(text, /- \[c1\] public\.order\.status \(off\)/);
  assert.match(text, /Except:\n- \[h1\] names containing "token"/);
  assert.match(formatPolicy('Local', null), /no access policy: you see every column/);
});
