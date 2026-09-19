// Everything an MCP client actually reads is rendered here. The MCP server
// is deliberately not a passthrough for pine-lang's API responses: those
// are shaped for beamlynx-ui (which needs the whole AST to draw the
// relationship graph), and an agent needs almost none of it. Measured on a
// real database, `user |` comes back as 5930 bytes of JSON of which
// ast.hints.table alone is 5559 -- so the win is not "drop the AST" (that's
// ~6%), it's rendering those hints as one ranked line each instead of ~180
// bytes of JSON per hint.
//
// HARD RULE, and the reason this file exists as its own module with its own
// test: **no output path may ever emit SQL.** Pine is the translation layer
// and the enforcement choke point (see beamlynx-plans/completed/
// 2026-08-15-mcp-server-and-url-scheme.md) -- an agent that reasons in SQL
// makes that layer meaningless, and an agent shown SQL will try to send SQL
// back. So `response.query` (pine-lang's compiled SQL) is never read here;
// `ast.prettified` is what confirms to the agent what its expression parsed
// to, in Pine.
//
// Pure functions only, and no `electron` import anywhere in this file --
// that's what lets __tests__/format.test.js require the compiled output
// under plain `node --test` (this repo's Node is v20, which has no
// TypeScript stripping, so tests run against dist/).

export type TableHint = {
  // null schema identifies a variable/checkpoint rather than a real table.
  schema: string | null;
  table: string;
  // Absent entirely on a "start a pipeline here" hint -- there's no
  // relation yet to describe. Present on a join hint.
  column?: string;
  'related-column'?: string;
  parent?: boolean;
  resolution?: 'fk' | 'heuristic' | 'synthetic' | 'manual';
  pine: string;
};

export type ColumnHint = { column: string; alias: string };

export type Hints = {
  table?: TableHint[];
  select?: ColumnHint[];
  where?: ColumnHint[];
  order?: ColumnHint[];
  update?: ColumnHint[];
};

export type SelectedTable = { schema: string | null; table: string; alias: string };

export type Ast = {
  hints?: Hints;
  'selected-tables'?: SelectedTable[];
  prettified?: string;
};

/** What the control plane's /explain route returns -- pine-lang's build response. */
export type BuildResponse = { ast?: Ast; error?: string };

/** What the control plane's /query route returns (beamlynx-ui's runMcpQuery). */
export type EvalResponse = {
  tabId?: string;
  columns?: { column: string; alias?: string; 'column-alias'?: string; hidden?: boolean }[];
  rows?: unknown[][];
  error?: string;
};

/** A saved-connection record as the control plane's /connections route returns it. */
export type ConnectionRecord = { id: string; label?: string; dbName?: string };

// Enough to keep a wide-schema database usable without dumping hundreds of
// lines. Anything past these is announced, never silently dropped -- a
// truncated list that doesn't say it's truncated reads to an agent as "this
// is all there is".
const MAX_FK_JOINS = 12;
const MAX_GUESSED_JOINS = 6;
const MAX_TABLE_MATCHES = 25;

// `count` and `count:` are two different things, and the footer used to
// print the aggregate with a trailing colon -- which is a parse error, on
// every single completion call. The grammar is explicit: an aggregate is a
// bare word (`aggregate-function := "count" | ...`), while the standalone
// operation is `count-op := <"count:">`. Printing them on adjacent lines
// with the asymmetry called out is what stops the two being conflated.
const OPERATIONS_CHEATSHEET = [
  '  other operations:',
  "    | select: <col>, <col>       pick columns",
  "    | where: <col> = 'value'     filter rows",
  '    | order: <col> desc          sort',
  '    | limit: <n>                 cap rows',
  '    | group: <col> => count      one row per value, with a count -- no colon after `count`',
  '    | count:                     one number, the row count -- colon here',
].join('\n');

function qualify(t: { schema: string | null; table: string }): string {
  return t.schema ? `${t.schema}.${t.table}` : t.table;
}

/**
 * The table a trailing `| ` or `| select: ` refers to. The AST's own
 * `context`/`current` fields do NOT mean the same thing across operation
 * types -- verified live: for `user | public.document .userId | ` context is
 * 'd_1', but for the same expression with `| select: ` it flips to 'u_0'
 * with current='d_1'. The last entry of selected-tables is correct in both
 * cases, so that's what's used instead.
 */
