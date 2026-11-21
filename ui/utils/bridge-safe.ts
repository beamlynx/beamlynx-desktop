/**
 * A copy of `value` made of plain data only, safe to hand to the desktop
 * app.
 *
 * What the page returns to the desktop app's preload script is copied by
 * Electron's contextBridge, which can't copy a MobX observable (a Proxy).
 * The copy fails with "An object could not be cloned." before the preload
 * can make its own plain copy. That failed agents' queries in Oct 2026: a
 * result carried an object read from session state (Session.evalHiddenColumn's
 * `table`), and every query that touched a masked column came back with that
 * error instead of an answer.
 *
 * What crosses is JSON-shaped already (rows, columns, messages), so a JSON
 * round trip loses nothing. `undefined` stays undefined.
 */
export function bridgeSafe<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}
