import { useEffect } from 'react';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import type { McpQueryRequest } from '../desktop';

/**
 * Registers the renderer's one handler for MCP-driven query execution (see
 * beamlynx-desktop's src/main/mcp/control-plane-server.ts, which is the
 * only thing that ever sends this request). The renderer is the only place
 * that can actually run a query into a visible tab -- main process code has
 * no access to Session/MobX state. window.beamlynxDesktop only exists
 * inside the real Electron shell, same guard as DesktopUpdateBanner.
 */
const McpBridge = () => {
  const { global } = useStores();

  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;

    // Unsubscribe on every re-run (effect deps change) or unmount --
    // without this, each re-run left the previous listener live too, so a
    // single incoming request could be handled by several stale handlers
    // at once, each closing over whatever `global` looked like when it was
    // registered. See preload/index.ts's onQueryRequest for what that
    // caused in practice.
    return window.beamlynxDesktop.mcp.onQueryRequest(async (request: McpQueryRequest) => {
      const { kind, profileId, expression, sql, variables, investigationId } = request;
      if (kind === 'build') {
        return global.explainMcpQuery({ profileId, expression });
      }
      // sql: run_sql_as_pine's SQL, which runMcpQuery converts to Pine and never runs.
      return global.runMcpQuery({ profileId, expression, sql, variables, investigationId });
    });
  }, [global]);

  // What the agent is doing, call by call, for McpActivityButton. Optional:
  // an older desktop app doesn't send it.
  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined') return;
    return window.beamlynxDesktop?.mcp.onActivity?.(event => global.applyAgentActivity(event));
  }, [global]);

  // Notes the user wrote to an investigation's agent, now received by it.
  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined') return;
    return window.beamlynxDesktop?.mcp.onNotesDelivered?.(({ investigationId, ids }) =>
      global.markNotesDelivered(investigationId, ids),
    );
  }, [global]);

  return null;
};

export default McpBridge;
