import type { AccessPolicy, AccessPolicyModule, AccessPolicyRule, ColumnMatcher, ColumnPolicy } from '../store/client';

/** One column of one real table: what a rule written from the results grid names. */
export type PolicyColumn = { schema: string | null; table: string; column: string };

// The schema a table is in unless it says otherwise: Postgres's `public`
// and SQLite's `main`. Naming it adds nothing.
const DEFAULT_SCHEMAS = new Set(['public', 'main']);

/** `user.email`, or `auth.user.email` outside the default schema. */
export function columnName({ schema, table, column }: PolicyColumn): string {
  return schema && !DEFAULT_SCHEMAS.has(schema) ? `${schema}.${table}.${column}` : `${table}.${column}`;
}

/** A matcher in words, as Settings and the right-click menu name it. */
export function describeMatcher(matcher: ColumnMatcher): string {
  switch (matcher.type) {
    case 'column-type':
      return 'Standard data types';
    case 'foreign-key':
      return 'Columns that reference another table';
    case 'column-name':
      if (matcher.contains) return `Name contains “${matcher.contains}”`;
      if (matcher.suffix) return `Name ends with “${matcher.suffix}”`;
      if (matcher.equals) return `Name is “${matcher.equals}”`;
      return 'Any name';
    case 'column':
      return columnName({ schema: matcher.schema ?? null, table: matcher.table, column: matcher.column });
  }
}

export function matcherOf(rule: AccessPolicyRule): ColumnMatcher {
  return rule.type === 'hide' ? rule.match : rule;
}

// The same JSON whatever order the keys came in: pine-lang sends a rule
// back in its own key order, not the one it was stored in.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The stored rule that pine-lang reported as deciding a column. */
export function findModule(policy: AccessPolicy, rule: AccessPolicyRule): AccessPolicyModule | undefined {
  const wanted = canonical(rule);
  return policy.rules.find(({ id: _id, enabled: _enabled, builtIn: _builtIn, ...stored }) => canonical(stored) === wanted);
}

/**
 * The Except rules of its own that hide the column a show rule names: the
 * ones showing it has to take out, or they would still win. A rule without
 * a schema names the table in any schema, so either side may lack one.
 */
export function ownHideRules(rules: AccessPolicyModule[], show: AccessPolicyRule): AccessPolicyModule[] {
  if (show.type !== 'column') return [];
  return rules.filter(
    m =>
      m.type === 'hide' &&
      m.match.type === 'column' &&
      m.match.table === show.table &&
      m.match.column === show.column &&
      (!m.match.schema || !show.schema || m.match.schema === show.schema),
  );
}

export function exactColumnRule(target: PolicyColumn, hide: boolean): AccessPolicyRule {
  const matcher: ColumnMatcher = { type: 'column', schema: target.schema, table: target.table, column: target.column };
  return hide ? { type: 'hide', match: matcher } : matcher;
}

/**
 * What the results grid's right-click menu offers for one column, from what
 * pine-lang reported about it:
 * - `hide`: agents see it now. The item hides it.
 * - `show`: hidden only because no rule shows it, or by its own exact-column
 *   hide rule. The item shows it.
 * - `hidden-by-rule`: a broader hide rule covers it. A hide rule always wins,
 *   so no column rule can show it. The item opens that rule in Settings.
 * - `no-policy`: agents can query this connection with no policy at all.
 * - null: nothing to offer, such as a computed value, or a connection agents
 *   can't query.
 */
export type ColumnPolicyAction =
  | { kind: 'hide' | 'show'; target: PolicyColumn; isPath: boolean }
  | { kind: 'hidden-by-rule'; target: PolicyColumn; rule: AccessPolicyRule }
  | { kind: 'no-policy' }
  | null;

export function columnPolicyAction(
  policy: ColumnPolicy | undefined,
  column: string | undefined,
  isPath: boolean,
  connection: { mcpEnabled?: boolean; policyId?: string | null } | undefined,
): ColumnPolicyAction {
  if (connection?.mcpEnabled && !connection.policyId) return { kind: 'no-policy' };
  if (!policy?.table || !column) return null;
  const target = { schema: policy.table.schema, table: policy.table.table, column };
  if (!policy.hidden) return { kind: 'hide', target, isPath };
  const by = policy.by;
  if (by?.type === 'hide' && by.match.type !== 'column') return { kind: 'hidden-by-rule', target, rule: by };
  return { kind: 'show', target, isPath };
}
