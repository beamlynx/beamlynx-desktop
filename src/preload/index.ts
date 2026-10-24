// Intentionally minimal: the UI talks to the bundled server via plain
// fetch() (see beamlynx-ui/store/client.ts), same as it does against a
// Docker-run server today. Only the server's URL comes from here, because a
// dev build uses a different port than the installed app. The one thing the web
// UI genuinely can't do itself is know about Electron's auto-update
// lifecycle (see src/main/auto-update.ts) -- that's exposed here so
// beamlynx-ui can show it in-app instead of it being silent/console-only.
import type { PolicyProposal } from '../main/mcp/policy-proposals';
import { contextBridge, ipcRenderer } from 'electron';
import type { AppDbStatus, Recipe, RecipeInputDef, StartupState } from '../main/app-db';
import type { AccountStatus, SignInResult } from '../main/account';
import type { UpdateStatus } from '../main/auto-update';
import type {
  AccessPolicy,
  AccessPolicyModule,
  AccessPolicyRule,
  CredentialsStatus,
  GetConnectionResult,
  SaveConnectionInput,
  SaveConnectionResult,
  SavedConnectionMeta,
  AttachTemplateResult,
  SetAgentAccessResult,
  SetMcpEnabledResult,
} from '../main/credential-store';
// Matches beamlynx-ui's desktop.d.ts McpQueryRequest -- kept as a hand-mirrored
// type across the repo boundary, same convention as the credential types above.
type McpQueryRequest = {
  requestId: string;
  kind: 'eval' | 'build';
  profileId: string;
  expression: string;
  variables?: Record<string, unknown>;
  sql?: string;
  investigationId?: string;
};

// Matches beamlynx-ui's desktop.d.ts AgentActivity -- see
// src/main/mcp/activity.ts, the source of truth for the shape.
type AgentActivity = {
  id: string;
  tool: string;
  phase: 'start' | 'end';
  at: number;
  summary: string;
  detail?: string;
  ok?: boolean;
  outcome?: string;
  investigationId?: string;
};

// Matches beamlynx-ui's desktop.d.ts RevealRequest/RevealOutcome -- see
// src/main/mcp/reveal-requests.ts, the source of truth for both shapes.
type RevealRequest = {
  id: string;
  profileId: string;
  expression: string;
  reason?: string;
  createdAt: number;
  status: 'pending' | 'revealed' | 'declined';
  investigationId?: string;
};
type RevealOutcome =
  | { ok: true; expression: string; columns: unknown; rows: unknown }
  | { ok: false; comment?: string };

// Passed by main through webPreferences.additionalArguments (see createWindow).
const pineServerUrl = process.argv
  .find(arg => arg.startsWith('--pine-server-url='))
  ?.slice('--pine-server-url='.length);
// The bundled server's launch token, sent by beamlynx-ui as
// `Authorization: Bearer` on every request (main's launch-secrets.ts).
const pineServerToken = process.argv
  .find(arg => arg.startsWith('--pine-server-token='))
  ?.slice('--pine-server-token='.length);

