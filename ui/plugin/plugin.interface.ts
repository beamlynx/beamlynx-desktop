import { GlobalStore } from '../store/global.store';
import { Row, Session } from '../store/session';

export type EvaluateOptions = {
  // A canvas-triggered auto-run's source of truth is always
  // `session.expression` (Pine), never the SQL panel's text - it's just a
  // view onto canvas's own output there (see GlobalStore.canvasActive), not
  // an independent thing to run. This forces DefaultPlugin.evaluate() down
  // the Pine/eval path regardless of `session.inputMode`, instead of
  // silently running whatever (possibly stale) SQL text the panel happens to
  // be showing.
  forcePine?: boolean;
};

export interface PluginInterface {
  evaluate(opts?: EvaluateOptions): Promise<Row[]>;
}