function currentTable(ast: Ast): SelectedTable | undefined {
  const selected = ast['selected-tables'] ?? [];
  return selected[selected.length - 1];
}

/** A hint with no `column` starts a pipeline; one with a column continues it via a join. */
function isJoinHint(hint: TableHint): boolean {
  return hint.column !== undefined;
}

// 'fk' is backed by a real foreign key. 'heuristic' is inferred from column
// naming alone (e.g. a `user_id` column implying a `user` table) and can be
// simply wrong; 'synthetic' is a made-up id=id join. Ranking and labelling
// these differently is the point -- today the agent gets the word
// "heuristic" buried in raw JSON with nothing explaining that it means
// "guess". client.ts's makeChildExpressions already filters both out for
// destructive operations, the same trust distinction.
function isConfirmed(hint: TableHint): boolean {
  return hint.resolution === 'fk' || hint.resolution === 'manual';
}

function renderJoinHints(hints: TableHint[]): string[] {
  const confirmed = hints.filter(isConfirmed);
  const guessed = hints.filter(h => !isConfirmed(h));
  const lines: string[] = [];

  if (confirmed.length) {
    lines.push('  joins (real foreign key):');
    for (const h of confirmed.slice(0, MAX_FK_JOINS)) {
      lines.push(`    | ${h.pine}`);
    }
    if (confirmed.length > MAX_FK_JOINS) {
      lines.push(`    +${confirmed.length - MAX_FK_JOINS} more; type part of a table name to narrow`);
    }
  }

  if (guessed.length) {
    lines.push('  joins (guessed from column naming -- verify before trusting):');
    for (const h of guessed.slice(0, MAX_GUESSED_JOINS)) {
      lines.push(`    | ${h.pine}`);
    }
    if (guessed.length > MAX_GUESSED_JOINS) {
      lines.push(`    +${guessed.length - MAX_GUESSED_JOINS} more; type part of a table name to narrow`);
    }
  }

  return lines;
}

/**
 * Column hints carry their own `alias`, so they're grouped by it and
 * resolved back to a table name -- an expression joining two tables can
 * offer columns from both, and `id` from either side is not the same
 * column.
 */
function renderColumnHints(ast: Ast, columns: ColumnHint[]): string[] {
  const tables = ast['selected-tables'] ?? [];
  const byAlias = new Map<string, string[]>();
  for (const c of columns) {
    const list = byAlias.get(c.alias) ?? [];
    list.push(c.column);
    byAlias.set(c.alias, list);
  }

  const lines: string[] = [];
  for (const [alias, cols] of byAlias) {
    const table = tables.find(t => t.alias === alias);
    lines.push(`  ${table ? `${qualify(table)} (as ${alias})` : alias} -- ${cols.join(', ')}`);
  }
  return lines;
}

/**
 * Every table in a pipeline has an alias, and the agent needs to see them:
 * qualifying a column is the only way to reach a table other than the last
 * one, and a bare table name does not work as a qualifier (Postgres rejects
 * it -- "invalid reference to ... entry for table"). Two kinds show up here
 * and both are equally typeable, verified live: the `c_0`/`o_1` names
 * pine-lang assigns on its own, and whatever the expression named with
 * `as`.
 *
 * Only rendered once there's more than one table, since with one there is
 * nothing to disambiguate and the line is pure noise on the most common
 * call of all.
 */
function renderAliases(ast: Ast): string | null {
  const tables = ast['selected-tables'] ?? [];
  if (tables.length < 2) return null;
  return `aliases in scope: ${tables.map(t => `${t.alias} = ${qualify(t)}`).join(', ')}`;
}

/**
 * The identifier in a trailing `<name>.`, which is how an agent asks for one
 * table's columns mid-`select:` (the grammar's `partial-alias`). Used only
 * to tell a mistyped or non-alias qualifier apart from an expression that
 * simply ended somewhere with nothing to suggest -- pine-lang returns an
 * empty hint set for both.
 */
