import { makeAutoObservable, reaction, runInAction, toJS } from 'mobx';
import { lt } from 'semver';
import {
  AccessPolicy,
  AccessPolicyModule,
  AccessPolicyRule,
  AgentAccess,
  HttpClient,
  ConnectionError,
  ConnectionInfo,
  effectiveAccessPolicyRules,
  ServerRejectedError,
  VariableValue,
} from './client';
import type { CredentialsStatus, PolicyProposal } from '../desktop';
import type { DbType } from '../utils/dbType';
import { Session, Theme, InputMode } from './session';
import { THEME_MODE, ThemeId } from '../styles/palette/tokens';
import { UiFontId, CodeFontId } from '../styles/fonts';
import { TextSize } from '../styles/text-size';
import {
  DEFAULT_NEW_LAYOUT_PANEL_HEIGHT,
  DEFAULT_NEW_LAYOUT_PANEL_WIDTH,
  DEFAULT_NEW_LAYOUT_PANE_HEIGHT,
  DEFAULT_NEW_LAYOUT_PANE_WIDTH,
  RequiredVersion,
} from '../constants';
import {
  getUserPreference,
  isBoolean,
  isFiniteNumber,
  isStringArray,
  isStringRecord,
  oneOf,
  setUserPreference,
  STORAGE_KEYS,
} from './preferences';
import { THEMES } from '../styles/palette/themes';
import { CODE_FONTS, UI_FONTS } from '../styles/fonts';
import { TEXT_SIZE_SCALE } from '../styles/text-size';
import { DevState } from './dev-state';
import { leadingDoc } from './canvas/pine-text';
import { isValuesBlock, splitExpressions } from './blocks';
import { AgentActivityStore } from './agent-activity';
import {
  DEFAULT_INVESTIGATION,
  Investigation,
  queryReason,
  snapshotOf,
} from './investigations';
import { exactColumnRule, ownHideRules, sameRules } from '../utils/accessPolicy';
import type { AgentActivity } from '../desktop';
import { getCommandById } from '../utils/commands';
import { normalizeServerVersion } from '../utils/version';
import { CONNECTION_COLOR_PALETTE, isDesktop, isDevelopment, isPlayground, pineString } from './util';
import {
  runMcpQuery as runMcpQueryImpl,
  explainMcpQuery as explainMcpQueryImpl,
} from './mcp-query';

/**
 * The subset of a Session that's worth restoring on reload: the pine/sql
 * text and enough connection context to re-run it. Deliberately excludes
 * results (rows/columns/ast/graph/etc.) -- those are re-derived by
 * re-evaluating, and persisting them would mean stashing arbitrary query
 * result data (and its DB row values) into localStorage.
 */
type PersistedSession = {
  expression: string;
  inputMode: InputMode;
  // The tab's one connection id (Session.connectionId). On desktop the saved
  // connection's id, which is random and local, so no address is saved.
  // Older desktop versions saved pine's address-based id here.
  connectionId?: string;
  // Where older desktop versions saved the saved connection's id.
  profileId?: string;
};

/**
 * The id older versions of pine gave a saved server connection, from its
 * address: `user@host:port:dbname`, or `host:port:dbname` without a user.
 * Now only read to move colours older versions stored under it
 * (migrateConnectionColors). Undefined for a SQLite file.
 */
export const pineIdOf = (c: Pick<ConnectionInfo, 'dbHost' | 'dbPort' | 'dbName' | 'dbUser'>): string | undefined =>
  c.dbHost && c.dbPort && c.dbName ? `${c.dbUser ? `${c.dbUser}@` : ''}${c.dbHost}:${c.dbPort}:${c.dbName}` : undefined;

// A database's hash, as the desktop app makes it (databaseKeyHash): SHA-256
// as 64 lowercase hex characters.
const isHashedKey = (value: string): boolean => /^[0-9a-f]{64}$/.test(value);

/**
 * The connection id a saved tab comes back with. Older desktop versions
 * saved the saved connection's id as `profileId`, and pine's address-based
 * id as `connectionId`: only the first names a saved connection, so only it
 * is used there. A desktop tab with neither comes back with no connection,
 * never a guess.
 */
const restoredConnectionId = (persisted: PersistedSession): string => {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  if (!isDesktop()) return text(persisted.connectionId);
  if ('profileId' in persisted) return text(persisted.profileId);
  return text(persisted.connectionId);
};

type PersistedSessionsState = {
  sessions: PersistedSession[];
  activeIndex: number;
};

// Thrown by connectToSavedProfile when the saved password can't be decrypted
// (e.g. connections.json copied onto a different machine/user -- safeStorage
// keys are OS/user/machine-scoped) -- distinguishable so the UI can offer to
// re-enter the password instead of showing a generic connect failure.
export class SavedConnectionNotFoundError extends Error {
  constructor() {
    super('Saved connection not found');
    this.name = 'SavedConnectionNotFoundError';
  }
}

export class DecryptionFailedError extends Error {
  constructor() {
    super('Failed to decrypt the saved password for this connection');
    this.name = 'DecryptionFailedError';
  }
}

const client = new HttpClient();

// How many investigations are kept before the oldest finished one is
// dropped (GlobalStore.dropOldInvestigations), and how long an agent must
// have been quiet for its investigation to count as finished.
export const MAX_INVESTIGATIONS = 10;
export const INVESTIGATION_IDLE_MS = 30 * 60_000;

// The desktop app's MCP bridge, or undefined: in the browser, in tests, and
// before the preload ran.
const desktopMcp = () => (typeof window === 'undefined' ? undefined : window.beamlynxDesktop?.mcp);
type ConnectionParams = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  // Defaults to 'postgres' (see client.createConnection) when omitted.
  // For 'sqlite', dbName is the database file's absolute path and the host,
  // port, user and password are empty strings.
  dbType?: DbType;
  // Desktop-only (see credentials.save) -- pine-lang itself has no concept of
  // a custom label, so this is ignored on the plain HTTP createConnection call.
  label?: string;
};

// A connection switch that's on hold because the active tab has a non-empty
// Pine expression -- switching would re-resolve it against a different
// connection's schema, so the user gets a warning (ChangeConnectionModal)
// before it's applied to the existing tab instead of it happening silently.
// Only covers switching to an already-known connection (an existing web
// session, or a desktop saved profile) -- these are the "pick a different
// connection for this tab" UI entry points (ActiveConnection.tsx,
// ConnectionsSection.tsx's switch action). Adding a brand-new connection via
// the "Add Connection" form isn't gated this way: `connect()` always assigns
// it to the active tab in place, same as before minus the silent-tab-fork.
export type PendingConnectionSwitch =
  | { kind: 'select'; connectionId: string }
  | { kind: 'connectToSavedProfile'; id: string };

export type SettingsSection = 'connections' | 'theme' | 'preferences' | 'mcp' | 'account' | 'about';

// Which edge the session tab strip runs along -- see tabOrientation below.
// Deliberately its own type rather than reusing the inline
// 'horizontal' | 'vertical' of newLayoutOrientation: the two describe
// unrelated axes (a tab strip's edge vs. the Canvas|Results split), and
// naming them apart keeps a future change to one from silently widening
// the other.
export type TabOrientation = 'horizontal' | 'vertical';

/**
 * Drops a trailing `delete:` / `d:` from a restored expression.
 *
 * pine-lang removed that operation (0.46.0), so an expression still carrying
 * it no longer parses - and in canvas mode a parse error means no
 * `ast.ranges`, which means the canvas can't segment *any* of the expression,
 * not just the last operation. A tab saved before the upgrade would come back
 * blank rather than merely missing its last word.
 *
 * A text regex, not the segment list, because the segment list comes from
 * `ast.ranges` - the parse that just failed. Anchored to a pipe so it can't
 * mangle a string literal that happens to end in `d:`.
 *
 * The expression text is the only thing that persists (see PersistedSession),
 * so this is the one place it needs doing. Removable a release or two after
 * 0.46.0 is the floor everywhere.
 */
export const stripRemovedDeleteOperation = (expression: string): string =>
  expression.replace(/\|\s*(?:delete:|d:)\s*$/i, '').trimEnd();

/**
 * How often the open tab tries its database again while it can't be
 * reached. Only the open tab: switching to another one tries that one at
 * once (see the activeSessionId reaction).
 */
export const UNREACHABLE_RETRY_MS = 10_000;
// The open tab's retry timer. Outside the store, so MobX doesn't observe it.
let unreachableRetry: ReturnType<typeof setInterval> | null = null;

export class GlobalStore {
  connecting = false;
  // There is no app-wide "current connection": each tab has its own
  // (Session.connectionId). One used to be kept here, as the connection
  // made last, and a new or reset tab took it. That tab then showed one
  // database and ran on another.
  version: string | undefined = undefined;
  /**
   * Whether the connected pine-lang is older than this UI needs. Derived from
   * `version`, so it follows the server: it used to be a flag that was set
   * once and never cleared.
   *
   * Compared on a normalised copy. semver.lt throws on a version like `dev`
   * or `0.48`, and that throw used to land in loadConnectionMetadata's
   * catch, showing a running server as "No connection". A version that
   * can't be read doesn't block the app.
   */
  get requiresUpgrade(): boolean {
    const comparable = normalizeServerVersion(this.version);
    return comparable !== null && lt(comparable, RequiredVersion);
  }
  connectionColors: Record<string, string> = {};
  connections: ConnectionInfo[] = [];
  // False until refreshConnections' first successful run. A session's
  // connectionId restores from localStorage synchronously, but `connections`
  // (needed to resolve it to a friendly saved-profile label) only loads
  // async -- without this, getConnectionLabel can't tell "no matching
  // profile" apart from "haven't checked yet" and would flash the raw
  // connection id (e.g. "localhost:5432") as if it were the name.
  connectionsLoaded = false;
  // Every access policy (credential-store.ts): each connection's own, which
  // it points at by ConnectionInfo.policyId and shares with no other
  // connection, and the templates (policyTemplates), which no query uses. Loaded alongside connections at boot (refreshAccessPolicies)
  // and re-read fresh before every MCP query (mcpQueryDeps'
  // resolveAccessPolicyRules); every session's own accessPolicyRules
  // getter reads this same shared array, so an edit here is visible to
  // every open tab on its next read.
  accessPolicies: AccessPolicy[] = [];
  // Which database the Agent page should open at, and which of its data
  // masking rules to pick out. See openAgentDatabase.
  agentDatabaseFocus: { connectionId: string; ruleId?: string } | null = null;
  credentialsStatus: CredentialsStatus | null = null;

  // Desktop-only: one investigation per Claude session that uses beamlynx
  // (store/investigations.ts), each with its own session that its
  // MCP-driven queries run in. Never the tab the human is looking at: a
  // finished query doesn't switch focus to it on its own. Its session is
  // out of the tab strip until the user opens it from the robot
  // (openInvestigationTab); then it is an ordinary tab, at the end of
  // theirs. Closing it only takes it out of the strip again.
  investigations: Investigation[] = [];
  // True from the moment an MCP-driven query finishes until its
  // investigation is next opened (openInvestigationTab clears it). It turns
  // the sidebar's robot amber: the only way to know a result landed while
  // looking at a different tab.
  mcpHasUnseenActivity = false;
  // Every MCP tool call the agent makes, as it happens (desktop only, see
  // McpBridge.tsx). SideRail shows it.
  agentActivity = new AgentActivityStore();
  // The agent's queries the desktop app sent, by its request id, so it can
  // stop one that ran past its time (cancelMcpQuery). Not observable.
  private mcpRuns = new Map<string, { sessionId: string; cancelled: boolean; started: boolean }>();
  // The longest an agent's query may hold its investigation's queue
  // (runQueuedMcpQuery): a little over the desktop app's own 60 s limit,
  // after which it should have been stopped already.
  mcpQueryDeadlineMs = 75_000;
  // The saved connections an agent's query has opened a pool for this app
  // session, so every MCP query doesn't open the pool again. See
  // store/mcp-query.ts's ensureConnection.
  private mcpOpenConnections: Record<string, true> = {};
  // Set by connectToSavedProfile on a decryption failure, so the settings
  // form can pre-fill the (still-plaintext) host/port/db/user and prompt the
  // user to just re-enter the password, instead of retyping everything.
  reconnectHint: {
    dbHost: string;
    dbPort: string;
    dbName: string;
    dbUser: string;
    dbType: DbType;
  } | null = null;

  // The connection ids that have an open pool on the server right now:
  // read from listConnections() at startup, and added to the moment a
  // connect or reconnect confirms one. Distinct from `connections`, which
  // on desktop lists every saved connection, open or not.
  liveConnectionIds: string[] = [];

  /**
   * True when the Pine server answered but refused this app (HTTP 401: a
   * launch token this app didn't send). Shown instead of "No connection",
   * which would send the person looking for a server that is running.
   */
  serverRejected: boolean = false;

  get pineConnected() {
    return DevState.pineConnected ?? !!this.version;
  }

  /** The open tab's connection id, or '' for none. */
  get activeConnectionId(): string {
    return this.sessions[this.activeSessionId]?.connectionId ?? '';
  }

  // Whether `connectionId` has an open pool on the server now, as opposed to
  // only being a tab's connection (Session.connectionId), which a tab keeps
  // across restarts while nothing is open.
  isConnectionLive = (connectionId: string): boolean =>
    !!connectionId && this.liveConnectionIds.includes(connectionId);

  activeSessionId = 'session-0';
  sessions: Record<string, Session> = {};
  virtualSession: Session | null = null;

  // Which of the three complete themes is active - see
  // styles/palette/themes.ts. Not a light/dark toggle crossed with a
  // swappable accent/surface anymore (that made every theme look like a
  // variation on the same shell - direct user feedback).
  _themeId: ThemeId;

  get themeId(): ThemeId {
    return this._themeId;
  }

  set themeId(newThemeId: ThemeId) {
    this._themeId = newThemeId;
    setUserPreference(STORAGE_KEYS.THEME, newThemeId);
  }

  // Derived, not independently settable - CodeMirror's syntax theme, graph
  // schema colors, and a few other pre-existing call sites only ever
  // supported a plain light/dark bucket, so this maps each named theme to
  // the bucket it behaves like (see styles/palette/tokens.ts's THEME_MODE).
  get theme(): Theme {
    return THEME_MODE[this._themeId];
  }

  // Interface font (--canvas-font - buttons, labels, headers, canvas node
  // text) and code font (--code-font - the query editor and results grid,
  // where monospace alignment actually matters) are independent choices.
  // See styles/fonts.ts / styles/app-font.ts.
  _uiFontFamily: UiFontId;

  get uiFontFamily(): UiFontId {
    return this._uiFontFamily;
  }

  set uiFontFamily(newFontFamily: UiFontId) {
    this._uiFontFamily = newFontFamily;
    setUserPreference(STORAGE_KEYS.UI_FONT_FAMILY, newFontFamily);
  }

