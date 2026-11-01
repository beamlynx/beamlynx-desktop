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
  attachTemplate,
  forgetConnection,
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
  setAgentAccess,
  defaultAccessPolicyRules,
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
  if (overrides.noPolicy) return result.profile;
  // A new connection has no policy until one is picked, as the app asks
  // when MCP is turned on. Most tests start from the first template.
  const template = listAccessPolicies().find(p => !p.connectionId);
  const attached = attachTemplate(result.profile.id, template.id);
  assert.ok(attached.ok);
  return attached.profile;
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
  assert.equal(attachTemplate(conn.id, policy.id).ok, true);
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

test('attachTemplate refuses an inactive template while mcpEnabled is true, but allows null ("None")', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);

  const emptyTemplate = createAccessPolicy('Empty');
  disableAllRules(emptyTemplate.id);
  assert.deepEqual(attachTemplate(conn.id, emptyTemplate.id), { ok: false, reason: 'mcp-requires-policy' });

  // null is the deliberate "None" choice, not an undecided/blank state --
  // valid even while MCP is already on.
  assert.deepEqual(attachTemplate(conn.id, null), {
    ok: true,
    profile: { ...conn, mcpEnabled: true, policyId: null },
  });
  // Its own policy went with it.
  assert.equal(policyById(conn.policyId), undefined);
});

test('attachTemplate refuses an unknown template, and another connection\'s policy', () => {
  const conn = addConnection();
  const other = addConnection();
  assert.deepEqual(attachTemplate(conn.id, 'missing'), { ok: false, reason: 'not-found' });
  assert.deepEqual(attachTemplate(conn.id, other.policyId), { ok: false, reason: 'not-found' });
  assert.deepEqual(attachTemplate('missing', null), { ok: false, reason: 'not-found' });
});

test('setMcpEnabled(id, true) succeeds when the connection\'s policy is null ("None" -- deliberate, unrestricted access)', () => {
  const conn = addConnection();
  assert.equal(attachTemplate(conn.id, null).ok, true);
  const result = setMcpEnabled(conn.id, true);
  assert.deepEqual(result, { ok: true, profile: { ...conn, policyId: null, mcpEnabled: true } });
  assert.equal(getMcpAccessStatus(conn.id), 'ok');
  assert.deepEqual(
    listMcpEnabledConnections().map(c => c.id),
    [conn.id],
  );
});

test('attachTemplate never itself changes mcpEnabled', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);
  const other = createAccessPolicy('Other');
  const result = attachTemplate(conn.id, other.id);
  assert.equal(result.ok, true);
  assert.equal(result.profile.mcpEnabled, true);
});

test('setApplyPolicyToOwnQueries never reads or writes mcpEnabled or policyId', () => {
  const conn = addConnection();
  assert.equal(setMcpEnabled(conn.id, true).ok, true);
  const updated = setApplyPolicyToOwnQueries(conn.id, true);
  assert.deepEqual(updated, { ...conn, mcpEnabled: true, applyPolicyToOwnQueries: true });
});

