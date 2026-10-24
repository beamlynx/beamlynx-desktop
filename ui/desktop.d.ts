// Matches beamlynx-desktop's src/preload/index.ts contextBridge API.
// Only present when running inside the real Electron shell -- guard with
// `typeof window !== 'undefined' && window.beamlynxDesktop` before use, since
// isDesktop() (store/util.ts) can be true in a plain browser dev-server run
// (NEXT_PUBLIC_DESKTOP=1 without Electron) where this doesn't exist.
import type { Recipe, SaveRecipeInput } from './utils/recipes';
import type { AccessPolicy, AccessPolicyModule, AccessPolicyRule } from './store/client';
import type { DbType } from './utils/dbType';

type DesktopUpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

type SavedConnectionMeta = {
  id: string;
  label: string;
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  // Defaults to 'postgres' for connections saved before this field existed
  // (credential-store.ts's toMeta) -- matches client.ts's own createConnection
  // default, so an old saved profile still reconnects exactly as before.
  dbType: DbType;
  createdAt: string;
  lastUsedAt: string;
  // MCP always uses this connection's own assigned policy whenever this is
  // true -- there's no "on but unprotected" state (credential-store.ts's
  // setMcpEnabled refuses turning this on unless policyId already resolves
  // to a policy with an active rule).
  mcpEnabled: boolean;
  // Which access policy (window.beamlynxDesktop.accessPolicy) applies to
  // this connection, or null for none. See client.ts's
  // effectiveAccessPolicyRules.
  policyId: string | null;
  // Whether the connection owner has switched the assigned policy ON for
  // their own (non-MCP) queries on this connection too -- MCP is
  // unconditional and never reads this. Defaults to false: the owner's own
  // session sees real data on this connection unless they opt in.
  // Undefined (older saved connections) also means false.
  applyPolicyToOwnQueries?: boolean;
  // Agent access set to "Every column": the policy stays, unapplied.
  // Undefined (an older desktop app) means false.
  agentsSeeEveryColumn?: boolean;
};

// `null` (SavedConnectionMeta's other failure shape) already means
// "connection id not found" -- refusing to enable MCP without an active
// policy is a second, distinct failure mode, so this can't reuse that.
type SetMcpEnabledResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'no-active-policy' };

// Same shape of problem as SetMcpEnabledResult, from the other direction:
// refuses attaching a template with no active rule while mcpEnabled is
// already true on that connection -- MCP must never end up behind a policy
// that decides nothing. not-found: no such connection, or no such template.
type SetAgentAccessResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' | 'needs-template' | 'no-active-policy' };

type AttachTemplateResult =
  | { ok: true; profile: SavedConnectionMeta }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'mcp-requires-policy' };

// One change in an agent's proposal, as beamlynx-desktop's
// src/main/mcp/policy-proposals.ts checked it: a rule to add, or the id of
// one of the policy's rules to remove, turn on or turn off.
type PolicyChange = { add: AccessPolicyRule } | { remove: string } | { enable: string } | { disable: string };

type PolicyProposal = {
  id: string;
  investigationId?: string;
  profileId: string;
  // The connection's own policy the changes were checked against.
  policyId: string;
  reason: string;
  changes: PolicyChange[];
};

// Sent by the main process (control-plane-server.ts) when an MCP client calls
// the run_query or complete_query MCP tool -- the renderer is the only place
// that can actually execute a query into a visible tab. See
// beamlynx-plans/completed/2026-08-15-mcp-server-and-url-scheme.md.
type McpQueryRequest = {
  requestId: string;
  kind: 'eval' | 'build';
  profileId: string;
  expression: string;
  // Values for the expression's $variables, as the agent passed them to
  // run_query. Absent from a desktop app older than variables.
  variables?: Record<string, import('./store/client').VariableValue>;
  // run_sql_as_pine's SQL, in place of an expression. runMcpQuery converts it to
  // Pine; it never runs as SQL. Absent from a desktop app older than this.
  sql?: string;
  // The Claude session it comes from (store/investigations.ts). Absent from
  // a desktop app older than investigations.
  investigationId?: string;
};

type McpQueryResult =
  | { requestId: string; ok: true; result: unknown }
  | { requestId: string; ok: false; error: string };

