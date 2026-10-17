// Regression tests for the security-critical parts of the access policy
// (src/main/credential-store.ts): MCP always reflects a deliberate policy
// decision once enabled -- either the explicit "None" choice (policyId:
// null, unrestricted access -- e.g. a local/sandbox DB) or a real, named
// policy with an active rule -- there is no "reachable but undecided" state,
// and that has to hold against state that predates or outlives any single
// toggle click, not just at the moment one is clicked. See
// beamlynx-ui/store/mcp-query.ts's own
// __tests__/mcp-query.no-raw-sql.test.js for the renderer-side half of this.
//
// Runs against dist/, not src/ (this repo's Node is v20, which has no
// TypeScript stripping -- `npm test` builds first). Calls the real exported
// functions with a real, temp connections.json per test -- not source-text
// regex -- so a logic bug (e.g. swapping && for ||) actually fails a test
// instead of sailing through because the right identifier tokens are still
// present in the file.
//
// credential-store.ts imports `electron` for `app.getPath`/`ipcMain.handle`/
// `safeStorage.*`, none of which exist when required from plain Node
// (`require('electron')` there resolves to a string -- the binary path --
// not the API). Rather than mocking the whole module, this stubs just
// enough of it via require.cache injection: Node resolves `require('electron')`
// to the same absolute path every time, so pre-seeding require.cache at that
// path with a fake `exports` object is picked up instead of the real
// package, and every other function in credential-store.ts (all real
// business logic, all pure fs/JSON) runs completely unmodified.
//
// Run with: node --test __tests__
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'credential-store.js');
assert.ok(fs.existsSync(DIST), 'dist/main/credential-store.js is missing -- run `npm run build` first (npm test does).');

let userDataDir;
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    // connections.json lives in <appData>/<app name> (see data-dir.ts's
    // getSharedDataDir), so both are stubbed to land it in the temp dir.
    app: { getPath: () => path.dirname(userDataDir), getName: () => path.basename(userDataDir) },
    ipcMain: { handle: () => {} },
    safeStorage: {
      isEncryptionAvailable: () => true,
      // Anything other than 'basic_text' reads as persistenceAvailable: true
      // on Linux -- see getCredentialsStatus.
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: str => Buffer.from(str, 'utf-8'),
      decryptString: buf => buf.toString('utf-8'),
    },
  },
};

const {
  saveConnection,
  setMcpEnabled,
  setConnectionPolicy,
  setApplyPolicyToOwnQueries,
  listConnections,
  createAccessPolicy,
  listAccessPolicies,
  addAccessPolicyRule,
  removeAccessPolicyRule,
  setAccessPolicyRuleEnabled,
  setAccessPolicyRules,
  deleteAccessPolicy,
  listMcpEnabledConnections,
  getMcpAccessStatus,
} = require(DIST);

beforeEach(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beamlynx-credstore-test-'));
});

function addConnection(overrides = {}) {
  const n = Math.random().toString(36).slice(2);
  const result = saveConnection({
    dbHost: overrides.dbHost ?? `host-${n}`,
    dbPort: '5432',
    dbName: 'db',
    dbUser: 'user',
    dbPassword: 'pw',
    label: overrides.label,
  });
  assert.ok(result.persisted, 'saveConnection must persist under the stubbed, encryption-available electron');
  return result.profile;
}

function policyById(policyId) {
  return listAccessPolicies().find(p => p.id === policyId);
}

function disableAllRules(policyId) {
  for (const rule of policyById(policyId).rules) {
    setAccessPolicyRuleEnabled(policyId, rule.id, false);
  }
}

test('setMcpEnabled(id, true) succeeds once the connection points at a policy with an active rule', () => {
  const conn = addConnection();
  // saveConnection defaults policyId to the seeded "Default" policy, which
  // starts with all three rules enabled -- so this should just work.
  const result = setMcpEnabled(conn.id, true);
  assert.deepEqual(result, { ok: true, profile: { ...conn, mcpEnabled: true } });
});

test('setMcpEnabled(id, true) refuses turning MCP on when the connection\'s own policy has no active rule', () => {
  const policy = createAccessPolicy('Empty');
  disableAllRules(policy.id);
  const conn = addConnection();
  assert.deepEqual(setConnectionPolicy(conn.id, policy.id), {
    ok: true,
    profile: { ...conn, policyId: policy.id },
  });
  assert.deepEqual(setMcpEnabled(conn.id, true), { ok: false, reason: 'no-active-policy' });
});

