import { makeAutoObservable } from 'mobx';
import { lt } from 'semver';
import { HttpClient } from './client';
import { Session, Theme } from './session';
import { RequiredVersion } from '../constants';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { DevState } from './dev-state';
import { getCommandById } from '../utils/commands';

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

  get pineConnected() {
    return DevState.pineConnected ?? !!this.version;
  }

  get dbConnected() {
    return DevState.dbConnected ?? !!this.connection;
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
    this._onboardingServer = getUserPreference(STORAGE_KEYS.ONBOARDING_SERVER, false);
    this._commandHistory = getUserPreference(STORAGE_KEYS.COMMAND_HISTORY, []);
    makeAutoObservable(this);

    // Initialize the default session
    const initSession = new Session('0', this);
    this.sessions[initSession.id] = initSession;
  }

  public handleUrlParameters() {
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
          session.expression = decodeURIComponent(queryParam);
          session.prettify();
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
          session.expression = data.expression;
          session.prettify();
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

  getConnectionName = () => {
    if (!this.connection) return '';
    const length = this.connection.length;
    const maxLength = 24;
    return length > maxLength ? this.connection.substring(0, maxLength) + '...' : this.connection;
  };

  connect = async (params: ConnectionParams): Promise<string> => {
    const connectionId = await client.createConnection(params);
    if (!connectionId) {
      throw new Error("Connection wasn't created");
    }
    const { id, version } = await client.useConnection(connectionId);
    if (!id) {
      this.connection = '';
      throw new Error('Failed to connect');
    }
    this.connection = id;
    this.version = version ?? '0.0.0';

    if (!this.onboardingServer) {
      this.onboardingServer = true;
    }
    return id;
  };

  createSessionUsingId = (id: string) => {
    const session = new Session(id, this);
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
    const session = this.createSession();
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
        this.connection = '';
        this.version = undefined;
        return;
      }
      const result = response.result as unknown as {
        version: string;
        'connection-id': string;
      };
      this.version = result.version ?? '0.0.0';
      this.connection = result['connection-id'] || '';

      if (this.pineConnected && !this.onboardingServer) {
        this.onboardingServer = true;
      }

      if (lt(this.version, RequiredVersion)) {
        this.requiresUpgrade = true;
      }
    } catch (e) {
      console.error('Failed to load connection metadata', e);
      this.connection = '';
      this.version = undefined;
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
