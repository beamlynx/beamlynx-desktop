import { useEffect } from 'react';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import type { RevealRequest } from '../desktop';

/**
 * Handles an MCP agent's request_reveal call once it reaches this window
 * (see beamlynx-desktop's src/main/mcp/control-plane-server.ts, which
 * creates the request and fires 'mcp:reveal-request' over IPC -- fire and
 * forget, there is no response for main to wait on here). Creates a
 * dedicated review session, pre-filled with the agent's proposed expression,
 * and tags it with the request id so RevealRequestBanner.tsx knows to show
 * its review controls there and PineTabs.tsx renders it as one of the
 * pinned tabs at the strip's end (GlobalStore.pendingRevealSessionIds)
 * rather than a regular one. Deliberately NOT global.addTab(): that would
 * set activeSessionId to it, hijacking whatever tab the human is currently
 * looking at -- the same "never hijack" rule mcpSessionId's own comment
 * states, just applying to a reveal request instead of an MCP query.
 * Likewise ensureProfileConnection instead of connectToSavedProfile, which
 * assigns to the ACTIVE session for the same reason addTab is wrong here.
 * The human-facing counterpart to McpBridge's MCP-facing path -- same shape
 * as DeepLinkHandler, plus the request-id tag that lets the owner's
 * decision find its way back to the agent's check_reveal poll.
 *
 * This tab is a normal, non-MCP session, so it evaluates under
 * Session.accessPolicyRules' human branch -- real, unredacted data by
 * default (see client.ts's effectiveAccessPolicyRules), unless the owner
 * has opted this connection into applyPolicyToOwnQueries themselves. That's
 * what actually lets the owner see the real values before deciding whether
 * to reveal them.
 */
const RevealRequestHandler = () => {
  const { global } = useStores();

  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;

    return window.beamlynxDesktop.mcpReveal.onRequest(async (request: RevealRequest) => {
      // One action, not create-then-tag: see createRevealSession's own
      // comment for why a separate runInAction after createSession would
      // briefly flash this tab as a regular one in the user's own strip.
      const session = global.createRevealSession(request.id, request.reason);

      let connectionId: string;
      try {
        connectionId = await global.ensureProfileConnection(request.profileId);
      } catch (e) {
        console.error('[reveal-request] failed to connect to saved profile ->', e);
        // Without this, a connect failure left the tab permanently tagged
        // pending with no way to resolve it -- the agent's check_reveal
        // poll would spin forever, and the owner would see a pinned tab
        // they can't act on to make it stop. Decline it on their behalf
        // instead, with a comment explaining why, so the agent finds out
        // and can retry once the connection issue is fixed -- and drop the
        // now-useless empty session entirely rather than leaving it pinned
        // with nothing to show.
        global.finishRevealSession(session.id);
        await global.resolveRevealRequest(request.id, {
          ok: false,
          comment: `Could not connect to this database: ${e instanceof Error ? e.message : String(e)}`,
        });
        return;
      }

      runInAction(() => {
        session.connectionId = connectionId;
        session.profileId = request.profileId;
        session.expression = request.expression;
      });
      session.evaluate().catch(e => console.error('[reveal-request] evaluate failed ->', e));
    });
  }, [global]);

  return null;
};

export default RevealRequestHandler;
