import { useEffect } from 'react';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import type { RevealRequest } from '../desktop';

/**
 * Handles an MCP agent's request_reveal call once it reaches this window
 * (see beamlynx-desktop's src/main/mcp/control-plane-server.ts, which
 * creates the request and fires 'mcp:reveal-request' over IPC -- fire and
 * forget, there is no response for main to wait on here). Opens a fresh tab
 * on the same connection, pre-filled with the agent's proposed expression,
 * and tags the session with the request id so RevealRequestBanner.tsx knows
 * to show its review controls there. The human-facing counterpart to
 * McpBridge's MCP-facing path -- same shape as DeepLinkHandler, plus the
 * request-id tag that lets the owner's decision find its way back to the
 * agent's check_reveal poll.
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
      global.addTab();
      const session = global.sessions[global.activeSessionId];
      if (!session) return;

      runInAction(() => {
        session.pendingRevealRequestId = request.id;
        session.revealReason = request.reason;
      });

      try {
        await global.connectToSavedProfile(request.profileId);
      } catch (e) {
        console.error('[reveal-request] failed to connect to saved profile ->', e);
        // Without this, a connect failure left the tab permanently tagged
        // pending with no way to resolve it -- the agent's check_reveal
        // poll would spin forever, and the owner would see a banner they
        // can't act on to make it stop. Decline it on their behalf instead,
        // with a comment explaining why, so the agent finds out and can
        // retry once the connection issue is fixed.
        runInAction(() => {
          session.pendingRevealRequestId = undefined;
          session.revealReason = undefined;
        });
        await global.resolveRevealRequest(request.id, {
          ok: false,
          comment: `Could not connect to this database: ${e instanceof Error ? e.message : String(e)}`,
        });
        return;
      }

      runInAction(() => {
        session.expression = request.expression;
      });
      session.evaluate().catch(e => console.error('[reveal-request] evaluate failed ->', e));
    });
  }, [global]);

  return null;
};

export default RevealRequestHandler;
