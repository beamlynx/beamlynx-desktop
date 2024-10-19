import { GlobalStore } from '../store/global.store';
import { Session } from '../store/session';

export interface PluginInterface {
  evaluate(): Promise<void>;
}