contextBridge.exposeInMainWorld('beamlynxDesktop', {
  pineServerUrl,
  pineServerToken,
  isDevBuild: process.argv.includes('--dev-build'),
  onUpdateStatus: (callback: (status: UpdateStatus) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  restartToUpdate: () => ipcRenderer.send('restart-to-update'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  // The app's own data in SQLite (src/main/app-db.ts). Preference values are
  // the JSON text the renderer would otherwise put in localStorage.
  appDb: {
    // Blocks while the main process reads the file. Called once, at startup.
    loadStartupState: (): StartupState => ipcRenderer.sendSync('app-db:load-startup-state'),
    status: (): Promise<AppDbStatus> => ipcRenderer.invoke('app-db:status'),
    loadPreferences: (): Promise<Record<string, string>> => ipcRenderer.invoke('app-db:load-preferences'),
    setPreferences: (changes: Record<string, string | null>): Promise<void> =>
      ipcRenderer.invoke('app-db:set-preferences', changes),
    getColumnWidths: (connection: string): Promise<Record<string, number>> =>
      ipcRenderer.invoke('app-db:get-column-widths', connection),
    setColumnWidths: (connection: string, changes: Record<string, number | null>): Promise<void> =>
      ipcRenderer.invoke('app-db:set-column-widths', connection, changes),
    markImportedFromLocalStorage: (): Promise<void> => ipcRenderer.invoke('app-db:mark-imported-from-local-storage'),
  },
  // Sign in once, and usage stats (src/main/account.ts). Main keeps the
  // state; onChanged tells the UI when it changes.
  account: {
    status: (): Promise<AccountStatus> => ipcRenderer.invoke('account:status'),
    signIn: (provider: 'github' | 'google'): Promise<SignInResult> => ipcRenderer.invoke('account:sign-in', provider),
    cancelSignIn: (): Promise<void> => ipcRenderer.invoke('account:cancel-sign-in'),
    signOut: (): Promise<AccountStatus> => ipcRenderer.invoke('account:sign-out'),
    skip: (): Promise<AccountStatus> => ipcRenderer.invoke('account:skip'),
    setUsageStats: (enabled: boolean): Promise<AccountStatus> => ipcRenderer.invoke('account:set-usage-stats', enabled),
    onChanged: (callback: (status: AccountStatus) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: AccountStatus) => callback(status);
      ipcRenderer.on('account:changed', listener);
      return () => ipcRenderer.removeListener('account:changed', listener);
    },
  },
  // One usage event. Main sends only the events and properties it knows
  // (src/main/usage-stats.ts), and only when usage stats are on.
  captureUsage: (event: string, properties?: Record<string, string>) =>
    ipcRenderer.send('usage-stats:capture', event, properties ?? {}),
  // Saved recipes (src/main/app-db.ts). They are global: every recipe is
  // offered on every database. Pass the current connection when saving a
  // new one, to record where it was saved from.
  recipes: {
    list: (): Promise<Recipe[]> => ipcRenderer.invoke('recipes:list'),
    find: (text: string): Promise<Recipe[]> => ipcRenderer.invoke('recipes:find', text),
    get: (id: string): Promise<Recipe | null> => ipcRenderer.invoke('recipes:get', id),
    save: (
      input: { id?: string; title: string; explanation?: string; expression: string; inputs?: RecipeInputDef[] },
      connectionId?: string,
    ): Promise<Recipe> => ipcRenderer.invoke('recipes:save', input, connectionId),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('recipes:delete', id),
  },
  credentials: {
    status: (): Promise<CredentialsStatus> => ipcRenderer.invoke('credentials:status'),
    list: (): Promise<SavedConnectionMeta[]> => ipcRenderer.invoke('credentials:list'),
    pickSqliteFile: (): Promise<string | null> => ipcRenderer.invoke('credentials:pick-sqlite-file'),
    save: (input: SaveConnectionInput): Promise<SaveConnectionResult> =>
      ipcRenderer.invoke('credentials:save', input),
    get: (id: string): Promise<GetConnectionResult> => ipcRenderer.invoke('credentials:get', id),
    delete: (id: string): Promise<void> => ipcRenderer.invoke('credentials:delete', id),
    setMcpEnabled: (id: string, enabled: boolean): Promise<SetMcpEnabledResult> =>
      ipcRenderer.invoke('credentials:set-mcp-enabled', id, enabled),
    // A fresh copy of a template as the connection's own policy, or none.
    // What agents can do on a connection: off, masked by its policy, or
    // every column. Masked without a policy needs the template to start
    // from.
    setAgentAccess: (
      id: string,
      access: 'off' | 'masked' | 'every-column',
      templateId?: string,
    ): Promise<SetAgentAccessResult> => ipcRenderer.invoke('credentials:set-agent-access', id, access, templateId),
    attachTemplate: (id: string, templateId: string | null): Promise<AttachTemplateResult> =>
      ipcRenderer.invoke('credentials:attach-template', id, templateId),
    setApplyPolicyToOwnQueries: (id: string, apply: boolean): Promise<SavedConnectionMeta | null> =>
      ipcRenderer.invoke('credentials:set-apply-policy-for-own-queries', id, apply),
    rename: (id: string, label: string): Promise<SavedConnectionMeta | null> =>
      ipcRenderer.invoke('credentials:rename', id, label),
  },
  // Access policies: templates, and each connection's own policy (the one
  // with its connectionId). The rule calls work on both. create and delete
  // are for templates; credentials.attachTemplate above gives a connection
  // its own copy of one. See credential-store.ts.
  accessPolicy: {
    list: (): Promise<AccessPolicy[]> => ipcRenderer.invoke('access-policy:list'),
    create: (name: string): Promise<AccessPolicy> => ipcRenderer.invoke('access-policy:create', name),
    rename: (id: string, name: string): Promise<AccessPolicy | null> =>
      ipcRenderer.invoke('access-policy:rename', id, name),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('access-policy:delete', id),
    addRule: (policyId: string, rule: AccessPolicyRule): Promise<AccessPolicy | null> =>
      ipcRenderer.invoke('access-policy:add-rule', policyId, rule),
    removeRule: (policyId: string, ruleId: string): Promise<AccessPolicy | null> =>
      ipcRenderer.invoke('access-policy:remove-rule', policyId, ruleId),
    setRuleEnabled: (policyId: string, ruleId: string, enabled: boolean): Promise<AccessPolicy | null> =>
      ipcRenderer.invoke('access-policy:set-rule-enabled', policyId, ruleId, enabled),
    setRules: (policyId: string, rules: AccessPolicyModule[]): Promise<AccessPolicy | null> =>
      ipcRenderer.invoke('access-policy:set-rules', policyId, rules),
  },
  // See src/main/mcp/render-bridge.ts -- main sends the request, this
  // process runs `handler` and reports the result back correlated by
  // requestId. Only one handler is meant to be live at a time -- returning
  // an unsubscribe function (same pattern as onUpdateStatus/onDeepLink
  // above) is what makes that actually true. Without it (the original
  // version of this function, which called ipcRenderer.on with no way to
  // remove it), McpBridge.tsx's effect re-running for any reason -- React
  // Strict Mode's double-invoke, or a Fast Refresh during dev -- piled up
  // another listener on top of the last one instead of replacing it. Every
  // stale listener still fires on each new request, each closing over
  // whatever `handler` (and its captured GlobalStore) looked like at the
  // moment it was registered -- so a sufficiently long dev session could
  // intermittently get a response from a handler that predates a since-added
  // method, throwing "X is not a function" for what looks like no reason,
  // depending on which listener's response the main process happens to
  // receive first for a given request.
  mcp: {
    getSetupInfo: (): Promise<{ name: string; command: string; args: string[] }> => ipcRenderer.invoke('mcp:get-setup-info'),
    onQueryRequest: (handler: (request: McpQueryRequest) => Promise<unknown>) => {
      const listener = async (_event: Electron.IpcRendererEvent, request: McpQueryRequest) => {
        try {
          const result = await handler(request);
          // handler() returns MobX-observable state (Session.columns/rows are
          // observable fields -- see beamlynx-ui's store/mcp-query.ts), and
          // Electron's IPC send() uses the structured clone algorithm, which
          // cannot clone a MobX Proxy -- confirmed empirically: it throws
          // "An object could not be cloned." synchronously at the send()
          // call below if passed one directly. A JSON round-trip forces a
          // plain, guaranteed-cloneable copy; query results are inherently
          // JSON-shaped data anyway, so this loses nothing.
          const safeResult = JSON.parse(JSON.stringify(result));
          ipcRenderer.send('mcp:query-response', { requestId: request.requestId, ok: true, result: safeResult });
        } catch (e) {
          ipcRenderer.send('mcp:query-response', {
            requestId: request.requestId,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      };
      ipcRenderer.on('mcp:query-request', listener);
      return () => ipcRenderer.removeListener('mcp:query-request', listener);
    },
    // Each MCP tool call as it starts and ends (see src/main/mcp/activity.ts),
    // so the app can show that an agent is working.
    onActivity: (callback: (event: AgentActivity) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, activity: AgentActivity) => callback(activity);
      ipcRenderer.on('mcp:activity', listener);
      return () => ipcRenderer.removeListener('mcp:activity', listener);
    },
    // A note for one investigation's agent, delivered with its next call
    // (see src/main/mcp/investigations.ts). Null for an empty note.
    addNote: (investigationId: string, text: string): Promise<{ id: string; text: string; at: number } | null> =>
      ipcRenderer.invoke('mcp:investigation-note', investigationId, text),
    // Which notes the agent has now received.
    onNotesDelivered: (callback: (event: { investigationId: string; ids: string[] }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, delivered: { investigationId: string; ids: string[] }) =>
        callback(delivered);
      ipcRenderer.on('mcp:notes-delivered', listener);
      return () => ipcRenderer.removeListener('mcp:notes-delivered', listener);
    },
    // An agent's proposed change to its connection's access policy (see
    // src/main/mcp/policy-proposals.ts), already checked against that
    // policy. beamlynx-ui shows it as a card and applies it, through
    // accessPolicy.* above, only when the user clicks Apply.
    onPolicyProposal: (callback: (proposal: PolicyProposal) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, proposal: PolicyProposal) => callback(proposal);
      ipcRenderer.on('mcp:policy-proposal', listener);
      return () => ipcRenderer.removeListener('mcp:policy-proposal', listener);
    },
    // A proposal nobody answered in time. The agent stopped waiting.
    onPolicyProposalExpired: (callback: (id: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, id: string) => callback(id);
      ipcRenderer.on('mcp:policy-proposal-expired', listener);
      return () => ipcRenderer.removeListener('mcp:policy-proposal-expired', listener);
    },
    // The user's answer, after the changes were applied, or not. False when
    // the agent no longer waits for it.
    resolvePolicyProposal: (id: string, outcome: { applied: boolean; comment?: string }): Promise<boolean> =>
      ipcRenderer.invoke('mcp:policy-proposal-resolve', id, outcome),
  },
  // control-plane-server.ts's POST /reveal (behind the MCP request_reveal
  // tool) creates a request and fires 'mcp:reveal-request' here rather than
  // awaiting a response the way onQueryRequest above does -- a human review
  // can take minutes, far past what one HTTP call should block on. onRequest
  // is how RevealRequestHandler.tsx (beamlynx-ui) learns a new one arrived,
  // so it can open a real tab for the owner to look at; resolve is how
  // RevealRequestBanner.tsx reports back what the owner decided, which
  // check_reveal (the matching poll-side MCP tool) then reads.
  mcpReveal: {
    onRequest: (callback: (request: RevealRequest) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, request: RevealRequest) => callback(request);
      ipcRenderer.on('mcp:reveal-request', listener);
      return () => ipcRenderer.removeListener('mcp:reveal-request', listener);
    },
    resolve: (id: string, outcome: RevealOutcome): Promise<RevealRequest | null> =>
      ipcRenderer.invoke('mcp:reveal-resolve', id, outcome),
  },
  onDeepLink: (callback: (params: { connection?: string; expression?: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, params: { connection?: string; expression?: string }) =>
      callback(params);
    ipcRenderer.on('deep-link:open-query', listener);
    return () => ipcRenderer.removeListener('deep-link:open-query', listener);
  },
  // Lets main flush a deep link that arrived before this window's renderer
  // had mounted DeepLinkHandler (macOS open-url can fire pre-ready; a cold
  // Linux launch has the URL in argv before anything is set up).
  notifyRendererReady: () => ipcRenderer.send('renderer:ready'),
});