test('deleting a template leaves the connections made from it alone; a connection\'s own policy is not deleted', () => {
  const template = createAccessPolicy('Team');
  const conn = addConnection();
  assert.equal(attachTemplate(conn.id, template.id).ok, true);
  const own = listConnections().find(c => c.id === conn.id).policyId;
  assert.equal(setMcpEnabled(conn.id, true).ok, true);

  assert.equal(deleteAccessPolicy(template.id), true);
  assert.equal(policyById(template.id), undefined);
  assert.equal(getMcpAccessStatus(conn.id), 'ok');
  assert.deepEqual(policyById(own).template, { id: template.id, name: 'Team' });

  assert.equal(deleteAccessPolicy(own), false);
  assert.ok(policyById(own));
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

  // Every connection has a policy of its own, so turning off all of one's
  // rules doesn't touch the other's.
  const wentInactive = addConnection();
  assert.equal(setMcpEnabled(wentInactive.id, true).ok, true);
  disableAllRules(wentInactive.policyId);

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
    ['column-type', 'foreign-key'],
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
          name: 'Mine',
          rules: [
            { type: 'column-type', allow: ['integer'], enabled: true },
            { type: 'foreign-key', enabled: false },
            { type: 'column-name', suffix: '_id', enabled: true },
          ],
        },
      ],
    }),
  );
  const policy = policyById('p1');
  assert.deepEqual(plain(policy), [
    { type: 'hide', match: { type: 'column-name', contains: 'token' } },
    { type: 'hide', match: { type: 'column-name', contains: 'password' } },
    { type: 'hide', match: { type: 'column-name', contains: 'secret' } },
    { type: 'column-type', allow: ['integer'] },
    { type: 'foreign-key' },
    { type: 'column-name', suffix: '_id' },
  ]);
  // The `_id` rule is switched off once (store version 6).
  assert.deepEqual(policy.rules.map(r => r.enabled), [true, true, true, true, false, false]);
  assert.deepEqual(policy.rules.map(r => !!r.builtIn), [false, false, false, true, true, true]);
  assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf-8')).version, 6);

  // Removing a starter rule sticks: the migration doesn't run again.
  removeAccessPolicyRule('p1', policy.rules[0].id);
  assert.equal(policyById('p1').rules.length, 5);
});

test('once, the built-in `_id` rule is switched off, unless it is the only rule on', () => {
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  const idRule = { type: 'column-name', suffix: '_id' };
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      version: 5,
      connections: [],
      accessPolicies: [
        {
          id: 'typical',
          name: 'Typical',
          rules: [
            { type: 'column-type', allow: ['integer'], id: 't1', enabled: true, builtIn: true },
            { ...idRule, id: 't2', enabled: true, builtIn: true },
          ],
        },
        {
          id: 'only-id',
          name: 'Only _id on',
          rules: [
            { type: 'column-type', allow: ['integer'], id: 'o1', enabled: false, builtIn: true },
            { ...idRule, id: 'o2', enabled: true, builtIn: true },
          ],
        },
      ],
    }),
  );
  assert.deepEqual(policyById('typical').rules.map(r => r.enabled), [true, false]);
  assert.deepEqual(policyById('only-id').rules.map(r => r.enabled), [false, true]);
  assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf-8')).version, 6);

  // Switching it back on sticks: this runs once.
  setAccessPolicyRuleEnabled('typical', 't2', true);
  assert.deepEqual(policyById('typical').rules.map(r => r.enabled), [true, true]);
});

test('a policy without rule ids is migrated on its own, even in a version 2 store, and only once', () => {
  // An older app sharing connections.json can add a policy after this one
  // has migrated the store.
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  const migrated = createAccessPolicy('Already migrated');
  const store = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  store.accessPolicies.push({
    id: 'old',
    name: 'From the old app',
    rules: [{ type: 'column-type', allow: ['integer'], enabled: true }],
  });
  fs.writeFileSync(storePath, JSON.stringify(store));

  const policies = listAccessPolicies();
  assert.deepEqual(policies.find(p => p.id === migrated.id), migrated);
  const old = policies.find(p => p.id === 'old');
  assert.equal(old.rules.length, 4);
  assert.ok(old.rules.every(r => typeof r.id === 'string'));
  assert.equal(new Set(old.rules.map(r => r.id)).size, 4);

  // Nothing left to migrate: a second read changes nothing.
  assert.deepEqual(listAccessPolicies(), policies);
});

test('a newer store version is never lowered', () => {
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({ version: 6, connections: [], accessPolicies: [] }));
  listAccessPolicies();
  assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf-8')).version, 6);
});

