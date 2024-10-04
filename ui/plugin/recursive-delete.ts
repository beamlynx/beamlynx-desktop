import { format } from 'sql-formatter';
import { GlobalStore } from '../store/global.store';
import { Client, State } from '../store/http';
import { Session } from '../store/session';
import { PluginInterface } from './plugin.interface';

export class RecursiveDeletePlugin implements PluginInterface {
  private readonly client: Client;
  constructor(
    private session: Session,
    global: GlobalStore,
  ) {
    this.client = new Client(async (state: State) => {
      // wait for 500 ms before setting the hints
      await new Promise(resolve => setTimeout(resolve, 500));
      global.setHints(session, state);
    });
  }
  public async evaluate(): Promise<void> {
    const expression = this.session.expression.split('|').slice(0, -1).join('|');

    const queries: string[] = [];
    await this.collectDeleteQueries(expression, queries);
    this.session.query = queries
      .map(q => {
        return format(q, {
          language: 'postgresql',
          indentStyle: 'tabularRight',
          denseOperators: false,
        });
      })
      .join('\n\n');

    return Promise.resolve();
  }

  private async collectDeleteQueries(expression: string, deleteQueries: string[]): Promise<void> {
    const count = await this.client.count(expression);

    if (count === 0) {
      return;
    }

    // Recurse to process children first
    const { expressions } = await this.client.makeChildExpressions(expression);

    for (const childExpr of expressions) {
      await this.collectDeleteQueries(childExpr, deleteQueries);
    }

    // After processing children, add the delete query for the current expression
    const { query } = await this.client.buildDeleteQuery(expression, count);
    deleteQueries.push(query);
  }
}
