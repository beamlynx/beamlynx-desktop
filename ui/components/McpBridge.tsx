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

    window.beamlynxDesktop.mcp.onQueryRequest(async (request: McpQueryRequest) => {
      const { kind, profileId, expression } = request;
      if (kind === 'build') {
        return global.explainMcpQuery({ profileId, expression });
      }
      return global.runMcpQuery({ profileId, expression });
    });
  }, [global]);

  return null;
};

export default McpBridge;
