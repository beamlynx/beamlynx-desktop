import { coerce, valid } from 'semver';

/**
 * A pine-lang version string in a form semver can compare, or null when it
 * has none. `0.48.1` and `v0.48.1` stay as they are, `0.48` becomes
 * `0.48.0`, and `dev` or a missing value is null.
 *
 * semver.lt throws on anything that isn't a full version. The version check
 * used to call it on the raw string; a throw there was caught as a failed
 * connection, so a running server showed as "No connection to Pine server".
 */
export const normalizeServerVersion = (version: unknown): string | null => {
  if (typeof version !== 'string' || !version.trim()) return null;
  return valid(version.trim()) ?? coerce(version)?.version ?? null;
};
