import type { UsageEvent } from '../desktop';

// An event's name, then the properties that event carries.
type UsageArgs = {
  [K in UsageEvent['event']]: [K, Extract<UsageEvent, { event: K }>['properties']];
}[UsageEvent['event']];

/**
 * Sends one anonymous usage event through the desktop app, which checks it
 * against its own list and sends it only when usage stats are on (see
 * beamlynx-desktop's src/main/usage-stats.ts). Does nothing in a browser or
 * an older desktop app, and never throws: usage stats must never get in the
 * way.
 *
 * Never pass anything the user typed or saw: no query text, table names or
 * connection details. The types only allow the fixed values each event
 * carries.
 */
export const captureUsage = (...[event, properties]: UsageArgs): void => {
  try {
    if (typeof window === 'undefined') return;
    window.beamlynxDesktop?.captureUsage?.(event, properties);
  } catch {
    // Nothing to do.
  }
};