test('a new connection has no policy until one is picked; attaching gives it its own copy of the template', () => {
  const fresh = addConnection({ label: 'Prod', noPolicy: true });
  assert.equal(fresh.policyId, null);
  assert.equal(fresh.mcpEnabled, false);
  const template = listAccessPolicies().find(p => !p.connectionId);
  const a = attachTemplate(fresh.id, template.id).profile;
  const b = addConnection({ label: 'Staging' });
  const own = policyById(a.policyId);
  assert.notEqual(a.policyId, template.id);
  assert.notEqual(a.policyId, b.policyId);
  assert.equal(own.connectionId, a.id);
  assert.equal(own.name, 'Default for Prod');
  assert.deepEqual(own.template, { id: template.id, name: 'Default' });
  assert.deepEqual(plain(own), plain(template));
  assert.ok(own.rules.every(r => !template.rules.some(t => t.id === r.id)));
});

test('changing one connection\'s policy changes neither another connection\'s nor the template', () => {
  const a = addConnection();
  const b = addConnection();
  const template = listAccessPolicies().find(p => !p.connectionId);
  addAccessPolicyRule(a.policyId, email);
  assert.ok(plain(policyById(a.policyId)).some(r => r.column === 'email'));
  assert.ok(!plain(policyById(b.policyId)).some(r => r.column === 'email'));
  assert.ok(!plain(policyById(template.id)).some(r => r.column === 'email'));

  // And the other way: a template edited later doesn't reach connections.
  addAccessPolicyRule(template.id, { type: 'hide', match: email });
  assert.ok(!plain(policyById(b.policyId)).some(r => r.type === 'hide' && r.match.column === 'email'));
});

test('forgetting a connection removes its own policy', () => {
  const conn = addConnection();
  forgetConnection(conn.id);
  assert.equal(policyById(conn.policyId), undefined);
});

// A store as 0.68.0 and older wrote it: two connections sharing one policy.
function writeSharedStore(overrides = {}) {
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  const rule = (r, extra = {}) => ({ ...r, id: Math.random().toString(36).slice(2), enabled: true, ...extra });
  const shared = { id: 'shared', name: 'Team', rules: [rule(email), rule({ type: 'foreign-key' }, { builtIn: true })] };
  const connection = (id, label, policyId) => ({
    id, label, dbHost: id, dbPort: '5432', dbName: 'db', dbUser: 'u', dbType: 'postgres',
    createdAt: '', lastUsedAt: '', dbPasswordEncrypted: '', mcpEnabled: true, policyId, applyPolicyToOwnQueries: false,
  });
  fs.writeFileSync(
    storePath,
    JSON.stringify({
      version: 2,
      connections: [connection('c1', 'Prod', 'shared'), connection('c2', 'Staging', 'shared'), connection('c3', 'Gone', 'missing')],
      accessPolicies: [shared],
      ...overrides,
    }),
  );
  return { storePath, shared };
}

test('connections that shared a policy each get their own copy, and the shared one becomes a template', () => {
  const { storePath, shared } = writeSharedStore();
  const [c1, c2, c3] = listConnections();
  assert.notEqual(c1.policyId, c2.policyId);
  for (const c of [c1, c2]) {
    const own = policyById(c.policyId);
    assert.equal(own.connectionId, c.id);
    assert.deepEqual(own.template, { id: 'shared', name: 'Team' });
    assert.deepEqual(plain(own), plain(shared));
    assert.deepEqual(own.rules.map(r => r.builtIn), shared.rules.map(r => r.builtIn));
    assert.equal(c.mcpEnabled, true);
  }
  assert.equal(policyById('shared').connectionId, undefined, 'the shared policy stays, as a template');
  // A policy that no longer exists: none, with MCP off, as before.
  assert.equal(c3.policyId, null);
  assert.equal(c3.mcpEnabled, false);

  const written = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  assert.equal(written.version, 6);
  // Only once: reading again changes nothing.
  listConnections();
  assert.deepEqual(JSON.parse(fs.readFileSync(storePath, 'utf-8')), written);
});

