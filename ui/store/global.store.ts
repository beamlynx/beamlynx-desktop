import { makeAutoObservable } from 'mobx';
import { lt } from 'semver';
import { HttpClient } from './client';
import { Session, Theme } from './session';
import { RequiredVersion } from '../constants';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';

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

  get pineConnected() {
    return !!this.version;
  }

  get dbConnected() {
    return !!this.connection;
  }

  activeSessionId = 'session-0';
  sessions: Record<string, Session> = {};

  // Theme - moved from individual sessions to global
  _theme: Theme;

  get theme(): Theme {
    return this._theme;
  }

  set theme(newTheme: Theme) {
    this._theme = newTheme;
    setUserPreference(STORAGE_KEYS.THEME, newTheme);
  }

  // User
  email = '';
  domain = '';

  // Settings
  showSettings = false;

  // Analysis
  showAnalysis = false;

  constructor() {
    this._theme = getUserPreference(STORAGE_KEYS.THEME, 'dark');
    makeAutoObservable(this);

    // Initialize the default session
    const initSession = new Session('0', this);
    this.sessions[initSession.id] = initSession;
  }

  public toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
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

  getSession = (id: string): Session => {
    const session = this.sessions[id];
    if (!session) {
      throw new Error('Session with id ' + id + ' not found');
    }
    return session;
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

      if (lt(this.version, RequiredVersion)) {
        // Use the default session to show the error
        const session = this.getSession(this.activeSessionId);
        session.error = `You are running version ${this.version}. Upgrade the server to the latest version (i.e. >= ${RequiredVersion}).`;
      }
    } catch (e) {
      console.error('Failed to load connection metadata', e);
      this.connection = '';
      this.version = undefined;
    }
    return this.connection;
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
  };
}
