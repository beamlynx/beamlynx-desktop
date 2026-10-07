// Who may call the MCP control plane. Kept free of electron imports so the
// tests can require it in plain Node.
import type { IncomingHttpHeaders } from 'http';
import { bearerMatches } from '../launch-secrets';

/**
 * Why a request to the control plane is refused, or null to let it through.
 *
 * - A request with an Origin header came from a web page. The --mcp relay
 *   never sends one.
 * - Every other request must carry this launch's token. Any program on the
 *   machine can reach the port; only the relay, which reads the token from a
 *   file only this user can read, can use it.
 */
export function authorizeControlPlaneRequest(
  headers: IncomingHttpHeaders,
  token: string,
): { status: number; error: string } | null {
  if (headers.origin !== undefined) {
    return { status: 403, error: 'Requests from web pages are not allowed' };
  }
  if (!bearerMatches(headers.authorization, token)) {
    return { status: 401, error: 'Missing or wrong control-plane token' };
  }
  return null;
}
