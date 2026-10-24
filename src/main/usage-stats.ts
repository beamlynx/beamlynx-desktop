// Anonymous usage stats: a few events, sent to PostHog against a random
// install ID. Signing in (account.ts) joins that ID to the person. See
// beamlynx-plans/plans/012-know-who-uses-beamlynx.md.
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
  // 'off' when the user turned usage stats off. Absent means on.
  enabled: 'usageStats.enabled',
  // What the person chose on the first-run screen: 'signed-in' or 'skipped'.
  // Nothing is sent before this is set, so turning usage stats off there
  // means nothing was ever sent.
  onboarding: 'account.onboarding',
  // The signed-in person's Supabase user ID. Events use it instead of the
  // install ID.
  userId: 'account.userId',
} as const;

export type MetaStore = {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string | null): void;
};

// The parts of posthog-node's PostHog client used here.
export type UsageClient = {
  capture(message: { distinctId: string; event: string; properties?: Record<string, unknown> }): void;
  alias(message: { distinctId: string; alias: string }): void;
  identify(message: { distinctId: string; properties?: Record<string, unknown> }): void;
  shutdown(timeoutMs?: number): Promise<void>;
};

export type UsageContext = { appVersion: string; os: string; arch: string };

const word = (max: number) => (v: unknown) => typeof v === 'string' && new RegExp(`^[a-z0-9_-]{1,${max}}$`).test(v);
const oneOf = (...values: string[]) => (v: unknown) => typeof v === 'string' && values.includes(v);

// Every event that may be sent, and the properties each may carry.
export const EVENTS: Record<string, Record<string, (v: unknown) => boolean>> = {
  app_opened: {},
  connection_added: { database_type: word(20) },
  query_run: { source: oneOf('user', 'agent'), language: oneOf('pine', 'sql') },
  sign_in_skipped: {},
  sign_in_completed: { provider: oneOf('github', 'google') },
};

export type UsageStats = {
  // True unless the user turned usage stats off. Says nothing about whether
  // events can be sent (no client, or onboarding not done yet).
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  onboarding(): 'signed-in' | 'skipped' | null;
  // Records the first-run choice. Sends the launch's app_opened if it was
  // held back waiting for it.
  setOnboarding(choice: 'signed-in' | 'skipped'): void;
  capture(event: string, properties?: Record<string, unknown>): void;
  // Called once per launch.
  appOpened(): void;
  // Joins this install's earlier events to the person.
  identify(user: { id: string; email?: string | null; name?: string | null }): void;
  // On sign-out: a new install ID, because PostHog joins an install ID to a
  // person for good. Without it, a second person signing in on this machine
  // would be counted as the first.
  forget(): void;
  shutdown(): Promise<void>;
};

export function createUsageStats(store: MetaStore, client: UsageClient | null, context: UsageContext): UsageStats {
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
  const canSend = () => client !== null && isEnabled() && onboarding() !== null;

  const capture = (event: string, properties: Record<string, unknown> = {}) => {
    const allowed = EVENTS[event];
    if (!allowed || !canSend()) return;
    const clean: Record<string, unknown> = {};
    for (const [key, check] of Object.entries(allowed)) {
      if (check(properties[key])) clean[key] = properties[key];
    }
    try {
      client!.capture({
        distinctId: store.getMeta(META.userId) ?? installId(),
        event,
        properties: { ...clean, app_version: context.appVersion, os: context.os, arch: context.arch },
      });
    } catch (e) {
      // Usage stats never get in the way of the app.
      console.error('[usage-stats] capture failed:', e);
    }
  };

  return {
    isEnabled,
    setEnabled: enabled => store.setMeta(META.enabled, enabled ? null : 'off'),
    onboarding,
    setOnboarding: choice => {
      store.setMeta(META.onboarding, choice);
      if (appOpenedHeld) {
        appOpenedHeld = false;
        capture('app_opened');
      }
    },
    capture,
    appOpened: () => {
      if (onboarding() === null) appOpenedHeld = true;
      else capture('app_opened');
    },
    identify: user => {
      store.setMeta(META.userId, user.id);
      if (!client || !isEnabled()) return;
      try {
        client.alias({ distinctId: user.id, alias: installId() });
        const properties: Record<string, unknown> = {};
        if (user.email) properties.email = user.email;
        if (user.name) properties.name = user.name;
        client.identify({ distinctId: user.id, properties });
      } catch (e) {
        console.error('[usage-stats] identify failed:', e);
      }
    },
    forget: () => {
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
