// Anonymous usage stats: a few events, sent to PostHog against a random
// install ID. Signing in (account.ts) joins that ID to the person. See
// beamlynx-plans/plans/012-know-who-uses-beamlynx.md.
//
// There are two kinds. Basic stats are always sent once the first-run screen
// is done: each launch, the sign-in choice, and who is signed in. Detailed
// stats follow the switch in Settings → Account: query counts, the database
// types added, and joining beamlynx.com visits to the person.
//
// Queries are counted, not sent one by one: each hour that had queries
// becomes one queries_run event with the counts, sent once the hour is over.
// The counts are kept in the meta table, so quitting loses nothing.
//
// What is never sent: query text, table or column names, connection hosts or
// names, result data, file paths, error messages. Every event and property is
// checked against EVENTS below, so a caller can't send anything else by
// mistake. Anything that doesn't pass is dropped without a word.
//
// This file has no Electron import, so the tests can run it on plain Node.
import { randomUUID } from 'crypto';

// The values below live in app-db's meta table.
export const META = {
  installId: 'usageStats.installId',
  // 'off' when the user turned detailed usage stats off. Absent means on.
  // Basic stats don't look at it.
  enabled: 'usageStats.enabled',
  // What the person chose on the first-run screen: 'signed-in' or 'skipped'.
  // Nothing is sent before this is set, so the screen that says what is sent
  // always comes first.
  onboarding: 'account.onboarding',
  // The signed-in person's Supabase user ID. Events use it instead of the
  // install ID.
  userId: 'account.userId',
  // This hour's query counts, as JSON: { hour, counts }. Sent once the hour
  // is over.
  queryCounts: 'usageStats.queryCounts',
} as const;

export type MetaStore = {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string | null): void;
};

// The parts of posthog-node's PostHog client used here.
export type UsageClient = {
  capture(message: { distinctId: string; event: string; properties?: Record<string, unknown>; timestamp?: Date }): void;
  alias(message: { distinctId: string; alias: string }): void;
  identify(message: { distinctId: string; properties?: Record<string, unknown> }): void;
  shutdown(timeoutMs?: number): Promise<void>;
};

export type UsageContext = { appVersion: string; os: string; arch: string };

const word = (max: number) => (v: unknown) => typeof v === 'string' && new RegExp(`^[a-z0-9_-]{1,${max}}$`).test(v);
const oneOf = (...values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);
const count = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1_000_000;

// The four query counts, by who ran the query and in which language.
const COUNT_KEYS = ['user_pine', 'user_sql', 'agent_pine', 'agent_sql'] as const;
type Counts = Partial<Record<(typeof COUNT_KEYS)[number], number>>;

// Every event that may be sent, and the properties each may carry.
export const EVENTS: Record<string, Record<string, (v: unknown) => boolean>> = {
  // Basic: sent even with the switch off.
  app_opened: {},
  sign_in_skipped: {},
  sign_in_completed: { provider: oneOf('github', 'google') },
  // Detailed: only with the switch on.
  connection_added: { database_type: word(20) },
  // Never sent as it is: counted into the hour's queries_run.
  query_run: { source: oneOf('user', 'agent'), language: oneOf('pine', 'sql') },
  queries_run: Object.fromEntries(COUNT_KEYS.map(k => [k, count])),
};
export const BASIC_EVENTS = new Set(['app_opened', 'sign_in_skipped', 'sign_in_completed']);

export type UsageStats = {
  // True unless the user turned detailed usage stats off. Says nothing about
  // whether events can be sent (no client, or onboarding not done yet).
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  onboarding(): 'signed-in' | 'skipped' | null;
  // Records the first-run choice. Sends the launch's app_opened if it was
  // held back waiting for it.
  setOnboarding(choice: 'signed-in' | 'skipped'): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  // Called once per launch.
  appOpened(): void;
  // Sends the counts of an hour that is over. Called at launch and by a timer.
  flushQueryCounts(): void;
  // The ID beamlynx.com can join this browser's visits to, after a sign-in.
  // null when detailed usage stats are off or can't be sent.
  linkId(): string | null;
  // Tells PostHog who the person is. Called at sign-in, and at each launch
  // so the name and email stay current. The first time for a person, it also
  // joins this install's earlier events to them.
  identify(user: { id: string; email?: string | null; name?: string | null }): void;
  // On sign-out: a new install ID, because PostHog joins an install ID to a
  // person for good. Without it, a second person signing in on this machine
  // would be counted as the first.
  forget(): void;
  shutdown(): Promise<void>;
};

