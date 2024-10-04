import { makeAutoObservable } from 'mobx';
import { format } from 'sql-formatter';
import { GraphStore } from './graph.store';
import { Http, Response, State, TableHint } from './http';
import { lt } from 'semver';
import { createSession, Mode, Session } from './session';

const requiredVersion = '0.11.0';

const initSession = createSession('0');

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

  constructor(private readonly graphStore: GraphStore) {
    makeAutoObservable(this);
  }

  getConnectionName = () => {
    const length = this.connection.length;
    const maxLength = 24;
    return length > maxLength ? this.connection.substring(0, maxLength) + '...' : this.connection;
  };

  createSession = (id: string) => {
    const session = createSession(id);
    this.sessions[session.id] = session;
    this.graphStore.createSession(session.id);
    return session;
  };

  deleteSession = (sessionId: string) => {
    delete this.sessions[sessionId];
    this.graphStore.deleteSession(sessionId);
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

  setConnectionName = (response: Response) => {
    if (!response['connection-id']) return;
    this.connection = response['connection-id'];
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

  handleError = (sessionId: string, response: Response) => {
    const session = this.getSession(sessionId);
    session.error = response.error || '';
    session.errorType = response['error-type'] || '';
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

  setQuery = (sessionId: string, response: Response) => {
    const session = this.getSession(sessionId);
    if (!response.query) return;
    let query = '-';
    try {
      query = format(response.query, {
        language: 'postgresql',
        indentStyle: 'tabularRight',
        denseOperators: false,
      });
    } catch (e) {}
    session.query = query;
    session.loaded = false;
  };

  setHints = (session: Session, state: State) => {
    // In case of an error, we don't get any state or hints
    if (!state || !state.hints) return;
    this.graphStore.generateGraphWrapper(session.id, state);
    const expressions = state.hints.table.map(h => h.pine);
    session.message = expressions ? expressions.join(', ').substring(0, 140) : '';
  };

  setOperation = (sessionId: string, response: Response) => {
    const session = this.getSession(sessionId);
    if (!response.state?.operation) {
      session.operation = { type: 'table' };
      return;
    }
    session.operation = response.state.operation;
  };

  buildQuery = async (sessionId: string) => {
    if (!this.connected) {
      this.handleError(sessionId, { error: 'Not connected' } as Response);
      return;
    }

    const session = this.getSession(sessionId);
    const response = await Http.post('build', {
      expression: session.expression,
    });

    if (!response) return;
    this.handleError(sessionId, response);
    this.setConnectionName(response);
    this.setQuery(sessionId, response);
    this.setHints(session, response.state);
    this.setOperation(sessionId, response);
  };

  updateExpressionUsingCandidate = (sessionId: string, candidate: TableHint) => {
    const session = this.getSession(sessionId);
    const { pine } = candidate;
    const parts = session.expression.split('|');
    parts.pop();
    parts.push(pine);
    session.expression = parts.join(' | ');
    this.prettifyExpression(sessionId);
  };

  prettifyExpression = (sessionId: string) => {
    const session = this.getSession(sessionId);
    const parts = session.expression.split('|');
    session.expression =
      parts
        .map(x => x.trim())
        .filter(Boolean)
        .join('\n | ') + '\n | ';
  };

  /**
   * @deprecated
   */
  cleanExpression = (expression: string) => {
    const e = expression.trim();
    return e.endsWith('|') ? e.slice(0, -1) : e;
  };

  setMode(sessionId: string, mode: Mode) {
    const session = this.getSession(sessionId);
    session.mode = mode;
    this.graphStore.resetCandidate(sessionId);
    if (mode === 'input') {
      document.getElementById('input')!.focus();
    }
  }
}
