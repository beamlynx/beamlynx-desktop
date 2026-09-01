import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { lt } from 'semver';
import { AccessPolicy, AccessPolicyRule, HttpClient, ConnectionInfo, effectiveAccessPolicyRules } from './client';
import type { CredentialsStatus } from '../desktop';
import { Session, Theme, InputMode } from './session';
import { THEME_MODE, ThemeId } from '../styles/palette/tokens';
import { UiFontId, CodeFontId } from '../styles/fonts';
import { TextSize } from '../styles/text-size';
import { RequiredVersion } from '../constants';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { DevState } from './dev-state';
import { getCommandById } from '../utils/commands';
import { CONNECTION_COLOR_PALETTE, isDesktop, isPlayground } from './util';
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
  connectionId: string;
  profileId: string;
};

type PersistedSessionsState = {
  sessions: PersistedSession[];
  activeIndex: number;
};

// Thrown by connectToSavedProfile when the saved password can't be decrypted
// (e.g. connections.json copied onto a different machine/user -- safeStorage
// keys are OS/user/machine-scoped) -- distinguishable so the UI can offer to
// re-enter the password instead of showing a generic connect failure.
export class DecryptionFailedError extends Error {
  constructor() {
    super('Failed to decrypt the saved password for this connection');
    this.name = 'DecryptionFailedError';
  }
}

const client = new HttpClient();
type ConnectionParams = {
  dbHost: string;
  dbPort: string;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  // Desktop-only (see credentials.save) -- pine-lang itself has no concept of
  // a custom label, so this is ignored on the plain HTTP createConnection call.
  label?: string;
};

export type SettingsSection = 'connections' | 'theme' | 'preferences' | 'access-policy' | 'mcp' | 'about';

export class GlobalStore {
  connecting = false;
  connection = '';
  version: string | undefined = undefined;
  requiresUpgrade = false;
  connectionColors: Record<string, string> = {};
  connections: ConnectionInfo[] = [];
  // False until refreshConnections' first successful run. A session's
  // connectionId restores from localStorage synchronously, but `connections`
  // (needed to resolve it to a friendly saved-profile label) only loads
  // async -- without this, getConnectionLabel can't tell "no matching
  // profile" apart from "haven't checked yet" and would flash the raw
  // connection id (e.g. "localhost:5432") as if it were the name.
  connectionsLoaded = false;
  // Every named access policy (Settings -> Access Policy, credential-store.ts)
  // -- each connection independently selects one by id (ConnectionInfo.policyId),
  // or none. Loaded alongside connections at boot (refreshAccessPolicies)
  // and re-read fresh before every MCP query (mcpQueryDeps'
  // resolveAccessPolicyRules); every session's own accessPolicyRules
  // getter reads this same shared array, so an edit here is visible to
  // every open tab on its next read.
  accessPolicies: AccessPolicy[] = [];
  credentialsStatus: CredentialsStatus | null = null;

  // Desktop-only: the one dedicated tab MCP-driven queries run in (see
  // runMcpQuery/explainMcpQuery below and store/mcp-query.ts). Deliberately
  // separate from activeSessionId -- MCP-driven queries must never hijack
  // whatever tab the human is currently looking at; they show up in the tab
  // bar (PineTabs renders every id in `sessions`) without switching focus.
  mcpSessionId: string | null = null;
  // profileId -> live pine-lang connection-id, cached per app session so
  // every MCP query doesn't spin up a fresh Hikari pool. See
  // store/mcp-query.ts's ensureConnection.
  private mcpConnectionsByProfile: Record<string, string> = {};
  // Set by connectToSavedProfile on a decryption failure, so the settings
  // form can pre-fill the (still-plaintext) host/port/db/user and prompt the
  // user to just re-enter the password, instead of retyping everything.
  reconnectHint: { dbHost: string; dbPort: string; dbName: string; dbUser: string } | null = null;

  // Pine's own ids that are actually live (a pool exists) *right now* --
  // refreshed via listConnections() (loadConnectionMetadata,
  // ensureSessionConnected) or appended to directly the instant a
  // connect/reconnect call confirms one. Distinct from `connections`, which
  // in desktop mode lists saved *profiles* regardless of whether they're
  // currently live -- see refreshConnections.
  liveConnectionIds: string[] = [];

  get pineConnected() {
    return DevState.pineConnected ?? !!this.version;
  }

  // Desktop only: which saved profile is behind the *active tab's own*
  // connection. Derived from the active session directly (not a separately
  // tracked field) so it can never go stale -- it used to be a standalone
  // field only written by connect()/connectToSavedProfile, which meant the
  // picker kept showing whichever profile was last *manually* selected even
  // after switching to a different tab silently reconnected a different one
  // (ensureSessionConnected never had a reason to touch a separate field).
  get activeProfileId(): string {
    return this.sessions[this.activeSessionId]?.profileId ?? '';
  }

