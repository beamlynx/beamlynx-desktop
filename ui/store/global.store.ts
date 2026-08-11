import { makeAutoObservable, reaction, runInAction } from 'mobx';
import { lt } from 'semver';
import { HttpClient, ConnectionInfo } from './client';
import type { CredentialsStatus } from '../desktop';
import { Session, Theme, InputMode } from './session';
import { RequiredVersion } from '../constants';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { DevState } from './dev-state';
import { getCommandById } from '../utils/commands';
import { CONNECTION_COLOR_PALETTE, isDesktop, isPlayground } from './util';

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
};

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
  credentialsStatus: CredentialsStatus | null = null;
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

  get dbConnected() {
    const activeSession = this.sessions[this.activeSessionId];
    return DevState.dbConnected ?? this.isConnectionLive(activeSession?.connectionId ?? '');
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

  // Theme - moved from individual sessions to global
  _theme: Theme;

  get theme(): Theme {
    return this._theme;
  }

  set theme(newTheme: Theme) {
    this._theme = newTheme;
    setUserPreference(STORAGE_KEYS.THEME, newTheme);
  }

  // Force Compact Mode
  _forceCompactMode: boolean;

  get forceCompactMode(): boolean {
    return this._forceCompactMode;
  }

  set forceCompactMode(value: boolean) {
    this._forceCompactMode = value;
    setUserPreference(STORAGE_KEYS.FORCE_COMPACT_MODE, value);
  }

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

  // User
  email = '';
  domain = '';

  // Settings
  showSettings = false;

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

  // Connections list modal (the "List Database Connections" command -- the
  // ActiveConnection dropdown covers the same data but is anchored to a
  // clicked DOM element, which a command handler doesn't have).
  showConnectionsModal = false;

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

  // Onboarding
  _onboardingServer: boolean;

  get onboardingServer(): boolean {
    return DevState.onboardingServer ?? this._onboardingServer;
  }

  set onboardingServer(value: boolean) {
    this._onboardingServer = value;
    setUserPreference(STORAGE_KEYS.ONBOARDING_SERVER, value);
  }

  constructor() {
    this._theme = getUserPreference(STORAGE_KEYS.THEME, 'dark');
    this._forceCompactMode = getUserPreference(STORAGE_KEYS.FORCE_COMPACT_MODE, false);
    this._pineTableColorsEnabled = getUserPreference(STORAGE_KEYS.PINE_TABLE_COLORS, false);
    this._canvasModeEnabled = getUserPreference(STORAGE_KEYS.CANVAS_MODE, false);
    this._onboardingServer = getUserPreference(STORAGE_KEYS.ONBOARDING_SERVER, false);
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
    const persisted = getUserPreference(STORAGE_KEYS.SESSIONS, null) as PersistedSessionsState | null;
    if (!persisted || !Array.isArray(persisted.sessions) || persisted.sessions.length === 0) {
      return false;
    }

    persisted.sessions.forEach((persistedSession, index) => {
      const session = this.createSessionUsingId(String(index));
      session.expression = persistedSession.expression ?? '';
      session.inputMode = persistedSession.inputMode === 'sql' ? 'sql' : 'pine';
      session.connectionId = persistedSession.connectionId ?? '';
      session.profileId = persistedSession.profileId ?? '';
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
      c => c.id === connectionId || (c.dbHost && c.dbPort && `${c.dbHost}:${c.dbPort}` === connectionId),
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
        }));
        this.connections.forEach(c => this.assignConnectionColor(c.id));
        // Keep the active pine connection's own color alive even though it's
        // keyed differently from the saved-profile list (see connect() below)
        // -- otherwise this prune would delete it the instant it's assigned,
        // since it's never "in" this desktop-mode list of profile ids.
        this.pruneConnectionColors([...this.connections.map(c => c.id), this.connection].filter(Boolean));
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

  consumeReconnectHint = () => {
    const hint = this.reconnectHint;
    runInAction(() => {
      this.reconnectHint = null;
    });
    return hint;
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

  public toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
  }

  public toggleCompactMode() {
    this.forceCompactMode = !this.forceCompactMode;
  }

  public toggleCanvasMode() {
    this.canvasModeEnabled = !this.canvasModeEnabled;
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
    const pineId = useDesktop && conn?.dbHost && conn?.dbPort ? `${conn.dbHost}:${conn.dbPort}` : id;
    console.log(`[credentials] deleteConnection: id=${id} useDesktop=${useDesktop} pineId=${pineId}`);

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
   * Bare createConnection + useConnection round trip -- no session/tab or
   * credential side effects. Shared by `connect` (the full user-facing flow)
   * and ensureSessionConnected's silent background reconnect, which must
   * not fork tabs or touch activeSessionId the way `connect` does.
   */
  private establishConnection = async (params: ConnectionParams): Promise<{ id: string; version: string }> => {
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

      if (!this.onboardingServer) {
        this.onboardingServer = true;
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
      console.log(`[credentials] ensureSessionConnected(${sessionId}): already live (${session.connectionId}), no-op`);
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
            new Set([...liveConnections.connections.map(c => c.id), this.connection].filter(Boolean)),
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

        if (this.pineConnected && !this.onboardingServer) {
          this.onboardingServer = true;
        }

        if (lt(this.version, RequiredVersion)) {
          this.requiresUpgrade = true;
        }
      });

      await this.refreshConnections();
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

    return length > maxLength
      ? expression.substring(0, maxLength).replaceAll('|', '') + '...'
      : expression || '...';
  };

  setShowSettings = (show: boolean) => {
    this.showSettings = show;
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

  setShowConnectionsModal = (show: boolean) => {
    this.showConnectionsModal = show;
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