// Sent by the main process (control-plane-server.ts, behind the MCP
// request_reveal tool) when the connection's access policy is redacting
// something the agent says it legitimately needs -- RevealRequestHandler.tsx
// opens a real tab for the owner to review it in. See
// beamlynx-desktop's src/main/mcp/reveal-requests.ts.
// One MCP tool call starting or ending -- see beamlynx-desktop's
// src/main/mcp/activity.ts, the source of truth for this shape.
export type AgentActivity = {
  id: string;
  tool: string;
  phase: 'start' | 'end';
  at: number;
  summary: string;
  detail?: string;
  ok?: boolean;
  outcome?: string;
  // The Claude session the call came from (store/investigations.ts).
  investigationId?: string;
};

type RevealRequest = {
  id: string;
  profileId: string;
  expression: string;
  reason?: string;
  createdAt: number;
  status: 'pending' | 'revealed' | 'declined';
  // The Claude session that asked (store/investigations.ts). Absent from a
  // desktop app older than investigations.
  investigationId?: string;
};

// What RevealRequestBanner.tsx reports back once the owner decides --
// `expression` on the reveal case is whatever actually ran, which may differ
// from the request's own if the owner edited it first.
type RevealOutcome =
  | { ok: true; expression: string; columns: unknown; rows: unknown }
  | { ok: false; comment?: string };

// Matches beamlynx-desktop's StartupState (src/main/app-db.ts). Not ok when
// the file couldn't be opened; preferences then stay in localStorage.
type AppDbStartupState =
  | {
      ok: true;
      preferences: Record<string, string>;
      status: { wasReset: boolean; importedFromLocalStorage: boolean };
    }
  | { ok: false; reason: string };

type CredentialsStatus = {
  persistenceAvailable: boolean;
  linuxBackend?: string;
};

type SaveConnectionInput = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  // Optional; defaults to 'postgres' (credential-store.ts's saveConnection).
  // For 'sqlite', dbName is the database file's absolute path and the host,
  // port, user and password are empty.
  dbType?: DbType;
  // Optional; falls back to a derived `user@host:port/db` label when blank
  // or omitted.
  label?: string;
};

type SaveConnectionResult = { persisted: true; profile: SavedConnectionMeta } | { persisted: false };

type GetConnectionResult =
  | { ok: true; profile: SavedConnectionMeta; dbPassword: string }
  | { ok: false; error: 'not-found' }
  | { ok: false; error: 'decryption-failed'; profile: SavedConnectionMeta };

// Matches beamlynx-desktop's AccountStatus (src/main/account.ts).
type AccountStatus = {
  // False when the desktop build has no sign-in service (every dev build).
  available: boolean;
  user: { id: string; email: string | null; name: string | null; provider: string | null } | null;
  onboarding: 'signed-in' | 'skipped' | null;
  usageStats: boolean;
  signingIn: boolean;
  online: boolean;
};

type SignInResult = { ok: true; status: AccountStatus } | { ok: false; reason: 'cancelled' | 'failed'; message: string };

// The usage events the UI sends, with the properties each may carry. The
// desktop app sends the others itself, and drops anything it doesn't know
// (src/main/usage-stats.ts).
type UsageEvent = { event: 'query_run'; properties: { source: 'user' | 'agent'; language: 'pine' | 'sql' } };