function trailingQualifier(expression: string): string | null {
  return /(?:^|[\s,:(|])([A-Za-z_][A-Za-z0-9_-]*)\.\s*$/.exec(expression)?.[1] ?? null;
}

/**
 * The trailing operator already selects which hints pine-lang returns --
 * verified live: `user |` yields 31 table hints and no others, `user |
 * select:` yields 14 select hints and no tables. So there's no need for the
 * caller to declare an intent; whichever bucket came back non-empty is the
 * intent, and this renders that one.
 */
export function formatCompletion(
  expression: string,
  response: BuildResponse,
  getDoc: (topic: string) => string | null,
): string {
  if (response.error) {
    return formatExpressionError(expression, response.error, getDoc);
  }

  const ast = response.ast ?? {};
  const hints = ast.hints ?? {};
  const sections: string[] = [];

  const parsed = (ast.prettified ?? expression).trimEnd();
  sections.push(parsed);

  const current = currentTable(ast);
  if (current) {
    const aliases = renderAliases(ast);
    sections.push(aliases ? `context: ${qualify(current)}\n${aliases}` : `context: ${qualify(current)}`);
  }

  const tableHints = hints.table ?? [];
  const joinHints = tableHints.filter(isJoinHint);
  const startHints = tableHints.filter(h => !isJoinHint(h));
  const columnHints = hints.select ?? hints.where ?? hints.order ?? hints.update ?? [];

  if (joinHints.length) {
    sections.push(['CONTINUE -- append one of these:', '', ...renderJoinHints(joinHints), '', OPERATIONS_CHEATSHEET].join('\n'));
    sections.push('To list a table\'s columns, call complete_query again with `| select: ` on the end.');
  } else if (columnHints.length) {
    sections.push(['COLUMNS:', ...renderColumnHints(ast, columnHints)].join('\n'));
    // The old wording here -- "qualified by table (`document.userId`)" --
    // taught the one form that cannot work: Postgres rejects a bare table
    // name as a qualifier, and the only fix is an alias. Since this footer
    // prints on every column completion, it's also the cheapest place to
    // teach that an earlier table's columns are reachable at all.
    //
    // Every example is built from the expression in hand rather than a
    // stock one. An agent that has just been shown `c_0 = public.customers`
    // and then reads an example about `u_0.email` has to work out that the
    // two are the same idea; one about `c_0.total_amount` leaves nothing to
    // work out.
    const tables = ast['selected-tables'] ?? [];
    const exampleColumn = columnHints[0]?.column ?? 'id';
    const exampleAlias = current?.alias ?? 'c_0';
    const earlier = tables.find(t => t.alias !== current?.alias);
    sections.push(
      [
        `Reference a column bare (\`${exampleColumn}\`), or qualified by an alias (\`${exampleAlias}.${exampleColumn}\`).`,
        `A bare table name is never a valid qualifier. To use a name of your own instead of the generated alias: \`${current ? qualify(current) : 'public.customers'} as x | ... | select: x.${exampleColumn}\`.`,
        ...(earlier
          ? [
              `Only the current table's columns are listed. For an earlier one, call complete_query again with its alias and a dot on the end -- \`| select: ${earlier.alias}.\` lists ${qualify(earlier)}.`,
            ]
          : []),
        '',
        OPERATIONS_CHEATSHEET,
      ].join('\n'),
    );
  } else if (startHints.length) {
    // A partial table name typed as a whole expression. find_tables is the
    // tool for this, but complete_query shouldn't dead-end if it lands here.
    sections.push(
      [
        `TABLES matching "${expression.trim()}":`,
        ...startHints.slice(0, MAX_TABLE_MATCHES).map(h => `  ${qualify(h)}`),
        ...(startHints.length > MAX_TABLE_MATCHES ? [`  +${startHints.length - MAX_TABLE_MATCHES} more`] : []),
      ].join('\n'),
    );
  } else if (current) {
    // A trailing `<name>.` that produced no columns means the name is not
    // an alias in this expression -- almost always a table name used as a
    // qualifier, the mistake the old footer actively encouraged. Saying so
    // matters because the generic message below ("append `| `") is wrong
    // advice mid-`select:`, and silence there reads to an agent as "keep
    // guessing".
    const qualifier = trailingQualifier(expression);
    const tables = ast['selected-tables'] ?? [];
    // The overwhelmingly common case: the qualifier is one of the
    // pipeline's own table names. Naming that table's actual alias turns
    // the message from a rule into a correction the agent can paste.
    const meant = qualifier ? tables.find(t => t.table === qualifier || qualify(t) === qualifier) : undefined;
    if (qualifier && tables.length) {
      sections.push(
        [
          meant
            ? `\`${qualifier}\` is a table name, and a table name cannot qualify a column. Its alias is \`${meant.alias}\` -- ask again with \`${meant.alias}.\` on the end.`
            : `\`${qualifier}\` is not an alias in this expression, so there is nothing to complete after it. A table name cannot qualify a column either.`,
          // renderAliases already printed the list above once there's more
          // than one table; repeating it here would be the third mention of
          // the same four words in one response.
          ...(renderAliases(ast) ? [] : [`Aliases in scope: ${tables.map(t => `${t.alias} (${qualify(t)})`).join(', ')}.`]),
          `To use a name of your own instead: \`${qualify(tables[0])} as x | ... | select: x.<col>\`.`,
        ].join('\n'),
      );
    } else {
      // Parsed fine, but the expression ends somewhere with nothing to
      // suggest (mid-value in a where clause, after `limit: 2`, ...).
      sections.push(
        ['No completions at this position. Append `| ` to see what this table joins to.', '', OPERATIONS_CHEATSHEET].join('\n'),
      );
    }
  } else {
    sections.push('No table resolved yet. Call find_tables to find one to start from.');
  }

  return sections.join('\n\n');
}

export function formatTableMatches(query: string, response: BuildResponse): string {
  if (response.error) {
    return `Could not search tables: ${response.error}`;
  }

  const hints = (response.ast?.hints?.table ?? []).filter(h => !isJoinHint(h));
  if (!hints.length) {
    return `No tables match "${query}". Try a shorter fragment -- matching is fuzzy, so "ten" finds "tenant".`;
  }

  const shown = hints.slice(0, MAX_TABLE_MATCHES);
  const header =
    hints.length > shown.length
      ? `${shown.length} of ${hints.length} matches for "${query}" (best first):`
      : `${hints.length} match${hints.length === 1 ? '' : 'es'} for "${query}" (best first):`;

  return [
    header,
    ...shown.map(h => `  ${qualify(h)}`),
    ...(hints.length > shown.length ? ['', 'Search again with a longer fragment to narrow this down.'] : []),
    '',
    `Start an expression with one, e.g. \`${qualify(shown[0])}\`, then call complete_query to continue it.`,
  ].join('\n');
}

// A query that parses but fails in the database comes back as Postgres's
// own message, and three of those are routinely unactionable to an agent
// that never sees the generated SQL. Each pattern below pairs with one
// sentence saying what to do in *Pine* -- appended to the original message,
// never replacing it, since the original is still the only thing that says
// which column or table was involved.
//
// All three were reproduced live on 2026-09-19 (see beamlynx-plans/
// completed/2026-09-19-mcp-pine-usability-feedback.md).
const EVAL_ERROR_GUIDANCE: { pattern: RegExp; guidance: string }[] = [
  {
    // e.g. `customers | orders .customer_id | select: customers.email`
    pattern: /invalid reference to .*entry for table/i,
    guidance:
      'In Pine a column is qualified by an alias, never by a table name. The hint above names the alias ' +
      'pine-lang assigned -- that is a real alias you can type (`c_0.email`). You can also name your ' +
      'own: `customers as c | ... | select: c.email`.',
  },
  {
    // The same mistake unqualified: the column exists, but on an earlier
    // table in the pipeline rather than the current one.
    pattern: /column [^\s]*\.[^\s]* does not exist/i,
    guidance:
      'That column belongs to a different table in the pipeline. Qualify it with the alias the hint names, ' +
      'or call complete_query with `<alias>.` on the end to see which columns each alias has.',
  },
  {
    // e.g. `customers | orders .customer_id` where the column is really
    // `customerId`. pine-lang builds the join with an empty column rather
    // than rejecting it, so the failure surfaces here with nothing pointing
    // at the cause.
    pattern: /zero-length delimited identifier/i,
    guidance:
      'A `.column` join suffix in the expression names a column that does not exist, so the join was built ' +
      'with an empty one. Column names are case-sensitive -- `customerId` and `customer_id` are different ' +
      'columns. Call complete_query with the expression up to that join and `| ` on the end; it lists every ' +
      'join with the exact column to use.',
  },
];

/**
 * Appends one line of Pine-level advice to a database error that has none.
 * Pass-through for anything unrecognised -- a guess dressed up as a hint is
 * worse than the plain message.
 */
export function explainEvalError(errorText: string): string {
  const match = EVAL_ERROR_GUIDANCE.find(g => g.pattern.test(errorText));
  return match ? `${errorText.trimEnd()}\n\n${match.guidance}` : errorText;
}

/**
 * Rows arrive with pine-lang's own header as row 0 plus a parallel
 * `columns` array of UI metadata (alias, column-alias, hidden, auto-id,
 * operation-index) -- so the header is effectively sent twice, and the
 * hidden `__<alias>__id` columns pine-lang adds for the UI's row identity
 * duplicate a column the agent can already see. Both are dropped here: a
 * 2-row query goes from 2135 bytes to ~640.
 *
 * Row data stays as JSON arrays rather than an aligned text table on
 * purpose -- cell values can contain `|` and newlines, which would make a
 * pipe-delimited table ambiguous to parse back.
 */
export function formatRows(response: EvalResponse): string {
  if (response.error) {
    return explainEvalError(response.error);
  }

  const rows = response.rows ?? [];
  if (!rows.length) {
    return 'No rows.';
  }

  const [header, ...data] = rows;

  // Hidden columns are matched by NAME against the header row, never by
  // position in `response.columns`. Confirmed the hard way end-to-end:
  // pine-lang's own /eval puts the hidden column first, but by the time a
  // result comes back through beamlynx-ui's session it has been reordered
  // to the end, so the two arrays no longer line up index for index and
  // position-based filtering drops the wrong column.
  const hiddenNames = new Set(
    (response.columns ?? []).filter(c => c.hidden).map(c => c['column-alias'] ?? c.column),
  );
  const hidden = new Set<number>();
  (header ?? []).forEach((name, i) => {
    // The name pattern is the fallback for a response with no column
    // metadata: pine-lang builds these row-identity columns as
    // `__<alias>__<column>` (see eval.clj), a shape a real column will not
    // collide with.
    if (hiddenNames.has(String(name)) || /^__.+__.+$/.test(String(name))) hidden.add(i);
  });
  const visible = (row: unknown[]) => row.filter((_, i) => !hidden.has(i));
  const lines = [header, ...data].map(row => JSON.stringify(visible(row)));

  return [`${data.length} row${data.length === 1 ? '' : 's'}`, '', ...lines].join('\n');
}

/**
 * Only the id and a human label. The stored record also carries the host,
 * port, database name, database *user* and creation time -- none of which
 * an agent needs to pick a connection, and the credentials half of which it
 * has no business seeing. The id is the only field it ever passes back.
 */
export function formatConnections(connections: ConnectionRecord[]): string {
  if (!connections.length) {
    return (
      'No connections are enabled for MCP access yet. Ask the user to toggle "Enable for MCP access" on a ' +
      'connection in beamlynx Settings.'
    );
  }
  return [
    `${connections.length} connection${connections.length === 1 ? '' : 's'} available:`,
    ...connections.map(c => `  ${c.id}  ${c.label ?? c.dbName ?? ''}`.trimEnd()),
    '',
    'Pass an id as connection_id to find_tables, complete_query or run_query.',
  ].join('\n');
}

/** What the control plane's POST /reveal route returns. */
export type RevealCreatedResponse = { requestId?: string; status?: string; error?: string };

/** The outcome half of what GET /reveal/:id returns, once resolved. */
export type RevealOutcome =
  | { expression: string; columns?: EvalResponse['columns']; rows?: EvalResponse['rows'] }
  | { comment?: string };

/** What the control plane's GET /reveal/:id route returns. */
export type RevealStatusResponse = {
  request?: {
    id: string;
    expression: string;
    status: 'pending' | 'revealed' | 'declined';
    outcome?: RevealOutcome;
  };
  error?: string;
};

/**
 * request_reveal never returns the outcome itself -- see
 * control-plane-server.ts's own comment on why this has to be
 * fire-and-forget. This just confirms the request was created and tells the
 * agent what to do next.
 */
export function formatRevealCreated(response: RevealCreatedResponse): string {
  if (response.error) {
    return response.error;
  }
  return (
    `Reveal request ${response.requestId} sent to the user for review -- not resolved yet. The user may edit ` +
    'the expression, reveal the real results, or decline (optionally with a comment). Call check_reveal with ' +
    'this id to wait for their decision.'
  );
}

/**
 * Whether the user changed the expression before revealing, ignoring layout.
 * A raw string comparison said yes every time: the review tab round-trips
 * the expression through pine-lang's prettifier, which puts each `|` on its
 * own line, so an untouched expression comes back re-wrapped and the agent
 * was told to re-read something it already knew.
 *
 * Pine has no whitespace-sensitive syntax outside quoted strings, so the
 * only edit this now misses is whitespace changed *inside* a quoted value
 * (`'a  b'` to `'a b'`). The rows rendered below are still the ones that
 * actually ran either way, and a notice that fires on every single reveal
 * is one nobody reads at all.
 */
function sameExpression(a: string, b: string): boolean {
  const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
  return normalize(a) === normalize(b);
}

/**
 * columns/rows on the revealed outcome are shaped exactly like /query's own
 * EvalResponse (both ultimately come from the same session.evaluate() call
 * in beamlynx-ui, see mcp-query.ts and RevealRequestBanner.tsx), so revealed
 * rows render through the same formatRows this file already uses for
 * run_query -- one row-rendering convention, not two.
 */
export function formatRevealStatus(response: RevealStatusResponse): string {
  if (response.error) {
    return response.error;
  }
  const request = response.request;
  if (!request) {
    return 'No such reveal request. It may have been from a previous app session.';
  }

  if (request.status === 'pending') {
    return 'Still pending after waiting -- the user has not responded yet. Call check_reveal again to keep waiting.';
  }

  if (request.status === 'declined') {
    const comment = (request.outcome as { comment?: string } | undefined)?.comment;
    return [
      'Declined by the user.',
      comment ? `Their comment: ${comment}` : 'No comment was given.',
      'Adjust the expression to address it (if a comment explains why) and call request_reveal again if needed.',
    ].join('\n');
  }

  const outcome = request.outcome as { expression: string; columns?: EvalResponse['columns']; rows?: EvalResponse['rows'] };
  const sections = [];
  if (!sameExpression(outcome.expression, request.expression)) {
    sections.push(`Revealed -- note the user edited the expression before running it:\n  ${outcome.expression}`);
  } else {
    sections.push('Revealed:');
  }
  sections.push(formatRows({ columns: outcome.columns, rows: outcome.rows }));
  return sections.join('\n\n');
}

// Pine operation names, and the doc topic that teaches each. Short forms
// are included because an agent that saw `s:` in a hint may well mistype
// that rather than the long form.
const OPERATION_DOCS: Record<string, string> = {
  select: 'select',
  s: 'select',
  where: 'where',
  w: 'where',
  order: 'order',
  o: 'order',
  limit: 'limit',
  l: 'limit',
  group: 'group',
  g: 'group',
  count: 'count',
  c: 'count',
  from: 'from',
  f: 'from',
  delete: 'delete',
  'delete!': 'delete',
};

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const next = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}

