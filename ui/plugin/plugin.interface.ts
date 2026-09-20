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

  // Overwrite session.expression with the server's own prettified rendering
  // once the eval response comes back (see client.ts's Response.prettified).
  // Opt-in and only ever set by the MCP path (store/mcp-query.ts) - a
  // human's own Run must never rewrite text they're actively editing in the
  // Pine panel.
  applyServerPrettified?: boolean;

  // false asks pine-lang to refuse an expression that changes data rather
  // than run it (client.ts's eval, pine-lang's docs/side-effects.md). Set
  // only by the MCP path, which must never change the person's database --
  // and set there unconditionally, not as a policy decision this plugin
  // makes. Absent everywhere else, so the person's own Run is unaffected.
  allowWrites?: boolean;
};

export interface PluginInterface {
  evaluate(opts?: EvaluateOptions): Promise<Row[]>;
}
