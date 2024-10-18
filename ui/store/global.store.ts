import { makeAutoObservable } from 'mobx';
import { lt } from 'semver';
import { Http } from './http';
import { Session } from './session';

const requiredVersion = '0.11.0';

const initSession = new Session('0');

export class GlobalStore {
  connected = false;
  connection = '';
  version: string | undefined = undefined;

  activeSessionId = 'session-0';
  sessions: Record<string, Session> = {
    [initSession.id]: initSession,
  };

  // User
  email = '';
  domain = '';

  constructor() {
    makeAutoObservable(this);
  }

  getConnectionName = () => {
    const length = this.connection.length;
    const maxLength = 24;
    return length > maxLength ? this.connection.substring(0, maxLength) + '...' : this.connection;
  };

  createSession = (id: string) => {
    const session = new Session(id);
    this.sessions[session.id] = session;
    return session;
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
    const response = await Http.get('connection');
    if (!response) return;
    const result = response.result as unknown as {
      version: string;
      'connection-id': string;
    };
    this.connection = result['connection-id'];
    this.version = result.version ?? '0.0.0';

    if (lt(this.version, requiredVersion)) {
      // Use the default session to show the error
      const session = this.getSession(this.activeSessionId);
      session.error = `🚨 You are running version ${this.version}. Upgrade the server to the latest version (i.e. >= ${requiredVersion}).`;
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
}