export function createUsageStats(
  store: MetaStore,
  client: UsageClient | null,
  context: UsageContext,
  now: () => Date = () => new Date(),
): UsageStats {
  let appOpenedHeld = false;

  const installId = () => {
    let id = store.getMeta(META.installId);
    if (!id) {
      id = randomUUID();
      store.setMeta(META.installId, id);
    }
    return id;
  };
  const isEnabled = () => store.getMeta(META.enabled) !== 'off';
  const onboarding = () => {
    const value = store.getMeta(META.onboarding);
    return value === 'signed-in' || value === 'skipped' ? value : null;
  };
  const canSendBasic = () => client !== null && onboarding() !== null;
  const canSend = (event: string) => canSendBasic() && (BASIC_EVENTS.has(event) || isEnabled());

  const send = (event: string, properties: Record<string, unknown> = {}, timestamp?: Date) => {
    const allowed = EVENTS[event];
    if (!allowed || !canSend(event)) return;
    const clean: Record<string, unknown> = {};
    for (const [key, check] of Object.entries(allowed)) {
      if (check(properties[key])) clean[key] = properties[key];
    }
    try {
      client!.capture({
        distinctId: store.getMeta(META.userId) ?? installId(),
        event,
        properties: { ...clean, app_version: context.appVersion, os: context.os, arch: context.arch },
        ...(timestamp ? { timestamp } : {}),
      });
    } catch (e) {
      // Usage stats never get in the way of the app.
      console.error('[usage-stats] capture failed:', e);
    }
  };

  // The start of the current hour, as an ISO string.
  const thisHour = () => {
    const d = now();
    d.setUTCMinutes(0, 0, 0);
    return d.toISOString();
  };
  const readCounts = (): { hour: string; counts: Counts } | null => {
    try {
      const value = JSON.parse(store.getMeta(META.queryCounts) ?? 'null');
      return value && typeof value.hour === 'string' && value.counts ? value : null;
    } catch {
      return null;
    }
  };
  // Sends a finished hour's counts, stamped with that hour, and clears them.
  // `now` sends this hour's too, before signing out.
  const flushQueryCounts = (when: 'finished' | 'now' = 'finished') => {
    const saved = readCounts();
    if (!saved || (when === 'finished' && saved.hour === thisHour())) return;
    store.setMeta(META.queryCounts, null);
    send('queries_run', saved.counts, new Date(saved.hour));
  };

  const capture = (event: string, properties: Record<string, unknown> = {}) => {
    if (event !== 'query_run') return send(event, properties);
    const { source, language } = EVENTS.query_run;
    if (!canSend(event) || !source(properties.source) || !language(properties.language)) return;
    flushQueryCounts();
    const key = `${properties.source}_${properties.language}` as keyof Counts;
    const saved = readCounts() ?? { hour: thisHour(), counts: {} };
    saved.counts[key] = (saved.counts[key] ?? 0) + 1;
    store.setMeta(META.queryCounts, JSON.stringify(saved));
  };

  return {
    isEnabled,
    setEnabled: enabled => {
      store.setMeta(META.enabled, enabled ? null : 'off');
      // Counts not sent yet never will be.
      if (!enabled) store.setMeta(META.queryCounts, null);
    },
    onboarding,
    setOnboarding: choice => {
      store.setMeta(META.onboarding, choice);
      if (appOpenedHeld) {
        appOpenedHeld = false;
        send('app_opened');
      }
    },
    capture,
    appOpened: () => {
      if (onboarding() === null) appOpenedHeld = true;
      else send('app_opened');
      flushQueryCounts();
    },
    flushQueryCounts: () => flushQueryCounts(),
    linkId: () => (client && isEnabled() ? installId() : null),
    identify: user => {
      const isNew = store.getMeta(META.userId) !== user.id;
      store.setMeta(META.userId, user.id);
      if (!canSendBasic()) return;
      try {
        if (isNew) client!.alias({ distinctId: user.id, alias: installId() });
        const properties: Record<string, unknown> = {};
        if (user.email) properties.email = user.email;
        if (user.name) properties.name = user.name;
        client!.identify({ distinctId: user.id, properties });
      } catch (e) {
        console.error('[usage-stats] identify failed:', e);
      }
    },
    forget: () => {
      // This hour's queries were the person's who is signing out.
      flushQueryCounts('now');
      store.setMeta(META.userId, null);
      store.setMeta(META.installId, randomUUID());
    },
    shutdown: async () => {
      try {
        await client?.shutdown(2000);
      } catch {
        // Nothing to do: the events are lost, and that's fine.
      }
    },
  };
}
