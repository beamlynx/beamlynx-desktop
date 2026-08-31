// Regression tests for the security-critical parts of the access policy
// (src/main/credential-store.ts): MCP always has a real, active policy
// applied once enabled -- there is no "reachable but unprotected" state,
// and that has to hold against state that predates or outlives any single
// toggle click, not just at the moment one is clicked. See
// beamlynx-ui/store/mcp-query.ts's own
// __tests__/mcp-query.no-raw-sql.test.js for the renderer-side half of this.
//
// Plain source-text assertions (this repo has no ts-node/tsx runtime wired
// up for `node --test` on .ts files yet, and credential-store.ts reads
// `app.getPath('userData')` -- real Electron APIs a plain node run can't
// exercise without mocking the whole module). A static check is the more
// robust guard for an invariant like this anyway: it catches a regression
// even in a code path a runtime test's fixtures happen not to exercise.
//
// Run with: node --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const CREDENTIAL_STORE_SOURCE = stripComments(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'credential-store.ts'), 'utf-8'),
);

function functionBody(source, exportedName) {
  const start = source.indexOf(`function ${exportedName}(`);
  assert.ok(start !== -1, `Could not find function ${exportedName} in credential-store.ts`);
  // Find the function body's own opening brace by first skipping past the
  // parameter list (balancing parens) -- a parameter with an inline object
  // type (e.g. `connection: { policyId: string | null }`) has its own
  // `{...}` INSIDE the parameter list, before the body even starts; naively
  // taking the first `{` after `start` matches that one instead and
  // truncates the captured body at its closing `}`, silently returning
  // only the parameter type annotation.
  const parenStart = source.indexOf('(', start);
  let parenDepth = 0;
  let afterParams = parenStart;
  for (; afterParams < source.length; afterParams++) {
    if (source[afterParams] === '(') parenDepth++;
    if (source[afterParams] === ')') {
      parenDepth--;
      if (parenDepth === 0) {
        afterParams++;
        break;
      }
    }
  }
  // Good enough for this file's actual functions, which are all short and
  // single-level -- find the matching closing brace by depth-counting from
  // the function's own opening brace.
  const openBrace = source.indexOf('{', afterParams);
  let depth = 0;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces scanning ${exportedName}`);
}

test('isConnectionPolicyActive resolves a connection\'s OWN policyId, not any policy anywhere', () => {
  const body = functionBody(CREDENTIAL_STORE_SOURCE, 'isConnectionPolicyActive');
  assert.ok(
    /connection\.policyId/.test(body) && /accessPolicies\.find/.test(body),
    'isConnectionPolicyActive must resolve the specific policy a connection points at (connection.policyId, ' +
      'looked up in store.accessPolicies) and check THAT policy\'s own rules -- not whether any policy anywhere ' +
      'has an active rule. Each connection is checked against its own assigned policy, independent of every ' +
      'other connection\'s.',
  );
});

test('listMcpEnabledConnections requires each connection\'s OWN policy to be active, not just mcpEnabled', () => {
  const body = functionBody(CREDENTIAL_STORE_SOURCE, 'listMcpEnabledConnections');
  assert.ok(
    /isConnectionPolicyActive\(/.test(body) && /\.mcpEnabled/.test(body),
    'listMcpEnabledConnections must filter on both c.mcpEnabled AND isConnectionPolicyActive(store, c) -- this ' +
      'is the real enforcement boundary (it backs both GET /connections and assertWhitelisted in ' +
      'control-plane-server.ts). A connection already mcpEnabled: true whose policy later went inactive (or was ' +
      'deleted) must not stay MCP-reachable just because nothing re-checks it.',
  );
});

test('setMcpEnabled refuses turning MCP on unless the connection\'s OWN policy is active, but never refuses turning it off', () => {
  const body = functionBody(CREDENTIAL_STORE_SOURCE, 'setMcpEnabled');
  assert.ok(
    /isConnectionPolicyActive\(/.test(body) && /no-active-policy/.test(body),
    'setMcpEnabled must refuse an `enabled: true` call with reason "no-active-policy" when ' +
      'isConnectionPolicyActive(store, connection) is false -- the UX-level guard against a toggle that would ' +
      'be silently inert.',
  );
  assert.ok(
    /if\s*\(\s*enabled\s*&&\s*!isConnectionPolicyActive/.test(body),
    'The isConnectionPolicyActive() check must be gated on `enabled` (only checked when turning MCP ON) -- ' +
      "turning MCP off must never be refused, regardless of the connection's policy state.",
  );
});

test('setConnectionPolicy refuses clearing/blanking the policy while mcpEnabled is true, but never writes mcpEnabled itself', () => {
  const body = functionBody(CREDENTIAL_STORE_SOURCE, 'setConnectionPolicy');
  assert.ok(
    /current\.mcpEnabled/.test(body) && /mcp-requires-policy/.test(body),
    'setConnectionPolicy must refuse (reason "mcp-requires-policy") setting policyId to null, or to a policy ' +
      'with no active rule, while the connection\'s mcpEnabled is true -- that would leave MCP pointing at ' +
      'nothing, the same disallowed state setMcpEnabled itself guards against from the other direction.',
  );
  assert.ok(
    !/mcpEnabled\s*:/.test(body),
    'setConnectionPolicy must never WRITE mcpEnabled (it may read current.mcpEnabled to decide whether to ' +
      'refuse) -- turning MCP on/off is setMcpEnabled\'s job alone.',
  );
});

test('setBypassPolicyForOwnQueries never reads or writes mcpEnabled or policyId -- it only ever affects the human\'s own queries', () => {
  const body = functionBody(CREDENTIAL_STORE_SOURCE, 'setBypassPolicyForOwnQueries');
  assert.ok(
    !/mcpEnabled/.test(body) && !/policyId/.test(body),
    'setBypassPolicyForOwnQueries must be a plain, unconditional setter with no reference to mcpEnabled or ' +
      "policyId -- it must never affect what MCP sees, only whether the connection's owner has switched the " +
      'policy off for their own tabs. Coupling it to either would defeat the point of it being independent.',
  );
});

test('deleteAccessPolicy turns mcpEnabled off (not just policyId: null) for any connection that pointed at the deleted policy', () => {
  const body = functionBody(CREDENTIAL_STORE_SOURCE, 'deleteAccessPolicy');
  assert.ok(
    /policyId\s*===\s*id/.test(body) && /policyId:\s*null/.test(body) && /mcpEnabled:\s*false/.test(body),
    'deleteAccessPolicy must set BOTH policyId: null AND mcpEnabled: false on every connection whose policyId ' +
      'matched the deleted policy. Clearing only policyId would leave mcpEnabled: true pointing at nothing -- ' +
      'the same disallowed state setMcpEnabled/setConnectionPolicy already guard against from the other two ' +
      'directions, reached here a third way.',
  );
});

test('getMcpAccessStatus exists and distinguishes "never enabled" from "policy went inactive"', () => {
  const body = functionBody(CREDENTIAL_STORE_SOURCE, 'getMcpAccessStatus');
  assert.ok(
    /not-enabled/.test(body) && /no-active-policy/.test(body) && /isConnectionPolicyActive\(/.test(body),
    'getMcpAccessStatus must return distinct statuses for "connection never opted in to MCP" (not-enabled) vs ' +
      '"connection is mcpEnabled but its policy currently has no active rule" (no-active-policy) -- ' +
      'control-plane-server.ts\'s assertWhitelisted relies on telling these apart to give a precise error at ' +
      'actual MCP call time, not just at toggle time.',
  );
});
