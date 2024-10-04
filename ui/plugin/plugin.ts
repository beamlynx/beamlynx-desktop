import { GlobalStore } from '../store/global.store';
import { Session } from '../store/session';
import { RecursiveDeletePlugin } from './recursive-delete';
import { RunQueryPlugin } from './run-query';

/**
 * @param global This is needed for the time being until I refactor the code to
 * avoid passing the store.
 */
export const evaluate = async (session: Session, global: GlobalStore): Promise<void> => {
  const { type } = session.operation;

  /**
   * FIXME:
   * Something is super wrong about creating an instance of a plugin on each
   * invocation of evaluate.
   */
  const plugin =
    type === 'delete'
      ? new RecursiveDeletePlugin(session, global)
      : new RunQueryPlugin(session, global);
  await plugin.evaluate();
};
