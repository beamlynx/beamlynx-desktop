import { GlobalStore } from '../store/global.store';
import { NoOpOperationName, OperationName } from '../store/http';
import { Session } from '../store/session';
import { PluginInterface } from './plugin.interface';
import { RecursiveDeletePlugin } from './recursive-delete';
import { RunQueryPlugin } from './run-query';

class FallbackPlugin implements PluginInterface {
  async evaluate(session: Session): Promise<void> {
    session.error = 'Invalid UI Operation';
  }
}

const plugins: { [operation in NoOpOperationName]: PluginInterface } = {
  'delete-recursive': new RecursiveDeletePlugin(),
  '-': new FallbackPlugin(),
} as const;

/**
 * @param global This is needed for the time being until I refactor the code to
 * avoid passing the store.
 */
export const evaluate = async (session: Session, global: GlobalStore): Promise<void> => {
  const { type, value: uiOp } = session.operation;
  const plugin =
    type === 'ui-op' ? plugins[uiOp] || new FallbackPlugin() : new RunQueryPlugin(global);
  await plugin.evaluate(session);
};
