// Sign in once, with GitHub or Google, through Supabase. It tells us who uses
// Beamlynx, and joins this install's usage stats to the person. People can
// skip it. See beamlynx-plans/plans/012-know-who-uses-beamlynx.md.
//
// The sign-in happens in the default browser, which comes back to a small
// local web server (loopback.ts). Supabase runs the PKCE flow: only this app
// holds the verifier needed to turn the browser's code into a session.
//
// The session is kept in a file in this copy's data folder (next to app-db),
// encrypted with safeStorage. Who the person is also goes in app-db's meta
// table, so the app knows it offline and never asks again. A dev build has
// its own data folder, so it has its own sign-in.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { app, BrowserWindow, ipcMain, net, safeStorage, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { PostHog } from 'posthog-node';
import { getAppDb } from './app-db-ipc';
import { startCallbackServer, type CallbackServer } from './loopback';
import { loadServiceConfig, type ServiceConfig } from './service-config';
import { createUsageStats, type MetaStore, type UsageStats } from './usage-stats';

export type Provider = 'github' | 'google';

export type AccountUser = { id: string; email: string | null; name: string | null; provider: string | null };

// What the renderer sees. Matches beamlynx-ui's desktop.d.ts AccountStatus.
export type AccountStatus = {
  // False when this build has no Supabase project (every dev build): no
  // first-run screen and no sign-in.
  available: boolean;
  user: AccountUser | null;
  onboarding: 'signed-in' | 'skipped' | null;
  usageStats: boolean;
  signingIn: boolean;
  // Whether the machine has a network connection. The first-run screen waits
  // for one: offline, sign-in can't work and nothing could be sent anyway.
  online: boolean;
};

export type SignInResult = { ok: true; status: AccountStatus } | { ok: false; reason: 'cancelled' | 'failed'; message: string };

const META_USER = 'account.user';
const META_PROFILE_SYNCED_AT = 'account.profileSyncedAt';
const PROFILE_SYNC_EVERY_MS = 24 * 60 * 60 * 1000;

let config: ServiceConfig | null = null;
let usageStats: UsageStats | null = null;
let supabase: SupabaseClient | null = null;
let pendingSignIn: CallbackServer | null = null;

// app-db can fail to open (a locked or read-only file). Usage stats and
// sign-in then quietly do nothing rather than break the app.
const metaStore: MetaStore = {
  getMeta: key => {
    try {
      return getAppDb().getMeta(key);
    } catch {
      return null;
    }
  },
  setMeta: (key, value) => {
    try {
      getAppDb().setMeta(key, value);
    } catch (e) {
      console.error('[account] could not save', key, e);
    }
  },
};

export function getUsageStats(): UsageStats {
  if (!usageStats) {
    config ??= loadServiceConfig(app.isPackaged);
    const client = config.posthogKey
      ? new PostHog(config.posthogKey, {
          host: config.posthogHost,
          flushAt: 20,
          flushInterval: 30_000,
          // The country, from the IP address. PostHog doesn't keep the
          // address itself unless the project is set to.
          disableGeoip: false,
          // Electron's fetch follows the system's proxy settings, which
          // Node's own fetch ignores.
          fetch: (url, options) => net.fetch(url, options as RequestInit) as never,
        })
      : null;
    client?.on('error', e => console.error('[usage-stats]', e));
    usageStats = createUsageStats(metaStore, client, {
      appVersion: app.getVersion(),
      os: process.platform,
      arch: process.arch,
    });
  }
  return usageStats;
}

// ---------- the session file ----------

// Supabase's storage adapter. One file holds every key Supabase stores (the
// session, and the PKCE verifier while signing in), encrypted as a whole.
// Without safeStorage (no keyring on Linux), it stays in memory: the person
// stays signed in for this run, and is still known by meta after that.
function sessionStorage() {
  const file = path.join(app.getPath('userData'), 'account-session.bin');
  let cache: Record<string, string> | null = null;
  const canEncrypt = () => safeStorage.isEncryptionAvailable();

  const load = (): Record<string, string> => {
    if (cache) return cache;
    cache = {};
    if (canEncrypt() && fs.existsSync(file)) {
      try {
        cache = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
      } catch (e) {
        console.error('[account] could not read the session file, starting signed out of Supabase:', e);
      }
    }
    return cache!;
  };
  const save = () => {
    if (!canEncrypt()) return;
    try {
      fs.writeFileSync(file, safeStorage.encryptString(JSON.stringify(cache ?? {})), { mode: 0o600 });
    } catch (e) {
      console.error('[account] could not save the session file:', e);
    }
  };

  return {
    getItem: (key: string) => load()[key] ?? null,
    setItem: (key: string, value: string) => {
      load()[key] = value;
      save();
    },
    removeItem: (key: string) => {
      delete load()[key];
      save();
    },
  };
}