test('setMcpEnabled(id, false) always succeeds, even if the connection\'s policy went inactive after MCP was turned on', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);
  // Disabling a policy's rules doesn't touch any connection using it --
  // deliberately, see setAccessPolicyRuleEnabled's own comment -- so this
  // reaches the exact "mcpEnabled: true, but no rule active" edge state.
  disableAllRules(conn.policyId);
  const result = setMcpEnabled(conn.id, false);
  assert.deepEqual(result, { ok: true, profile: { ...conn, mcpEnabled: false } });
});

test('setConnectionPolicy refuses an inactive named policy while mcpEnabled is true, but allows null ("None")', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);

  const emptyPolicy = createAccessPolicy('Empty');
  disableAllRules(emptyPolicy.id);
  assert.deepEqual(setConnectionPolicy(conn.id, emptyPolicy.id), { ok: false, reason: 'mcp-requires-policy' });

  // null is the deliberate "None" choice, not an undecided/blank state --
  // valid even while MCP is already on.
  assert.deepEqual(setConnectionPolicy(conn.id, null), {
    ok: true,
    profile: { ...conn, mcpEnabled: true, policyId: null },
  });
});

test('setMcpEnabled(id, true) succeeds when the connection\'s policy is null ("None" -- deliberate, unrestricted access)', () => {
  const conn = addConnection();
  assert.equal(setConnectionPolicy(conn.id, null).ok, true);
  const result = setMcpEnabled(conn.id, true);
  assert.deepEqual(result, { ok: true, profile: { ...conn, policyId: null, mcpEnabled: true } });
  assert.equal(getMcpAccessStatus(conn.id), 'ok');
  assert.deepEqual(
    listMcpEnabledConnections().map(c => c.id),
    [conn.id],
  );
});

test('setConnectionPolicy never itself changes mcpEnabled', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);
  const otherPolicy = createAccessPolicy('Other');
  const result = setConnectionPolicy(conn.id, otherPolicy.id);
  assert.deepEqual(result, { ok: true, profile: { ...conn, mcpEnabled: true, policyId: otherPolicy.id } });
});

test('setApplyPolicyToOwnQueries never reads or writes mcpEnabled or policyId', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);
  const updated = setApplyPolicyToOwnQueries(conn.id, true);
  assert.deepEqual(updated, { ...conn, mcpEnabled: true, applyPolicyToOwnQueries: true });
});

test('deleteAccessPolicy sets both policyId: null and mcpEnabled: false on every connection that pointed at it', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);
  deleteAccessPolicy(conn.policyId);
  assert.deepEqual(getMcpAccessStatus(conn.id), 'not-enabled');
  assert.deepEqual(listMcpEnabledConnections(), []);
});

test('getMcpAccessStatus distinguishes not-found, not-enabled, no-active-policy, and ok', () => {
  const conn = addConnection();
  assert.equal(getMcpAccessStatus('does-not-exist'), 'not-found');
  assert.equal(getMcpAccessStatus(conn.id), 'not-enabled');
  assert.equal(setMcpEnabled(conn.id, true).ok, true);
  assert.equal(getMcpAccessStatus(conn.id), 'ok');
  disableAllRules(conn.policyId);
  assert.equal(getMcpAccessStatus(conn.id), 'no-active-policy');
});

test('listMcpEnabledConnections requires each connection\'s OWN policy to be active, not just mcpEnabled', () => {
  const active = addConnection();
  assert.equal(setMcpEnabled(active.id, true).ok, true);

  // Its own separate policy -- addConnection defaults every new connection
  // to the same first-created policy, so reusing that one here would also
  // deactivate `active`'s policy once disableAllRules runs.
  const ownPolicy = createAccessPolicy('WentInactive');
  const wentInactive = addConnection();
  assert.equal(setConnectionPolicy(wentInactive.id, ownPolicy.id).ok, true);
  assert.equal(setMcpEnabled(wentInactive.id, true).ok, true);
  disableAllRules(ownPolicy.id);

  const neverEnabled = addConnection();

  const result = listMcpEnabledConnections();
  assert.deepEqual(
    result.map(c => c.id).sort(),
    [active.id].sort(),
  );
  assert.ok(!result.some(c => c.id === wentInactive.id || c.id === neverEnabled.id));
});


// Rules as pine-lang receives them, in order, for comparing.
function plain(policy) {
  return policy.rules.map(({ id: _id, enabled: _enabled, builtIn: _builtIn, ...rule }) => rule);
}

const email = { type: 'column', schema: 'public', table: 'user', column: 'email' };

