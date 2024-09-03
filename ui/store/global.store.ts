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

export class GlobalStore {
  connected = false;
  connection = '';
  version: string | undefined = undefined;
  expression = '';
  query = '';
  loaded = false;
  error = '';
  errorType: string = '';
  message = '';
  columns: Column[] = [];
  rows: Row[] = [];
  mode: Mode = 'none';
  // User
  email = '';
  domain = '';

  constructor(private readonly graphStore: GraphStore) {
    makeAutoObservable(this);
  }

  getConnectionName = () => {
    const length = this.connection.length;
    const maxLength = 50;
    return length > maxLength ? this.connection.substring(0, maxLength) + '...' : this.connection;
  };

  getSessionName = () => {
    const length = this.connection.length;
    const maxLength = 10;

    // Skip the schema when naming the session
    const [x, y] = this.expression.split('.');
    const expression = y || x;

    return length > maxLength
      ? expression.substring(0, maxLength).replaceAll('|', '') + '...'
      : this.connection;
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

  handleError = (response: Response) => {
    this.error = response.error || '';
    this.errorType = response['error-type'] || '';
  };

  setQuery = (response: Response) => {
    if (!response.query) return;
    let query = '-';
    try {
      query = format(response.query, {
        language: 'postgresql',
        indentStyle: 'tabularRight',
        denseOperators: false,
      });
    } catch (e) {}
    this.query = query;
    this.loaded = false;
  };

  setHints = (response: Response) => {
    if (!response.state?.hints) return;
    this.graphStore.generateGraphWrapper(response.state);
    const expressions = response.state.hints.table.map(h => h.pine);
    this.message = expressions ? expressions.join(', ').substring(0, 140) : '';
  };

  buildQuery = async () => {
    if (!this.connected) {
      this.handleError({ error: 'Not connected' } as Response);
      return;
    }
    const response = await Http.post('build', {
      expression: this.expression,
    });

    if (!response) return;
    this.handleError(response);
    this.setConnectionName(response);
    this.setQuery(response);
    this.setHints(response);
  };

  evaluate = async () => {
    if (!this.connected) {
      this.handleError({ error: 'Not connected' } as Response);
      return;
    }
    this.message = '⏳ Fetching rows ...';
    const response = await Http.post('eval', {
      expression: this.cleanExpression(this.expression),
    });

    if (!response) return;
    this.handleError(response);
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
    this.columns = columns;
    this.rows = rows.splice(1).map((row, index) => {
      return {
        ...row,
        _id: index,
      };
    });
    this.message = pickSuccessMessage();
    this.loaded = true;
    this.setMode('result');
  };

  updateExpressionUsingCandidate = (candidate: TableHint) => {
    const { pine } = candidate;
    const parts = this.expression.split('|');
    parts.pop();
    parts.push(pine);
    this.expression = parts.join(' | ');
    this.prettifyExpression();
  };

  prettifyExpression = () => {
    const parts = this.expression.split('|');
    this.expression =
      parts
        .map(x => x.trim())
        .filter(Boolean)
        .join('\n | ') + '\n | ';
  };

  cleanExpression = (expression: string) => {
    const e = expression.trim();
    return e.endsWith('|') ? e.slice(0, -1) : e;
  };

  setCopiedMessage = (v: string, quote = false) => {
    if (quote) {
      v = `'${v.replace(/'/g, "'")}'`;
    }
    this.message = `📋 Copied: ${v}`;
  };

  setMode(mode: Mode) {
    this.mode = mode;
    this.graphStore.resetCandidate();
    if (mode === 'input') {
      document.getElementById('input')!.focus();
    }
  }
}
