// An AI agent's expression must never change data, whichever tab it lands
// in. Session.evaluate forces allowWrites: false for an agent's tab.
//
// These call the real Session.evaluate with the plugin swapped for a stub that
// records the options it was given.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Session, agentSessionNeverWrites } = require('../store/session.ts');

const fakeGlobalStore = () => ({ connections: [], accessPolicies: [], mcpSessionId: 'session-mcp' });

function recordEvaluate(session) {
  const calls = [];
  session.plugins.default = {
    evaluate: async opts => {
      calls.push(opts);
      return [];
    },
  };
  return calls;
}

test('agentSessionNeverWrites: the MCP tab never writes; an ordinary tab may', () => {
  assert.equal(agentSessionNeverWrites({ isMcpSession: true }), true);
  assert.equal(agentSessionNeverWrites({ isMcpSession: false }), false);
});

test("an agent's tab evaluates with allowWrites: false even when the caller passes no options", async () => {
  const session = new Session('mcp', fakeGlobalStore());
  const calls = recordEvaluate(session);
  await session.evaluate();
  assert.equal(calls[0].allowWrites, false);
  assert.equal(session.isAgentSession, true);
});

test("an agent's tab cannot be talked into writing by an explicit allowWrites: true", async () => {
  const session = new Session('mcp', fakeGlobalStore());
  const calls = recordEvaluate(session);
  await session.evaluate({ allowWrites: true, applyServerPrettified: true });
  assert.equal(calls[0].allowWrites, false);
  assert.equal(calls[0].applyServerPrettified, true);
});

test("an ordinary tab's options pass through unchanged, so the person's own Run can still write", async () => {
  const session = new Session('human-tab', fakeGlobalStore());
  const calls = recordEvaluate(session);
  await session.evaluate();
  assert.equal(calls[0], undefined);
  assert.equal(session.isAgentSession, false);
});

test('a tab opened from a link stops showing the link banner after a run that succeeds, not after one that fails', async () => {
  const session = new Session('link-tab', fakeGlobalStore());
  session.openedFromLink = true;
  session.plugins.default = {
    evaluate: async () => {
      session.error = 'boom';
      return [];
    },
  };
  await session.evaluate();
  assert.equal(session.openedFromLink, true);

  session.plugins.default = {
    evaluate: async () => {
      session.error = '';
      return [];
    },
  };
  await session.evaluate();
  assert.equal(session.openedFromLink, false);
});
