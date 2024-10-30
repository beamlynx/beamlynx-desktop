import { HttpClient } from '../store/client';
import { Column, Row, Session } from '../store/session';
import { pickSuccessMessage } from '../store/success-messages';
import { PluginInterface } from './plugin.interface';

export class DefaultPlugin implements PluginInterface {
  private readonly client: HttpClient;
  constructor(private session: Session) {
    this.client = new HttpClient();
  }

  public async evaluate(): Promise<void> {
    const session = this.session;
    session.message = '⏳ Fetching rows ...';
    const response = await this.client.eval(session.expression);

    if (!response) {
      session.message = '🤷 No response';
      return;
    }

    if (response.error) {
      session.message = '';
      session.error = response.error;
      return;
    }

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
    session.message = pickSuccessMessage();
    session.loaded = true;
    session.mode = 'result';
  }
}
