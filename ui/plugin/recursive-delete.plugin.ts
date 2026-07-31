import { runInAction } from 'mobx';
import { format } from 'sql-formatter';
import { Row, Session } from '../store/session';
import { PluginInterface } from './plugin.interface';
import { Ast, HttpClient } from '../store/client';

export class RecursiveDeletePlugin implements PluginInterface {
  private readonly client: HttpClient;
  constructor(private session: Session) {
    this.client = new HttpClient(async (ast: Ast) => {
      // wait for 100 ms before setting the hints
      await new Promise(resolve => setTimeout(resolve, 100));
      runInAction(() => {
        this.session.ast = ast;
      });
    });
  }
  public async evaluate(): Promise<Row[]> {
    const startTime = Date.now();
    try {
      const expression = this.session.expression.split('|').slice(0, -1).join('|');
      runInAction(() => {
        this.session.loading = true;
        this.session.query = '/* Recursive deletion in progress ... */';
      });

      // Create the delete queries
      const queries: string[] = ['/* DELETE queries */', 'BEGIN;'];
      // FIXME: The column name is hardcoded to `id`. This means that if a table
      // that doesn't have `id` as the primary column won't be deleted using the
      // recursive delete method.
      await this.collectDeleteQueries(expression, 'id', queries);
      queries.push('COMMIT;');

      // Format the queries
      const formattedQuery = queries
        .map(q => {
          if (q.trim().startsWith('/*')) {
            return q;
          }
          return format(q, {
            language: 'postgresql',
            indentStyle: 'tabularRight',
            denseOperators: false,
          });
        })
        .join('\n\n');
      runInAction(() => {
        this.session.query = formattedQuery;
        // FIXME: I am not sure how to design this. When we get all the queries, I
        // show the graph to the right so that the queries also also visible.
        // Currently, there is no way to see the queries if the result mode is
        // enabled as the graph is shown in place of the queries (i.e. the
        // secondary view is not visible).
        this.session.mode = 'graph';
      });
    } catch (e) {
      runInAction(() => {
        this.session.error = e instanceof Error ? e.message : 'Unknown error';
        this.session.query = `/* Recursive deletion failed */`;
      });
    } finally {
      const timeTaken = Date.now() - startTime;
      const minutes = Math.floor(timeTaken / 60000);
      const seconds = Math.floor((timeTaken % 60000) / 1000);
      runInAction(() => {
        this.session.loading = false;
        this.session.message = `⏱️ Time taken: ${minutes}:${seconds.toString().padStart(2, '0')}`;
      });
    }

    return [];
  }

  private async collectDeleteQueries(
    expression: string,
    column: string,
    deleteQueries: string[],
  ): Promise<void> {
    await this.client.build([expression], undefined, this.session.connectionId);
    const count = await this.client.count(expression, this.session.connectionId);

    if (count === 0) {
      return;
    }

    // Recurse to process children first
    const { expressions } = await this.client.makeChildExpressions(expression, this.session.connectionId);

    for (const { expression: childExpression, column: childColumn } of expressions) {
      await this.collectDeleteQueries(childExpression, childColumn, deleteQueries);
    }

    // After processing children, add the delete query for the current expression
    const query = await this.client.buildDeleteQuery(expression, column, count, this.session.connectionId);
    deleteQueries.push(`/*\n${expression}\n*/`);
    deleteQueries.push(query);
  }
}
