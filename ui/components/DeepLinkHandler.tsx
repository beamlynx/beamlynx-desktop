import { useEffect } from 'react';
import { runInAction } from 'mobx';
import { useStores } from '../store/store-container';
import { isDesktop } from '../store/util';

/**
 * Handles a beamlynx://run?connection=<id>&expression=<pine-expr> link once
 * it reaches this window (see beamlynx-desktop's src/main/index.ts
 * handleDeepLink, which resolves the cold-start/second-instance/open-url
 * cases and forwards the parsed params here over IPC). Opens a fresh tab,
 * points it at the requested saved connection, and puts the expression in
 * the editor -- this is the human-facing counterpart to McpBridge's
 * MCP-facing path, and deliberately Pine-expression-only, same reasoning as
 * store/mcp-query.ts.
 *
 * It does not run the expression. Any web page, email or chat message can
 * carry such a link, and the browser's "Open beamlynx?" prompt doesn't show
 * what it would do -- `user | delete!` would otherwise run the moment the
 * person clicked. The tab shows LinkOpenedBanner instead, and the person
 * presses Run once they've checked the expression and the connection.
 */

// Longer than any expression a person would share as a link.
const MAX_LINK_EXPRESSION_LENGTH = 10000;
const DeepLinkHandler = () => {
  const { global } = useStores();

  useEffect(() => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;

    window.beamlynxDesktop.notifyRendererReady();

    return window.beamlynxDesktop.onDeepLink(async ({ connection, expression }) => {
      if (expression && expression.length > MAX_LINK_EXPRESSION_LENGTH) {
        console.warn(`[deep-link] ignored: expression longer than ${MAX_LINK_EXPRESSION_LENGTH} characters`);
        return;
      }
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
        // Setting the expression starts the usual build, so hints and the
        // canvas show what the query would do. Nothing is evaluated.
        runInAction(() => {
          session.expression = expression;
          session.openedFromLink = true;
        });
      }
    });
  }, [global]);

  return null;
};

export default DeepLinkHandler;