test('a file an older app wrote back is repaired: shared again means copied again, and an unused copy goes', () => {
  writeSharedStore();
  const [c1] = listConnections();
  const storePath = path.join(userDataDir, 'connections.json');
  // An older app moves Prod onto the template, as its policy picker did.
  const file = JSON.parse(fs.readFileSync(storePath, 'utf-8'));
  file.connections[0].policyId = 'shared';
  fs.writeFileSync(storePath, JSON.stringify(file));

  const repaired = listConnections()[0];
  assert.notEqual(repaired.policyId, 'shared');
  assert.equal(policyById(repaired.policyId).connectionId, c1.id);
  assert.equal(policyById(c1.policyId), undefined, 'the copy nothing uses any more is removed');
});

// A store as 0.68.0 left it, shaped like a real one: Default shared by two
// connections, Test used by none, and a copy that 0.68.0's "Copy for this
// connection" made for one connection.
function writeStoreWithACopy() {
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  const rule = (r, extra = {}) => ({ ...r, id: Math.random().toString(36).slice(2), enabled: true, ...extra });
  const policy = (id, name) => ({ id, name, rules: [rule(email), rule({ type: 'foreign-key' }, { builtIn: true })] });
  const connection = (id, label, policyId, mcpEnabled = true) => ({
    id, label, dbHost: id, dbPort: '5432', dbName: 'db', dbUser: 'u', dbType: 'postgres',
    createdAt: '', lastUsedAt: '', dbPasswordEncrypted: '', mcpEnabled, policyId, applyPolicyToOwnQueries: false,
  });
  fs.writeFileSync(storePath, JSON.stringify({
    version: 2,
    connections: [
      connection('local', 'Localhost', 'default'),
      connection('staging', 'Staging', 'default'),
      connection('prod', 'Production Read-Only', 'copy'),
      connection('fga', 'Production Read-Only (Open FGA)', null),
    ],
    accessPolicies: [policy('default', 'Default'), policy('test', 'Test'), policy('copy', 'Default for Production Read-Only')],
  }));
  return storePath;
}

test('a policy only one connection uses becomes its own, as it is; a shared one is copied; the template list keeps only real templates', () => {
  writeStoreWithACopy();
  const connections = Object.fromEntries(listConnections().map(c => [c.id, c]));
  const policies = listAccessPolicies();
  // The copy 0.68.0 made is moved, not copied again: same id, now owned.
  assert.equal(connections.prod.policyId, 'copy');
  assert.equal(policyById('copy').connectionId, 'prod');
  // Default, used by two, gives each its own copy and stays a template.
  for (const id of ['local', 'staging']) {
    const own = policyById(connections[id].policyId);
    assert.equal(own.connectionId, id);
    assert.deepEqual(own.template, { id: 'default', name: 'Default' });
  }
  assert.deepEqual(policies.filter(p => !p.connectionId).map(p => p.name).sort(), ['Default', 'Test']);
  // No policy stays no policy.
  assert.equal(connections.fga.policyId, null);
  assert.equal(connections.fga.mcpEnabled, true);
});

test('moving the only template to its one connection leaves the built-in Default for new connections', () => {
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify({
    version: 2,
    connections: [{ id: 'one', label: 'One', dbHost: 'h', dbPort: '1', dbName: 'd', dbUser: 'u', dbType: 'postgres',
      createdAt: '', lastUsedAt: '', dbPasswordEncrypted: '', mcpEnabled: true, policyId: 'default', applyPolicyToOwnQueries: false }],
    accessPolicies: [{ id: 'default', name: 'Default', rules: [{ ...email, id: 'r1', enabled: true }] }],
  }));
  const [one] = listConnections();
  assert.equal(one.policyId, 'default');
  assert.equal(policyById('default').connectionId, 'one');
  const templates = listAccessPolicies().filter(p => !p.connectionId);
  // The connection keeps its Allow rule. Default is the built-in one, as
  // every Default is now.
  assert.deepEqual(plain(policyById('default')), [email]);
  assert.deepEqual(templates.map(p => [p.name, !!p.builtIn]), [['Default', true]]);
  assert.deepEqual(plain(templates[0]), plain({ rules: defaultAccessPolicyRules() }));
});