function getSupabase(): SupabaseClient | null {
  config ??= loadServiceConfig(app.isPackaged);
  if (!config.supabaseUrl || !config.supabaseKey) return null;
  supabase ??= createClient(config.supabaseUrl, config.supabaseKey, {
    auth: {
      flowType: 'pkce',
      storage: sessionStorage(),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    // Electron's fetch follows the system's proxy settings, which Node's own
    // fetch ignores.
    global: { fetch: (input, init) => net.fetch(input instanceof URL ? input.href : input, init) },
  });
  return supabase;
}

// ---------- status ----------

function storedUser(): AccountUser | null {
  const raw = metaStore.getMeta(META_USER);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getAccountStatus(): AccountStatus {
  const stats = getUsageStats();
  return {
    available: getSupabase() !== null,
    user: storedUser(),
    onboarding: stats.onboarding(),
    usageStats: stats.isEnabled(),
    signingIn: pendingSignIn !== null,
    online: net.isOnline(),
  };
}

function broadcast(): void {
  const status = getAccountStatus();
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('account:changed', status);
}

function userFrom(session: Session): AccountUser {
  const u = session.user;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    id: u.id,
    email: u.email ?? text(meta.email),
    name: text(meta.full_name) ?? text(meta.name) ?? text(meta.user_name),
    provider: text(u.app_metadata?.provider),
  };
}

// ---------- the profile row ----------

// The person's row in the profiles table, which is our list of users. The
// app never touches the table: it calls record_profile, which reads who the
// person is from their sign-in. Old apps keep calling the same function
// while the table changes (supabase/README.md). Each new shape of this
// payload needs a file in supabase/tests/payloads/.
async function syncProfile(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('record_profile', {
    profile: { app_version: app.getVersion(), os: process.platform },
  });
  if (error) throw new Error(error.message);
  metaStore.setMeta(META_PROFILE_SYNCED_AT, String(Date.now()));
}

// At most once a day, while signed in: when the person was last seen, and on
// which version. Offline, or with an expired session, it waits for the next
// launch.
async function syncProfileDaily(): Promise<void> {
  const client = getSupabase();
  const user = storedUser();
  if (!client || !user) return;
  const last = Number(metaStore.getMeta(META_PROFILE_SYNCED_AT) ?? 0);
  if (Date.now() - last < PROFILE_SYNC_EVERY_MS) return;
  try {
    const { data } = await client.auth.getSession();
    if (data.session?.user.id !== user.id) return;
    await syncProfile(client);
  } catch (e) {
    console.error('[account] profile sync skipped:', e instanceof Error ? e.message : e);
  }
}

// ---------- sign in and out ----------

export async function signIn(provider: Provider): Promise<SignInResult> {
  const client = getSupabase();
  if (!client) return { ok: false, reason: 'failed', message: 'Sign-in is not available in this build.' };
  pendingSignIn?.close();

  let server: CallbackServer | null = null;
  try {
    server = await startCallbackServer();
    pendingSignIn = server;
    broadcast();

    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: server.redirectUri, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw new Error(error?.message ?? 'No sign-in address');
    await shell.openExternal(data.url);

    const result = await server.result;
    if ('error' in result) throw new Error(result.error);
    const exchanged = await client.auth.exchangeCodeForSession(
      result.code,
      result.flowId ? { flowId: result.flowId } : undefined,
    );
    if (exchanged.error || !exchanged.data.session) {
      throw new Error(exchanged.error?.message ?? 'No session');
    }

    const user = userFrom(exchanged.data.session);
    metaStore.setMeta(META_USER, JSON.stringify(user));
    const stats = getUsageStats();
    stats.setOnboarding('signed-in');
    stats.identify(user);
    stats.capture('sign_in_completed', { provider });
    syncProfile(client).catch(e => console.error('[account] profile sync failed:', e));
    return { ok: true, status: getAccountStatus() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const cancelled = message === 'Sign-in cancelled';
    if (!cancelled) console.error('[account] sign-in failed:', message);
    return { ok: false, reason: cancelled ? 'cancelled' : 'failed', message };
  } finally {
    server?.close();
    if (pendingSignIn === server) pendingSignIn = null;
    broadcast();
  }
}

export function cancelSignIn(): void {
  pendingSignIn?.close();
}

export async function signOut(): Promise<AccountStatus> {
  const client = getSupabase();
  try {
    // Local: only this app's session. Works offline.
    await client?.auth.signOut({ scope: 'local' });
  } catch (e) {
    console.error('[account] sign-out:', e);
  }
  metaStore.setMeta(META_USER, null);
  metaStore.setMeta(META_PROFILE_SYNCED_AT, null);
  getUsageStats().forget();
  broadcast();
  return getAccountStatus();
}

// ---------- wiring ----------

export function registerAccountIpc(): void {
  ipcMain.handle('account:status', () => getAccountStatus());
  ipcMain.handle('account:sign-in', (_event, provider: Provider) =>
    provider === 'github' || provider === 'google'
      ? signIn(provider)
      : { ok: false, reason: 'failed', message: 'Unknown provider' },
  );
  ipcMain.handle('account:cancel-sign-in', () => cancelSignIn());
  ipcMain.handle('account:sign-out', () => signOut());
  ipcMain.handle('account:skip', () => {
    const stats = getUsageStats();
    stats.setOnboarding('skipped');
    stats.capture('sign_in_skipped');
    broadcast();
    return getAccountStatus();
  });
  ipcMain.handle('account:set-usage-stats', (_event, enabled: boolean) => {
    getUsageStats().setEnabled(enabled === true);
    broadcast();
    return getAccountStatus();
  });
  // From the renderer: checked against usage-stats.ts's EVENTS, so nothing
  // else can be sent.
  ipcMain.on('usage-stats:capture', (_event, name: unknown, properties: unknown) => {
    if (typeof name !== 'string') return;
    getUsageStats().capture(name, properties && typeof properties === 'object' ? (properties as Record<string, unknown>) : {});
  });
}

// Once per launch, after the window is up.
export function onAppStarted(): void {
  getUsageStats().appOpened();
  void syncProfileDaily();
}

export async function shutdownAccount(): Promise<void> {
  pendingSignIn?.close();
  await usageStats?.shutdown();
}
