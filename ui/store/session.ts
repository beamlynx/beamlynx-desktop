import { GridColDef } from '@mui/x-data-grid';
import { makeAutoObservable, reaction } from 'mobx';
import { format } from 'sql-formatter';
import { TOTAL_BARS } from '../constants';
import { DefaultPlugin } from '../plugin/default.plugin';
import { RecursiveDeletePlugin } from '../plugin/recursive-delete.plugin';
import { Ast, Hints, HttpClient, Operation, Response } from './client';
import { generateGraph, getCandidateIndex, Graph } from './graph.util';
import { getUserPreference, setUserPreference, STORAGE_KEYS } from './preferences';
import { debounce, prettifyExpression } from './util';

export type Mode = 'documentation' | 'graph' | 'result' | 'monitor';

export type Theme = 'light' | 'dark';

export type InputMode = 'pine' | 'sql';

export type Row = { [key: string]: any };

export type ColumnMetadata = {
  colIndexToAliasLookup: Record<string, string>; // i.e. which table does the column belong to
  aliasToIdLookup: Record<string, string>; // i.e. what is the id column index for the table
  colIndexToColumnLookup: Record<string, string>; // i.e. what is the column name for the column index
};

const client = new HttpClient();

/**
 * ! A note on evaluation of the pine expressions !
 *
 * The expressions are evaluated in 2 ways:
 * - Build the expression i.e. get the AST and SQL
 * - Run the SQL
 *
 * The expressions are built for each character inserted i.e. if the pine
 * expression is updated, it is automatically being built using mobx reactions.
 *
 * The evaluation is explicit. A function is called to evaluate the expression.
 *
 * Depending on the operation type, we are using the appropriate plugin i.e.
 * default vs recursive delete.
 *
 * I would like to merge the logic for all invocations the the backend i.e.
 * build the expression, get the results, or evaluate in the recursive delete
 * mode.
 *
 * Right now, I need to keep the evaluation of recursive delete separate as it
 * lets me update parts of the session and not everything e.g. only update the
 * graph while keeping the pine expressions and the sql query the same. If I add
 * functionality for tabs within sessions, then each tab could hold a separate
 * pine expression and the related query for each data set that needs to be
 * deleted - but that requires more work to copy all the delete queries (and not
 * go throw each tab in the session and manually copy the queries).
 *
 * For now I'll keep it like this and let it percolate until I am convinced of a
 * way to refactor is in a better way.
 */
export class Session {
  /**
   * Unique session id
   */
  id: string;

  /**
   * Layout properties
   */
  isSmallScreen: boolean = false;

  /**
   * App states
   */
  /** Vim mode */
  vimMode: boolean = false;

  /** Pine expression to be evaluated */
  expression: string = ''; // observable

  /** Input mode - pine or sql */
  inputMode: InputMode = 'pine';

  /** Database connection monitoring */
  monitor: boolean = false;
  connectionCountLogs: { time: string; count: number }[] = [];

  /** Expression/query that was last successfully evaluated (for coloring only after eval) */
  expressionAtLastEval: string = '';

  /** Result */
  loading: boolean = false; // observable
  columns: GridColDef[] = [];
  // The field name - which is the index of the column (stringified) - and the
  // value is false The id fields are hidden by default but kept in the list of
  // columns so that finding the correct id of the row being updated is possible
  columnVisibilityModel: Record<string, boolean> = {};
  columnMetadata: ColumnMetadata = {
    colIndexToAliasLookup: {},
    aliasToIdLookup: {},
    colIndexToColumnLookup: {},
  };
  rows: Row[] = [];

  /** Mode - controls the main view */
  mode: Mode = 'documentation';
  message: string = '';

  /**
   * Flags to control the input mode
   */
  // TODO: make sure this is a readonly. This should only represent the state.
  // The actual focus should be done by calling the focus() function
  textInputFocused: boolean = false;

  /**
   * Response
   *  |_ Connection
   *  |_ Error
   *  |_ ErrorType
   *  |_ Ast
   *      |_ Operation
   *      |_ Hints
   *      |_ Query
   */
  response: Response | null = null; // observable
  connection: string = '-';
  error: string = '';
  errorType: string = '';

