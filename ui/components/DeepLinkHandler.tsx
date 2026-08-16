import { useEffect } from 'react';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';

/**
 * Handles a beamlynx://run?connection=<id>&expression=<pine-expr> link once
 * it reaches this window (see beamlynx-desktop's src/main/index.ts
 * handleDeepLink, which resolves the cold-start/second-instance/open-url
 * cases and forwards the parsed params here over IPC). Opens a fresh tab,
 * points it at the requested saved connection, and runs the expression --
 * this is the human-facing counterpart to McpBridge's MCP-facing path,
 * and deliberately Pine-expression-only, same reasoning as store/mcp-query.ts.
 */
const DeepLinkHandler = () => {
  const { global } = useStores();

  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;

    window.beamlynxDesktop.notifyRendererReady();

    return window.beamlynxDesktop.onDeepLink(async ({ connection, expression }) => {
      global.addTab();
      const session = global.sessions[global.activeSessionId];
      if (!session) return;

      if (connection) {
        try {
          await global.connectToSavedProfile(connection);
        } catch (e) {
          console.error('[deep-link] failed to connect to saved profile ->', e);
          return;
        }
      }

      if (expression) {
        runInAction(() => {
          session.expression = expression;
        });
        session.evaluate().catch(e => console.error('[deep-link] evaluate failed ->', e));
      }
    });
  }, [global]);

  return null;
};

export default DeepLinkHandler;
