import { makeAutoObservable } from 'mobx';
import { format } from 'sql-formatter';
import { GraphStore } from './graph.store';
import { Http, Response, TableHint } from './http';
import { pickSuccessMessage } from './success-messages';
import { lt } from 'semver';

const requiredVersion = '0.8.1';

type Column = {
  field: string;
  headerName: string;
  flex: number;
  editable: boolean;
  minWidth: number;
  maxWidth: number;
};

type Row = { [key: string]: any };
type Mode = 'input' | 'graph' | 'result' | 'none';

type Session = {
  expression: string;
  query: string;
  loaded: boolean;
  errorType: string;
  columns: Column[];
  rows: Row[];
  mode: Mode;
};

const initSession: Session = {
  expression: '',
  query: '',
  loaded: false,
  errorType: '',
  columns: [],
  rows: [],
  mode: 'none',
};
export class GlobalStore {
  connected = false;
  connection = '';
  version: string | undefined = undefined;
  error: string = '';
  message: string = '';

  activeSessionId = '0';
  sessions: Record<string, Session> = {
    'session-0': initSession,
    'session-1': initSession,
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

  getActiveSessionId = () => {
    return this.activeSessionId;
  };

  createSession = (sessionId: string) => {
    this.sessions[`session-${sessionId}`] = initSession;
    this.graphStore.createSession(sessionId);
  };

  deleteSession = (sessionId: string) => {
    delete this.sessions[`session-${sessionId}`];
    this.graphStore.deleteSession(sessionId);
  };

  getSession = (sessionId: string): Session => {
    const session = this.sessions[`session-${sessionId}`];
    if (!session) {
      throw new Error('Session with id ' + sessionId + ' not found');
    }
    return session;
  };

  loadConnectionMetadata = async () => {
    const response = await Http.get('connection');
    if (!response) return;
    const result = response.result as {
      version: string;
      'connection-id': string;
    };
    this.connection = result['connection-id'];
    this.version = result.version ?? '0.0.0';

    if (lt(this.version, requiredVersion)) {
      this.error = `🚨 You are running version ${this.version}. Upgrade the server to the latest version (i.e. >= ${requiredVersion}).`;
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

  setCopiedMessage = (v: string, quote = false) => {
    if (quote) {
      v = `'${v.replace(/'/g, "'")}'`;
    }
    this.message = `📋 Copied: ${v}`;
  };

  handleError = (sessionId: string, response: Response) => {
    const session = this.getSession(sessionId);
    this.error = response.error || '';
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

  setHints = (sessionId: string, response: Response) => {
    if (!response.state?.hints) return;
    this.graphStore.generateGraphWrapper(sessionId, response.state);
    const expressions = response.state.hints.table.map(h => h.pine);
    this.message = expressions ? expressions.join(', ').substring(0, 140) : '';
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
    this.setHints(sessionId, response);
  };

  evaluate = async (sessionId: string) => {
    if (!this.connected) {
      this.handleError(sessionId, { error: 'Not connected' } as Response);
      return;
    }
    this.message = '⏳ Fetching rows ...';
    const session = this.getSession(sessionId);
    const response = await Http.post('eval', {
      expression: this.cleanExpression(session.expression),
    });

    if (!response) return;
    this.handleError(sessionId, response);
    if (!response.result) return;

    const rows = response.result as Row[];
    const columns: Column[] = rows[0].map((header: string, index: number): Column => {
      return {
        field: index.toString(),
        headerName: header,
        flex: 1,
        editable: false,
        minWidth: 100,
        maxWidth: 400,
      };
    });
    session.columns = columns;
    session.rows = rows.splice(1).map((row, index) => {
      return {
        ...row,
        _id: index,
      };
    });
    this.message = pickSuccessMessage();
    session.loaded = true;
    this.setMode(sessionId, 'result');
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