  _codeFontFamily: CodeFontId;

  get codeFontFamily(): CodeFontId {
    return this._codeFontFamily;
  }

  set codeFontFamily(newFontFamily: CodeFontId) {
    this._codeFontFamily = newFontFamily;
    setUserPreference(STORAGE_KEYS.CODE_FONT_FAMILY, newFontFamily);
  }

  // Text/spacing scale across the app's own chrome (MUI theme.typography +
  // theme.spacing - see styles/theme.ts), plus the query editor and results
  // grid via --text-scale. Deliberately NOT CSS zoom (see styles/text-
  // size.ts) - resizable panel widths and the canvas are stored as literal
  // pixels, untouched by either mechanism, so this can't disturb panel
  // balance or introduce a page scrollbar the way zoom did.
  _textSize: TextSize;

  get textSize(): TextSize {
    return this._textSize;
  }

  set textSize(newTextSize: TextSize) {
    this._textSize = newTextSize;
    setUserPreference(STORAGE_KEYS.TEXT_SIZE, newTextSize);
  }

  // Vim-style navigation/editing -- global (like theme below),
  // not per-session: one Preferences toggle governs it, not a per-tab
  // choice, so it belongs here rather than on Session. It used to live on
  // Session (each instance seeding its own copy from the same underlying
  // localStorage key at construction) -- harmless for a single tab, but
  // toggling it in one already-open tab never touched any OTHER already-open
  // tab's own copy, leaving it stale until reload. Read by PineInput.tsx/
  // SqlInput.tsx (the query editor's own vim keybindings) and
  // useCanvasKeybindings.ts/useSettingsKeybindings.ts (the canvas's and
  // Settings rail's vim-style letter shortcuts).
  _vimModeEnabled: boolean;

  get vimMode(): boolean {
    return this._vimModeEnabled;
  }

  set vimMode(value: boolean) {
    this._vimModeEnabled = value;
    setUserPreference(STORAGE_KEYS.VIM_MODE, value);
  }

  toggleVimMode = () => {
    this.vimMode = !this.vimMode;
  };

  // Whether typing `|` at the end of a query, or picking a suggestion, tidies
  // the query: each step on its own line. On by default. Off, the Tidy
  // command and the button in the Pine panel do it on demand.
  _autoTidy: boolean;

  get autoTidy(): boolean {
    return this._autoTidy;
  }

  set autoTidy(value: boolean) {
    this._autoTidy = value;
    setUserPreference(STORAGE_KEYS.AUTO_TIDY, value);
  }

  toggleAutoTidy = () => {
    this.autoTidy = !this.autoTidy;
  };

  // Pine / result table coloring (segment and column tints)
  _pineTableColorsEnabled: boolean;

  get pineTableColorsEnabled(): boolean {
    return this._pineTableColorsEnabled;
  }

  set pineTableColorsEnabled(value: boolean) {
    this._pineTableColorsEnabled = value;
    setUserPreference(STORAGE_KEYS.PINE_TABLE_COLORS, value);
  }

  // Whether the SQL panel shows the hidden columns pine-lang adds so results
  // can be edited: each table's key, each JSON value's type. They are
  // fetched either way. Off by default: they make the SQL longer to read.
  _showHiddenSqlColumns: boolean;

  // The sidebar on the left (SideRail.tsx): icons only, or with labels and
  // the list of investigations. Remembered between launches.
  _sideRailExpanded: boolean;

  get sideRailExpanded(): boolean {
    return this._sideRailExpanded;
  }

  setSideRailExpanded = (expanded: boolean) => {
    this._sideRailExpanded = expanded;
    setUserPreference(STORAGE_KEYS.SIDE_RAIL_EXPANDED, expanded);
  };

  get showHiddenSqlColumns(): boolean {
    return this._showHiddenSqlColumns;
  }

  set showHiddenSqlColumns(value: boolean) {
    this._showHiddenSqlColumns = value;
    setUserPreference(STORAGE_KEYS.SHOW_HIDDEN_SQL_COLUMNS, value);
  }

  public toggleShowHiddenSqlColumns() {
    this.showHiddenSqlColumns = !this.showHiddenSqlColumns;
  }

  // Auto-run - whenever a canvas gesture commits a new, backend-confirmed-
  // valid expression, run it immediately instead of waiting for an explicit
  // Run. Global (like theme), not per-session.
  _autoRunEnabled: boolean;

  get autoRunEnabled(): boolean {
    return this._autoRunEnabled;
  }

  set autoRunEnabled(value: boolean) {
    this._autoRunEnabled = value;
    setUserPreference(STORAGE_KEYS.AUTO_RUN_ENABLED, value);
  }

  // Always true now - Canvas is the only graph editor, and New Layout (the
  // Canvas-first two-pane arrangement) is the only layout (the classic
  // node-graph widget, GraphBox, and the classic sidebar layout it lived in
  // were both removed). Kept as a named getter (rather than inlining `true`
  // at each call site) since callers read it as "is Canvas the mounted
  // graph editor", a question still worth asking by name even though the
  // answer no longer varies.
  get canvasActive(): boolean {
    return true;
  }

  // Whether New Layout's canvas pane shows an editable text panel alongside
  // it, in addition to point-and-click editing. One shared widget serves
  // both the Pine and SQL editors (Input.tsx already switches between them
  // on session.inputMode) - "Pine panel"/"SQL panel" are two different ways
  // to open the SAME panel in a given mode, not two different panels. Global
  // (like theme), not per-session - it's how you like to work, not
  // something that should vary tab to tab.
  _newLayoutPanelVisible: boolean;

  /**
   * The split sizes, in pixels. Global rather than per-tab, and held here so a
   * tab switch cannot reset them -- see the constructor. The dividers write
   * through these setters as they drag; persisting stays with the divider,
   * which already owns the storage key for each (ResizableDividers.tsx).
   */
  _newLayoutPaneWidth: number;
  _newLayoutPaneHeight: number;
  _newLayoutPanelWidth: number;
  _newLayoutPanelHeight: number;

  get newLayoutPaneWidth(): number {
    return this._newLayoutPaneWidth;
  }
  set newLayoutPaneWidth(value: number) {
    this._newLayoutPaneWidth = value;
  }
  get newLayoutPaneHeight(): number {
    return this._newLayoutPaneHeight;
  }
  set newLayoutPaneHeight(value: number) {
    this._newLayoutPaneHeight = value;
  }
  get newLayoutPanelWidth(): number {
    return this._newLayoutPanelWidth;
  }
  set newLayoutPanelWidth(value: number) {
    this._newLayoutPanelWidth = value;
  }
  get newLayoutPanelHeight(): number {
    return this._newLayoutPanelHeight;
  }
  set newLayoutPanelHeight(value: number) {
    this._newLayoutPanelHeight = value;
  }

  get newLayoutPanelVisible(): boolean {
    return this._newLayoutPanelVisible;
  }

