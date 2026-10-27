import { useEffect } from 'react';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import type { McpQueryRequest, RevealRequest } from '../desktop';

/**
 * Registers every renderer handler for the MCP server, then tells the
 * desktop app they are ready (see beamlynx-desktop's
 * src/main/mcp/control-plane-server.ts). The renderer is the only place
 * that can actually run a query into a visible tab -- main process code has
 * no access to Session/MobX state. window.beamlynxDesktop only exists
 * inside the real Electron shell, same guard as DesktopUpdateBanner.
 *
 * One effect, so notifyBridgeReady comes after every subscription: until
 * it, the desktop app answers requests that need this window with 503, and
 * after it, it sends the proposals and reveal requests still waiting again.
 */
const McpBridge = () => {
  const { global } = useStores();

  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const desktop = window.beamlynxDesktop;
    const mcp = desktop.mcp;

    // Each is unsubscribed on every re-run (effect deps change) or unmount
    // -- without this, each re-run left the previous listener live too, so a
    // single incoming request could be handled by several stale handlers
    // at once, each closing over whatever `global` looked like when it was
    // registered. See preload/index.ts's onQueryRequest for what that
    // caused in practice. The optional ones are absent from an older
    // desktop app.
    const offs = [
      mcp.onQueryRequest(async (request: McpQueryRequest) => {
        const { kind, profileId, expression, sql, variables, investigationId, requestId } = request;
        if (kind === 'build') {
          return global.explainMcpQuery({ profileId, expression });
        }
        // sql: run_sql_as_pine's SQL, which runMcpQuery converts to Pine and never runs.
        return global.runMcpQuery({ profileId, expression, sql, variables, investigationId, requestId });
      }),
      // An agent's query past its time limit: stop it.
      mcp.onQueryCancel?.(({ requestId }) => global.cancelMcpQuery(requestId)),
      // What the agent is doing, call by call, for SideRail.tsx.
      mcp.onActivity?.(event => global.applyAgentActivity(event)),
      // An agent's proposed policy change: a card in its investigation, and
      // the card expiring once the agent stops waiting for it.
      mcp.onPolicyProposal?.(proposal => global.handlePolicyProposal(proposal)),
      mcp.onPolicyProposalExpired?.(id => global.expirePolicyProposal(id)),
      // An agent's request_reveal: a card in its investigation, and the
      // same expiry.
      desktop.mcpReveal.onRequest((request: RevealRequest) => {
        void global.handleRevealRequest(request);
      }),
      desktop.mcpReveal.onExpired?.(id => global.expireRevealRequest(id)),
      // Notes the user wrote to an investigation's agent, now received by it.
      mcp.onNotesDelivered?.(({ investigationId, ids }) => global.markNotesDelivered(investigationId, ids)),
    ];
    mcp.notifyBridgeReady?.();
    return () => offs.forEach(off => off?.());
  }, [global]);

  return null;
};

export default McpBridge;
