import { useEffect } from 'react';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';
import type { RevealRequest } from '../desktop';

/**
 * Takes an MCP agent's request_reveal call once it reaches this window (see
 * beamlynx-desktop's src/main/mcp/control-plane-server.ts, which creates the
 * request and fires 'mcp:reveal-request' over IPC -- fire and forget). The
 * request becomes a card in the agent's investigation
 * (GlobalStore.handleRevealRequest), not a tab of its own.
 */
const RevealRequestHandler = () => {
  const { global } = useStores();

  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;
    return window.beamlynxDesktop.mcpReveal.onRequest((request: RevealRequest) => {
      void global.handleRevealRequest(request);
    });
  }, [global]);

  return null;
};

export default RevealRequestHandler;
