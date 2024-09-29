import { Session } from '../store/session';
import { PluginInterface } from './plugin.interface';

export class RecursiveDeletePlugin implements PluginInterface {
  public async evaluate(session: Session): Promise<void> {
    alert(session.expression);
    return Promise.resolve();
  }
}