  // Whether `connectionId` currently has a live pool on the server -- as
  // opposed to merely being a tab's *assigned* connection (see
  // Session.connectionId), which persists across restarts/reconnects even
  // while nothing is live. `liveConnectionIds` is always keyed by pine's own
  // id (host:port), but callers here (the saved-connections list/picker)
  // pass a saved-profile id in desktop mode -- a different id space for the
  // same logical connection (see resolveConnectionEntry). Resolve both sides
  // to the same identity before comparing, so this works regardless of
  // which id space the caller happens to have on hand.
  isConnectionLive = (connectionId: string): boolean => {
    if (!connectionId) return false;
    if (this.liveConnectionIds.includes(connectionId)) return true;
    const resolvedSelf = this.resolveConnectionEntry(connectionId)?.id ?? connectionId;
    return this.liveConnectionIds.some(
      liveId => (this.resolveConnectionEntry(liveId)?.id ?? liveId) === resolvedSelf,
    );
  };

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

  // Vim-style navigation/editing -- global (like canvasModeEnabled below),
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

  // Pine / result table coloring (segment and column tints)
  _pineTableColorsEnabled: boolean;

  get pineTableColorsEnabled(): boolean {
    return this._pineTableColorsEnabled;
  }

  set pineTableColorsEnabled(value: boolean) {
    this._pineTableColorsEnabled = value;
    setUserPreference(STORAGE_KEYS.PINE_TABLE_COLORS, value);
  }

  // Canvas mode - global (like theme), not per-session: every tab's "graph"
  // view shows the experimental canvas instead of the classic node graph
  // while this is on, rather than each session remembering its own choice.
  _canvasModeEnabled: boolean;

  get canvasModeEnabled(): boolean {
    return this._canvasModeEnabled;
  }

  set canvasModeEnabled(value: boolean) {
    this._canvasModeEnabled = value;
    setUserPreference(STORAGE_KEYS.CANVAS_MODE, value);
  }

  // Auto-run - whenever a canvas gesture commits a new, backend-confirmed-
  // valid expression, run it immediately instead of waiting for an explicit
  // Run. Global (like canvasModeEnabled), not per-session.
  _autoRunEnabled: boolean;

  get autoRunEnabled(): boolean {
    return this._autoRunEnabled;
  }

  set autoRunEnabled(value: boolean) {
    this._autoRunEnabled = value;
    setUserPreference(STORAGE_KEYS.AUTO_RUN_ENABLED, value);
  }

  // Which overall app layout wraps a session - the new Canvas-first two-pane
  // arrangement (default for everyone) or the classic sidebar layout kept
  // around for people who aren't ready to leave it. Orthogonal to
  // canvasModeEnabled: layoutMode picks the *layout*, canvasModeEnabled
  // (Legacy Layout only) picks which graph editor Legacy's own graph panel
  // uses. New Layout is always Canvas, with no switcher of its own - see
  // canvasActive below for the derived "a canvas is on screen right now"
  // check other code should read instead of canvasModeEnabled directly.
  _layoutMode: 'legacy' | 'new';

  get layoutMode(): 'legacy' | 'new' {
    return this._layoutMode;
  }

  set layoutMode(value: 'legacy' | 'new') {
    this._layoutMode = value;
    setUserPreference(STORAGE_KEYS.LAYOUT_MODE, value);
  }

  get canvasActive(): boolean {
    return this.layoutMode === 'new' || this.canvasModeEnabled;
  }

  // Whether New Layout's canvas pane shows an editable text panel alongside
  // it, in addition to point-and-click editing. One shared widget serves
  // both the Pine and SQL editors (Input.tsx already switches between them
  // on session.inputMode) - "Pine panel"/"SQL panel" are two different ways
  // to open the SAME panel in a given mode, not two different panels. Global
  // (like layoutMode itself), not per-session - it's how you like to work,
  // not something that should vary tab to tab.
  _newLayoutPanelVisible: boolean;

  get newLayoutPanelVisible(): boolean {
    return this._newLayoutPanelVisible;
  }