/**
 * Pine has no quoted-identifier syntax -- pine-lang quotes every identifier
 * itself in the SQL it emits, so a Pine expression never needs to. An agent
 * reaching for SQL habits on a camelCase or reserved-looking column (e.g.
 * `select: "tenantId"`) hits a parse error right at the `"`, and it's an
 * unusually unhelpful one: tidyParseError strips every regex terminal from
 * "Expected one of", which for this failure is all of them, leaving just
 * `--`, `|`, `,`. Nothing there tells the agent quotes are the problem, so
 * that case gets a direct, one-line correction instead of relying on the
 * generic error text.
 */
function isStrayQuote(errorText: string): boolean {
  const location = /Parse error at line (\d+), column (\d+):\n([\s\S]*?)\n/.exec(errorText);
  if (!location) return false;
  const column = Number(location[2]);
  const line = location[3];
  return line[column - 1] === '"';
}

/**
 * Pulls the token the parser choked on out of a pine-lang parse error and
 * matches it against the known operation names. The error's caret sits on
 * the first character the parser couldn't accept -- for `user | wehre: x`
 * that's the `:` at column 13 -- so the word immediately *before* the caret
 * is the misspelling.
 *
 * Returns the doc topic to attach, or null when the error isn't a
 * mistyped-operation one (a bad value, an unreachable database) and no doc
 * would help.
 */
