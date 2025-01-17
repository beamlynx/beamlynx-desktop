import { makeAutoObservable, reaction } from 'mobx';
import { format } from 'sql-formatter';
import { DefaultPlugin } from '../plugin/default.plugin';
import { RecursiveDeletePlugin } from '../plugin/recursive-delete.plugin';
import { Ast, Hints, HttpClient, Operation, Response, TableHint } from './client';
import { generateGraph, getCandidateIndex, Graph } from './graph.util';
import { debounce, prettifyExpression } from './util';

export type Mode = 'input' | 'graph' | 'result' | 'none';

export type Column = {
  field: string;
  headerName: string;
  flex: number;
  editable: boolean;
  minWidth: number;
  maxWidth: number;
};

export type Row = { [key: string]: any };

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
 * The evaluation is explicit. A function is called to evaluate the expressoin.
 *
 * Depending on the operatoin type, we are using the appropriate plugin i.e.
 * default vs recursive delete.
 *
 * I would like to merge the logic for all invokations the the backend i.e.
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
 * For now I'll keep it like this and let it perculate until I am convinced of a
 * way to refactor is in a better way.
 */
export class Session {
  id: string;
  expression: string = ''; // observable

  // Result
  loaded: boolean = false; // observable
  columns: Column[] = [];
  rows: Row[] = [];

  mode: Mode = 'none';
  message: string = '';

  /**
   * Resonse
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
  // Ast
  operation: Operation = { type: 'table' };
  ast: Ast | null = null; // observable
  query: string = '';
  hints: Hints | null = null; // observable

  // Graph
  candidateIndex: number | undefined = undefined; // observable

  graph: Graph = {
    candidate: null,
    selectedNodes: [],
    suggestedNodes: [],
    edges: [],
  };

  // Evaluation plugins
  plugins: { delete: RecursiveDeletePlugin; default: DefaultPlugin };

  constructor(id: string) {
    this.id = `session-${id}`;

    // TODO: explicitly mark the observables, actions, computables
    makeAutoObservable(this);

    // Evaluation plugins
    this.plugins = {
      delete: new RecursiveDeletePlugin(this),
      default: new DefaultPlugin(this),
    };

    /**
     * Handle the expression
     * - Get the http repsonse
     */
    reaction(
      () => this.expression,
      debounce(async expression => {
        // reset the candidate
        this.candidateIndex = undefined;

        // response
        try {
          this.response = await client.build(expression);
        } catch (e) {
          this.error = (e as any).message || 'Failed to build';
        }
      }, 150),
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
     * - Message from the hints
     */
    reaction(
      () => this.ast,
      async ast => {
        if (!ast) return;

        if (ast.hints) {
          const hints = ast.hints;
          const message = getMessageFromHints(ast.operation, hints);
          if (message) {
            this.message = message;
          }
        }

        const graph = generateGraph(ast);
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

  public selectNextCandidate(offset: number) {
    this.candidateIndex = this.candidateIndex === undefined ? 0 : this.candidateIndex + offset;
  }

  public getExpressionUsingCandidate() {
    if (!this.graph.candidate) {
      throw new Error('Unable to update the expression as no candidate is selected.');
    }
    const { pine } = this.graph.candidate;
    const parts = this.expression.split('|');
    parts.pop();
    parts.push(pine);
    const expression = parts.join(' | ');
    return prettifyExpression(expression);
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
}

const getMessageFromHints = (operation: Operation, hints: Hints): string | undefined => {
  switch (operation.type) {
    case 'table':
      const tableExpressions = hints.table.map(h => h.pine);
      return tableExpressions ? tableExpressions.join(', ').substring(0, 140) : '';
    case 'select-partial':
      const columns = hints.select?.map(h => h.column);
      return columns ? columns.join(', ').substring(0, 140) : '';
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