test('a new policy starts with the starter hide rules, then the built-in show rules', () => {
  const policy = createAccessPolicy('Fresh');
  assert.deepEqual(
    policy.rules.filter(r => r.type === 'hide').map(r => r.match.contains),
    ['token', 'password', 'secret'],
  );
  assert.deepEqual(
    policy.rules.filter(r => r.builtIn).map(r => r.type),
    ['column-type', 'foreign-key', 'column-name'],
  );
  assert.ok(policy.rules.every(r => r.enabled && typeof r.id === 'string'));
  assert.equal(new Set(policy.rules.map(r => r.id)).size, policy.rules.length);
});

test('a column gets one rule of its own: Hide replaces Show, and Show replaces Hide', () => {
  const policy = createAccessPolicy('Columns');
  addAccessPolicyRule(policy.id, email);
  let rules = plain(policyById(policy.id));
  assert.deepEqual(rules.at(-1), email);

  addAccessPolicyRule(policy.id, { type: 'hide', match: email });
  rules = plain(policyById(policy.id));
  assert.deepEqual(rules[0], { type: 'hide', match: email });
  assert.ok(!rules.some(r => r.type === 'column'));

  addAccessPolicyRule(policy.id, email);
  rules = plain(policyById(policy.id));
  assert.ok(!rules.some(r => r.type === 'hide' && r.match.type === 'column'));
  assert.equal(rules.filter(r => r.type === 'column').length, 1);
});

test('adding a rule the policy already has switches it on instead of adding it twice', () => {
  const policy = createAccessPolicy('Twice');
  const token = policy.rules.find(r => r.type === 'hide' && r.match.contains === 'token');
  setAccessPolicyRuleEnabled(policy.id, token.id, false);
  addAccessPolicyRule(policy.id, { type: 'hide', match: { type: 'column-name', contains: 'token' } });
  const after = policyById(policy.id);
  assert.equal(after.rules.length, policy.rules.length);
  assert.equal(after.rules.find(r => r.id === token.id).enabled, true);
});

test('a built-in rule can be switched off but not removed; other rules can be removed', () => {
  const policy = createAccessPolicy('Remove');
  const builtIn = policy.rules.find(r => r.builtIn);
  const starter = policy.rules.find(r => r.type === 'hide');
  removeAccessPolicyRule(policy.id, builtIn.id);
  removeAccessPolicyRule(policy.id, starter.id);
  const ids = policyById(policy.id).rules.map(r => r.id);
  assert.ok(ids.includes(builtIn.id));
  assert.ok(!ids.includes(starter.id));
});

test('setAccessPolicyRules puts rules back for Undo, and never drops a built-in rule', () => {
  const policy = createAccessPolicy('Undo');
  const before = policyById(policy.id).rules;
  addAccessPolicyRule(policy.id, email);
  setAccessPolicyRules(policy.id, before);
  assert.deepEqual(policyById(policy.id).rules, before);

  setAccessPolicyRules(policy.id, []);
  assert.deepEqual(
    policyById(policy.id).rules.map(r => r.id),
    before.filter(r => r.builtIn).map(r => r.id),
  );
});

test('a version 1 store gets rule ids, built-in marks and the starter hide rules, once', () => {
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      version: 1,
      connections: [],
      accessPolicies: [
        {
          id: 'p1',
          name: 'Default',
          rules: [
            { type: 'column-type', allow: ['integer'], enabled: true },
            { type: 'foreign-key', enabled: false },
            { type: 'column-name', suffix: '_id', enabled: true },
          ],
        },
      ],
    }),
  );
  const [policy] = listAccessPolicies();
  assert.deepEqual(plain(policy), [
    { type: 'hide', match: { type: 'column-name', contains: 'token' } },
    { type: 'hide', match: { type: 'column-name', contains: 'password' } },
    { type: 'hide', match: { type: 'column-name', contains: 'secret' } },
    { type: 'column-type', allow: ['integer'] },
    { type: 'foreign-key' },
    { type: 'column-name', suffix: '_id' },
  ]);
  assert.deepEqual(policy.rules.map(r => r.enabled), [true, true, true, true, false, true]);
  assert.deepEqual(policy.rules.map(r => !!r.builtIn), [false, false, false, true, true, true]);
  assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf-8')).version, 2);

  // Removing a starter rule sticks: the migration doesn't run again.
  removeAccessPolicyRule('p1', policy.rules[0].id);
  assert.equal(listAccessPolicies()[0].rules.length, 5);
});