  set newLayoutPanelVisible(value: boolean) {
    this._newLayoutPanelVisible = value;
    setUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_VISIBLE, value);
  }

  // New Layout's Canvas|Results split: side-by-side or stacked top/bottom.
  // Global (like theme), not per-session -- see NewLayoutView.tsx, which
  // also overrides this to 'vertical' on small screens regardless of what's
  // stored here.
  _newLayoutOrientation: 'horizontal' | 'vertical';

  get newLayoutOrientation(): 'horizontal' | 'vertical' {
    return this._newLayoutOrientation;
  }

  set newLayoutOrientation(value: 'horizontal' | 'vertical') {
    this._newLayoutOrientation = value;
    setUserPreference(STORAGE_KEYS.NEW_LAYOUT_ORIENTATION, value);
  }

  // Which edge the session tab strip runs along: 'horizontal' (the classic
  // strip across the top) or 'vertical' (a rail down the left, which trades
  // width for room to show more tabs and longer names without the strip
  // scrolling). Unlike newLayoutOrientation above this isn't specific to
  // New Layout's own pane arrangement. Global, not per-session, for the same
  // reason the rest of these are: it's how you like to work.
  _tabOrientation: TabOrientation;

  get tabOrientation(): TabOrientation {
    return this._tabOrientation;
  }

  set tabOrientation(value: TabOrientation) {
    this._tabOrientation = value;
    setUserPreference(STORAGE_KEYS.TAB_ORIENTATION, value);
  }

  // A graph-only, distraction-free view: the header, tab strip, and Results
  // pane all hide, leaving just Canvas (see AppView.tsx/PineTabs.tsx/
  // NewLayoutView.tsx's isZenModeActive checks). Transient, not persisted -
  // this is a momentary focus toggle for the current sitting, not a lasting
  // preference, so it always starts off on reload. Read isZenModeActive
  // below, not this field directly, in every one of those render checks.
  zenMode = false;

  // What autoRunEnabled was the instant before toggleZenMode last turned Zen
  // mode on - null whenever Zen mode is off. Not persisted, same reasoning
  // as zenMode itself; auto-run doesn't make sense while heads-down on the
  // graph (see toggleZenMode), and this is what lets turning it back off
  // hand auto-run back exactly as you left it instead of guessing a default.
  _autoRunBeforeZenMode: boolean | null = null;

  // A separate getter (rather than reading `zenMode` directly at every
  // render site) since Zen mode used to only make sense in New Layout - now
  // the only layout there is, so this is just `zenMode`, but kept named for
  // the same reason `canvasActive` is: every call site reads it as asking a
  // real question, not an implementation detail.
  get isZenModeActive(): boolean {
    return this.zenMode;
  }

  // User

  // Which panel (New Layout only) most recently held real DOM focus --
  // 'graph' | 'settings' | 'input' | null (null = nothing panel-specific
  // focused, e.g. the header). Transient, not persisted -- same reasoning as
  // zenMode above. Written by useFocusedPanelTracking.ts's document-level
  // focusin/focusout listener; read through activeKeyboardPanel below, never
  // directly -- 'settings' here doesn't necessarily mean Settings still owns
  // the keyboard (it may have since closed, or focus may have wandered
  // somewhere neither Canvas nor Input claim), and the getter is what
  // resolves that ambiguity rather than every caller re-deriving it.
  focusedPanelId: 'graph' | 'settings' | 'library' | 'input' | null = null;

  setFocusedPanelId = (id: 'graph' | 'settings' | 'library' | 'input' | null) => {
    this.focusedPanelId = id;
  };

  // The single source of truth every panel-scoped keybinding hook
  // (useCanvasKeybindings, useSettingsKeybindings) gates on. DOM focus
  // decides who owns bare-key input, but ONLY when it's explicitly ON
  // Canvas or the Input panel -- clicking either is a deliberate "give this
  // one the keyboard" action, and wins outright. Anything else (Tab landing
  // on a header icon that isn't part of any managed panel, focus lost to
  // nothing in particular, a stray click on inert chrome) is NOT such a
  // signal, and must not be read as "give it to Canvas" -- confirmed live
  // that reading it that way felt exactly backwards: Tabbing through
  // Settings' own content (past its last real control, toward the header)
  // silently armed canvas's j/k the instant focus happened to land on the
  // Settings gear icon, with nothing on screen suggesting canvas now owned
  // the keyboard. Settings is a *docked* panel (see SettingsDockedPanel.tsx's
  // own comment) meant to stay open while you keep working the canvas, so
  // "Settings is open" can't mean "owns every keystroke until closed" either
  // -- but short of an explicit click into Canvas/Input, it's the one
  // default that's actually predictable while it's open. Falls back to
  // 'graph' only once Settings itself is closed too, which is the original,
  // pre-panel-routing default this whole mechanism is layered on top of.
  // The Library panel (components/recipes/LibraryPanel.tsx) shares Settings'
  // docked slot. It handles its own keys (Up/Down/Enter) on its root, so it
  // is 'library' rather than 'settings': Settings' Up/Down would otherwise
  // move between Settings sections behind it.
  get activeKeyboardPanel(): 'graph' | 'settings' | 'library' | 'input' {
    if (this.focusedPanelId === 'input' && this.newLayoutPanelVisible) return 'input';
    if (this.focusedPanelId === 'graph') return 'graph';
    if (this.showLibrary) return 'library';
    if (this.showSettings) return 'settings';
    return 'graph';
  }

  // Settings
  showSettings = false;
  // Which section the settings panel opens to -- defaults to Connections
  // since that's the section a decryption-failure reconnect or "add
  // connection" click needs to land on; the panel remembers whatever
  // section was last open otherwise (see SettingsPanelContent.tsx's rail).
  settingsSection: SettingsSection = 'connections';
  // Consume-once signal (same pattern as reconnectHint below) telling the
  // Connections section to open straight to its "add" sub-view instead of
  // the list -- set by the "New Database Connection" command, which used to
  // jump straight to a dedicated add-connection modal before Connections
  // became one section among several.
  settingsConnectionsAdding = false;

  // Set whenever connecting to a saved/existing connection fails (e.g. the
  // DB is down or unreachable) so the UI can surface it -- see connect() and
  // selectConnection() below.
  connectionError: string | null = null;

  // Analysis
  showAnalysis = false;
  analysisInitialValue = '';

  // Command Palette
  showCommandPalette = false;
  _commandHistory: string[] = []; // Store command IDs

  // Changelog
  showChangelog = false;

  // Save-as-file modal (Ctrl/Cmd+S)
  // Ctrl+S's "Save as recipe" bar above the active tab (components/recipes/).
  // Desktop only: recipes are stored by the desktop app.
  showSaveRecipe = false;
  saveRecipeRequestCount = 0;
  // The sidebar's Library: saved recipes in Settings' docked slot. Library
  // and Settings replace each other there (setShowLibrary/setShowSettings).
  // Ctrl+O opens it too (findRecipe), and each time it does, the Library
  // focuses its search box.
  showLibrary = false;
  // Which of the two was open last, so Ctrl+, brings it back
  // (toggleSidebarPanel).
  lastSidebarPanel: 'settings' | 'library' = 'settings';
  libraryFindCount = 0;
  // Counts recipes saved from this window, so an open Library lists them again.
  recipesChangedCount = 0;

  // See PendingConnectionSwitch.
  pendingConnectionSwitch: PendingConnectionSwitch | null = null;

  get commandHistory(): string[] {
    return this._commandHistory;
  }

  addToCommandHistory(commandId: string) {
    // Remove if already exists (move to front)
    this._commandHistory = this._commandHistory.filter(id => id !== commandId);
    // Add to front
    this._commandHistory.unshift(commandId);
    // Keep only last 5
    this._commandHistory = this._commandHistory.slice(0, 5);
    // Persist to localStorage
    setUserPreference(STORAGE_KEYS.COMMAND_HISTORY, this._commandHistory);
  }

  constructor() {
    // Every value is checked against what the app accepts today: a theme or
    // font from an older version, or a hand-edited value, falls back to the
    // default instead of breaking the first render.
    const orientations = ['horizontal', 'vertical'] as const;
    this._themeId = getUserPreference<ThemeId>(STORAGE_KEYS.THEME, 'dark', oneOf(Object.keys(THEMES)));
    this._uiFontFamily = getUserPreference<UiFontId>(
      STORAGE_KEYS.UI_FONT_FAMILY,
      'system',
      oneOf(UI_FONTS.map(f => f.id)),
    );
    this._codeFontFamily = getUserPreference<CodeFontId>(
      STORAGE_KEYS.CODE_FONT_FAMILY,
      'plex-mono',
      oneOf(CODE_FONTS.map(f => f.id)),
    );
    this._textSize = getUserPreference<TextSize>(STORAGE_KEYS.TEXT_SIZE, 'medium', oneOf(Object.keys(TEXT_SIZE_SCALE)));
    this._vimModeEnabled = getUserPreference(STORAGE_KEYS.VIM_MODE, false, isBoolean);
    this._autoTidy = getUserPreference(STORAGE_KEYS.AUTO_TIDY, true, isBoolean);
    this._pineTableColorsEnabled = getUserPreference(STORAGE_KEYS.PINE_TABLE_COLORS, false, isBoolean);
    this._autoRunEnabled = getUserPreference(STORAGE_KEYS.AUTO_RUN_ENABLED, true, isBoolean);
    this._showHiddenSqlColumns = getUserPreference(STORAGE_KEYS.SHOW_HIDDEN_SQL_COLUMNS, false, isBoolean);
    this._sideRailExpanded = getUserPreference(STORAGE_KEYS.SIDE_RAIL_EXPANDED, false, isBoolean);
    this._newLayoutPanelVisible = getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_VISIBLE, false, isBoolean);
    this._newLayoutOrientation = getUserPreference<'horizontal' | 'vertical'>(
      STORAGE_KEYS.NEW_LAYOUT_ORIENTATION,
      'horizontal',
      oneOf(orientations),
    );
    this._tabOrientation = getUserPreference<TabOrientation>(
      STORAGE_KEYS.TAB_ORIENTATION,
      'horizontal',
      oneOf(orientations),
    );
    // Read here, with every other preference, rather than in the components
    // that use them. They are global -- one panel width for the app, not one
    // per tab -- and MUI unmounts an inactive tab's children, so a component
    // reading them on mount re-read them on every tab switch: the layout
    // started at its default size and moved to the saved one a commit later.
    // Visible as the canvas resizing, the graph recentring, and even the empty
    // results placeholder drifting, every time you changed tab.
    this._newLayoutPaneWidth = getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANE_WIDTH, DEFAULT_NEW_LAYOUT_PANE_WIDTH, isFiniteNumber);
    this._newLayoutPaneHeight = getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANE_HEIGHT, DEFAULT_NEW_LAYOUT_PANE_HEIGHT, isFiniteNumber);
    this._newLayoutPanelWidth = getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_WIDTH, DEFAULT_NEW_LAYOUT_PANEL_WIDTH, isFiniteNumber);
    this._newLayoutPanelHeight = getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_HEIGHT, DEFAULT_NEW_LAYOUT_PANEL_HEIGHT, isFiniteNumber);
    this._commandHistory = getUserPreference<string[]>(STORAGE_KEYS.COMMAND_HISTORY, [], isStringArray);
    this.connectionColors = getUserPreference<Record<string, string>>(STORAGE_KEYS.CONNECTION_COLORS, {}, isStringRecord);
    makeAutoObservable<GlobalStore, 'mcpRuns'>(this, { mcpRuns: false });

    // Restore tabs/sessions from a previous visit, if any were saved.
    // getUserPreference safely no-ops (returns the default) during SSR, so
    // this always falls through to a single fresh session there.
    let restored = false;
    try {
      restored = this.restoreSessions();
    } catch (e) {
      console.error('Could not restore the previous tabs; starting fresh ->', e);
    }
    if (!restored) {
      const initSession = new Session('0', this);
      this.sessions[initSession.id] = initSession;
    }

    // Persist tabs (pine/sql text, input mode, connection) on change, debounced
    // so typing doesn't hit localStorage on every keystroke.
    reaction(
      () => this.snapshotSessions(),
      snapshot => setUserPreference(STORAGE_KEYS.SESSIONS, snapshot),
      { delay: 1000 },
    );

    // The debounce above can drop the last keystrokes if the tab is closed
    // right after typing -- flush unconditionally on the way out.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        setUserPreference(STORAGE_KEYS.SESSIONS, this.snapshotSessions());
      });
    }

    // Connect lazily, one tab at a time, instead of eagerly reconnecting
    // everything or forcing the user through a picker: whenever the active
    // tab changes (including right after startup, once pine itself becomes
    // reachable), bring up that tab's *own* assigned connection if it isn't
    // already live. A tab with no assigned connection, or one that's
    // already live, is a no-op -- see ensureSessionConnected.
    reaction(
      () => this.activeSessionId,
      sessionId => {
        this.ensureSessionConnected(sessionId);
        // A tab whose last build drew nothing, say because the database
        // was down when it was built, tries again when it's opened.
        const session = this.sessions[sessionId];
        if (session?.buildFailed && this.isConnectionLive(session.connectionId)) {
          session.rebuild();
        }
      },
    );
    // While the open tab can't reach its database, try again every
    // UNREACHABLE_RETRY_MS. Nothing runs while it can, or for other tabs.
    reaction(
      () => this.sessions[this.activeSessionId]?.databaseUnreachable ?? false,
      unreachable => {
        if (unreachableRetry) clearInterval(unreachableRetry);
        unreachableRetry = unreachable ? setInterval(this.retryActiveDatabase, UNREACHABLE_RETRY_MS) : null;
        // Node's timers keep a process alive (the tests); a browser's are numbers.
        (unreachableRetry as { unref?: () => void } | null)?.unref?.();
      },
    );
    reaction(
      () => this.pineConnected,
      connected => {
        // The pine server restarted, or went away: the agent's connections
        // were in its pools, which are gone.
        this.mcpOpenConnections = {};
        if (connected) {
          this.ensureSessionConnected(this.activeSessionId);
        }
      },
    );
  }

  /**
   * Build the persisted shape of the current tabs -- see PersistedSessionsState.
   */
  private snapshotSessions = (): PersistedSessionsState => {
    // An agent's tabs belong to a conversation that ends with the app, so
    // they are not restored as tabs of the user's own.
    const agentTabs = new Set(this.agentSessionIds);
    const ids = Object.keys(this.sessions).filter(id => !agentTabs.has(id));
    return {
      sessions: ids.map(id => {
        const session = this.sessions[id];
        // Desktop: only a saved connection's id, which is random and local.
        // A connection that couldn't be saved (no OS credential store) has
        // pine's id, made from the database's address, so it isn't kept.
        // Until the saved connections load, a restored tab keeps its id.
        const keep =
          !isDesktop() || !this.connectionsLoaded || this.connections.some(c => c.id === session.connectionId);
        return {
          expression: session.expression,
          inputMode: session.inputMode,
          connectionId: keep ? session.connectionId : '',
        };
      }),
      activeIndex: Math.max(ids.indexOf(this.activeSessionId), 0),
    };
  };

  /**
   * Recreate tabs from a previously persisted snapshot, if one exists and
   * looks well-formed. Returns whether anything was restored, so the caller
   * knows whether it still needs to create the usual blank default session.
   */
  private restoreSessions = (): boolean => {
    const persisted = getUserPreference(
      STORAGE_KEYS.SESSIONS,
      null,
    ) as PersistedSessionsState | null;
    if (!persisted || typeof persisted !== 'object' || !Array.isArray(persisted.sessions)) {
      return false;
    }
    // A tab saved by an older version, or a damaged entry, is skipped rather
    // than allowed to throw here: this runs while the store is being created,
    // so a throw left a blank page.
    const usable = persisted.sessions.filter(
      (s): s is PersistedSession =>
        typeof s === 'object' && s !== null && (s.expression === undefined || typeof s.expression === 'string'),
    );
    if (usable.length === 0) {
      return false;
    }

    usable.forEach((persistedSession, index) => {
      const session = this.createSessionUsingId(String(index));
      const expression = stripRemovedDeleteOperation(persistedSession.expression ?? '');
      runInAction(() => {
        session.expression = expression;
        session.inputMode = persistedSession.inputMode === 'sql' ? 'sql' : 'pine';
        session.connectionId = restoredConnectionId(persistedSession);
        session.awaitingConnection = !!session.connectionId;
      });
      // `new Session()` (inside createSessionUsingId, just above) wires up its
      // own expression -> build reaction *while this whole forEach is still
      // one in-flight action* (restoreSessions is itself an auto-actioned
      // method, per makeAutoObservable on GlobalStore) - a reaction created
      // mid-action defers its first tracked read until the action fully
      // unwinds, so that first read already sees `expression` set to
      // `persistedSession.expression` above, not the `''` the field started
      // at. No "before -> after" transition is ever observed, so the
      // reaction's effect (the debounced /build call) never fires - ast stays
      // null forever, and canvas mode's "not parsing" placeholder is the
      // visible symptom (confirmed live: zero /build requests fire for a
      // restored session, vs. two for the same expression entered by hand).
      //
      // Forcing it via a bare `setTimeout(0)` (an earlier version of this
      // fix) fires it far too early against a cold-started backend - the
      // desktop app's bundled pine-lang process can take real time to start
      // accepting connections, and `client.build` doesn't wait for that; it
      // just fails ("Failed to fetch"), same silent-no-retry problem as
      // before, just with a network error this time instead of an unfired
      // reaction. So wait on the real readiness signal (`pineConnected`,
      // already tracked for reconnecting the active tab below) rather than
      // guessing a delay - `fireImmediately` covers the case where pine is
      // already up by the time this subscribes (a fast/local connection),
      // and the reaction disposes itself right after firing once, since this
      // is only ever needed for the one build that never happened.
      if (expression.trim() !== '') {
        const disposeOnceConnected = reaction(
          () => this.pineConnected,
          connected => {
            if (!connected) return;
            session.requestHints();
            disposeOnceConnected();
          },
          { fireImmediately: true },
        );
      }
    });

    const ids = Object.keys(this.sessions);
    const activeIndex = typeof persisted.activeIndex === 'number' ? persisted.activeIndex : 0;
    this.activeSessionId = ids[activeIndex] ?? ids[0];
    return true;
  };

  // The listed connection with this id, and only that one: on desktop the
  // saved connection, in the browser pine's. Never a near match, because a
  // near match is how a tab came to be labelled with another database.
  private connectionEntry = (connectionId: string): ConnectionInfo | undefined =>
    connectionId ? this.connections.find(c => c.id === connectionId) : undefined;

  // Only for moving colours older versions stored under pine's
  // address-based ids, in the shapes it has had: `user@host:port:dbname`,
  // `host:port:dbname` and `host:port`. Ambiguous when two saved connections
  // share an address, which is why nothing else uses it.
  private legacyConnectionEntry = (key: string): ConnectionInfo | undefined =>
    this.connectionEntry(key) ??
    this.connections.find(
      c =>
        pineIdOf(c) === key ||
        (c.dbHost && c.dbPort && c.dbName && `${c.dbHost}:${c.dbPort}:${c.dbName}` === key) ||
        (c.dbHost && c.dbPort && `${c.dbHost}:${c.dbPort}` === key),
    );

  /**
   * Where a connection's colour is kept: its database's hash, so the stored
   * colours never show a database's address (see AGENTS.md). Without a saved
   * connection to hash, its own id, kept in memory only on desktop
   * (persistConnectionColors).
   */
  private colorKeyFor = (connectionId: string): string => {
    const entry = this.connectionEntry(connectionId);
    return entry?.databaseKeyHash || entry?.id || connectionId;
  };

  getConnectionColor = (connectionId: string): string => {
    const entry = this.connectionEntry(connectionId);
    // The hash first. Then the keys older versions stored, until
    // migrateConnectionColors moves them: the saved connection's id, or
    // pine's own id for it.
    return (
      (entry?.databaseKeyHash && this.connectionColors[entry.databaseKeyHash]) ||
      (entry && this.connectionColors[entry.id]) ||
      this.connectionColors[connectionId] ||
      ''
    );
  };

  /**
   * Desktop: moves colours older versions stored under a saved connection's
   * id, or under pine's `host:port:dbname` id, to the database's hash. A
   * colour already under the hash wins, and colours stored under the saved
   * connection's id are moved before pine's ids, so each connection keeps
   * the colour it had. Runs once the saved connections have loaded, before
   * pruneConnectionColors, which would drop the old keys.
   */
  private migrateConnectionColors = () => {
    const keys = Object.keys(this.connectionColors).filter(k => !isHashedKey(k));
    const byConnectionIdFirst = [
      ...keys.filter(k => this.connections.some(c => c.id === k)),
      ...keys.filter(k => !this.connections.some(c => c.id === k)),
    ];
    for (const key of byConnectionIdFirst) {
      const hash = this.legacyConnectionEntry(key)?.databaseKeyHash;
      if (!hash) continue;
      if (!this.connectionColors[hash]) this.connectionColors[hash] = this.connectionColors[key];
      delete this.connectionColors[key];
    }
  };

  /**
   * Saves the colours. On desktop only under a database's hash, and only
   * once the saved connections have loaded: before that, a colour can only
   * be kept under pine's id, which is the database's address.
   */
  private persistConnectionColors = () => {
    if (!isDesktop()) {
      setUserPreference(STORAGE_KEYS.CONNECTION_COLORS, this.connectionColors);
      return;
    }
    if (!this.connectionsLoaded) return;
    const hashed = Object.fromEntries(Object.entries(this.connectionColors).filter(([k]) => isHashedKey(k)));
    setUserPreference(STORAGE_KEYS.CONNECTION_COLORS, hashed);
  };

  getConnectionLabel = (connectionId: string): string => {
    if (!connectionId) return '';
    const resolved = this.connectionEntry(connectionId)?.label;
    if (resolved) return resolved;
    // Nothing listed with this id, or the list hasn't loaded yet. Until it
    // has, '…' rather than the raw id, which would read as a name change a
    // moment later. After: the id itself, which in the browser is pine's
    // `user@host:port:dbname`, and on desktop names a connection that
    // couldn't be saved.
    return this.connectionsLoaded ? connectionId : '…';
  };

  private pruneConnectionColors = (liveIds: string[]) => {
    const live = new Set(liveIds);
    let changed = false;
    for (const id of Object.keys(this.connectionColors)) {
      if (!live.has(id)) {
        delete this.connectionColors[id];
        changed = true;
      }
    }
    if (changed) this.persistConnectionColors();
  };

  refreshConnections = async (): Promise<ConnectionInfo[]> => {
    // Desktop mode: pine-server is a fresh JVM every launch, so its own live
    // connection list is empty until something reconnects this session --
    // not useful as "what connections does the user have". Source the list
    // from locally saved profiles instead.
    console.log(
      `[credentials] refreshConnections: isDesktop()=${isDesktop()} window.beamlynxDesktop=${
        typeof window !== 'undefined' && !!window.beamlynxDesktop
      }`,
    );
    if (isDesktop() && typeof window !== 'undefined' && window.beamlynxDesktop) {
      const profiles = await window.beamlynxDesktop.credentials.list();
      if (isDevelopment()) console.log('[credentials] refreshConnections (desktop): profiles ->', profiles);
      runInAction(() => {
        this.connections = profiles.map(p => ({
          id: p.id,
          label: p.label,
          dbHost: p.dbHost,
          dbPort: p.dbPort,
          dbName: p.dbName,
          dbUser: p.dbUser,
          databaseKey: p.databaseKey,
          databaseKeyHash: p.databaseKeyHash,
          mcpEnabled: p.mcpEnabled,
          policyId: p.policyId,
          applyPolicyToOwnQueries: p.applyPolicyToOwnQueries,
          agentsSeeEveryColumn: p.agentsSeeEveryColumn,
        }));
        // Before anything else touches the colours: the prune below would
        // drop the keys older versions stored.
        this.migrateConnectionColors();
        this.connections.forEach(c => this.assignConnectionColor(c.id));
        this.connectionsLoaded = true;
        // Keep the colour of a tab's connection that couldn't be saved (see
        // connect() below): otherwise this prune would delete it the
        // instant it's assigned.
        this.pruneConnectionColors(
          [
            ...this.connections.map(c => this.colorKeyFor(c.id)),
            ...Object.values(this.sessions).map(s => s.connectionId && this.colorKeyFor(s.connectionId)),
          ].filter(Boolean),
        );
        // Rewrites what older versions saved with addresses in it: colours
        // and tabs are saved under hashes and saved connections' ids now.
        this.persistConnectionColors();
        setUserPreference(STORAGE_KEYS.SESSIONS, this.snapshotSessions());
      });
      return this.connections;
    }

    const result = await client.listConnections();
    if (!result) {
      return this.connections;
    }
    runInAction(() => {
      this.connections = result.connections ?? [];
      this.connections.forEach(c => this.assignConnectionColor(c.id));
      this.pruneConnectionColors(this.connections.map(c => c.id));
      if (result.version) {
        this.version = result.version;
      }
      // In the browser the list is pine's open pools, so it is exactly
      // what is live.
      this.liveConnectionIds = this.connections.map(c => c.id);
      this.connectionsLoaded = true;
    });
    return this.connections;
  };

  // Desktop-only, same as accessPolicies itself -- browser mode has no MCP
  // and no policy concept, so this is a no-op there. Called at boot
  // alongside refreshConnections, and again before every MCP query
  // (mcpQueryDeps' resolveAccessPolicyRules) so an edit made from Settings
  // -> Access Policy takes effect on the very next query, not just the
  // next reconnect.
  refreshAccessPolicies = async (): Promise<AccessPolicy[]> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return this.accessPolicies;
    const policies = await window.beamlynxDesktop.accessPolicy.list();
    runInAction(() => {
      this.accessPolicies = policies;
    });
    return this.accessPolicies;
  };

  /**
   * The templates: the rules a connection's data masking can start from,
   * on the Agent page's Masking tab. The UI calls them rule sets, and the
   * built-in one Recommended. Copied into a connection, never shared.
   */
  get policyTemplates(): AccessPolicy[] {
    // The built-in Default first, then your own in the order they were made.
    const templates = this.accessPolicies.filter(p => !p.connectionId);
    return [...templates.filter(p => p.builtIn), ...templates.filter(p => !p.builtIn)];
  }

  /**
   * A saved connection's access policy, if it has one: its own. A desktop
   * app older than per-connection policies hasn't marked it as the
   * connection's yet, and it is still the policy the connection uses, so
   * it is never shown as "None".
   */
  connectionPolicy = (connectionId: string | undefined): AccessPolicy | undefined => {
    const connection = this.connections.find(c => c.id === connectionId);
    return connection?.policyId ? this.accessPolicies.find(p => p.id === connection.policyId) : undefined;
  };

  /** A new template, with the starting rules. */
  createAccessPolicy = async (name: string): Promise<AccessPolicy | undefined> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return undefined;
    const policy = await window.beamlynxDesktop.accessPolicy.create(name);
    runInAction(() => {
      this.accessPolicies = [...this.accessPolicies, policy];
    });
    return policy;
  };

  renameAccessPolicy = async (id: string, name: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const updated = await window.beamlynxDesktop.accessPolicy.rename(id, name);
    if (!updated) return;
    runInAction(() => {
      this.accessPolicies = this.accessPolicies.map(p => (p.id === id ? updated : p));
    });
  };

  // Deletes a template. Connections made from it keep their own copies.
  deleteAccessPolicy = async (id: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    if (!(await window.beamlynxDesktop.accessPolicy.delete(id))) return;
    runInAction(() => {
      this.accessPolicies = this.accessPolicies.filter(p => p.id !== id);
    });
  };

  // Each of these writes through beamlynx-desktop's credential-store.ts and
  // takes back the policy as stored, so this list always shows what agents
  // actually get on their next query.
  private replaceAccessPolicy = (updated: AccessPolicy | null): AccessPolicy | null => {
    if (!updated) return null;
    runInAction(() => {
      this.accessPolicies = this.accessPolicies.map(p => (p.id === updated.id ? updated : p));
    });
    return updated;
  };

  setAccessPolicyRuleEnabled = async (policyId: string, ruleId: string, enabled: boolean) => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return null;
    return this.replaceAccessPolicy(
      await window.beamlynxDesktop.accessPolicy.setRuleEnabled(policyId, ruleId, enabled),
    );
  };

  // toJS: a rule can come out of this observable store, such as an agent's
  // proposal, and IPC can't send a MobX proxy ("An object could not be
  // cloned").
  addAccessPolicyRule = async (policyId: string, rule: AccessPolicyRule) => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return null;
    return this.replaceAccessPolicy(await window.beamlynxDesktop.accessPolicy.addRule(policyId, toJS(rule)));
  };

  removeAccessPolicyRule = async (policyId: string, ruleId: string) => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return null;
    return this.replaceAccessPolicy(await window.beamlynxDesktop.accessPolicy.removeRule(policyId, ruleId));
  };

  // Undo of a change made from the results grid: the rules exactly as they
  // were. toJS because the rules came out of this observable store, and IPC
  // can't send a MobX proxy.
  setAccessPolicyRules = async (policyId: string, rules: AccessPolicyModule[]) => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return null;
    return this.replaceAccessPolicy(await window.beamlynxDesktop.accessPolicy.setRules(policyId, toJS(rules)));
  };

  /**
   * Opens the Agent page at one database, with its data masking open and
   * one of its rules picked out when `ruleId` is given. Where the results
   * grid and Database Connections send someone to change what agents see.
   */
  openAgentDatabase = (connectionId: string, ruleId?: string) => {
    this.agentDatabaseFocus = { connectionId, ruleId };
    // No attention flash (showSettingsSection): the page already shows
    // what changed, by opening that database's line. The flash's left
    // edge also didn't show on the owner's screen (beamlynx-plans #22).
    this.setShowSettings(true, 'mcp');
  };

  clearAgentDatabaseFocus = () => {
    this.agentDatabaseFocus = null;
  };

  consumeReconnectHint = () => {
    const hint = this.reconnectHint;
    runInAction(() => {
      this.reconnectHint = null;
    });
    return hint;
  };

  consumeSettingsConnectionsAdding = () => {
    const adding = this.settingsConnectionsAdding;
    runInAction(() => {
      this.settingsConnectionsAdding = false;
    });
    return adding;
  };

  /** Opens Settings straight to the Connections section's "add" sub-view. */
  openAddConnection = () => {
    runInAction(() => {
      this.showSettings = true;
      this.showLibrary = false;
      this.settingsSection = 'connections';
      this.settingsConnectionsAdding = true;
    });
  };

  loadCredentialsStatus = async () => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) {
      console.log(
        `[credentials] loadCredentialsStatus: skipped (window.beamlynxDesktop=${
          typeof window !== 'undefined' && !!window.beamlynxDesktop
        })`,
      );
      return;
    }
    const status = await window.beamlynxDesktop.credentials.status();
    if (isDevelopment()) console.log('[credentials] loadCredentialsStatus ->', status);
    runInAction(() => {
      this.credentialsStatus = status;
    });
  };

  setConnectionColor = (connectionId: string, color: string) => {
    this.connectionColors[this.colorKeyFor(connectionId)] = color;
    this.persistConnectionColors();
  };

  private assignConnectionColor = (connectionId: string) => {
    if (!connectionId) return;
    // getConnectionColor resolves first: connectionId may be pine's own id
    // for a connection whose colour is kept under its hash, or under a key an
    // older version used. Checking the raw id alone would reassign a new
    // colour on every reconnect.
    if (this.getConnectionColor(connectionId)) return;
    const used = new Set(Object.values(this.connectionColors));
    const color =
      CONNECTION_COLOR_PALETTE.find(c => !used.has(c)) ??
      CONNECTION_COLOR_PALETTE[
        Object.keys(this.connectionColors).length % CONNECTION_COLOR_PALETTE.length
      ];
    this.setConnectionColor(connectionId, color);
  };

  public async handleUrlParameters() {
    if (typeof window === 'undefined') return; // Skip on server-side

    const urlParams = new URLSearchParams(window.location.search);
    let hasChanges = false;

    // Handle 'analyse' parameter
    try {
      const analyseParam = urlParams.get('analyse');
      if (analyseParam) {
        this.analysisInitialValue = analyseParam;
        this.setShowAnalysis(true);
        urlParams.delete('analyse');
        hasChanges = true;
      }
    } catch (error) {
      console.log('Error handling analyse parameter:', error);
    }

    // Handle 'query' parameter
    try {
      const queryParam = urlParams.get('query');
      if (queryParam) {
        const session = this.getSession(this.activeSessionId);
        if (session) {
          runInAction(() => {
            // Already decoded by URLSearchParams. Decoding again broke any
            // query containing %, like `like '%a%'`.
            session.expression = queryParam;
          });
          await session.prettify();
        }
        urlParams.delete('query');
        hasChanges = true;
      }
    } catch (error) {
      console.log('Error handling query parameter:', error);
    }

    // Handle 'data' parameter
    try {
      const dataParam = urlParams.get('data');
      if (dataParam) {
        const data = JSON.parse(dataParam);
        const session = this.getSession(this.activeSessionId);
        if (session && data.expression) {
          runInAction(() => {
            session.expression = data.expression;
          });
          await session.prettify();
        }
        urlParams.delete('data');
        hasChanges = true;
      }
    } catch (error) {
      console.log('Error handling data parameter:', error);
    }

    // Update URL if any parameters were processed
    if (hasChanges) {
      const newUrl =
        window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }

  // Cycles through the three named themes (used by the command palette's
  // "Toggle Theme" entry) - a plain binary toggle stopped making sense once
  // there were three, not two, to choose from.
  public toggleTheme() {
    const order: ThemeId[] = ['light', 'dark', 'sepia'];
    this.themeId = order[(order.indexOf(this.themeId) + 1) % order.length];
  }

  public toggleAutoRunEnabled() {
    this.autoRunEnabled = !this.autoRunEnabled;
  }

  public toggleNewLayoutOrientation() {
    this.newLayoutOrientation =
      this.newLayoutOrientation === 'horizontal' ? 'vertical' : 'horizontal';
  }

  public toggleTabOrientation() {
    this.tabOrientation = this.tabOrientation === 'horizontal' ? 'vertical' : 'horizontal';
  }

  public toggleZenMode() {
    if (this.zenMode) {
      this.zenMode = false;
      if (this._autoRunBeforeZenMode !== null) {
        this.autoRunEnabled = this._autoRunBeforeZenMode;
        this._autoRunBeforeZenMode = null;
      }
    } else {
      this._autoRunBeforeZenMode = this.autoRunEnabled;
      this.autoRunEnabled = false;
      this.zenMode = true;
    }
  }

  /**
   * "Toggle Pine Panel" and "Toggle SQL Panel" (below) are two different
   * ways to open the SAME New Layout panel in a given mode - not two
   * separate panels. Invoking one while the panel is already open in that
   * exact mode closes it (a true toggle); invoking it while the panel is
   * open in the OTHER mode just switches the mode, without closing.
   *
   * Either way, opening (or mode-switching) the panel also moves keyboard
   * focus into it -- session.focusTextInput() flips textInputFocused, which
   * PineInput/SqlInput's own effect turns into a real CodeMirror .focus()
   * call. That's a deliberate, explicit "give this panel the keyboard" act
   * (the whole point of invoking the shortcut/button), unlike the
   * NewLayoutView autoFocus={false} case (see PineInput's own comment on
   * that prop) which guards against stealing focus from the graph on every
   * *other* re-render of an already-open panel.
   */
  public togglePinePanel(session: Session) {
    if (this.newLayoutPanelVisible && session.inputMode === 'pine') {
      this.hideNewLayoutPanel();
    } else {
      this.newLayoutPanelVisible = true;
      session.setInputMode('pine');
      session.focusTextInput();
    }
  }

  public toggleSqlPanel(session: Session) {
    if (this.newLayoutPanelVisible && session.inputMode === 'sql') {
      this.hideNewLayoutPanel();
    } else {
      this.newLayoutPanelVisible = true;
      session.setInputMode('sql');
      session.focusTextInput();
    }
  }

  private hideNewLayoutPanel() {
    this.newLayoutPanelVisible = false;
    // Every tab shares this one panel's visibility, but inputMode is
    // per-session - hiding it while some OTHER tab was mid-hand-edit of raw
    // SQL would otherwise leave that tab's inputMode stuck on 'sql' with no
    // visible editor left to explain why, and per
    // Session.notifyCanvasCommit(), auto-run silently stays off in that
    // state. Revert every session, not just the active one.
    //
    // Also force textInputFocused back off: unmounting PineInput/SqlInput
    // (this panel disappearing) isn't guaranteed to fire their onBlur
    // reliably before teardown, so leaving that decision to the blur event
    // can strand the flag on `true` - which blocks every canvas keybinding
    // (see useCanvasKeybindings.ts's guard) with no visible input left on
    // screen to explain why keyboard focus feels "stuck".
    Object.values(this.sessions).forEach(session => {
      session.setInputMode('pine');
      session.blurTextInput();
    });
  }

  public togglePineTableColors() {
    this.pineTableColorsEnabled = !this.pineTableColorsEnabled;
  }

  /**
   * Switch the active tab to one of the listed connections, as the sidebar's
   * connection menu does (ActiveConnection.tsx): the command palette's
   * Switch Connection. A tab with a query in it asks first
   * (ChangeConnectionModal). On desktop a saved connection that fails to
   * decrypt opens Settings, where only its password needs typing again.
   */
  switchActiveTabConnection = async (id: string): Promise<void> => {
    if (!isDesktop()) return this.selectConnection(id);
    if (id === this.activeConnectionId && this.isConnectionLive(id)) return;
    if (this.sessions[this.activeSessionId]?.expression.trim()) {
      this.requestConnectionSwitch({ kind: 'connectToSavedProfile', id });
      return;
    }
    try {
      await this.connectToSavedProfile(id);
    } catch (e) {
      // connectToSavedProfile already shows the failure (connectionError).
      if (e instanceof DecryptionFailedError) this.setShowSettings(true, 'connections');
    }
  };

  /**
   * Select an existing server connection from the picker and assign it to the
   * active tab. If that tab has a non-empty Pine expression, the switch is
   * held in `pendingConnectionSwitch` and ChangeConnectionModal warns the
   * user first -- pass `confirmed: true` (as confirmPendingConnectionSwitch
   * does) to apply it anyway.
   */
  selectConnection = async (connectionId: string, confirmed = false) => {
    const activeSession = this.sessions[this.activeSessionId];
    if (!activeSession) {
      return;
    }
    if (activeSession.connectionId === connectionId && this.isConnectionLive(connectionId)) {
      return;
    }
    if (activeSession.expression.trim() && !confirmed) {
      runInAction(() => {
        this.pendingConnectionSwitch = { kind: 'select', connectionId };
      });
      return;
    }
    const seq = this.beginConnect(activeSession);
    try {
      const { id, version } = await client.checkConnection(connectionId);
      // Another switch for this tab started since: that one decides.
      if (activeSession.connectSeq !== seq) return;
      runInAction(() => {
        this.version = version ?? '0.0.0';
        this.liveConnectionIds = Array.from(new Set([...this.liveConnectionIds, id]));
        activeSession.connectionId = id;
        // Nothing reacts to connectionId changing on its own -- bump the
        // counter to force the debounced build reaction to re-resolve the
        // existing expression against the new connection's schema, so any
        // now-invalid table/column names surface via session.error.
        activeSession.hintsRequestedCounter++;
        this.pendingConnectionSwitch = null;
        this.endConnect(activeSession, seq, true);
      });
      await this.refreshConnections();
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.endConnect(activeSession, seq, false);
        if (activeSession.connectSeq !== seq) return;
        activeSession.message = `⚠ Failed to switch connection: ${message}`;
        this.connectionError = `Failed to switch connection: ${message}`;
      });
      throw e;
    }
  };

  /**
   * Fetch and decrypt a saved (desktop-only) profile's credentials. Throws
   * DecryptionFailedError (with reconnectHint populated) or a generic error
   * if the profile is gone -- callers decide what to do next.
   */
  private getSavedProfileCredentials = async (profileId: string): Promise<ConnectionParams> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) {
      throw new Error('Saved connections are only available in desktop mode');
    }
    const result = await window.beamlynxDesktop.credentials.get(profileId);
    // Never log `result` itself: on success it holds the decrypted password.
    if (isDevelopment()) {
      console.log('[credentials] getSavedProfileCredentials: ok ->', result.ok, 'profile ->', 'profile' in result ? result.profile.id : undefined);
    }
    if (!result.ok) {
      if (result.error === 'decryption-failed') {
        const { dbHost, dbPort, dbName, dbUser, dbType } = result.profile;
        runInAction(() => {
          this.reconnectHint = { dbHost, dbPort, dbName, dbUser, dbType };
        });
        throw new DecryptionFailedError();
      }
      throw new SavedConnectionNotFoundError();
    }
    const { profile, dbPassword } = result;
    return {
      dbHost: profile.dbHost,
      dbPort: profile.dbPort,
      dbName: profile.dbName,
      dbUser: profile.dbUser,
      dbPassword,
      dbType: profile.dbType,
    };
  };

  /**
   * Connect to a saved (desktop-only) profile that may not have a live pine
   * pool yet this session -- fetches the decrypted credentials and goes
   * through the normal `connect` (create + use) path, rather than assuming
   * a pool already exists the way `selectConnection` does. No
   * pendingConnectionSwitch warning here -- callers that need one
   * (ActiveConnection.tsx / ConnectionsSection.tsx's switch action) check the
   * active tab themselves via requestConnectionSwitch before calling this.
   * For a silent background reconnect of one specific (possibly inactive)
   * tab, see ensureSessionConnected instead.
   */
  connectToSavedProfile = async (id: string): Promise<string> => {
    console.log(`[credentials] connectToSavedProfile called for id=${id}`);
    // The tab is the one open now, before reading the password: see connect.
    const target = this.sessions[this.activeSessionId];
    const seq = target ? this.beginConnect(target) : 0;
    let params: ConnectionParams;
    try {
      params = await this.getSavedProfileCredentials(id);
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.connectionError = `Failed to connect: ${message}`;
        if (target) this.endConnect(target, seq, false);
      });
      throw e;
    }
    return this.connect(params, id, target ? { target, seq } : undefined);
  };

  /**
   * The current investigation's tab: the one whose agent called last. What
   * the header's robot opens. null when there is none.
   */
  get mcpSessionId(): string | null {
    let latest: Investigation | undefined;
    for (const investigation of this.investigations) {
      if (!latest || (investigation.lastCallAt ?? 0) >= (latest.lastCallAt ?? 0)) latest = investigation;
    }
    return latest?.sessionId ?? null;
  }

  /** Every investigation's tab. */
  get agentSessionIds(): string[] {
    return this.investigations.map(i => i.sessionId);
  }

  investigationForSession = (sessionId: string): Investigation | undefined =>
    this.investigations.find(i => i.sessionId === sessionId);

  getOrCreateInvestigation = (id: string = DEFAULT_INVESTIGATION): Investigation => {
    const existing = this.investigations.find(i => i.id === id);
    if (existing && this.sessions[existing.sessionId]) return existing;
    this.dropOldInvestigations();
    const session = this.createSession();
    const investigation = new Investigation(id, session.id);
    runInAction(() => {
      session.inputMode = 'pine';
      this.investigations = [...this.investigations.filter(i => i.id !== id), investigation];
    });
    return investigation;
  };

  /**
   * Makes room for a new investigation: past MAX_INVESTIGATIONS, the oldest
   * that is over is dropped, with its tab and what it saw. Over means its
   * tab is closed, nothing waits on the user, and its agent hasn't called
   * for INVESTIGATION_IDLE_MS. One still in use is never dropped.
   */
  private dropOldInvestigations = () => {
    if (this.investigations.length < MAX_INVESTIGATIONS) return;
    const now = Date.now();
    const over = this.investigations
      .filter(
        i =>
          !i.tabOpen &&
          i.pendingDecisions.length === 0 &&
          !i.steps.some(s => s.kind === 'query' && s.running) &&
          now - (i.lastCallAt ?? 0) >= INVESTIGATION_IDLE_MS,
      )
      .sort((a, b) => (a.lastCallAt ?? 0) - (b.lastCallAt ?? 0));
    const drop = new Set(over.slice(0, this.investigations.length - MAX_INVESTIGATIONS + 1));
    if (drop.size === 0) return;
    runInAction(() => {
      this.investigations = this.investigations.filter(i => !drop.has(i));
      drop.forEach(investigation => this.deleteSession(investigation.sessionId));
    });
  };

  private getOrCreateMcpSession = (investigationId: string = DEFAULT_INVESTIGATION): Session =>
    this.sessions[this.getOrCreateInvestigation(investigationId).sessionId];

  private mcpQueryDeps = (investigationId: string = DEFAULT_INVESTIGATION) => ({
    client,
    getSavedProfileCredentials: this.getSavedProfileCredentials,
    getOrCreateMcpSession: () => this.getOrCreateMcpSession(investigationId),
    getServerVersion: () => this.version,
    isMcpConnectionOpen: (connectionId: string) => !!this.mcpOpenConnections[connectionId],
    markMcpConnectionOpen: (connectionId: string) => {
      runInAction(() => {
        this.mcpOpenConnections = { ...this.mcpOpenConnections, [connectionId]: true };
      });
    },
    // Always re-reads both the connection list and every access policy
    // first (see mcp-query.ts's top comment for why a cached snapshot isn't
    // safe here) -- this replaces `this.connections`/`this.accessPolicies`
    // wholesale, so it also brings Session.accessPolicyRules (which reads
    // those same two) up to date for whichever session runMcpQuery is
    // about to evaluate against.
    resolveAccessPolicyRules: async (profileId: string) => {
      const [connections, policies] = await Promise.all([this.refreshConnections(), this.refreshAccessPolicies()]);
      // forMcp: true -- this is only ever called from runMcpQuery/explainMcpQuery.
      return effectiveAccessPolicyRules(connections.find(c => c.id === profileId), policies, true);
    },
  });

  /**
   * The only entry point the `run_query` MCP tool reaches.
   * Executes in the dedicated MCP tab (getOrCreateMcpSession), never the
   * human's active tab. See store/mcp-query.ts for the safety rules this
   * enforces (no raw SQL, no delete!, connection-id always explicit).
   */
  runMcpQuery = async ({
    investigationId,
    requestId,
    ...args
  }: {
    profileId: string;
    expression: string;
    sql?: string;
    variables?: Record<string, VariableValue>;
    investigationId?: string;
    requestId?: string;
  }) => {
    const investigation = this.getOrCreateInvestigation(investigationId);
    const stepId = investigation.startQuery(args.expression, 'agent', args.sql);
    const run = { sessionId: investigation.sessionId, cancelled: false, started: false };
    if (requestId) this.mcpRuns.set(requestId, run);
    try {
      // One query at a time per investigation: they share its tab, and a
      // second one would read the first's columns, rows and error.
      return await investigation.queue.run(() => this.runQueuedMcpQuery(investigation, stepId, run, args));
    } finally {
      if (requestId) this.mcpRuns.delete(requestId);
    }
  };

  private runQueuedMcpQuery = async (
    investigation: Investigation,
    stepId: string,
    run: { cancelled: boolean; started: boolean },
    args: { profileId: string; expression: string; sql?: string; variables?: Record<string, VariableValue> },
  ) => {
    if (run.cancelled) {
      const message = 'Stopped before it ran: the agent waited too long for it.';
      investigation.failQuery(stepId, message);
      throw new Error(message);
    }
    run.started = true;
    // Marks the tab's requests as the agent's for exactly as long as this
    // query runs (Session.runsAsAgent): they are enforced, and the run isn't
    // taken for the user's own (onSessionEvaluated).
    const running = this.getOrCreateMcpSession(investigation.id);
    runInAction(() => running.agentRunsInFlight++);
    const work = (async () => {
      try {
        const first = await runMcpQueryImpl(this.mcpQueryDeps(investigation.id), args);
        // pine-lang no longer has the connection this app made for the agent,
        // such as after the server restarted: make a new one, once.
        if (run.cancelled || running.evalErrorType !== 'no-connection') return first;
        this.forgetMcpConnection(args.profileId);
        return await runMcpQueryImpl(this.mcpQueryDeps(investigation.id), args);
      } finally {
        runInAction(() => running.agentRunsInFlight--);
      }
    })();
    // A run that never ends would hold the queue, and every later query of
    // this investigation would wait behind it: past the deadline it is
    // stopped and its place given up. A desktop app older than
    // onQueryCancel never stops one itself.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => resolve('timeout'), this.mcpQueryDeadlineMs);
      // Node's timers keep a process alive (the tests); a browser's are numbers.
      (timer as { unref?: () => void }).unref?.();
    });
    let result: Awaited<ReturnType<typeof runMcpQueryImpl>>;
    try {
      const outcome = await Promise.race([work, deadline]);
      if (outcome === 'timeout') {
        void running.stop();
        work.catch(() => undefined);
        throw new Error(`The query was stopped: it ran for more than ${Math.round(this.mcpQueryDeadlineMs / 1000)} s.`);
      }
      result = outcome;
    } catch (e) {
      investigation.failQuery(stepId, e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
    const session = this.sessions[investigation.sessionId];
    // No tab id: the SQL didn't convert, so nothing ran in the tab, and
    // there is no Pine to show there again.
    if (session && result.tabId) investigation.finishQuery(stepId, snapshotOf(session));
    else investigation.failQuery(stepId, result.error);

    // Flag SideRail's badge regardless of `result.error` -- a
    // failed MCP query is still activity worth surfacing, not something to
    // swallow silently. Not wrapped into runMcpQueryImpl itself: that file
    // is deliberately isolated (see its own top comment) to keep
    // __tests__/mcp-query.no-raw-sql.test.ts scoped to query execution, not
    // UI state.
    runInAction(() => {
      this.mcpHasUnseenActivity = true;
    });
    return result;
  };

  /**
   * The desktop app gave up on an agent's query (its time limit). A query
   * still waiting its turn never runs; a running one is stopped on the
   * server, as the Stop button does.
   */
  cancelMcpQuery = (requestId: string) => {
    const run = this.mcpRuns.get(requestId);
    if (!run) return;
    run.cancelled = true;
    if (run.started) void this.sessions[run.sessionId]?.stop();
  };

  private forgetMcpConnection = (connectionId: string) => {
    const { [connectionId]: _gone, ...others } = this.mcpOpenConnections;
    this.mcpOpenConnections = others;
  };

  /** An agent's proposed policy change, from beamlynx-desktop (McpBridge.tsx): a card in its investigation. */
  handlePolicyProposal = (proposal: PolicyProposal) => {
    this.getOrCreateInvestigation(proposal.investigationId).addProposal(proposal);
    runInAction(() => {
      this.mcpHasUnseenActivity = true;
    });
  };

  /** A proposal the agent stopped waiting on: its card can no longer be answered. */
  expirePolicyProposal = (proposalId: string) => {
    for (const investigation of this.investigations) investigation.setProposal(proposalId, 'expired');
  };

  private proposalStep = (investigationId: string, proposalId: string) =>
    this.investigations.find(i => i.id === investigationId)?.proposal(proposalId);

  /**
   * Re-reads the saved connections and every access policy. Desktop only:
   * elsewhere there are none to read. A decision about a policy reads them
   * first, so it never acts on a list another window or Settings changed.
   */
  private refreshPolicyState = async () => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return;
    await Promise.all([this.refreshConnections(), this.refreshAccessPolicies()]);
  };

  /**
   * The user's answer to a proposal card. Apply makes the changes to the
   * connection's own policy, through the same calls as Settings, then tells
   * the agent's waiting call. Only a pending card is answered, and only
   * while the connection still has the policy the changes were checked
   * against. False when nothing was saved. A change that fails, by
   * returning nothing or by throwing, puts the policy back as it was; a
   * throw is passed on, for the card to show.
   */
  answerPolicyProposal = async (investigationId: string, proposalId: string, apply: boolean, comment?: string) => {
    const step = this.proposalStep(investigationId, proposalId);
    if (!step || step.status !== 'pending') return false;
    const { proposal } = step;
    const investigation = this.investigations.find(i => i.id === investigationId)!;
    if (!apply) {
      await desktopMcp()?.resolvePolicyProposal?.(proposal.id, { applied: false, comment });
      investigation.setProposal(proposal.id, 'declined');
      return true;
    }
    await this.refreshPolicyState();
    const current = this.connectionPolicy(proposal.profileId);
    if (!current || current.id !== proposal.policyId) return false;
    const policyId = current.id;
    const before = toJS(current.rules);
    // The policy as the desktop app stored it after the last change.
    let saved: AccessPolicy | null = null;
    try {
      for (const change of proposal.changes) {
        // Showing a column takes out its own Except rules first, as the
        // results grid's "Show to agents" does. The card says so. Read
        // from the policy as it is now, after the changes before this one.
        const rules = this.connectionPolicy(proposal.profileId)?.rules ?? [];
        for (const hide of 'add' in change ? ownHideRules(rules, change.add) : []) {
          saved = await this.removeAccessPolicyRule(policyId, hide.id);
          if (!saved) {
            await this.setAccessPolicyRules(policyId, before);
            return false;
          }
        }
        saved =
          'add' in change
            ? await this.addAccessPolicyRule(policyId, change.add)
            : 'remove' in change
              ? await this.removeAccessPolicyRule(policyId, change.remove)
              : await this.setAccessPolicyRuleEnabled(policyId, 'enable' in change ? change.enable : change.disable, 'enable' in change);
        if (!saved) {
          await this.setAccessPolicyRules(policyId, before);
          return false;
        }
      }
    } catch (e) {
      await this.setAccessPolicyRules(policyId, before).catch(() => null);
      throw e;
    }
    // The rules as the policy list reads them, which is what Undo compares
    // with. Without the desktop app, as the last change returned them.
    await this.refreshPolicyState().catch(() => undefined);
    const after = isDesktop() ? this.accessPolicies.find(p => p.id === policyId)?.rules : undefined;
    investigation.setProposal(proposal.id, 'applied', { before, after: toJS(after ?? saved?.rules ?? before) });
    // Saved either way. Telling the agent is all that's left, and it may
    // have stopped waiting.
    let told: boolean | undefined;
    try {
      told = await desktopMcp()?.resolvePolicyProposal?.(proposal.id, { applied: true });
    } catch {
      told = false;
    }
    if (told === false) investigation.markProposalAgentGone(proposal.id);
    return true;
  };

  /**
   * Puts the policy back as it was before an applied proposal. The agent
   * isn't told. Refused, with an error that says why, once the policy has
   * changed since Apply: putting the old rules back would also undo that
   * later change, such as a column hidden afterwards.
   */
  undoPolicyProposal = async (investigationId: string, proposalId: string) => {
    const step = this.proposalStep(investigationId, proposalId);
    if (!step || step.status !== 'applied' || !step.before) return false;
    await this.refreshPolicyState();
    const policy = this.accessPolicies.find(p => p.id === step.proposal.policyId);
    if (!policy || (step.after && !sameRules(policy.rules, step.after))) {
      throw new Error('The data masking has changed since this was applied. Undo it on the Agent page instead.');
    }
    if (!(await this.setAccessPolicyRules(step.proposal.policyId, step.before))) return false;
    this.investigations.find(i => i.id === investigationId)!.setProposal(proposalId, 'undone');
    return true;
  };

  /** The connection an investigation's queries run on, by its label. */
  investigationConnection = (investigationId: string) => {
    const investigation = this.investigations.find(i => i.id === investigationId);
    const session = investigation && this.sessions[investigation.sessionId];
    return this.connections.find(c => c.id === session?.connectionId);
  };

  /** A tool call's start or end, from beamlynx-desktop (McpBridge.tsx). */
  applyAgentActivity = (event: AgentActivity) => {
    this.agentActivity.apply(event);
    this.getOrCreateInvestigation(event.investigationId).apply(event);
  };

  /**
   * Called when any tab finishes running (Session.evaluate). In an
   * investigation's tab, a run that isn't the agent's is the user's own: it
   * goes in the timeline, and the agent is told with its next call.
   */
  onSessionEvaluated = (session: Session) => {
    if (session.agentRunsInFlight > 0) return;
    const investigation = this.investigationForSession(session.id);
    if (!investigation) return;
    const snapshot = snapshotOf(session);
    investigation.finishQuery(investigation.startQuery(snapshot.expression, 'user'), snapshot);
    const outcome = snapshot.error
      ? `It failed: ${snapshot.error}`
      : `It returned ${snapshot.rows.length} row${snapshot.rows.length === 1 ? '' : 's'}.`;
    void desktopMcp()?.addNote?.(
      investigation.id,
      `They ran this query themselves, in the tab that shows your work:\n${snapshot.expression}\n${outcome}`,
    );
  };

  /** Shows one step's result in its investigation's tab, without running anything. */
  showInvestigationStep = (investigationId: string, stepId: string | null) => {
    const investigation = this.investigations.find(i => i.id === investigationId);
    const session = investigation && this.sessions[investigation.sessionId];
    if (!investigation || !session) return;
    const step = stepId
      ? investigation.steps.find(s => s.id === stepId)
      : investigation.latestQuery;
    // A query's result as the agent saw it.
    const snapshot = step?.kind === 'query' ? step.snapshot : undefined;
    if (!snapshot) return;
    investigation.select(stepId);
    session.showSnapshot(snapshot);
  };

  /** Backing call for the `complete_query` MCP tool -- parse/build only, no execution. */
  explainMcpQuery = async (args: { profileId: string; expression: string }) => {
    const response = await explainMcpQueryImpl(this.mcpQueryDeps(), args);
    // As in runQueuedMcpQuery: a connection pine-lang no longer has.
    if ((response as { 'error-type'?: string })?.['error-type'] !== 'no-connection') return response;
    this.forgetMcpConnection(args.profileId);
    return explainMcpQueryImpl(this.mcpQueryDeps(), args);
  };


  /**
   * Toggles whether MCP clients may use a saved connection at all -- the
   * access-control lever for the MCP server. Off by default; the
   * control-plane server (beamlynx-desktop) refuses any MCP tool call
   * against a connection that isn't in this list, regardless of what's live
   * in pine-lang's own pool. Also refused (not silently ignored) if *this
   * connection's own* assigned policy is a real, named policy with no
   * active module -- there is no "MCP on, undecided" state -- see
   * credential-store.ts's setMcpEnabled. Not refused when the connection's
   * policy is null ("None"): that's a deliberate choice of unrestricted
   * access, not an oversight to guard against. The ConnectionsSection UI is
   * expected to disable this control before the refusal case can even be
   * attempted (see its own tooltip/disabled state), but this still surfaces
   * connectionError on the refusal path as a belt-and-suspenders in case a
   * caller reaches it some other way.
   */
  setMcpEnabled = async (id: string, enabled: boolean): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const result = await window.beamlynxDesktop.credentials.setMcpEnabled(id, enabled);
    if (!result.ok) {
      runInAction(() => {
        this.connectionError =
          result.reason === 'no-active-policy'
            ? 'Select "None" for unrestricted access, or a masking policy with an active rule, for this connection first.'
            : 'That connection no longer exists.';
      });
      return;
    }
    runInAction(() => {
      this.connections = this.connections.map(c =>
        c.id === id ? { ...c, mcpEnabled: result.profile.mcpEnabled, policyId: result.profile.policyId } : c,
      );
    });
  };

  /**
   * Sets what agents can do on a connection: off, masked by its policy, or
   * every column (the policy kept, unapplied). Masked without a policy
   * needs `templateId`, the template its policy starts from. False, with
   * connectionError set, when refused. See credential-store.ts's
   * setAgentAccess.
   */
  setAgentAccess = async (id: string, access: AgentAccess, templateId?: string): Promise<boolean> => {
    const desktop = typeof window === 'undefined' ? undefined : window.beamlynxDesktop;
    if (!desktop?.credentials.setAgentAccess) return false;
    const result = await desktop.credentials.setAgentAccess(id, access, templateId);
    if (!result.ok) {
      runInAction(() => {
        this.connectionError =
          result.reason === 'no-active-policy'
            ? "This database's data masking has no rule on, so it would mask nothing. Turn a rule on first."
            : result.reason === 'needs-template'
              ? 'Choose the rules to start its data masking from.'
              : 'That connection no longer exists.';
      });
      return false;
    }
    runInAction(() => {
      this.connections = this.connections.map(c =>
        c.id === id
          ? {
              ...c,
              mcpEnabled: result.profile.mcpEnabled,
              policyId: result.profile.policyId,
              agentsSeeEveryColumn: result.profile.agentsSeeEveryColumn,
            }
          : c,
      );
    });
    // A connection that started from a template has a new policy.
    await this.refreshAccessPolicies();
    return true;
  };

  /**
   * Gives a connection a fresh copy of a template's rules as its own policy,
   * in place of the rules it had, or no policy (null, "None" -- unrestricted
   * access, a valid choice even while mcpEnabled is already true). Refused
   * only for a template with no active rule while mcpEnabled is true: MCP
   * must never end up behind a policy that decides nothing. Surfaces
   * connectionError on refusal the same way setMcpEnabled does. See
   * credential-store.ts's attachTemplate.
   */
  attachTemplate = async (id: string, templateId: string | null): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return false;
    const result = await window.beamlynxDesktop.credentials.attachTemplate(id, templateId);
    if (!result.ok) {
      runInAction(() => {
        this.connectionError =
          result.reason === 'mcp-requires-policy'
            ? 'Agents can use this database, so its data masking needs a rule that is on. Pick other rules, or turn agents off for it first.'
            : 'That database or those rules no longer exist.';
      });
      return false;
    }
    runInAction(() => {
      this.connections = this.connections.map(c =>
        c.id === id ? { ...c, mcpEnabled: result.profile.mcpEnabled, policyId: result.profile.policyId } : c,
      );
    });
    // The connection's new policy, and its old one gone.
    await this.refreshAccessPolicies();
    return true;
  };

  /**
   * Whether the connection owner has switched the assigned policy ON for
   * their own tab queries on it too -- MCP always uses the assigned policy
   * and never reads this. Never refused: unlike
   * setMcpEnabled/setConnectionPolicy there's no "pointing at nothing" state
   * this could create, since it doesn't touch mcpEnabled or policyId. See
   * credential-store.ts's setApplyPolicyToOwnQueries.
   */
  setApplyPolicyToOwnQueries = async (id: string, apply: boolean): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const updated = await window.beamlynxDesktop.credentials.setApplyPolicyToOwnQueries(id, apply);
    if (!updated) {
      runInAction(() => {
        this.connectionError = 'That connection no longer exists.';
      });
      return;
    }
    runInAction(() => {
      this.connections = this.connections.map(c =>
        c.id === id ? { ...c, applyPolicyToOwnQueries: updated.applyPolicyToOwnQueries } : c,
      );
    });
  };

  /**
   * Rename a saved connection profile. Desktop-only -- browser mode's
   * connection list comes straight from pine-lang's live pools (see
   * refreshConnections), which has nowhere to persist a custom name.
   */
  renameConnection = async (id: string, label: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    try {
      const profile = await window.beamlynxDesktop.credentials.rename(id, label);
      if (!profile) return;
      runInAction(() => {
        this.connections = this.connections.map(c =>
          c.id === id ? { ...c, label: profile.label } : c,
        );
      });
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.connectionError = `Failed to rename: ${message}`;
      });
      throw e;
    }
  };

  /**
   * Delete a connection: best-effort, silently close any live pine session
   * for it, and (desktop only) forget the saved credential -- both are
   * independent and safe to attempt even if the other has nothing to do
   * (e.g. deleting a saved profile that was never connected this session,
   * or deleting in browser mode where there's no saved credential at all).
   */
  deleteConnection = async (id: string) => {
    // The playground's connection is shared infrastructure -- deleting it
    // breaks the playground for everyone else using it, so refuse here as a
    // backstop even though the UI already hides the delete action.
    if (isPlayground()) {
      return;
    }
    const desktopApi = typeof window !== 'undefined' ? window.beamlynxDesktop : undefined;
    const useDesktop = isDesktop() && !!desktopApi;
    console.log(`[credentials] deleteConnection: id=${id} useDesktop=${useDesktop}`);

    try {
      await client.deleteConnection(id);
    } catch {
      // No live session under this id -- nothing to close, not an error.
    }

    if (useDesktop && desktopApi) {
      try {
        await desktopApi.credentials.delete(id);
        // Its own policy went with it.
        await this.refreshAccessPolicies();
      } catch {
        // Best effort -- nothing more useful to do if this fails.
      }
    }

    runInAction(() => {
      this.liveConnectionIds = this.liveConnectionIds.filter(c => c !== id);
      this.forgetMcpConnection(id);
      Object.values(this.sessions).forEach(session => {
        if (session.connectionId === id) {
          // Whatever was connecting it no longer applies.
          this.endConnect(session, this.beginConnect(session), false);
          session.connectionId = '';
        }
      });
      if (this.virtualSession?.connectionId === id) {
        this.virtualSession.connectionId = '';
      }
    });
    await this.refreshConnections();
  };

  /**
   * Counts reindexes, so what was loaded from a connection's schema (the SQL
   * panel's completion) loads again.
   */
  schemaVersion = 0;

  /**
   * Re-read a live connection's tables/columns from the database. The server
   * indexes a connection's schema once on first connect and caches it for the
   * life of the process, so a table or column added afterward stays invisible
   * until this is called (or the server restarts).
   */
  reindexConnection = async (id: string): Promise<void> => {
    try {
      await client.reindexConnection(id);
      runInAction(() => {
        this.schemaVersion++;
      });
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.connectionError = `Failed to reindex: ${message}`;
      });
      throw e;
    }
  };

  /**
   * Opens a pool and checks it works: no tab or saved-connection side
   * effects. With `id`, pine-lang opens it under that id (a saved
   * connection's); without, under its own address-based id. Shared by
   * `connect` and ensureSessionConnected's background reconnect.
   */
  private establishConnection = async (
    params: ConnectionParams & { id?: string },
  ): Promise<{ id: string; version: string }> => {
    const connectionId = await client.createConnection(params);
    if (!connectionId) {
      throw new Error("Connection wasn't created");
    }
    if (params.id && connectionId !== params.id) {
      // pine-lang opens the pool under the id it is given. Anything else
      // would put the tab on a connection it didn't ask for.
      throw new Error(`The server opened ${connectionId} instead of ${params.id}`);
    }
    const { id, version } = await client.checkConnection(connectionId);
    if (!id) {
      throw new Error('Failed to connect');
    }
    return { id, version };
  };

  /**
   * Desktop: saves a connection that was just checked, and gives its saved
   * id, or '' when it couldn't be saved (no OS credential store).
   */
  private saveNewConnection = async (params: ConnectionParams): Promise<string> => {
    if (!isDesktop() || typeof window === 'undefined' || !window.beamlynxDesktop) return '';
    try {
      const saveResult = await window.beamlynxDesktop.credentials.save(params);
      if (isDevelopment()) console.log('[credentials] connect: save result ->', saveResult);
      if (!saveResult.persisted) return '';
      // A new connection gets its own copy of the first template, which
      // this list doesn't have yet.
      await this.refreshAccessPolicies();
      return saveResult.profile.id;
    } catch (e) {
      console.error('[credentials] connect: credentials.save threw ->', e);
      return '';
    }
  };

  /**
   * Create (or re-establish) a connection and make it the active tab's,
   * whatever that tab currently contains -- no fork-a-new-tab side step, and
   * no pendingConnectionSwitch warning here. `connectToSavedProfile`'s own
   * callers gate this for their "switch this tab to a different saved
   * profile" UI actions (see PendingConnectionSwitch); this primitive is also
   * called by flows with no tab-content concern to warn about at all: the
   * "Add Connection" form (a brand-new connection, not a switch) and the
   * deep-link handler (which always targets a fresh tab it just created).
   *
   * The connection goes to the tab that was open when this was called, not
   * whichever is open when connecting finishes: switching tabs while a
   * slow database connects used to put the other tab on it, without the
   * warning its query should have had. A later switch of the same tab wins.
   *
   * @param savedId The saved connection's id, when it has one
   * (connectToSavedProfile). Without it, this is a new connection: it is
   * checked first and saved after, so a mistyped password is never saved,
   * and then opened under its saved id.
   */
  connect = async (
    params: ConnectionParams,
    savedId?: string,
    // Given by connectToSavedProfile, which picks the tab before its own wait.
    started?: { target: Session; seq: number },
  ): Promise<string> => {
    const target = started?.target ?? this.sessions[this.activeSessionId];
    const seq = started?.seq ?? (target ? this.beginConnect(target) : 0);
    let connected = false;
    let id: string;
    let version: string;
    try {
      if (savedId) {
        ({ id, version } = await this.establishConnection({ ...params, id: savedId }));
      } else {
        ({ id, version } = await this.establishConnection(params));
        const newId = await this.saveNewConnection(params);
        if (newId) {
          const checked = id;
          ({ id, version } = await this.establishConnection({ ...params, id: newId }));
          // The pool opened only to check the connection, unless a tab is
          // on it: one on a connection that couldn't be saved earlier.
          if (!Object.values(this.sessions).some(s => s.connectionId === checked)) {
            await client.deleteConnection(checked).catch(() => undefined);
          }
        }
      }
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.connectionError = `Failed to connect: ${message}`;
        if (target) this.endConnect(target, seq, false);
      });
      throw e;
    }

    runInAction(() => {
      this.version = version ?? '0.0.0';
      this.assignConnectionColor(id);
      this.liveConnectionIds = Array.from(new Set([...this.liveConnectionIds, id]));

      if (target && this.sessions[target.id] === target && target.connectSeq === seq) {
        target.connectionId = id;
        // See the matching comment in selectConnection -- forces the
        // existing expression to re-resolve against the new connection.
        target.hintsRequestedCounter++;
        connected = true;
      }
      if (target) this.endConnect(target, seq, connected);
      this.pendingConnectionSwitch = null;
    });

    await this.refreshConnections();
    return id;
  };

  /**
   * Apply a connection switch that ChangeConnectionModal warned about and the
   * user confirmed anyway.
   */
  confirmPendingConnectionSwitch = async (): Promise<void> => {
    const pending = this.pendingConnectionSwitch;
    if (!pending) {
      return;
    }
    runInAction(() => {
      this.pendingConnectionSwitch = null;
    });
    if (pending.kind === 'select') {
      await this.selectConnection(pending.connectionId, true);
    } else {
      await this.connectToSavedProfile(pending.id);
    }
  };

  /**
   * Open the connection ChangeConnectionModal asked about in a new tab,
   * leaving the current tab and its query as they are.
   */
  openPendingConnectionInNewTab = async (): Promise<void> => {
    const pending = this.pendingConnectionSwitch;
    if (!pending) {
      return;
    }
    runInAction(() => {
      this.pendingConnectionSwitch = null;
      this.addTab();
    });
    // The new tab is empty, so the switch applies to it without asking.
    if (pending.kind === 'select') {
      await this.selectConnection(pending.connectionId, true);
    } else {
      await this.connectToSavedProfile(pending.id);
    }
  };

  cancelPendingConnectionSwitch = () => {
    this.pendingConnectionSwitch = null;
  };

  /**
   * Hold a "switch this tab to a different known connection" action behind
   * ChangeConnectionModal's warning -- called by the UI switch actions in
   * ActiveConnection.tsx / ConnectionsSection.tsx when the active tab has a
   * non-empty Pine expression, instead of calling selectConnection /
   * connectToSavedProfile directly.
   */
  requestConnectionSwitch = (pending: PendingConnectionSwitch) => {
    this.pendingConnectionSwitch = pending;
  };

  /**
   * Starts a connection change for a tab: it counts as connecting, so Run
   * waits, and whatever started before it no longer applies (connectSeq).
   */
  private beginConnect = (session: Session): number => {
    session.connectSeq++;
    session.connecting = true;
    return session.connectSeq;
  };

  /**
   * Ends the change `seq` started, unless a newer one has begun: that one
   * ends it. `connected` leaves the wait to the tab's next build, so old
   * errors stay hidden until the build on the new connection replaces them.
   */
  private endConnect = (session: Session, seq: number, connected: boolean) => {
    if (session.connectSeq !== seq) return;
    session.connecting = false;
    if (!connected) session.awaitingConnection = false;
  };

  /**
   * Silently (re)connect one specific tab's *own* assigned connection if
   * it isn't already live -- never opens a modal, never forks a new tab,
   * never touches any other tab. This is what makes "connect lazily, only
   * when needed" work: called whenever a tab becomes active (see the
   * activeSessionId/pineConnected reactions in the constructor), not
   * eagerly for every tab up front.
   */
  ensureSessionConnected = async (sessionId: string): Promise<void> => {
    const session = this.sessions[sessionId];
    if (!session || !session.connectionId || !this.pineConnected) {
      console.log(
        `[credentials] ensureSessionConnected(${sessionId}): skip -- session=${!!session} connectionId=${session?.connectionId} pineConnected=${this.pineConnected}`,
      );
      // Still waiting while pine itself isn't up: this runs again once it is.
      if (session && this.pineConnected) runInAction(() => (session.awaitingConnection = false));
      return;
    }
    if (this.isConnectionLive(session.connectionId)) {
      console.log(
        `[credentials] ensureSessionConnected(${sessionId}): already live (${session.connectionId}), no-op`,
      );
      runInAction(() => (session.awaitingConnection = false));
      return;
    }
    // Ends the wait unless the tab connected: then its next build does
    // (Session's response reaction), so the old errors stay hidden until
    // the build on the new connection replaces them.
    let reconnected = false;
    // The connection this reconnect is for. If the tab moves to another
    // while it runs, or is closed, the answer is dropped: it used to
    // overwrite the tab's newer choice.
    const connectionId = session.connectionId;
    const seq = this.beginConnect(session);
    const stale = () => session.connectSeq !== seq || this.sessions[sessionId] !== session;

    console.log(`[credentials] ensureSessionConnected(${sessionId}): reconnecting connectionId=${connectionId}`);
    try {
      let version: string;
      if (isDesktop()) {
        // The tab's id is its saved connection's, and pine-lang opens the
        // pool under that same id.
        const params = await this.getSavedProfileCredentials(connectionId);
        ({ version } = await this.establishConnection({ ...params, id: connectionId }));
      } else {
        ({ version } = await client.checkConnection(connectionId));
      }
      console.log(`[credentials] ensureSessionConnected(${sessionId}): reconnected -> id=${connectionId}`);
      runInAction(() => {
        this.assignConnectionColor(connectionId);
        this.liveConnectionIds = Array.from(new Set([...this.liveConnectionIds, connectionId]));
        if (sessionId === this.activeSessionId) {
          this.version = version ?? this.version;
        }
      });
      if (stale()) return;
      // The very first build (fired the moment this session was
      // constructed/restored, before this connection actually had a live
      // pool) almost certainly failed -- session.ast stayed null, which
      // canvas mode reads as "still connecting" forever (see
      // CanvasStore.isConnecting), since nothing else re-triggers a build
      // once the expression itself stops changing. Same fix as
      // restoreSessions' analogous "pine wasn't reachable yet" case just
      // above: request hints again now that the connection is real.
      // requestHints's own guard (skip if the cursor hasn't moved since the
      // last successful build) doesn't block this -- that build never
      // succeeded, so lastHintsCursorPosition was never set.
      reconnected = true;
      session.rebuild();
    } catch (e) {
      if (stale()) return;
      if (e instanceof SavedConnectionNotFoundError) {
        // The tab points at a saved connection that was deleted. Forget it
        // once, rather than failing (and showing an alert) on every switch
        // to this tab.
        runInAction(() => {
          session.connectionId = '';
          session.message = 'This tab’s saved connection no longer exists. Pick a connection.';
        });
        return;
      }
      if (e instanceof ConnectionError && e.errorType === 'database-unreachable') {
        // The database is down, or not reachable from here yet. Nothing is
        // wrong with the tab or its saved connection, so no alert: the tab
        // shows the one "can't reach the database" message, and connecting
        // is tried again while the tab is open.
        console.log(`[credentials] ensureSessionConnected(${sessionId}): database unreachable`);
        const reason = e.message;
        runInAction(() => {
          session.unreachable = reason;
        });
        return;
      }
      const message = (e as Error)?.message ?? 'Unknown error';
      console.error(`[credentials] ensureSessionConnected(${sessionId}): failed ->`, e);
      runInAction(() => {
        session.message = `⚠ Failed to reconnect: ${message}`;
        // Only surface the global Snackbar for the tab the user is actually
        // looking at -- a background tab silently failing to reconnect
        // (e.g. one of several stale tabs from a previous session) would
        // otherwise pop an alert for something not currently on screen; its
        // own per-tab message above is enough for that case.
        if (sessionId === this.activeSessionId) {
          this.connectionError = `Failed to reconnect: ${message}`;
        }
      });
    } finally {
      this.endConnect(session, seq, reconnected);
    }
  };

  /**
   * The database `connectionId` answered again. Every tab on it whose last
   * build drew nothing builds again, so switching to one shows its graph,
   * not the old error.
   */
  databaseReachable = (connectionId: string) => {
    for (const session of Object.values(this.sessions)) {
      if (session.connectionId === connectionId && session.buildFailed) {
        session.rebuild();
      }
    }
  };

  /**
   * Tries the open tab's database again: connects it if it isn't connected,
   * and builds again if it is.
   */
  private retryActiveDatabase = () => {
    const session = this.sessions[this.activeSessionId];
    if (!session?.databaseUnreachable) return;
    if (this.isConnectionLive(session.connectionId)) {
      session.rebuild();
    } else {
      void this.ensureSessionConnected(this.activeSessionId);
    }
  };

  /**
   * A new tab on `connectionId`, or on none. Each caller says which: a tab
   * never takes a connection from anywhere else.
   */
  createSessionUsingId = (id: string, connectionId = '') => {
    const session = new Session(id, this);
    session.connectionId = connectionId;
    this.sessions[session.id] = session;
    return session;
  };

  createSession = (connectionId = '') => {
    const id = Math.random().toString(36).substring(7);
    return this.createSessionUsingId(id, connectionId);
  };

  deleteSession = (sessionId: string) => {
    delete this.sessions[sessionId];
  };

  /**
   * Open a Pine expression in a new tab, inheriting the current tab's
   * connection, and switch to it.
   *
   * Used by the traversal panel: every table the walk reached carries a real,
   * runnable expression, so a row in that list is something you can go and
   * look at rather than a name and a number. A new tab rather than the
   * current one - the expression you were working on is the reason the
   * traversal exists, and overwriting it to inspect a branch of its own
   * result would be a poor trade.
   */
  openExpressionInNewTab = async (expression: string) => {
    const from = this.activeSessionId;
    this.addTab();
    const session = this.sessions[this.activeSessionId];
    if (!session) return undefined;
    // Closing this tab should land back where it was opened from, not on
    // whatever happens to be first (see closeTab).
    session.openedFrom = from;

    // Prettified before it is shown. The expressions a traversal builds are
    // assembled by appending joins, so they arrive as one long line with
    // doubled spaces -- correct Pine, but not what anyone would have typed.
    let text = expression;
    try {
      text = await session.prettifyExpression(expression);
    } catch {
      // A prettify that fails is cosmetic; show the raw expression rather
      // than nothing.
    }
    runInAction(() => {
      session.expression = text;
    });

    // The expression -> build reaction cannot do this one. It was created
    // inside `addTab` above, and a reaction created mid-action defers its
    // first tracked read until that action unwinds -- by which point the
    // expression is already its final value, so no before/after transition is
    // ever observed and the build never fires. `ast` stays null, which is
    // exactly the "no nodes on the canvas" symptom. restoreSessions hit the
    // same trap and documents it at length. Past the action now (this await),
    // so bumping the counter is a real change the reaction sees.
    session.requestHints();

    // And run it, if auto-run is on. Setting the expression builds it -- that
    // is what draws the graph -- but building is not committing, and auto-run
    // listens for a commit (notifyCanvasCommit, which every canvas gesture
    // calls). Without this the new tab showed the query and the graph and then
    // sat there, which is not what opening a row is for: the point is to see
    // the rows. notifyCanvasCommit honours the auto-run preference itself, so
    // there is nothing to check here.
    session.notifyCanvasCommit();
    return session;
  };

  /**
   * Add a new tab and switch to it.
   * This is the proper way to create a new tab in the UI.
   */
  /**
   * Opens Beamlynx's own data file, beamlynx.db (preferences, recipes and
   * column widths), as a SQLite connection in a new tab. A saved connection
   * to the file is reused; otherwise one is saved, named after it.
   * Desktop only.
   */
  openAppDataFile = async (): Promise<void> => {
    const file = await window.beamlynxDesktop?.appDb?.path?.();
    if (!file) return;
    runInAction(() => {
      const session = this.createSession();
      this.activeSessionId = session.id;
    });
    const saved = this.connections.find(c => c.dbName === file && !c.dbHost);
    if (saved) {
      await this.connectToSavedProfile(saved.id);
    } else {
      await this.connect({
        dbType: 'sqlite',
        dbName: file,
        dbHost: '',
        dbPort: '',
        dbUser: '',
        dbPassword: '',
        label: 'Beamlynx data (beamlynx.db)',
      });
    }
  };

  addTab = () => {
    // On the open tab's connection, or on none when it has none.
    const session = this.createSession(this.activeConnectionId);
    this.activeSessionId = session.id;
  };

  // The tabs in the strip: every session except an investigation's whose
  // tab isn't open (openInvestigationTab). Reorder and cycling read this
  // instead of `Object.keys(sessions)` directly, so a hidden investigation
  // can't be dragged or reached with Ctrl+Tab, and closing the user's only
  // other tab can't hand activeSessionId to it.
  get visibleSessionIds(): string[] {
    const hidden = new Set(this.investigations.filter(i => !i.tabOpen).map(i => i.sessionId));
    return Object.keys(this.sessions).filter(id => !hidden.has(id));
  }

  /**
   * Puts an investigation's tab at the end of the user's tabs, if it isn't
   * there already, and shows it: what the robot does.
   */
  openInvestigationTab = (investigation: Investigation) => {
    if (!this.sessions[investigation.sessionId]) return;
    if (!investigation.tabOpen) {
      const { [investigation.sessionId]: session, ...others } = this.sessions;
      this.sessions = { ...others, [investigation.sessionId]: session };
      investigation.setTabOpen(true);
    }
    this.activeSessionId = investigation.sessionId;
    this.mcpHasUnseenActivity = false;
  };

  /**
   * Close a tab with proper cleanup and switching logic.
   * If it's the pinned MCP tab, just drops it -- the agent's next query
   * recreates it (getOrCreateMcpSession), so there's no "last tab" case to
   * special-case the way there is for the user's own tabs below.
   * Otherwise, if it's the last one of the user's own tabs, resets it
   * instead of closing.
   *
   * @param sessionId The session ID to close
   */
  closeTab = (sessionId: string) => {
    // An investigation's tab only leaves the strip: the agent may still be
    // working, and the robot opens it again with everything it did.
    const investigation = this.investigationForSession(sessionId);
    if (investigation) {
      const index = this.visibleSessionIds.indexOf(sessionId);
      investigation.setTabOpen(false);
      if (this.activeSessionId === sessionId) {
        const remaining = this.visibleSessionIds;
        this.activeSessionId = remaining[Math.max(0, index - 1)] ?? remaining[0] ?? this.activeSessionId;
      }
      return;
    }

    const sessionIds = this.visibleSessionIds;

    // If it's the last visible tab, reset it instead of closing. The fresh
    // tab stays on the closed one's connection. It used to take the
    // connection made last instead, and then named one database and ran on
    // another.
    if (sessionIds.length === 1) {
      const connectionId = this.sessions[sessionId]?.connectionId ?? '';
      this.createSessionUsingId(sessionId.replace('session-', ''), connectionId);
      // Same id, so the activeSessionId reaction won't fire: connect it here
      // in case its connection isn't open.
      void this.ensureSessionConnected(sessionId);
      return;
    }

    const closedIndex = sessionIds.indexOf(sessionId);
    const openedFrom = this.sessions[sessionId]?.openedFrom;

    // Remove the session
    this.deleteSession(sessionId);

    // If the active tab is being closed, switch to another tab
    if (this.activeSessionId === sessionId && sessionIds.length > 1) {
      const remaining = this.visibleSessionIds;
      if (remaining.length > 0) {
        // Where this tab was opened from, if that tab is still open. A tab
        // opened to go and look at something -- a row of a traversal -- is a
        // detour, and finishing a detour should put you back where you
        // started.
        const returnTo = openedFrom && remaining.includes(openedFrom) ? openedFrom : undefined;
        // Otherwise the neighbour on the left, or the new first tab if this
        // was the leftmost. Jumping to tab one from anywhere in the strip
        // loses your place for no reason.
        const neighbour = remaining[Math.max(0, Math.min(closedIndex - 1, remaining.length - 1))];
        this.activeSessionId = returnTo ?? neighbour ?? remaining[0];
      }
    }
  };

  /**
   * Reorder the tab strip, by dragging a tab (PineTabs.tsx). `fromIndex` and
   * `toIndex` are positions in the current strip order.
   *
   * Tab order isn't stored anywhere of its own -- it's the key order of
   * `sessions` itself -- so this rebuilds that record in the new order. That
   * works only because session ids are `session-N` STRINGS: JS objects keep
   * string keys in insertion order, but integer-like keys ('0', '1') would be
   * sorted numerically no matter what order they were inserted in, and this
   * would silently do nothing.
   *
   * Rebuilding rather than keeping a parallel order array is what makes one
   * change carry everywhere, since every reader of tab order reads that same
   * key order: the strip itself, Ctrl+Tab cycling (activateAdjacentTab just
   * below), and the persisted snapshot (snapshotSessions), which stores tabs
   * as an ordered array -- so a reordered strip survives a reload. The
   * Session instances move by reference, so no tab's query, results, or
   * connection is disturbed by being dragged.
   */
  moveTab = (fromIndex: number, toIndex: number) => {
    const ids = this.visibleSessionIds;
    const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < ids.length;
    if (fromIndex === toIndex || !valid(fromIndex) || !valid(toIndex)) return;

    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);

    const reordered: Record<string, Session> = {};
    ids.forEach(id => (reordered[id] = this.sessions[id]));
    // No pinned session (the MCP one) is
    // part of the draggable strip -- carry each over unchanged rather than
    // dropping it, since none of them are in `ids` above (visibleSessionIds)
    // and would otherwise vanish from `sessions`. Keyed off whatever isn't
    // already in `reordered` rather than re-deriving the pinned id list, so
    // this doesn't need its own copy of that logic to stay in sync with it.
    Object.keys(this.sessions).forEach(id => {
      if (!(id in reordered)) {
        reordered[id] = this.sessions[id];
      }
    });
    this.sessions = reordered;
  };

  /**
   * Next/previous tab, wrapping at either end - the same cycling behavior
   * Ctrl+Tab/Ctrl+Shift+Tab has over a real browser's own tab strip (see
   * utils/keybindings.ts). Order matches PineTabs.tsx's own tab strip
   * (`visibleSessionIds`), so this always moves to the visually adjacent
   * one of the user's own tabs, and never lands on a pinned tab --
   * including cycling FROM one: unlike the user's own tabs, activeSessionId
   * can now be a pinned session (clicking its tab, or focusAgentTab), so
   * `indexOf` below can legitimately be -1, not just
   * "not found". Treat that as "off the end", same as a real browser tab
   * strip cycling away from a pinned tab: Ctrl+Tab goes to the first tab,
   * Ctrl+Shift+Tab to the last.
   */
  activateAdjacentTab = (direction: 1 | -1) => {
    const sessionIds = this.visibleSessionIds;
    const currentIndex = sessionIds.indexOf(this.activeSessionId);
    if (currentIndex < 0) {
      this.activeSessionId = sessionIds[direction === 1 ? 0 : sessionIds.length - 1];
      return;
    }
    const nextIndex = (currentIndex + direction + sessionIds.length) % sessionIds.length;
    this.activeSessionId = sessionIds[nextIndex];
  };

  getSession = (id: string): Session => {
    const session = this.sessions[id];
    if (!session) {
      throw new Error('Session with id ' + id + ' not found');
    }
    return session;
  };

  /**
   * The off-screen session that builds and runs a grid edit's `update!`,
   * on the open tab's database. It takes that tab's connection every time
   * it is handed out. It used to keep whichever connection was made last,
   * so an edit in one tab could write to another tab's database.
   */
  getVirtualSession = (): Session => {
    if (!this.virtualSession) {
      this.virtualSession = new Session('virtual', this);
    }
    const virtual = this.virtualSession;
    const connectionId = this.activeConnectionId;
    if (virtual.connectionId !== connectionId) {
      runInAction(() => (virtual.connectionId = connectionId));
    }
    return virtual;
  };

  loadConnectionMetadata = async () => {
    try {
      const response = await client.get('connection');
      runInAction(() => {
        this.serverRejected = false;
      });
      if (!response?.result) {
        runInAction(() => {
          this.version = undefined;
        });
        return;
      }
      const result = response.result as unknown as { version: string };

      // A tab's connectionId can be restored from a previous visit, but the
      // server's pools don't survive a restart, so read which are open now
      // (isConnectionLive). The tab's own id is left alone, for
      // ensureSessionConnected to reconnect when the tab is opened. A tab
      // with no connection stays without one: this used to give it the
      // server's "selected" connection, another tab's database.
      const liveConnections = await client.listConnections();

      runInAction(() => {
        this.version = result.version ?? '0.0.0';
        // Fail open on a transient fetch failure -- leave the previous
        // liveConnectionIds alone rather than wiping the indicator out.
        if (liveConnections) {
          this.liveConnectionIds = liveConnections.connections.map(c => c.id);
        }
      });

      await this.refreshConnections();
      await this.refreshAccessPolicies();
    } catch (e) {
      console.error('Failed to load connection metadata', e);
      runInAction(() => {
        this.version = undefined;
        this.serverRejected = e instanceof ServerRejectedError;
      });
    }
    return this.version;
  };

  getRequiresUpgrade = () => {
    return DevState.requiresUpgrade ?? this.requiresUpgrade;
  };

  setCopiedMessage = (sessionId: string, v: string, quote = false) => {
    const session = this.getSession(sessionId);
    if (quote) {
      v = pineString(v);
    }
    if (v.length > 120) {
      v = v.substring(0, 120) + '...';
    }
    session.message = `📋 Copied: ${v}`;
  };

  // Called for every tab, including the pinned MCP one -- PineTabs.tsx
  // overrides that one's rendered label with a robot icon instead of using
  // this name, so what this returns for it is never actually shown, but it
  // still needs to not throw.
  getSessionName = (sessionId: string) => {
    // An investigation's tab is named for the agent's question.
    const investigation = this.investigationForSession(sessionId);
    if (investigation) {
      const question = investigation.question ?? 'Agent';
      return question.length > 20 ? `${question.slice(0, 19).trimEnd()}…` : question;
    }
    const session = this.getSession(sessionId);
    // A doc comment at the top of the expression is prose about the query,
    // not the query - naming the tab from it produced things like "Checki..."
    // off the second sentence, since the split on '.' below lands inside the
    // comment's own punctuation. Name the tab from the Pine itself.
    // A values block (`$name = ...`) isn't the query either: name the tab
    // from the first block that is.
    const query = splitExpressions(session.expression).find(b => !isValuesBlock(b.text))?.text ?? session.expression;
    const source = query.slice(leadingDoc(query).length).trim();
    const length = source.length;
    const maxLength = 10;

    // Skip the schema when naming the session
    const [x, y] = source.split('.');
    const expression = y || x;

    return length > maxLength
      ? expression.substring(0, maxLength).replaceAll('|', '') + '...'
      : expression || '...';
  };

  setShowSettings = (show: boolean, section?: SettingsSection) => {
    this.showSettings = show;
    if (show) {
      this.showLibrary = false;
      this.lastSidebarPanel = 'settings';
    }
    if (section) {
      this.settingsSection = section;
    }
  };

  /**
   * Ctrl+,: closes the panel beside the sidebar when one is open, Settings
   * or the Library. Otherwise opens the one that was open last, at the
   * section it was on.
   */
  toggleSidebarPanel = () => {
    if (this.showSettings || this.showLibrary) {
      this.showSettings = false;
      this.showLibrary = false;
    } else if (this.lastSidebarPanel === 'library') {
      this.setShowLibrary(true);
    } else {
      this.setShowSettings(true);
    }
  };

  // Counts requests to bring Settings to the person's attention
  // (showSettingsSection). SettingsDock flashes the panel on each.
  settingsAttentionCount = 0;

  /**
   * Opens Settings at a section, and makes sure it is seen: a link that
   * opens Settings when it is already open there seemed to do nothing.
   */
  showSettingsSection = (section: SettingsSection) => {
    this.setShowSettings(true, section);
    this.settingsAttentionCount++;
  };

  /** Decisions an agent is blocked on: its proposed policy changes. */
  get agentDecisionsWaiting(): number {
    return this.investigations.reduce((n, i) => n + i.pendingDecisions.length, 0);
  }

  /**
   * Jumps to whichever agent tab most needs the owner right now -- what the
   * agent's robot in the sidebar (SideRail) does on click.
   * An investigation with a decision its agent is blocked on wins.
   * Otherwise the current investigation. A no-op when the agent has none.
   */
  focusAgentTab = () => {
    const waiting = this.investigations.find(i => i.pendingDecisions.length > 0);
    const current = this.mcpSessionId ? this.investigationForSession(this.mcpSessionId) : undefined;
    const target = waiting ?? current;
    if (target) this.openInvestigationTab(target);
  };

  setSettingsSection = (section: SettingsSection) => {
    this.settingsSection = section;
  };

  setConnectionError = (message: string | null) => {
    this.connectionError = message;
  };

  setShowAnalysis = (show: boolean) => {
    this.showAnalysis = show;
    if (!show) {
      this.analysisInitialValue = ''; // Clear initial value when closing
    }
  };

  setShowCommandPalette = (show: boolean) => {
    this.showCommandPalette = show;
  };

  setShowChangelog = (show: boolean) => {
    this.showChangelog = show;
  };

  setShowSaveRecipe = (show: boolean) => {
    this.showSaveRecipe = show;
    // Counted, so Ctrl+S while the bar is already open (focus back in the
    // editor, say) still takes you to its title.
    if (show) this.saveRecipeRequestCount++;
  };

  /** Ctrl+O: opens the Library, with its search box focused to type in. */
  findRecipe = () => {
    this.setShowLibrary(true);
    this.libraryFindCount++;
  };

  /** Opens or closes the Library panel, in the slot Settings docks in. */
  setShowLibrary = (show: boolean) => {
    this.showLibrary = show;
    if (show) {
      this.showSettings = false;
      this.lastSidebarPanel = 'library';
    }
  };

  noteRecipesChanged = () => {
    this.recipesChangedCount++;
  };

  /**
   * Execute a command by its ID.
   * This is the central command execution mechanism that:
   * 1. Looks up the command from the registry
   * 2. Checks if the command is enabled (all prerequisites met)
   * 3. Executes its handler
   * 4. Adds it to command history
   *
   * @param commandId The unique identifier of the command to execute
   * @throws Error if the command ID is not found
   * @throws Error if the command's isEnabled() returns false
   */
  executeCommand = (commandId: string) => {
    const session = this.getSession(this.activeSessionId);
    const command = getCommandById(commandId);

    if (!command) {
      throw new Error(`Command with id "${commandId}" not found`);
    }

    // Check if command is enabled
    if (!command.isEnabled(this, session)) {
      throw new Error(`Command "${commandId}" cannot execute: prerequisites not met`);
    }

    // Execute the command handler
    command.handler(this, session);

    // Add to command history
    this.addToCommandHistory(commandId);
  };
}