interface BeamlynxDesktopApi {
  // Where this app's bundled pine server listens, e.g. http://localhost:33333.
  // The dev build uses a different port than the installed app, so both can
  // run at once (see beamlynx-desktop's src/main/ports.ts).
  pineServerUrl: string;
  // The bundled server's launch token, sent as `Authorization: Bearer` on
  // every request (beamlynx-desktop's launch-secrets.ts).
  pineServerToken?: string;
  // True when running from source (beamlynx-desktop's `npm start`), not an
  // installed app. Shows the DEV chip in the header (DevModeChip.tsx).
  isDevBuild: boolean;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => () => void;
  restartToUpdate: () => void;
  // Backs the Settings About section's "App version" row -- reads the
  // installed desktop app's own version, same value `beamlynx --app-version`
  // prints from the CLI. Distinct from beamlynx-ui's own version (this
  // build's package.json) and from the connected server's version
  // (GlobalStore.version) -- three separate things that happen to often
  // move together but aren't the same number.
  getAppVersion: () => Promise<string>;
  // Saved recipes. Matches beamlynx-desktop's src/preload/index.ts. Optional
  // because a desktop app older than 0.19 doesn't have them.
  recipes?: {
    list: () => Promise<Recipe[]>;
    find: (text: string) => Promise<Recipe[]>;
    get: (id: string) => Promise<Recipe | null>;
    save: (input: SaveRecipeInput, connectionId?: string) => Promise<Recipe>;
    delete: (id: string) => Promise<boolean>;
  };
  // The app's own SQLite file, where preferences live on desktop
  // (store/preferences.ts). Values are the JSON text localStorage would
  // hold. Optional because older desktop apps lack it, and loadStartupState
  // is newer still.
  appDb?: {
    // Blocks while the main process reads the file. Called once, at startup.
    loadStartupState?: () => AppDbStartupState;
    // A null value deletes the key. All changes in one call are one write.
    setPreferences: (changes: Record<string, string | null>) => Promise<void>;
    markImportedFromLocalStorage: () => Promise<void>;
    // Remembered column widths for one connection, keyed as
    // store/column-widths.ts's columnWidthKey names them.
    getColumnWidths?: (connection: string) => Promise<Record<string, number>>;
    // A null width forgets the column. The file drops the oldest past a limit.
    setColumnWidths?: (connection: string, changes: Record<string, number | null>) => Promise<void>;
  };
  credentials: {
    status: () => Promise<CredentialsStatus>;
    list: () => Promise<SavedConnectionMeta[]>;
    save: (input: SaveConnectionInput) => Promise<SaveConnectionResult>;
    get: (id: string) => Promise<GetConnectionResult>;
    delete: (id: string) => Promise<void>;
    setMcpEnabled: (id: string, enabled: boolean) => Promise<SetMcpEnabledResult>;
    // What agents can do on a connection. Masked without a policy needs the
    // template to start from. Optional: absent from an older desktop app.
    setAgentAccess?: (
      id: string,
      access: 'off' | 'masked' | 'every-column',
      templateId?: string,
    ) => Promise<SetAgentAccessResult>;
    // A fresh copy of a template as the connection's own policy, or none (null).
    attachTemplate: (id: string, templateId: string | null) => Promise<AttachTemplateResult>;
    setApplyPolicyToOwnQueries: (id: string, apply: boolean) => Promise<SavedConnectionMeta | null>;
    rename: (id: string, label: string) => Promise<SavedConnectionMeta | null>;
    // Opens the OS file chooser for a SQLite database; resolves with the
    // chosen absolute path, or null if the user cancels. Absent in a desktop
    // build that predates SQLite, so callers hide their Browse button then.
    pickSqliteFile?: () => Promise<string | null>;
  };
  // Access policies: each connection's own (with its connectionId), and the
  // templates. The rule calls work on both; create and delete are for
  // templates. See credential-store.ts and store/client.ts's
  // effectiveAccessPolicyRules.
  accessPolicy: {
    list: () => Promise<AccessPolicy[]>;
    create: (name: string) => Promise<AccessPolicy>;
    rename: (id: string, name: string) => Promise<AccessPolicy | null>;
    // Whether a template was deleted. A connection's own policy isn't.
    delete: (id: string) => Promise<boolean>;
    // By rule id. A rule for one exact column replaces any other rule for
    // that column; a built-in rule can't be removed. setRules is Undo.
    addRule: (policyId: string, rule: AccessPolicyRule) => Promise<AccessPolicy | null>;
    removeRule: (policyId: string, ruleId: string) => Promise<AccessPolicy | null>;
    setRuleEnabled: (policyId: string, ruleId: string, enabled: boolean) => Promise<AccessPolicy | null>;
    setRules: (policyId: string, rules: AccessPolicyModule[]) => Promise<AccessPolicy | null>;
  };
  // Registers the renderer's handler for MCP-driven query execution -- the
  // handler must resolve with the eventual result (or throw), the preload
  // layer reports it back to main correlated by requestId. Returns an
  // unsubscribe function (same pattern as onUpdateStatus/onDeepLink below):
  // McpBridge.tsx's effect can re-run more than once in dev (Fast Refresh,
  // React Strict Mode), and without unsubscribing first, each re-run used
  // to pile up another live listener instead of replacing it -- see
  // preload/index.ts's onQueryRequest for what that caused in practice.
  mcp: {
    // The resolved command/args to register this install as an MCP server
    // (e.g. `claude mcp add beamlynx -- <command> <args>`). Resolved at call
    // time, not baked in statically -- the executable path varies by install
    // location and packaging format (.app bundle vs. deb-installed binary).
    // `name` is the server name to register it under: "beamlynx", or
    // "beamlynx-dev" for a dev build, so both can be registered side by side.
    getSetupInfo: () => Promise<{ name: string; command: string; args: string[] }>;
    onQueryRequest: (handler: (request: McpQueryRequest) => Promise<unknown>) => () => void;
    // Each MCP tool call as it starts and ends (store/agent-activity.ts).
    // Optional: a desktop app older than the activity feed doesn't have it.
    onActivity?: (callback: (event: AgentActivity) => void) => () => void;
    // Investigations (store/investigations.ts). Optional: absent from a
    // desktop app older than them. A note waits for the agent's next call.
    addNote?: (investigationId: string, text: string) => Promise<{ id: string; text: string; at: number } | null>;
    onNotesDelivered?: (callback: (event: { investigationId: string; ids: string[] }) => void) => () => void;
    // An agent's proposed change to its connection's access policy,
    // already checked against it by the desktop app. Shown as a card;
    // applied here, through accessPolicy.*, only when the user clicks Apply.
    onPolicyProposal?: (callback: (proposal: PolicyProposal) => void) => () => void;
    // A proposal nobody answered in time. The agent stopped waiting.
    onPolicyProposalExpired?: (callback: (id: string) => void) => () => void;
    // False when the agent no longer waits for the answer.
    resolvePolicyProposal?: (id: string, outcome: { applied: boolean; comment?: string }) => Promise<boolean>;
  };
  // request_reveal/check_reveal's renderer half -- see
  // RevealRequestHandler.tsx and RevealRequestBanner.tsx. onRequest fires as
  // soon as an agent's request_reveal call is created (fire-and-forget, no
  // response for it to wait on -- see control-plane-server.ts); resolve
  // reports what the owner decided, which the agent's check_reveal poll
  // reads back.
  mcpReveal: {
    onRequest: (callback: (request: RevealRequest) => void) => () => void;
    resolve: (id: string, outcome: RevealOutcome) => Promise<RevealRequest | null>;
  };
  // Sign in once, and usage stats. Optional: absent from a desktop app
  // older than them. See FirstRunScreen.tsx and settings/AccountSection.tsx.
  account?: {
    status: () => Promise<AccountStatus>;
    signIn: (provider: 'github' | 'google') => Promise<SignInResult>;
    cancelSignIn: () => Promise<void>;
    signOut: () => Promise<AccountStatus>;
    skip: () => Promise<AccountStatus>;
    setUsageStats: (enabled: boolean) => Promise<AccountStatus>;
    onChanged: (callback: (status: AccountStatus) => void) => () => void;
  };
  // One usage event (utils/usage-stats.ts). Sent only when usage stats are on.
  captureUsage?: (event: UsageEvent['event'], properties?: Record<string, string>) => void;
  // Fired when the user clicks a beamlynx:// deep link and this window is
  // the one that ends up handling it (see main/index.ts's handleDeepLink).
  onDeepLink: (callback: (params: { connection?: string; expression?: string }) => void) => () => void;
  // Call once, on mount -- flushes any deep link that arrived before this
  // window's renderer was ready to receive it.
  notifyRendererReady: () => void;
}

declare global {
  interface Window {
    beamlynxDesktop?: BeamlynxDesktopApi;
  }
}

export type {
  DesktopUpdateStatus,
  SavedConnectionMeta,
  SetMcpEnabledResult,
  AttachTemplateResult,
  SetAgentAccessResult,
  PolicyChange,
  PolicyProposal,
  BeamlynxDesktopApi,
  AppDbStartupState,
  CredentialsStatus,
  SaveConnectionInput,
  SaveConnectionResult,
  GetConnectionResult,
  McpQueryRequest,
  McpQueryResult,
  RevealRequest,
  RevealOutcome,
  AccountStatus,
  SignInResult,
  UsageEvent,
};
