// An AI agent's expression must never change data, whichever tab it lands
// in. Session.evaluate forces allowWrites: false for the dedicated MCP tab and,
// since 2026-10-08, for a tab reviewing a request_reveal call too. Before
// that, a reveal request for `user | delete!` ran with writes allowed the
// moment it arrived (RevealRequestHandler.tsx).
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

test('agentSessionNeverWrites: the MCP tab and a reveal tab never write; an ordinary tab may', () => {
  assert.equal(agentSessionNeverWrites({ isMcpSession: true }), true);
  assert.equal(agentSessionNeverWrites({ isMcpSession: false, pendingRevealRequestId: 'r1' }), true);
  assert.equal(agentSessionNeverWrites({ isMcpSession: false }), false);
  assert.equal(agentSessionNeverWrites({ isMcpSession: false, pendingRevealRequestId: '' }), false);
});

test('a reveal-review tab evaluates with allowWrites: false even when the caller passes no options', async () => {
  const session = new Session('reveal-tab', fakeGlobalStore());
  session.pendingRevealRequestId = 'reveal-1';
  const calls = recordEvaluate(session);
  await session.evaluate();
  assert.equal(calls[0].allowWrites, false);
  assert.equal(session.isAgentSession, true);
});

test('a reveal-review tab cannot be talked into writing by an explicit allowWrites: true', async () => {
  const session = new Session('reveal-tab', fakeGlobalStore());
  session.pendingRevealRequestId = 'reveal-1';
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