export function pickDocTopic(errorText: string): { token: string; operation: string; topic: string } | null {
  const location = /Parse error at line (\d+), column (\d+):\n([\s\S]*?)\n/.exec(errorText);
  if (!location) return null;

  const column = Number(location[2]);
  const line = location[3];
  const beforeCaret = line.slice(0, Math.max(0, column - 1));

  // A misspelled operation leaves the caret on the `:` that follows it, so
  // the bare word at the very end of the text is the thing to correct.
  const misspelled = /([A-Za-z][A-Za-z0-9_-]*!?)\s*$/.exec(beforeCaret)?.[1];
  if (misspelled) {
    const lower = misspelled.toLowerCase();
    if (OPERATION_DOCS[lower]) {
      return { token: misspelled, operation: `${lower}:`, topic: OPERATION_DOCS[lower] };
    }

    let best: { name: string; distance: number } | null = null;
    for (const name of Object.keys(OPERATION_DOCS)) {
      // Single-letter short forms are excluded from fuzzy matching -- every
      // short token is within distance 2 of them, which would match table
      // fragments as operations.
      if (name.length < 3) continue;
      const distance = levenshtein(lower, name);
      if (distance <= 2 && (!best || distance < best.distance)) {
        best = { name, distance };
      }
    }
    if (best) {
      return { token: misspelled, operation: `${best.name}:`, topic: OPERATION_DOCS[best.name] };
    }
  }

  // Otherwise the operation itself was spelled fine and the mistake is in
  // its arguments -- `where: status =` with no value, say. The caret sits
  // well past the operation name by then, so fall back to the last
  // well-formed `name:` before it. That operation's doc is what explains
  // the argument syntax that was got wrong.
  const operations = [...beforeCaret.matchAll(/([A-Za-z][A-Za-z0-9_-]*)\s*:/g)];
  const last = operations[operations.length - 1]?.[1]?.toLowerCase();
  if (last && OPERATION_DOCS[last]) {
    return { token: last, operation: `${last}:`, topic: OPERATION_DOCS[last] };
  }

  return null;
}