  /** Ast */
  operation: Operation = { type: 'table' };
  ast: Ast | null = null; // observable
  query: string = '';
  hints: Hints | null = null; // observable

  /** Graph */
  candidateIndex: number | undefined = undefined; // observable

  graph: Graph = {
    candidate: null,
    selectedNodes: [],
    suggestedNodes: [],
    edges: [],
  };

  /** Cursor position */
  cursorPosition?: { line: number; character: number };

  /** Counter to trigger hint regeneration on demand */
  hintsRequestedCounter: number = 0;

  /** Evaluation plugins */
  plugins: { delete: RecursiveDeletePlugin; default: DefaultPlugin };

  /** Global store reference for accessing theme */
  private globalStore: any = null;

  constructor(id: string, globalStore?: any) {
    this.id = `session-${id}`;
    this.vimMode = getUserPreference(STORAGE_KEYS.VIM_MODE, false);
    this.globalStore = globalStore;

    makeAutoObservable(this);

    /** Evaluation plugins */
    this.plugins = {
      delete: new RecursiveDeletePlugin(this),
      default: new DefaultPlugin(this),
    };

    /**
     * Handle the expression and explicit hint requests
     * - Get the http response
     */
    reaction(
      () => ({
        expression: this.expression,
        trigger: this.hintsRequestedCounter,
      }),
      debounce(async ({ expression }) => {
        // Skip building if in SQL mode - no Pine expression to build
        if (this.inputMode === 'sql') {
          return;
        }

        // reset the candidate
        this.candidateIndex = undefined;

        if (expression.trim() === '' && this.mode === 'graph') {
          this.mode = 'documentation';
        } else if (expression.trim() !== '' && this.mode === 'documentation') {
          this.mode = 'graph';
        }

        // response - use current cursor position (not watched, but always current)
        try {
          this.response = await client.build(expression, this.cursorPosition);
        } catch (e) {
          this.error = (e as any).message || 'Failed to build';
        }
      }, 200),
    );

    /**
     * Handle the response:
     * - connection name
     * - ast
     * - query
     * - operation
     * - error
     */
    reaction(
      () => this.response,
      async response => {
        if (!response) return;

        // connection
        this.connection = response['connection-id'] || '-';

        // ast
        this.ast = response.ast;

        // query
        this.query = formatQuery(response.query);

        // operation
        this.operation = handleOperation(response);

        // error
        const { error, errorType } = handleError(response);
        this.error = error;
        this.errorType = errorType;
      },
    );

    /**
     * Handle the ast
     * - Graph
     */
    reaction(
      () => this.ast,
      async ast => {
        if (!ast) return;

        const isDark = this.globalStore?.theme === 'dark';
        const graph = generateGraph(ast, this.id, isDark);
        this.graph = graph;
      },
    );

    /**
     * Handle the candidate index
     * - Candidate
     */
    reaction(
      () => this.candidateIndex,
      async ci => {
        if (ci === undefined) return;
        const ast = this.ast;
        if (!ast?.hints) return;

        const {
          hints: { table: suggestedTables },
        } = ast;

        const sanitizedCandidateIndex = getCandidateIndex(suggestedTables, ci);
        for (const { h, i } of suggestedTables.map((h, i) => ({ h, i }))) {
          if (i === sanitizedCandidateIndex) {
            this.graph.candidate = h;
            break;
          }
        }
      },
    );

    /**
     * Handle the candidate
     * - Suggested Pine Expression
     */
    reaction(
      () => this.graph.candidate,
      async candidate => {
        if (!candidate) return;
        const { pine } = candidate;
        this.message = pine;
      },
    );
  }

  public toggleVimMode() {
    this.vimMode = !this.vimMode;
    setUserPreference(STORAGE_KEYS.VIM_MODE, this.vimMode);
  }

  public selectNextCandidate(offset: number) {
    this.candidateIndex = this.candidateIndex === undefined ? 0 : this.candidateIndex + offset;
  }