test('once, a stored Default template goes: Default is built in, and connections keep every rule they had', () => {
  const storePath = path.join(userDataDir, 'connections.json');
  fs.mkdirSync(userDataDir, { recursive: true });
  const r = (rule, extra = {}) => ({ ...rule, id: Math.random().toString(36).slice(2), enabled: true, ...extra });
  const added = { type: 'column', schema: 'public', table: 'tenant', column: 'title' };
  const rules = [r({ type: 'hide', match: { type: 'column-name', contains: 'token' } }), r({ type: 'foreign-key' }, { builtIn: true }), r(added)];
  fs.writeFileSync(storePath, JSON.stringify({
    version: 3,
    connections: [{ id: 'c', label: 'C', dbHost: 'h', dbPort: '1', dbName: 'd', dbUser: 'u', dbType: 'postgres', createdAt: '', lastUsedAt: '',
      dbPasswordEncrypted: '', mcpEnabled: true, policyId: 'own', applyPolicyToOwnQueries: false }],
    accessPolicies: [
      { id: 'default', name: 'Default', rules },
      { id: 'mine', name: 'Mine', rules },
      { id: 'own', name: 'Default for C', connectionId: 'c', template: { id: 'default', name: 'Default' }, rules },
    ],
  }));
  const templates = listAccessPolicies().filter(p => !p.connectionId);
  assert.deepEqual(templates.map(p => [p.id, p.name]), [['builtin:default', 'Default'], ['mine', 'Mine']]);
  assert.equal(policyById('default'), undefined);
  assert.deepEqual(plain(policyById('own')), plain({ rules }));
  assert.deepEqual(plain(policyById('mine')), plain({ rules }));
  assert.equal(JSON.parse(fs.readFileSync(storePath, 'utf-8')).version, 6);
});

test('the built-in Default can\'t be changed, renamed or deleted', () => {
  const before = plain(policyById('builtin:default'));
  assert.equal(addAccessPolicyRule('builtin:default', email), null);
  assert.equal(removeAccessPolicyRule('builtin:default', 'builtin:default:0'), null);
  assert.equal(setAccessPolicyRuleEnabled('builtin:default', 'builtin:default:0', false), null);
  assert.equal(setAccessPolicyRules('builtin:default', []), null);
  assert.equal(deleteAccessPolicy('builtin:default'), false);
  assert.deepEqual(plain(policyById('builtin:default')), before);
  assert.deepEqual(policyById('builtin:default').rules.map(r => r.id), policyById('builtin:default').rules.map((_, i) => `builtin:default:${i}`));
});

test('agent access: off, masked by the policy, or every column with the policy kept', () => {
  const conn = addConnection({ noPolicy: true });
  // Masked needs a policy: without one, a template to start from.
  assert.deepEqual(setAgentAccess(conn.id, 'masked'), { ok: false, reason: 'needs-template' });
  const masked = setAgentAccess(conn.id, 'masked', 'builtin:default');
  assert.equal(masked.ok, true);
  assert.equal(masked.profile.mcpEnabled, true);
  assert.equal(masked.profile.agentsSeeEveryColumn, false);
  const policyId = masked.profile.policyId;
  addAccessPolicyRule(policyId, email);

  // Every column keeps the policy and its rules, to apply again later.
  const all = setAgentAccess(conn.id, 'every-column');
  assert.equal(all.profile.agentsSeeEveryColumn, true);
  assert.equal(all.profile.policyId, policyId);
  assert.ok(plain(policyById(policyId)).some(r => r.column === 'email'));
  // Even a policy with no rule on doesn't stop every-column access.
  disableAllRules(policyId);
  assert.equal(getMcpAccessStatus(conn.id), 'ok');
  // But it can't go back to masked behind a policy that decides nothing.
  assert.deepEqual(setAgentAccess(conn.id, 'masked'), { ok: false, reason: 'no-active-policy' });

  const off = setAgentAccess(conn.id, 'off');
  assert.equal(off.profile.mcpEnabled, false);
  assert.equal(getMcpAccessStatus(conn.id), 'not-enabled');
  assert.deepEqual(setAgentAccess('missing', 'off'), { ok: false, reason: 'not-found' });
});