/**
 * pine-lang's parse errors end with an "Expected one of:" list taken
 * straight from the grammar, one item per line. Most of those lines are
 * raw regex terminals -- the whitespace rule, the identifier rule, the
 * block-comment rule -- each printed in full as a `#"..."` string. They are
 * noise to an agent: it cannot act on them, and on a typical error they are
 * about half the total length. Drop them and collapse the operators that
 * remain onto one line.
 */
function tidyParseError(errorText: string): string {
  const split = /\nExpected one of:\n/.exec(errorText);
  if (!split) return errorText.trimEnd();

  const head = errorText.slice(0, split.index);
  const expected = errorText
    .slice(split.index + split[0].length)
    .split('\n')
    .map(t => t.trim())
    .filter(t => t && !t.startsWith('#"'));

  if (!expected.length) return head.trimEnd();
  return `${head.trimEnd()}\nExpected one of: ${expected.join('  ')}`;
}

/**
 * A failed expression is the one moment the agent has proven it needs a
 * specific piece of Pine documentation, so the doc is pushed inline rather
 * than left for it to pull with a second and third tool call.
 */
export function formatExpressionError(
  expression: string,
  errorText: string,
  getDoc: (topic: string) => string | null,
): string {
  const sections = [tidyParseError(errorText)];

  if (isStrayQuote(errorText)) {
    sections.push(
      'Pine never quotes identifiers, even camelCase or reserved-looking ones. Drop the quotes -- `select: tenantId`, not `select: "tenantId"`.',
    );
  }

  const match = pickDocTopic(errorText);
  if (match) {
    if (match.operation !== `${match.token.toLowerCase()}:`) {
      sections.push(`\`${match.token}\` is not a Pine operation. Closest match: \`${match.operation}\``);
    }
    const doc = getDoc(match.topic);
    if (doc) {
      sections.push(`--- Pine reference: ${match.topic} ---\n${doc.trimEnd()}`);
    }
  }

  return sections.join('\n\n');
}
