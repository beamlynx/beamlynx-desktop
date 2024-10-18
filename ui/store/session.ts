import { makeAutoObservable, reaction } from 'mobx';
import { Ast, Hints, Operation, Response, TableHint } from './http';
import { HttpClient } from './client';
import { generateGraph, Graph } from './graph.util';
import { format } from 'sql-formatter';
import { RecursiveDeletePlugin } from '../plugin/recursive-delete.plugin';
import { DefaultPlugin } from '../plugin/default.plugin';
import { prettifyExpression } from './util';

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

export class Session {
  id: string;
  expression: string = ''; // observable

  // Result
  loaded: boolean = false;
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
  candidate: TableHint | null = null;

  graph: Graph = {
    nodes: [],
    edges: [],
  };

  // Evaluation plugins
  plugins: { delete: RecursiveDeletePlugin; default: DefaultPlugin };

  constructor(id: string) {
    this.id = `session-${id}`;

    // TODO: explicitly mark the observables, actions, computables
    makeAutoObservable(this);

    this.plugins = {
      delete: new RecursiveDeletePlugin(this),
      default: new DefaultPlugin(this),
    };
    /**
     * Build the expression i.e. get the http repsonse
     */
    reaction(
      () => this.expression,
      async expression => {
        // reset the candidate
        this.candidateIndex = undefined;

        // response
        try {
          this.response = await client.build(expression);
        } catch (e) {
          this.error = (e as any).message || 'Failed to build';
        }
      },
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
     * - message from hints
     * - graph from ast
     */
    reaction(
      () => this.ast,
      async ast => {
        if (!ast) return;

        if (ast.hints) {
          const hints = ast.hints;
          this.message = getMessageFromHints(hints);
        }

        const { candidate, graph } = generateGraph(ast, this.candidateIndex);
        this.candidate = candidate;
        this.graph = graph;
      },
    );

    reaction(
      () => this.candidateIndex,
      async ci => {
        const ast = this.ast;
        if (!ast?.hints) return;
        const { candidate, graph } = generateGraph(ast, ci);
        this.candidate = candidate;
        this.graph = graph;
      },
    );
  }

  public selectNextCandidate(offset: number) {
    this.candidateIndex = this.candidateIndex === undefined ? 0 : this.candidateIndex + offset;
  }

  public updateExpressionUsingCandidate() {
    if (!this.candidate) {
      throw new Error('Unable to update the expression as no candidate is selected.');
    }
    const { pine } = this.candidate;
    const parts = this.expression.split('|');
    parts.pop();
    parts.push(pine);
    const expression = parts.join(' | ');
    this.expression = prettifyExpression(expression);
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

const getMessageFromHints = (hints: Hints): string => {
  const expressions = hints.table.map(h => h.pine);
  return expressions ? expressions.join(', ').substring(0, 140) : '';
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
