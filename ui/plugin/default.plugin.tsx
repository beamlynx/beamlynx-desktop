import { HttpClient } from '../store/client';
import { Row, Session } from '../store/session';
import { pickSuccessMessage } from '../store/success-messages';
import { PluginInterface } from './plugin.interface';
import { Link } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';

export class DefaultPlugin implements PluginInterface {
  private readonly client: HttpClient;
  constructor(private session: Session) {
    this.client = new HttpClient();
  }

  public async evaluate(): Promise<void> {
    const session = this.session;
    session.message = '⏳ Fetching rows ...';
    session.loading = true;

    const response = await this.client.eval(session.expression);

    if (!response) {
      session.message = '🤷 No response';
      session.loading = false;
      return;
    }

    if (response.error) {
      session.message = '';
      session.error = response.error;
      session.loading = false;
      return;
    }

    if (!response.result) {
      session.loading = false;
      return;
    }

    const rows = response.result as Row[];
    const columns: GridColDef[] = rows[0].map((header: string, index: number): GridColDef => {
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
    const idIndex = columns.findIndex(column => column.headerName === 'id');
    session.rows = rows.splice(1).map((row, index) => {
      if (idIndex !== -1) {
        row[idIndex] = row[idIndex]; // TODO: this should be clicable
      }

      return { ...row, _id: index };
    });
    session.message = pickSuccessMessage();
    session.loading = false;
    session.focusTextInput();
    session.mode = 'result';
  }
}