  set newLayoutPanelVisible(value: boolean) {
    this._newLayoutPanelVisible = value;
    setUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_VISIBLE, value);
  }

  // New Layout's Canvas|Results split: side-by-side or stacked top/bottom.
  // Global (like layoutMode), not per-session -- see NewLayoutView.tsx,
  // which also overrides this to 'vertical' on small screens regardless of
  // what's stored here.
  _newLayoutOrientation: 'horizontal' | 'vertical';

  get newLayoutOrientation(): 'horizontal' | 'vertical' {
    return this._newLayoutOrientation;
  }

  set newLayoutOrientation(value: 'horizontal' | 'vertical') {
    this._newLayoutOrientation = value;
    setUserPreference(STORAGE_KEYS.NEW_LAYOUT_ORIENTATION, value);
  }

  // A graph-only, distraction-free view: New Layout's header, tab strip, and
  // Results pane all hide, leaving just Canvas (see AppView.tsx/PineTabs.tsx/
  // NewLayoutView.tsx's isZenModeActive checks). Transient, not persisted -
  // unlike layoutMode/canvasModeEnabled above, this is a momentary focus
  // toggle for the current sitting, not a lasting preference, so it always
  // starts off on reload. Read isZenModeActive below, not this field
  // directly, in every one of those render checks.
  zenMode = false;

  // What autoRunEnabled was the instant before toggleZenMode last turned Zen
  // mode on - null whenever Zen mode is off. Not persisted, same reasoning
  // as zenMode itself; auto-run doesn't make sense while heads-down on the
  // graph (see toggleZenMode), and this is what lets turning it back off
  // hand auto-run back exactly as you left it instead of guessing a default.
  _autoRunBeforeZenMode: boolean | null = null;

  // The check every render site (AppView/PineTabs/NewLayoutView) actually
  // wants - `zenMode` alone would hide Legacy Layout's header too if it were
  // ever left `true` while switching layouts, even though Legacy never has
  // the Canvas/Results crowding problem Zen mode exists to solve.
  get isZenModeActive(): boolean {
    return this.zenMode && this.layoutMode === 'new';
  }

  // User
  email = '';
  domain = '';

  // Which panel (New Layout only) most recently held real DOM focus --
  // 'graph' | 'settings' | 'input' | null (null = nothing panel-specific
  // focused, e.g. the header). Transient, not persisted -- same reasoning as
  // zenMode above. Written by useFocusedPanelTracking.ts's document-level
  // focusin/focusout listener; read through activeKeyboardPanel below, never
  // directly -- 'settings' here doesn't necessarily mean Settings still owns
  // the keyboard (it may have since closed, or focus may have wandered
  // somewhere neither Canvas nor Input claim), and the getter is what
  // resolves that ambiguity rather than every caller re-deriving it.
  focusedPanelId: 'graph' | 'settings' | 'input' | null = null;

  setFocusedPanelId = (id: 'graph' | 'settings' | 'input' | null) => {
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
  get activeKeyboardPanel(): 'graph' | 'settings' | 'input' {
    if (this.focusedPanelId === 'input' && this.newLayoutPanelVisible) return 'input';
    if (this.focusedPanelId === 'graph') return 'graph';
    if (this.showSettings) return 'settings';
    return 'graph';
  }

  // Settings
  showSettings = false;
  // Which section the settings modal opens to -- defaults to Connections
  // since that's the section a decryption-failure reconnect or "add
  // connection" click needs to land on; the modal remembers whatever
  // section was last open otherwise (see SettingsModal.tsx's rail).
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
  showSaveModal = false;

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
    this._themeId = getUserPreference(STORAGE_KEYS.THEME, 'dark');
    this._uiFontFamily = getUserPreference(STORAGE_KEYS.UI_FONT_FAMILY, 'system');
    this._codeFontFamily = getUserPreference(STORAGE_KEYS.CODE_FONT_FAMILY, 'plex-mono');
    this._textSize = getUserPreference(STORAGE_KEYS.TEXT_SIZE, 'medium');
    this._vimModeEnabled = getUserPreference(STORAGE_KEYS.VIM_MODE, false);
    this._pineTableColorsEnabled = getUserPreference(STORAGE_KEYS.PINE_TABLE_COLORS, false);
    this._canvasModeEnabled = getUserPreference(STORAGE_KEYS.CANVAS_MODE, false);
    this._autoRunEnabled = getUserPreference(STORAGE_KEYS.AUTO_RUN_ENABLED, true);
    this._layoutMode = getUserPreference(STORAGE_KEYS.LAYOUT_MODE, 'new');
    this._newLayoutPanelVisible = getUserPreference(STORAGE_KEYS.NEW_LAYOUT_PANEL_VISIBLE, false);
    this._newLayoutOrientation = getUserPreference(
      STORAGE_KEYS.NEW_LAYOUT_ORIENTATION,
      'horizontal',
    );
    this._commandHistory = getUserPreference(STORAGE_KEYS.COMMAND_HISTORY, []);
    this.connectionColors = getUserPreference(STORAGE_KEYS.CONNECTION_COLORS, {});
    makeAutoObservable(this);

    // Restore tabs/sessions from a previous visit, if any were saved.
    // getUserPreference safely no-ops (returns the default) during SSR, so
    // this always falls through to a single fresh session there.
    const restored = this.restoreSessions();
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
      },
    );
    reaction(
      () => this.pineConnected,
      connected => {
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
    const ids = Object.keys(this.sessions);
    return {
      sessions: ids.map(id => {
        const session = this.sessions[id];
        return {
          expression: session.expression,
          inputMode: session.inputMode,
          connectionId: session.connectionId,
          profileId: session.profileId,
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
    if (!persisted || !Array.isArray(persisted.sessions) || persisted.sessions.length === 0) {
      return false;
    }

    persisted.sessions.forEach((persistedSession, index) => {
      const session = this.createSessionUsingId(String(index));
      const expression = persistedSession.expression ?? '';
      runInAction(() => {
        session.expression = expression;
        session.inputMode = persistedSession.inputMode === 'sql' ? 'sql' : 'pine';
        session.connectionId = persistedSession.connectionId ?? '';
        session.profileId = persistedSession.profileId ?? '';
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
    this.activeSessionId = ids[persisted.activeIndex] ?? ids[0];
    return true;
  };

  // In desktop mode, `connections` is keyed by saved-profile id, while
  // `activeSession.connectionId`/`this.connection` are pine's own id
  // (`host:port`) -- two different id spaces for the same logical
  // connection. Resolve pine's id back to its profile by comparing
  // host:port, so color/label lookups work regardless of which id space
  // they were called with. A no-op in browser mode, where `connections`
  // is already keyed by pine's own id (first condition matches directly).
  private resolveConnectionEntry = (connectionId: string): ConnectionInfo | undefined => {
    if (!connectionId) return undefined;
    return this.connections.find(
      c =>
        c.id === connectionId ||
        (c.dbHost && c.dbPort && `${c.dbHost}:${c.dbPort}` === connectionId),
    );
  };

  getConnectionColor = (connectionId: string): string => {
    const key = this.resolveConnectionEntry(connectionId)?.id ?? connectionId;
    return this.connectionColors[key] ?? '';
  };

  getConnectionLabel = (connectionId: string): string => {
    if (!connectionId) return '';
    const resolved = this.resolveConnectionEntry(connectionId)?.label;
    if (resolved) return resolved;
    // No matching saved profile -- either genuinely none (browser mode, or
    // a profile that was since deleted/renamed) or `connections` just
    // hasn't loaded yet. Only fall back to the raw id (pine's host:port,
    // not a real name) once we know it's the former; otherwise showing it
    // reads as "the connection's name changed" the moment the real label
    // loads a beat later.
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
    if (changed) {
      setUserPreference(STORAGE_KEYS.CONNECTION_COLORS, this.connectionColors);
    }
  };

  refreshConnections = async (): Promise<ConnectionInfo[]> => {
    // Desktop mode: pine-server is a fresh JVM every launch, so its own live
    // connection list is empty until something reconnects this session --
    // not useful as "what connections does the user have". Source the list
    // from locally saved profiles instead. `this.connection` is left alone
    // here; it's driven by actual connect operations (connect /
    // connectToSavedProfile), not by loading the list.
    console.log(
      `[credentials] refreshConnections: isDesktop()=${isDesktop()} window.beamlynxDesktop=${
        typeof window !== 'undefined' && !!window.beamlynxDesktop
      }`,
    );
    if (isDesktop() && typeof window !== 'undefined' && window.beamlynxDesktop) {
      const profiles = await window.beamlynxDesktop.credentials.list();
      console.log('[credentials] refreshConnections (desktop): profiles ->', profiles);
      runInAction(() => {
        this.connections = profiles.map(p => ({
          id: p.id,
          label: p.label,
          dbHost: p.dbHost,
          dbPort: p.dbPort,
          mcpEnabled: p.mcpEnabled,
          policyId: p.policyId,
        }));
        this.connections.forEach(c => this.assignConnectionColor(c.id));
        // Keep the active pine connection's own color alive even though it's
        // keyed differently from the saved-profile list (see connect() below)
        // -- otherwise this prune would delete it the instant it's assigned,
        // since it's never "in" this desktop-mode list of profile ids.
        this.pruneConnectionColors(
          [...this.connections.map(c => c.id), this.connection].filter(Boolean),
        );
        this.connectionsLoaded = true;
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
      this.connection = result['selected-connection-id'] ?? '';
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

  // Any connection that had this policy selected falls back to "None"
  // server-side (credential-store.ts's deleteAccessPolicy) -- refresh
  // connections too, so a connection row showing this policy's name
  // doesn't keep showing it after it no longer exists.
  deleteAccessPolicy = async (id: string): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    await window.beamlynxDesktop.accessPolicy.delete(id);
    runInAction(() => {
      this.accessPolicies = this.accessPolicies.filter(p => p.id !== id);
    });
    await this.refreshConnections();
  };

  setAccessPolicyModuleEnabled = async (
    policyId: string,
    type: AccessPolicyRule['type'],
    enabled: boolean,
  ): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const updated = await window.beamlynxDesktop.accessPolicy.setModuleEnabled(policyId, type, enabled);
    if (!updated) return;
    runInAction(() => {
      this.accessPolicies = this.accessPolicies.map(p => (p.id === policyId ? updated : p));
    });
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
    console.log('[credentials] loadCredentialsStatus ->', status);
    runInAction(() => {
      this.credentialsStatus = status;
    });
  };

  setConnectionColor = (connectionId: string, color: string) => {
    const key = this.resolveConnectionEntry(connectionId)?.id ?? connectionId;
    this.connectionColors[key] = color;
    setUserPreference(STORAGE_KEYS.CONNECTION_COLORS, this.connectionColors);
  };

  private assignConnectionColor = (connectionId: string) => {
    if (!connectionId) return;
    // Resolve first: connectionId may be pine's own id for a connection that
    // already has a color stored under its saved-profile id -- checking the
    // raw id here would miss that and reassign a new color on every
    // reconnect.
    const existingKey = this.resolveConnectionEntry(connectionId)?.id ?? connectionId;
    if (this.connectionColors[existingKey]) return;
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
        this.analysisInitialValue = decodeURIComponent(analyseParam);
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
            session.expression = decodeURIComponent(queryParam);
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

  public toggleCanvasMode() {
    this.canvasModeEnabled = !this.canvasModeEnabled;
  }

  public toggleAutoRunEnabled() {
    this.autoRunEnabled = !this.autoRunEnabled;
  }

  public toggleLayoutMode() {
    this.layoutMode = this.layoutMode === 'legacy' ? 'new' : 'legacy';
  }

  public toggleNewLayoutOrientation() {
    this.newLayoutOrientation =
      this.newLayoutOrientation === 'horizontal' ? 'vertical' : 'horizontal';
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
   */
  public togglePinePanel(session: Session) {
    if (this.newLayoutPanelVisible && session.inputMode === 'pine') {
      this.hideNewLayoutPanel();
    } else {
      this.newLayoutPanelVisible = true;
      session.setInputMode('pine');
    }
  }

  public toggleSqlPanel(session: Session) {
    if (this.newLayoutPanelVisible && session.inputMode === 'sql') {
      this.hideNewLayoutPanel();
    } else {
      this.newLayoutPanelVisible = true;
      session.setInputMode('sql');
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
   * Select an existing server connection from the picker. Opens a new tab if the
   * active tab has content; otherwise assigns the connection to the active tab.
   */
  selectConnection = async (connectionId: string) => {
    const activeSession = this.sessions[this.activeSessionId];
    if (!activeSession) {
      return;
    }
    if (activeSession.connectionId === connectionId && this.connection === connectionId) {
      return;
    }
    try {
      const { id, version } = await client.useConnection(connectionId);
      runInAction(() => {
        this.connection = id;
        this.version = version ?? '0.0.0';
        this.liveConnectionIds = Array.from(new Set([...this.liveConnectionIds, id]));
        if (activeSession.expression.trim()) {
          const session = this.createSession();
          this.activeSessionId = session.id;
          session.connectionId = id;
        } else {
          activeSession.connectionId = id;
        }
      });
      await this.refreshConnections();
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
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
    console.log('[credentials] getSavedProfileCredentials: get result ->', result);
    if (!result.ok) {
      if (result.error === 'decryption-failed') {
        const { dbHost, dbPort, dbName, dbUser } = result.profile;
        runInAction(() => {
          this.reconnectHint = { dbHost, dbPort, dbName, dbUser };
        });
        throw new DecryptionFailedError();
      }
      throw new Error('Saved connection not found');
    }
    const { profile, dbPassword } = result;
    return {
      dbHost: profile.dbHost,
      dbPort: profile.dbPort,
      dbName: profile.dbName,
      dbUser: profile.dbUser,
      dbPassword,
    };
  };

  /**
   * Connect to a saved (desktop-only) profile that may not have a live pine
   * pool yet this session -- fetches the decrypted credentials and goes
   * through the normal `connect` (create + use) path, rather than assuming
   * a pool already exists the way `selectConnection` does. Manual/UI entry
   * point: forks a new tab if the active one has content, same as `connect`.
   * For a silent background reconnect of one specific (possibly inactive)
   * tab, see ensureSessionConnected instead.
   */
  connectToSavedProfile = async (id: string): Promise<string> => {
    console.log(`[credentials] connectToSavedProfile called for id=${id}`);
    let params: ConnectionParams;
    try {
      params = await this.getSavedProfileCredentials(id);
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.connectionError = `Failed to connect: ${message}`;
      });
      throw e;
    }
    return this.connect(params, id);
  };

  private getOrCreateMcpSession = (): Session => {
    let mcpSession = this.mcpSessionId ? this.sessions[this.mcpSessionId] : undefined;
    if (!mcpSession) {
      mcpSession = this.createSession();
      runInAction(() => {
        mcpSession!.inputMode = 'pine';
        this.mcpSessionId = mcpSession!.id;
      });
    }
    return mcpSession;
  };

  private mcpQueryDeps = () => ({
    client,
    getSavedProfileCredentials: this.getSavedProfileCredentials,
    getOrCreateMcpSession: this.getOrCreateMcpSession,
    getMcpConnectionId: (profileId: string) => this.mcpConnectionsByProfile[profileId],
    setMcpConnectionId: (profileId: string, connectionId: string) => {
      runInAction(() => {
        this.mcpConnectionsByProfile = {
          ...this.mcpConnectionsByProfile,
          [profileId]: connectionId,
        };
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
  runMcpQuery = (args: { profileId: string; expression: string }) =>
    runMcpQueryImpl(this.mcpQueryDeps(), args);

  /** Backing call for the `complete_query` MCP tool -- parse/build only, no execution. */
  explainMcpQuery = (args: { profileId: string; expression: string }) =>
    explainMcpQueryImpl(this.mcpQueryDeps(), args);

  /**
   * Toggles whether MCP clients may use a saved connection at all -- the
   * access-control lever for the MCP server. Off by default; the
   * control-plane server (beamlynx-desktop) refuses any MCP tool call
   * against a connection that isn't in this list, regardless of what's live
   * in pine-lang's own pool. Also refused (not silently ignored) unless
   * *this connection's own* assigned policy has an active module -- there
   * is no "MCP on, unprotected" state -- see credential-store.ts's
   * setMcpEnabled. The ConnectionsSection UI is expected to disable this
   * control before that refusal can even be attempted (see its own
   * tooltip/disabled state), but this still surfaces connectionError on the
   * refusal path as a belt-and-suspenders in case a caller reaches it some
   * other way.
   */
  setMcpEnabled = async (id: string, enabled: boolean): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const result = await window.beamlynxDesktop.credentials.setMcpEnabled(id, enabled);
    if (!result.ok) {
      runInAction(() => {
        this.connectionError =
          result.reason === 'no-active-policy'
            ? 'Select an access policy with an active rule for this connection first.'
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
   * Selects which access policy (if any) applies to this connection's
   * queries. Refused (not silently ignored) if it would clear/blank the
   * policy -- to null, or to one with no active rule -- while mcpEnabled is
   * already true: MCP must never end up pointing at nothing. The
   * ConnectionsSection UI is expected to disable "None" and any inactive
   * policy in that state (see its own picker), but this still surfaces
   * connectionError on the refusal path the same way setMcpEnabled does.
   * See credential-store.ts's setConnectionPolicy.
   */
  setConnectionPolicy = async (id: string, policyId: string | null): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const result = await window.beamlynxDesktop.credentials.setConnectionPolicy(id, policyId);
    if (!result.ok) {
      runInAction(() => {
        this.connectionError =
          result.reason === 'mcp-requires-policy'
            ? 'MCP access is on for this connection -- pick a policy with an active rule, or turn MCP off first.'
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
   * Whether the connection owner has switched the assigned policy OFF for
   * their own tab queries on it -- MCP always uses the assigned policy and
   * never reads this. Never refused: unlike setMcpEnabled/setConnectionPolicy
   * there's no "pointing at nothing" state this could create, since it
   * doesn't touch mcpEnabled or policyId. See credential-store.ts's
   * setBypassPolicyForOwnQueries.
   */
  setBypassPolicyForOwnQueries = async (id: string, bypass: boolean): Promise<void> => {
    if (typeof window === 'undefined' || !window.beamlynxDesktop) return;
    const updated = await window.beamlynxDesktop.credentials.setBypassPolicyForOwnQueries(id, bypass);
    if (!updated) return;
    runInAction(() => {
      this.connections = this.connections.map(c =>
        c.id === id ? { ...c, bypassPolicyForOwnQueries: updated.bypassPolicyForOwnQueries } : c,
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
    const conn = this.connections.find(c => c.id === id);
    // In desktop mode, `id` is the saved profile's id, not pine's -- derive
    // pine's own id (host:port) the same way pine derives it itself
    // (pine.db.connections/make-connection-id) so the close attempt targets
    // the right pool.
    const pineId =
      useDesktop && conn?.dbHost && conn?.dbPort ? `${conn.dbHost}:${conn.dbPort}` : id;
    console.log(
      `[credentials] deleteConnection: id=${id} useDesktop=${useDesktop} pineId=${pineId}`,
    );

    try {
      await client.deleteConnection(pineId);
    } catch {
      // No live session under this id -- nothing to close, not an error.
    }

    if (useDesktop && desktopApi) {
      try {
        await desktopApi.credentials.delete(id);
      } catch {
        // Best effort -- nothing more useful to do if this fails.
      }
    }

    runInAction(() => {
      if (this.connection === id || this.connection === pineId) {
        this.connection = '';
      }
      // activeProfileId is derived from the active session's own profileId
      // (see its getter) -- clearing it below, in the same sweep as every
      // other session, is enough; no separate field to reset here.
      this.liveConnectionIds = this.liveConnectionIds.filter(c => c !== id && c !== pineId);
      Object.values(this.sessions).forEach(session => {
        if (session.connectionId === id || session.connectionId === pineId) {
          session.connectionId = '';
          session.profileId = '';
        }
      });
      if (
        this.virtualSession &&
        (this.virtualSession.connectionId === id || this.virtualSession.connectionId === pineId)
      ) {
        this.virtualSession.connectionId = '';
      }
    });
    await this.refreshConnections();
  };

  /**
   * Re-read a live connection's tables/columns from the database. The server
   * indexes a connection's schema once on first connect and caches it for the
   * life of the process, so a table or column added afterward stays invisible
   * until this is called (or the server restarts).
   */
  reindexConnection = async (id: string): Promise<void> => {
    const useDesktop = isDesktop();
    const conn = this.connections.find(c => c.id === id);
    // Same id resolution as deleteConnection: in desktop mode `id` is the
    // saved profile's id, not pine's own (host:port) id.
    const pineId =
      useDesktop && conn?.dbHost && conn?.dbPort ? `${conn.dbHost}:${conn.dbPort}` : id;
    try {
      await client.reindexConnection(pineId);
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.connectionError = `Failed to reindex: ${message}`;
      });
      throw e;
    }
  };

  /**
   * Bare createConnection + useConnection round trip -- no session/tab or
   * credential side effects. Shared by `connect` (the full user-facing flow)
   * and ensureSessionConnected's silent background reconnect, which must
   * not fork tabs or touch activeSessionId the way `connect` does.
   */
  private establishConnection = async (
    params: ConnectionParams,
  ): Promise<{ id: string; version: string }> => {
    const connectionId = await client.createConnection(params);
    if (!connectionId) {
      throw new Error("Connection wasn't created");
    }
    const { id, version } = await client.useConnection(connectionId);
    if (!id) {
      throw new Error('Failed to connect');
    }
    return { id, version };
  };

  /**
   * Create (or re-establish) a connection and make it the active tab's.
   * Opens a new tab instead if the active tab already has content, so an
   * in-progress query isn't silently switched to a different database.
   *
   * @param knownProfileId Pass the saved profile id when it's already known
   * (connectToSavedProfile) so the session can be tagged with it directly,
   * skipping the credentials.save round trip used for a brand-new connection
   * (Settings' "add connection" form, which has no profile yet to know).
   */
  connect = async (params: ConnectionParams, knownProfileId?: string): Promise<string> => {
    let id: string;
    let version: string;
    try {
      ({ id, version } = await this.establishConnection(params));
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        this.connection = '';
        this.connectionError = `Failed to connect: ${message}`;
      });
      throw e;
    }

    let profileId = knownProfileId ?? '';
    console.log(
      `[credentials] connect: isDesktop()=${isDesktop()} window.beamlynxDesktop=${
        typeof window !== 'undefined' && !!window.beamlynxDesktop
      }`,
    );
    if (!knownProfileId && isDesktop() && typeof window !== 'undefined' && window.beamlynxDesktop) {
      try {
        const saveResult = await window.beamlynxDesktop.credentials.save(params);
        console.log('[credentials] connect: save result ->', saveResult);
        profileId = saveResult.persisted ? saveResult.profile.id : '';
      } catch (e) {
        console.error('[credentials] connect: credentials.save threw ->', e);
        profileId = '';
      }
    }

    runInAction(() => {
      this.connection = id;
      this.version = version ?? '0.0.0';
      this.assignConnectionColor(id);
      this.liveConnectionIds = Array.from(new Set([...this.liveConnectionIds, id]));

      const activeSession = this.sessions[this.activeSessionId];
      if (activeSession) {
        if (activeSession.expression.trim()) {
          const session = this.createSession();
          this.activeSessionId = session.id;
          session.connectionId = id;
          session.profileId = profileId;
        } else {
          activeSession.connectionId = id;
          activeSession.profileId = profileId;
        }
      }
      if (this.virtualSession) {
        this.virtualSession.connectionId = id;
      }
    });

    await this.refreshConnections();
    return id;
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
      return;
    }
    if (this.isConnectionLive(session.connectionId)) {
      console.log(
        `[credentials] ensureSessionConnected(${sessionId}): already live (${session.connectionId}), no-op`,
      );
      return;
    }

    console.log(
      `[credentials] ensureSessionConnected(${sessionId}): reconnecting connectionId=${session.connectionId} profileId=${session.profileId}`,
    );
    runInAction(() => {
      session.connecting = true;
    });
    try {
      let id: string;
      let version: string;
      if (isDesktop()) {
        let profileId = session.profileId;
        if (!profileId) {
          // Sessions persisted before profileId existed only have pine's
          // own (coarser) host:port id -- best-effort resolve it back to a
          // saved profile so autoconnect still works for them instead of
          // silently giving up. `connections` (the saved-profiles list)
          // may not have loaded yet if this is running right as pine just
          // became reachable -- refresh once and retry before giving up.
          let resolved = this.resolveConnectionEntry(session.connectionId);
          if (!resolved) {
            await this.refreshConnections();
            resolved = this.resolveConnectionEntry(session.connectionId);
          }
          profileId = resolved?.id ?? '';
          console.log(
            `[credentials] ensureSessionConnected(${sessionId}): resolved profileId=${profileId || '(none found)'} for connectionId=${session.connectionId}`,
          );
        }
        if (!profileId) {
          // Genuinely nothing to reconnect from -- leave it for the user
          // to reconnect manually via the picker.
          return;
        }
        const params = await this.getSavedProfileCredentials(profileId);
        ({ id, version } = await this.establishConnection(params));
        runInAction(() => {
          session.profileId = profileId;
        });
      } else {
        ({ id, version } = await client.useConnection(session.connectionId));
      }
      console.log(`[credentials] ensureSessionConnected(${sessionId}): reconnected -> id=${id}`);
      runInAction(() => {
        session.connectionId = id;
        this.assignConnectionColor(id);
        this.liveConnectionIds = Array.from(new Set([...this.liveConnectionIds, id]));
        if (sessionId === this.activeSessionId) {
          this.connection = id;
          this.version = version ?? this.version;
        }
      });
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
      session.requestHints();
    } catch (e) {
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
      runInAction(() => {
        session.connecting = false;
      });
    }
  };

  createSessionUsingId = (id: string) => {
    const session = new Session(id, this);
    session.connectionId = this.connection;
    session.profileId = this.activeProfileId;
    this.sessions[session.id] = session;
    return session;
  };

  createSession = () => {
    const id = Math.random().toString(36).substring(7);
    return this.createSessionUsingId(id);
  };

  deleteSession = (sessionId: string) => {
    delete this.sessions[sessionId];
  };

  /**
   * Add a new tab and switch to it.
   * This is the proper way to create a new tab in the UI.
   */
  addTab = () => {
    const activeSession = this.sessions[this.activeSessionId];
    const session = this.createSession();
    session.connectionId = activeSession?.connectionId || this.connection;
    session.profileId = activeSession?.profileId || this.activeProfileId;
    this.activeSessionId = session.id;
  };

  /**
   * Close a tab with proper cleanup and switching logic.
   * If it's the last tab, resets it instead of closing.
   *
   * @param sessionId The session ID to close
   */
  closeTab = (sessionId: string) => {
    const sessionIds = Object.keys(this.sessions);

    // If it's the last tab, reset it instead of closing
    if (sessionIds.length === 1) {
      this.createSessionUsingId(sessionId.replace('session-', ''));
      return;
    }

    // Remove the session
    this.deleteSession(sessionId);

    // If the active tab is being closed, switch to another tab
    if (this.activeSessionId === sessionId && sessionIds.length > 1) {
      const remainingSessions = Object.keys(this.sessions);
      if (remainingSessions.length > 0) {
        this.activeSessionId = remainingSessions[0];
      }
    }
  };

  /**
   * Next/previous tab, wrapping at either end - the same cycling behavior
   * Ctrl+Tab/Ctrl+Shift+Tab has over a real browser's own tab strip (see
   * utils/keybindings.ts). Order matches PineTabs.tsx's own tab strip
   * (`Object.keys(this.sessions)`), so this always moves to the visually
   * adjacent tab.
   */
  activateAdjacentTab = (direction: 1 | -1) => {
    const sessionIds = Object.keys(this.sessions);
    const currentIndex = sessionIds.indexOf(this.activeSessionId);
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

  getVirtualSession = (): Session => {
    if (!this.virtualSession) {
      this.virtualSession = new Session('virtual', this);
    }
    return this.virtualSession;
  };

  loadConnectionMetadata = async () => {
    try {
      const response = await client.get('connection');
      if (!response?.result) {
        runInAction(() => {
          this.connection = '';
          this.version = undefined;
        });
        return;
      }
      const result = response.result as unknown as {
        version: string;
        'connection-id': string;
      };

      // A session's connectionId can be restored from localStorage
      // (restoreSessions) from a previous visit -- but pine-server's actual
      // pools don't survive a process restart (desktop is a fresh JVM every
      // launch; a shared/browser server can restart too), so a non-empty
      // persisted connectionId doesn't mean it's actually connected right
      // now. Fetch the backend's real live pools to reflect that (see
      // isConnectionLive/liveConnectionIds) -- but a persisted connectionId
      // itself is left alone: it's the tab's *assigned* connection, which
      // ensureSessionConnected lazily reconnects on demand rather than this
      // silently clearing it every time it isn't live yet.
      const liveConnections = await client.listConnections();

      runInAction(() => {
        this.version = result.version ?? '0.0.0';
        this.connection = result['connection-id'] || '';
        this.assignConnectionColor(this.connection);

        // Fail open on a transient fetch failure -- leave the previous
        // liveConnectionIds alone rather than wiping the indicator out.
        if (liveConnections) {
          this.liveConnectionIds = Array.from(
            new Set(
              [...liveConnections.connections.map(c => c.id), this.connection].filter(Boolean),
            ),
          );
        }

        if (this.connection) {
          Object.values(this.sessions).forEach(session => {
            if (!session.connectionId) {
              session.connectionId = this.connection;
            }
          });
          if (this.virtualSession && !this.virtualSession.connectionId) {
            this.virtualSession.connectionId = this.connection;
          }
        }

        if (lt(this.version, RequiredVersion)) {
          this.requiresUpgrade = true;
        }
      });

      await this.refreshConnections();
      await this.refreshAccessPolicies();
    } catch (e) {
      console.error('Failed to load connection metadata', e);
      runInAction(() => {
        this.connection = '';
        this.version = undefined;
      });
    }
    return this.connection;
  };

  getRequiresUpgrade = () => {
    return DevState.requiresUpgrade ?? this.requiresUpgrade;
  };

  setEmail = (email: string) => {
    if (!email) return;
    this.email = email;
    const [, domain] = email?.split('@');
    this.domain = domain;
  };

  setCopiedMessage = (sessionId: string, v: string, quote = false) => {
    const session = this.getSession(sessionId);
    if (quote) {
      v = `'${v.replace(/'/g, "'")}'`;
    }
    if (v.length > 120) {
      v = v.substring(0, 120) + '...';
    }
    session.message = `📋 Copied: ${v}`;
  };

  getSessionName = (sessionId: string) => {
    const session = this.getSession(sessionId);
    const length = session.expression.length;
    const maxLength = 10;

    // Skip the schema when naming the session
    const [x, y] = session.expression.split('.');
    const expression = y || x;

    const name =
      length > maxLength
        ? expression.substring(0, maxLength).replaceAll('|', '') + '...'
        : expression || '...';

    // Visibly distinguish the tab MCP-driven queries run in from the
    // human's own tabs -- see mcpSessionId/runMcpQuery above.
    return sessionId === this.mcpSessionId ? `🤖 ${name}` : name;
  };

  setShowSettings = (show: boolean, section?: SettingsSection) => {
    this.showSettings = show;
    if (section) {
      this.settingsSection = section;
    }
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

  setShowSaveModal = (show: boolean) => {
    this.showSaveModal = show;
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
