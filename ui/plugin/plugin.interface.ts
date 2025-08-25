import { GlobalStore } from '../store/global.store';
import { Row, Session } from '../store/session';

export interface PluginInterface {
  evaluate(): Promise<Row[]>;
}
