import { Session } from '../store/session';

export interface PluginInterface {
  evaluate(session: Session): Promise<void>;
}
