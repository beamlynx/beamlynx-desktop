// Parsing for beamlynx:// links. Kept free of electron imports so the tests
// can require it in plain Node.

export type DeepLinkParams = { connection?: string; expression?: string };

/**
 * The fields of a beamlynx://run link, or null for anything else.
 *
 * Only `run` is a link this app understands. Any web page can hand the OS a
 * beamlynx:// URL, so everything that isn't exactly that shape is ignored
 * rather than read for whatever query parameters it happens to carry.
 * beamlynx-ui puts the expression in a new tab without running it (its
 * DeepLinkHandler.tsx).
 */
export function parseDeepLink(url: string): DeepLinkParams | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'beamlynx:') return null;
    // Non-special schemes put `run` in hostname on current Node and Chromium;
    // pathname covers a `beamlynx:run?...` form some launchers produce.
    const target = parsed.hostname || parsed.pathname.replace(/^\/+/, '');
    if (target !== 'run') return null;
    return {
      connection: parsed.searchParams.get('connection') ?? undefined,
      expression: parsed.searchParams.get('expression') ?? undefined,
    };
  } catch {
    return null;
  }
}