  private getExpressionUsingCandidate() {
    if (!this.graph.candidate) {
      throw new Error('Unable to update the expression as no candidate is selected.');
    }
    const { pine } = this.graph.candidate;
    return this.pipeExpression(pine, true);
  }

  private pipeExpression(pine: string, overwriteLastOperation: boolean) {
    const parts = this.expression.split('|').map(p => p.trim());
    const last = parts.pop();
    if (!overwriteLastOperation && last) {
      parts.push(last);
    }
    parts.push(pine);
    const expression = parts.join(' | ').trimEnd();
    return prettifyExpression(expression, true);
  }

  public updateExpressionUsingCandidate() {
    this.expression = this.getExpressionUsingCandidate();
  }

  public prettify(appendPipe = false) {
    this.expression = prettifyExpression(this.expression, appendPipe);
  }

  public appendAndUpdateExpression(string: string) {
    this.expression = this.expression + string;
  }

  public pipeAndUpdateExpression(pine: string, overwriteLastOperation: boolean = false) {
    this.expression = this.pipeExpression(pine, overwriteLastOperation);
  }

  public setContext(alias: string) {
    const pine = `from: ${alias}`;
    this.expression = this.pipeExpression(pine, true);
  }

  public async evaluate() {
    const { type } = this.operation;
    switch (type) {
      case 'delete':
        return await this.plugins.delete.evaluate();
      case 'table':
      // intentional fall through
      default:
        return await this.plugins.default.evaluate();
    }
  }

  /**
   * Explicitly build an expression and return the AST.
   * This bypasses the reactive flow and is useful for imperative operations
   * like fetching hints for command palette options.
   *
   * Similar to evaluate() but only builds without executing.
   */
  public async build(expression: string): Promise<Ast> {
    const response = await client.build(expression, this.cursorPosition);
    return response.ast;
  }

  public setTextInputFocused(focused: boolean) {
    this.textInputFocused = focused;
  }

  public focusTextInput() {
    this.textInputFocused = true;
  }

  public blurTextInput() {
    this.textInputFocused = false;
  }

  public updateCursorPosition(line: number, character: number) {
    this.cursorPosition = { line, character };
  }

  public requestHints() {
    // Increment counter to trigger the reaction
    this.hintsRequestedCounter++;
  }

  public setInputMode(mode: InputMode) {
    this.inputMode = mode;
  }

  public setMessage(message: string, autoClearMs: number = 3000) {
    this.message = message;

    if (autoClearMs > 0) {
      setTimeout(() => {
        // Only clear if the message hasn't been changed by something else
        if (this.message === message) {
          this.message = '';
        }
      }, autoClearMs);
    }
  }

  async updateConnectionLogs() {
    const stats = await client.getConnectionStats();
    if (!stats) return;

    const newLog = {
      time: stats.time.toTimeString().split(' ')[0],
      count: stats.connectionCount,
    };

    // Update logs array
    if (this.connectionCountLogs.length >= TOTAL_BARS) {
      this.connectionCountLogs = [...this.connectionCountLogs.slice(1), newLog];
    } else {
      this.connectionCountLogs = [...this.connectionCountLogs, newLog];
    }
  }
}

const getMessageFromHints = (operation: Operation, hints: Hints): string | undefined => {
  switch (operation.type) {
    case 'table':
      const tableExpressions = hints.table.map(h => h.pine);
      return tableExpressions ? tableExpressions.join(', ') : '';
    case 'select-partial':
      const columns = hints.select?.map(h => h.column);
      return columns ? columns.join(', ') : '';
    case 'where-partial':
      const whereColumns = hints.where?.map(h => h.column);
      return whereColumns ? whereColumns.join(', ') : '';
  }
};

const handleOperation = (response: Response): Operation => {
  if (!response.ast?.operation) {
    return { type: 'table' };
  }
  return response.ast.operation;
};

const handleError = (response: Response): { error: string; errorType: string } => {
  return {
    error: response.error || '',
    errorType: response['error-type'] || '',
  };
};

const formatQuery = (query: string): string => {
  if (!query) return '';
  try {
    return format(query, {
      language: 'postgresql',
      indentStyle: 'tabularRight',
      denseOperators: false,
    });
  } catch (e) {}
  return '';
};
