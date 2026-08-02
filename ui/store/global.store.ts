import { makeAutoObservable, runInAction } from 'mobx';
import { lt } from 'semver';
import { HttpClient, ConnectionInfo } from './client';
import type { CredentialsStatus } from '../desktop';
import { Session, Theme } from './session';
import { RequiredVersion } from '../constants';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { DevState } from './dev-state';
import { getCommandById } from '../utils/commands';
import { CONNECTION_COLOR_PALETTE, isDesktop } from './util';

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
  // Desktop only: which saved profile (if any) is behind whatever pine
  // currently considers the selected connection. Needed because pine's own
  // connection id is derived only from host:port (coarser than a saved
  // profile's host+port+db+user), so it can't be used to reliably tell which
  // profile is active when highlighting the picker.
  activeProfileId = '';
  credentialsStatus: CredentialsStatus | null = null;
  // Set by connectToSavedProfile on a decryption failure, so the settings
  // form can pre-fill the (still-plaintext) host/port/db/user and prompt the
  // user to just re-enter the password, instead of retyping everything.
  reconnectHint: { dbHost: string; dbPort: string; dbName: string; dbUser: string } | null = null;

  get pineConnected() {
    return DevState.pineConnected ?? !!this.version;
  }

  get dbConnected() {
    const activeSession = this.sessions[this.activeSessionId];
    const connectionId = activeSession?.connectionId || this.connection;
    return DevState.dbConnected ?? !!connectionId;
  }

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

  // User
  email = '';
  domain = '';

  // Settings
  showSettings = false;

  // Analysis
  showAnalysis = false;
  analysisInitialValue = '';

  // Command Palette
  showCommandPalette = false;
  _commandHistory: string[] = []; // Store command IDs

  // Changelog
  showChangelog = false;

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
    this._onboardingServer = getUserPreference(STORAGE_KEYS.ONBOARDING_SERVER, false);
    this._commandHistory = getUserPreference(STORAGE_KEYS.COMMAND_HISTORY, []);
    this.connectionColors = getUserPreference(STORAGE_KEYS.CONNECTION_COLORS, {});
    makeAutoObservable(this);

    // Initialize the default session
    const initSession = new Session('0', this);
    this.sessions[initSession.id] = initSession;
  }

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
    return this.resolveConnectionEntry(connectionId)?.label ?? connectionId;
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
        if (activeSession.expression.trim()) {
          const session = this.createSession();
          this.activeSessionId = session.id;
        } else {
          activeSession.connectionId = id;
        }
      });
      await this.refreshConnections();
    } catch (e) {
      const message = (e as Error)?.message ?? 'Unknown error';
      runInAction(() => {
        activeSession.message = `⚠ Failed to switch connection: ${message}`;
      });
      throw e;
    }
  };

  /**
   * Connect to a saved (desktop-only) profile that may not have a live pine
   * pool yet this session -- fetches the decrypted credentials and goes
   * through the normal `connect` (create + use) path, rather than assuming
   * a pool already exists the way `selectConnection` does.
   */
  connectToSavedProfile = async (id: string): Promise<string> => {
    console.log(`[credentials] connectToSavedProfile called for id=${id}`);
    if (typeof window === 'undefined' || !window.beamlynxDesktop) {
      throw new Error('Saved connections are only available in desktop mode');
    }
    const result = await window.beamlynxDesktop.credentials.get(id);
    console.log('[credentials] connectToSavedProfile: get result ->', result);
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
    return this.connect({
      dbHost: profile.dbHost,
      dbPort: profile.dbPort,
      dbName: profile.dbName,
      dbUser: profile.dbUser,
      dbPassword,
    });
  };

  /**
   * Delete a connection: best-effort, silently close any live pine session
   * for it, and (desktop only) forget the saved credential -- both are
   * independent and safe to attempt even if the other has nothing to do
   * (e.g. deleting a saved profile that was never connected this session,
   * or deleting in browser mode where there's no saved credential at all).
   */
  deleteConnection = async (id: string) => {
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
      if (this.activeProfileId === id) {
        this.activeProfileId = '';
      }
      Object.values(this.sessions).forEach(session => {
        if (session.connectionId === id || session.connectionId === pineId) {
          session.connectionId = '';
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

  connect = async (params: ConnectionParams): Promise<string> => {
    const connectionId = await client.createConnection(params);
    if (!connectionId) {
      throw new Error("Connection wasn't created");
    }
    const { id, version } = await client.useConnection(connectionId);
    if (!id) {
      runInAction(() => {
        this.connection = '';
      });
      throw new Error('Failed to connect');
    }
    runInAction(() => {
      this.connection = id;
      this.version = version ?? '0.0.0';
      this.assignConnectionColor(id);

      const activeSession = this.sessions[this.activeSessionId];
      if (activeSession) {
        if (activeSession.expression.trim()) {
          const session = this.createSession();
          this.activeSessionId = session.id;
        } else {
          activeSession.connectionId = id;
        }
      }
      if (this.virtualSession) {
        this.virtualSession.connectionId = id;
      }

      if (!this.onboardingServer) {
        this.onboardingServer = true;
      }
    });

    console.log(
      `[credentials] connect: isDesktop()=${isDesktop()} window.beamlynxDesktop=${
        typeof window !== 'undefined' && !!window.beamlynxDesktop
      }`,
    );
    if (isDesktop() && typeof window !== 'undefined' && window.beamlynxDesktop) {
      try {
        const saveResult = await window.beamlynxDesktop.credentials.save(params);
        console.log('[credentials] connect: save result ->', saveResult);
        runInAction(() => {
          this.activeProfileId = saveResult.persisted ? saveResult.profile.id : '';
        });
      } catch (e) {
        console.error('[credentials] connect: credentials.save threw ->', e);
        runInAction(() => {
          this.activeProfileId = '';
        });
      }
    }

    await this.refreshConnections();
    return id;
  };

  createSessionUsingId = (id: string) => {
    const session = new Session(id, this);
    session.connectionId = this.connection;
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
      runInAction(() => {
        this.version = result.version ?? '0.0.0';
        this.connection = result['connection-id'] || '';
        this.assignConnectionColor(this.connection);

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
